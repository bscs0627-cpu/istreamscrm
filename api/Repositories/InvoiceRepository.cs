using Dapper;
using IStreamsCrm.Api.Data;
using IStreamsCrm.Api.DTOs;

namespace IStreamsCrm.Api.Repositories;

public interface IInvoiceRepository
{
    // today = the user's local date, for overdue. onlyUserId (staff) = invoices of leads assigned to them.
    Task<IEnumerable<InvoiceRow>> GetAllAsync(int companyId, int? onlyUserId, InvoiceFilter f, DateTime today);
    Task<InvoiceRow?> GetByIdAsync(int companyId, int invoiceId, DateTime today);
    Task<InvoiceRow?> CreateAsync(int companyId, int leadId, int? quotationId, SaveInvoiceDto dto, int? userId, DateTime today,
        int? subscriptionId = null, DateTime? periodStart = null, DateTime? periodEnd = null);
    Task<InvoiceRow?> UpdateDraftAsync(int companyId, int invoiceId, SaveInvoiceDto dto, DateTime today);
    Task<bool> DeleteDraftAsync(int companyId, int invoiceId);
    // Gives the next INV number for the invoice year and freezes the buyer details.
    Task<bool> IssueAsync(int companyId, int invoiceId, string? billToName, string? billToTrn, string? billToAddress);
    Task<bool> CancelAsync(int companyId, int invoiceId, string reason);
    Task MarkSentAsync(int companyId, int invoiceId);
    Task AddPaymentAsync(int companyId, int invoiceId, SavePaymentDto dto, int userId);
    Task<int?> DeletePaymentAsync(int companyId, int paymentId);
    // Share of the quotation's value (before VAT) already on non-cancelled invoices, 0-100.
    Task<decimal> InvoicedPercentAsync(int companyId, int quotationId, decimal quoteNet);
    Task<IEnumerable<AgingRow>> AgingAsync(int companyId, int? onlyUserId, DateTime today);
    Task<int> IssuedCountForLeadsAsync(int companyId, string whereLeads, object args);
}

public class InvoiceRepository : IInvoiceRepository
{
    private readonly IDbConnectionFactory _factory;
    public InvoiceRepository(IDbConnectionFactory factory) => _factory = factory;

    private const string Select = @"
        SELECT i.*, l.lead_seq, l.assigned_to AS lead_assigned_to, l.customer_id,
               q.quote_year, q.quote_seq, q.revision AS quote_revision,
               c.customer_name, c.whatsapp_name, c.mobile_no, c.email, c.job_title,
               a.account_id, a.account_name, a.trn AS account_trn, a.address AS account_address, a.city AS account_city,
               a.country AS account_country, cb.full_name AS created_by_name,
               CASE WHEN i.status <> 'ISSUED' THEN i.status
                    WHEN i.amount_paid >= i.grand_total THEN 'PAID'
                    WHEN i.due_date < @today THEN 'OVERDUE'
                    WHEN i.amount_paid > 0 THEN 'PARTIAL'
                    ELSE 'UNPAID' END AS payment_status,
               CASE WHEN i.status = 'ISSUED' AND i.amount_paid < i.grand_total AND i.due_date < @today
                    THEN DATEDIFF(DAY, i.due_date, @today) ELSE 0 END AS days_overdue
        FROM dbo.wsm_invoices i
        JOIN dbo.wsm_leads l ON l.lead_id = i.lead_id
        JOIN dbo.wsm_customers c ON c.customer_id = l.customer_id
        LEFT JOIN dbo.wsm_accounts a ON a.account_id = c.account_id
        LEFT JOIN dbo.wsm_quotations q ON q.quotation_id = i.quotation_id
        LEFT JOIN dbo.wsm_users cb ON cb.user_id = i.created_by";

    public async Task<IEnumerable<InvoiceRow>> GetAllAsync(int companyId, int? onlyUserId, InvoiceFilter f, DateTime today)
    {
        var search = string.IsNullOrWhiteSpace(f.Search) ? null : f.Search.Trim();
        int? seq = search is not null && int.TryParse(search.ToUpperInvariant().Split('-').Where(p => p.Length > 0 && p != "INV").LastOrDefault(), out var n) ? n : null;
        using var db = _factory.CreateConnection();
        return await db.QueryAsync<InvoiceRow>($@"
            SELECT * FROM ({Select}
                WHERE i.company_id = @companyId
                  AND (@onlyUserId IS NULL OR l.assigned_to = @onlyUserId)
                  AND (@leadId IS NULL OR i.lead_id = @leadId)
                  AND (@quotationId IS NULL OR i.quotation_id = @quotationId)
                  AND (@accountId IS NULL OR a.account_id = @accountId)
                  AND (@status IS NULL OR i.status = @status)
                  AND (@search IS NULL OR i.inv_seq = @seq OR i.stage LIKE '%' + @search + '%'
                       OR a.account_name LIKE '%' + @search + '%' OR i.bill_to_name LIKE '%' + @search + '%'
                       OR c.customer_name LIKE '%' + @search + '%')
            ) x
            WHERE @payment IS NULL OR x.payment_status = @payment
               OR (@payment = 'OUTSTANDING' AND x.payment_status IN ('UNPAID', 'PARTIAL', 'OVERDUE'))
            ORDER BY CASE WHEN x.inv_seq IS NULL THEN 0 ELSE 1 END, x.inv_year DESC, x.inv_seq DESC, x.invoice_id DESC",
            new
            {
                companyId, onlyUserId, today, search, seq, f.LeadId, f.QuotationId, f.AccountId,
                status = string.IsNullOrWhiteSpace(f.Status) ? null : f.Status,
                payment = string.IsNullOrWhiteSpace(f.Payment) ? null : f.Payment
            });
    }

    public async Task<InvoiceRow?> GetByIdAsync(int companyId, int invoiceId, DateTime today)
    {
        using var db = _factory.CreateConnection();
        var inv = await db.QuerySingleOrDefaultAsync<InvoiceRow>(
            Select + " WHERE i.company_id = @companyId AND i.invoice_id = @invoiceId", new { companyId, invoiceId, today });
        if (inv is null) return null;
        inv.Lines = (await db.QueryAsync<QuotationLineRow>(@"
            SELECT il.*, p.product_code FROM dbo.wsm_invoice_lines il
            LEFT JOIN dbo.wsm_products p ON p.product_id = il.product_id
            WHERE il.invoice_id = @invoiceId ORDER BY il.sort_order", new { invoiceId })).ToList();
        inv.Payments = (await db.QueryAsync<PaymentRow>(@"
            SELECT py.*, u.full_name AS created_by_name FROM dbo.wsm_payments py
            LEFT JOIN dbo.wsm_users u ON u.user_id = py.created_by
            WHERE py.invoice_id = @invoiceId ORDER BY py.payment_date, py.payment_id", new { invoiceId })).ToList();
        return inv;
    }

    private static async Task SaveLinesAsync(System.Data.IDbConnection db, int companyId, int invoiceId, List<SaveQuotationLineDto> lines)
    {
        await db.ExecuteAsync("DELETE FROM dbo.wsm_invoice_lines WHERE invoice_id = @invoiceId", new { invoiceId });
        decimal gross = 0, discount = 0, vat = 0;
        var rows = lines.Select((l, i) =>
        {
            l.Quantity = Math.Round(l.Quantity, 2, MidpointRounding.AwayFromZero);
            l.UnitPrice = Math.Round(l.UnitPrice, 2, MidpointRounding.AwayFromZero);
            l.DiscountPct = Math.Round(l.DiscountPct, 2, MidpointRounding.AwayFromZero);
            l.VatPct = Math.Round(l.VatPct, 2, MidpointRounding.AwayFromZero);
            var m = QuoteMath.Line(l.Quantity, l.UnitPrice, l.DiscountPct, l.VatPct);
            gross += m.Gross; discount += m.Discount; vat += m.Vat;
            return new
            {
                invoiceId, companyId, SortOrder = i + 1, l.ProductId, l.Description, l.Unit, l.Quantity, l.UnitPrice,
                l.DiscountPct, l.VatPct, NetAmount = m.Net, VatAmount = m.Vat
            };
        }).ToList();
        await db.ExecuteAsync(@"
            INSERT INTO dbo.wsm_invoice_lines (invoice_id, sort_order, product_id, description, unit, quantity, unit_price, discount_pct, vat_pct, net_amount, vat_amount)
            VALUES (@invoiceId, @SortOrder,
                    (SELECT product_id FROM dbo.wsm_products WHERE product_id = @ProductId AND company_id = @companyId),
                    @Description, @Unit, @Quantity, @UnitPrice, @DiscountPct, @VatPct, @NetAmount, @VatAmount)", rows);
        await db.ExecuteAsync(@"
            UPDATE dbo.wsm_invoices
            SET subtotal = @gross, discount_total = @discount, vat_total = @vat, grand_total = @gross - @discount + @vat,
                updated_at = SYSUTCDATETIME()
            WHERE invoice_id = @invoiceId", new { invoiceId, gross, discount, vat });
    }

    public async Task<InvoiceRow?> CreateAsync(int companyId, int leadId, int? quotationId, SaveInvoiceDto dto, int? userId, DateTime today,
        int? subscriptionId = null, DateTime? periodStart = null, DateTime? periodEnd = null)
    {
        using var db = _factory.CreateConnection();
        var id = await db.ExecuteScalarAsync<int>(@"
            INSERT INTO dbo.wsm_invoices (company_id, quotation_id, lead_id, stage, invoice_date, due_date, terms, notes, created_by,
                                          subscription_id, period_start, period_end)
            VALUES (@companyId, @quotationId, @leadId, @Stage, @InvoiceDate, @DueDate, @Terms, @Notes, @userId,
                    @subscriptionId, @periodStart, @periodEnd);
            SELECT CAST(SCOPE_IDENTITY() AS INT);",
            new
            {
                companyId, quotationId, leadId, userId, dto.Stage, InvoiceDate = dto.InvoiceDate.Date, DueDate = dto.DueDate.Date,
                dto.Terms, dto.Notes, subscriptionId, periodStart = periodStart?.Date, periodEnd = periodEnd?.Date
            });
        await SaveLinesAsync(db, companyId, id, dto.Lines);
        return await GetByIdAsync(companyId, id, today);
    }

    public async Task<InvoiceRow?> UpdateDraftAsync(int companyId, int invoiceId, SaveInvoiceDto dto, DateTime today)
    {
        using var db = _factory.CreateConnection();
        var n = await db.ExecuteAsync(@"
            UPDATE dbo.wsm_invoices SET stage = @Stage, invoice_date = @InvoiceDate, due_date = @DueDate, terms = @Terms, notes = @Notes
            WHERE company_id = @companyId AND invoice_id = @invoiceId AND status = 'DRAFT'",
            new { companyId, invoiceId, dto.Stage, InvoiceDate = dto.InvoiceDate.Date, DueDate = dto.DueDate.Date, dto.Terms, dto.Notes });
        if (n == 0) return null;
        await SaveLinesAsync(db, companyId, invoiceId, dto.Lines);
        return await GetByIdAsync(companyId, invoiceId, today);
    }

    public async Task<bool> DeleteDraftAsync(int companyId, int invoiceId)
    {
        using var db = _factory.CreateConnection();
        return await db.ExecuteAsync(
            "DELETE FROM dbo.wsm_invoices WHERE company_id = @companyId AND invoice_id = @invoiceId AND status = 'DRAFT'",
            new { companyId, invoiceId }) > 0;
    }

    public async Task<bool> IssueAsync(int companyId, int invoiceId, string? billToName, string? billToTrn, string? billToAddress)
    {
        using var db = _factory.CreateConnection();
        return await db.ExecuteAsync(@"
            DECLARE @year INT = (SELECT YEAR(invoice_date) FROM dbo.wsm_invoices
                                 WHERE company_id = @companyId AND invoice_id = @invoiceId AND status = 'DRAFT');
            IF @year IS NOT NULL
                UPDATE dbo.wsm_invoices
                SET status = 'ISSUED', inv_year = @year,
                    inv_seq = (SELECT ISNULL(MAX(inv_seq), 0) + 1 FROM dbo.wsm_invoices WITH (UPDLOCK, HOLDLOCK)
                               WHERE company_id = @companyId AND inv_year = @year),
                    bill_to_name = @billToName, bill_to_trn = @billToTrn, bill_to_address = @billToAddress,
                    issued_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
                WHERE invoice_id = @invoiceId;",
            new { companyId, invoiceId, billToName, billToTrn, billToAddress }) > 0;
    }

    public async Task<bool> CancelAsync(int companyId, int invoiceId, string reason)
    {
        using var db = _factory.CreateConnection();
        return await db.ExecuteAsync(@"
            UPDATE dbo.wsm_invoices SET status = 'CANCELLED', cancelled_at = SYSUTCDATETIME(), cancel_reason = @reason, updated_at = SYSUTCDATETIME()
            WHERE company_id = @companyId AND invoice_id = @invoiceId AND status = 'ISSUED' AND amount_paid = 0",
            new { companyId, invoiceId, reason }) > 0;
    }

    public async Task MarkSentAsync(int companyId, int invoiceId)
    {
        using var db = _factory.CreateConnection();
        await db.ExecuteAsync(@"
            UPDATE dbo.wsm_invoices SET sent_at = ISNULL(sent_at, SYSUTCDATETIME()), updated_at = SYSUTCDATETIME()
            WHERE company_id = @companyId AND invoice_id = @invoiceId", new { companyId, invoiceId });
    }

    private const string RecalcPaid = @"
        UPDATE dbo.wsm_invoices
        SET amount_paid = ISNULL((SELECT SUM(amount) FROM dbo.wsm_payments WHERE invoice_id = @invoiceId), 0), updated_at = SYSUTCDATETIME()
        WHERE invoice_id = @invoiceId;";

    public async Task AddPaymentAsync(int companyId, int invoiceId, SavePaymentDto dto, int userId)
    {
        using var db = _factory.CreateConnection();
        await db.ExecuteAsync(@"
            INSERT INTO dbo.wsm_payments (company_id, invoice_id, payment_date, amount, method, reference, notes, created_by)
            VALUES (@companyId, @invoiceId, @PaymentDate, @Amount, @Method, @Reference, @Notes, @userId);" + RecalcPaid,
            new { companyId, invoiceId, userId, PaymentDate = dto.PaymentDate.Date, Amount = Math.Round(dto.Amount, 2), dto.Method, dto.Reference, dto.Notes });
    }

    public async Task<int?> DeletePaymentAsync(int companyId, int paymentId)
    {
        using var db = _factory.CreateConnection();
        var invoiceId = await db.ExecuteScalarAsync<int?>(
            "SELECT invoice_id FROM dbo.wsm_payments WHERE company_id = @companyId AND payment_id = @paymentId", new { companyId, paymentId });
        if (invoiceId is null) return null;
        await db.ExecuteAsync("DELETE FROM dbo.wsm_payments WHERE payment_id = @paymentId;" + RecalcPaid, new { paymentId, invoiceId });
        return invoiceId;
    }

    public async Task<decimal> InvoicedPercentAsync(int companyId, int quotationId, decimal quoteNet)
    {
        if (quoteNet <= 0) return 0;
        using var db = _factory.CreateConnection();
        var invoiced = await db.ExecuteScalarAsync<decimal>(@"
            SELECT ISNULL(SUM(subtotal - discount_total), 0) FROM dbo.wsm_invoices
            WHERE company_id = @companyId AND quotation_id = @quotationId AND status <> 'CANCELLED'", new { companyId, quotationId });
        return Math.Round(invoiced / quoteNet * 100m, 2);
    }

    public async Task<IEnumerable<AgingRow>> AgingAsync(int companyId, int? onlyUserId, DateTime today)
    {
        using var db = _factory.CreateConnection();
        return await db.QueryAsync<AgingRow>(@"
            SELECT a.account_id, COALESCE(a.account_name, MAX(i.bill_to_name), MAX(c.customer_name), MAX(c.whatsapp_name)) AS customer,
                   COUNT(*) AS invoices,
                   SUM(CASE WHEN i.due_date >= @today THEN bal ELSE 0 END) AS not_due,
                   SUM(CASE WHEN DATEDIFF(DAY, i.due_date, @today) BETWEEN 1 AND 30 THEN bal ELSE 0 END) AS days1_to30,
                   SUM(CASE WHEN DATEDIFF(DAY, i.due_date, @today) BETWEEN 31 AND 60 THEN bal ELSE 0 END) AS days31_to60,
                   SUM(CASE WHEN DATEDIFF(DAY, i.due_date, @today) BETWEEN 61 AND 90 THEN bal ELSE 0 END) AS days61_to90,
                   SUM(CASE WHEN DATEDIFF(DAY, i.due_date, @today) > 90 THEN bal ELSE 0 END) AS over90,
                   SUM(bal) AS total
            FROM dbo.wsm_invoices i
            CROSS APPLY (SELECT i.grand_total - i.amount_paid AS bal) b
            JOIN dbo.wsm_leads l ON l.lead_id = i.lead_id
            JOIN dbo.wsm_customers c ON c.customer_id = l.customer_id
            LEFT JOIN dbo.wsm_accounts a ON a.account_id = c.account_id
            WHERE i.company_id = @companyId AND i.status = 'ISSUED' AND i.amount_paid < i.grand_total
              AND (@onlyUserId IS NULL OR l.assigned_to = @onlyUserId)
            GROUP BY a.account_id, a.account_name, CASE WHEN a.account_id IS NULL THEN c.customer_id END
            ORDER BY SUM(bal) DESC", new { companyId, onlyUserId, today });
    }

    // whereLeads: a condition on l (the leads) — e.g. l.lead_id = @id or l.customer_id = @id.
    public async Task<int> IssuedCountForLeadsAsync(int companyId, string whereLeads, object args)
    {
        using var db = _factory.CreateConnection();
        var p = new DynamicParameters(args);
        p.Add("companyId", companyId);
        return await db.ExecuteScalarAsync<int>($@"
            SELECT COUNT(*) FROM dbo.wsm_invoices i JOIN dbo.wsm_leads l ON l.lead_id = i.lead_id
            WHERE i.company_id = @companyId AND i.status <> 'DRAFT' AND {whereLeads}", p);
    }
}
