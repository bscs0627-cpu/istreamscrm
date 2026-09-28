using Dapper;
using IStreamsCrm.Api.Data;
using IStreamsCrm.Api.DTOs;

namespace IStreamsCrm.Api.Repositories;

public class QuotationFilter
{
    public string? Search { get; set; }
    public string? Status { get; set; }
    public int? LeadId { get; set; }
    public string? Approval { get; set; }    // PENDING = waiting for admin approval
}

public interface IQuotationRepository
{
    // onlyUserId (staff): quotations of leads assigned to them.
    Task<IEnumerable<QuotationRow>> GetAllAsync(int companyId, int? onlyUserId, QuotationFilter f);
    Task<QuotationRow?> GetByIdAsync(int companyId, int quotationId);
    Task<QuotationRow?> CreateAsync(int companyId, SaveQuotationDto dto, string approvalStatus, int userId);
    Task<QuotationRow?> UpdateAsync(int companyId, int quotationId, SaveQuotationDto dto, string approvalStatus);
    Task<bool> DeleteDraftAsync(int companyId, int quotationId);
    // Copies a sent quotation into a new draft revision; the old one becomes REVISED.
    Task<QuotationRow?> ReviseAsync(int companyId, int quotationId, int userId);
    Task ApproveAsync(int companyId, int quotationId, int userId);
    Task MarkSentAsync(int companyId, int quotationId);
    Task CloseAsync(int companyId, int quotationId, bool accepted, string? reason);
}

// All money is rounded per line (2 decimals) and the header totals are the sum of the lines.
public static class QuoteMath
{
    public static (decimal Gross, decimal Discount, decimal Net, decimal Vat) Line(decimal qty, decimal price, decimal discountPct, decimal vatPct)
    {
        var gross = Math.Round(qty * price, 2, MidpointRounding.AwayFromZero);
        var discount = Math.Round(gross * discountPct / 100m, 2, MidpointRounding.AwayFromZero);
        var net = gross - discount;
        var vat = Math.Round(net * vatPct / 100m, 2, MidpointRounding.AwayFromZero);
        return (gross, discount, net, vat);
    }
}

public class QuotationRepository : IQuotationRepository
{
    private readonly IDbConnectionFactory _factory;
    public QuotationRepository(IDbConnectionFactory factory) => _factory = factory;

    private const string Select = @"
        SELECT q.*, l.lead_seq, l.assigned_to AS lead_assigned_to, l.status AS lead_status, l.customer_id,
               c.customer_name, c.whatsapp_name, c.mobile_no, c.email, c.job_title,
               a.account_id, a.account_name, a.trn AS account_trn, a.address AS account_address, a.city AS account_city,
               a.country AS account_country, ab.full_name AS approved_by_name, cb.full_name AS created_by_name
        FROM dbo.wsm_quotations q
        JOIN dbo.wsm_leads l ON l.lead_id = q.lead_id
        JOIN dbo.wsm_customers c ON c.customer_id = l.customer_id
        LEFT JOIN dbo.wsm_accounts a ON a.account_id = c.account_id
        LEFT JOIN dbo.wsm_users ab ON ab.user_id = q.approved_by
        LEFT JOIN dbo.wsm_users cb ON cb.user_id = q.created_by";

    public async Task<IEnumerable<QuotationRow>> GetAllAsync(int companyId, int? onlyUserId, QuotationFilter f)
    {
        var search = string.IsNullOrWhiteSpace(f.Search) ? null : f.Search.Trim();
        // "QT-2026-0012" or "12" finds the number.
        int? seq = search is not null && int.TryParse(search.ToUpperInvariant().Split('-').Where(p => p.Length > 0 && p != "QT").LastOrDefault(), out var n) ? n : null;
        using var db = _factory.CreateConnection();
        return await db.QueryAsync<QuotationRow>(Select + @"
            WHERE q.company_id = @companyId
              AND (@onlyUserId IS NULL OR l.assigned_to = @onlyUserId)
              AND (@leadId IS NULL OR q.lead_id = @leadId)
              AND (@status IS NULL OR q.status = @status)
              AND (@approval IS NULL OR q.approval_status = @approval)
              AND (@search IS NULL OR q.quote_seq = @seq OR q.subject LIKE '%' + @search + '%'
                   OR a.account_name LIKE '%' + @search + '%' OR c.customer_name LIKE '%' + @search + '%')
            ORDER BY q.quote_year DESC, q.quote_seq DESC, q.revision DESC",
            new
            {
                companyId, onlyUserId, f.LeadId, search, seq,
                status = string.IsNullOrWhiteSpace(f.Status) ? null : f.Status,
                approval = string.IsNullOrWhiteSpace(f.Approval) ? null : f.Approval
            });
    }

    public async Task<QuotationRow?> GetByIdAsync(int companyId, int quotationId)
    {
        using var db = _factory.CreateConnection();
        var q = await db.QuerySingleOrDefaultAsync<QuotationRow>(
            Select + " WHERE q.company_id = @companyId AND q.quotation_id = @quotationId", new { companyId, quotationId });
        if (q is null) return null;
        q.Lines = (await db.QueryAsync<QuotationLineRow>(@"
            SELECT ql.*, p.product_code FROM dbo.wsm_quotation_lines ql
            LEFT JOIN dbo.wsm_products p ON p.product_id = ql.product_id
            WHERE ql.quotation_id = @quotationId ORDER BY ql.sort_order", new { quotationId })).ToList();
        return q;
    }

    // Replaces the lines and recomputes the totals from them.
    private static async Task SaveLinesAsync(System.Data.IDbConnection db, int companyId, int quotationId, List<SaveQuotationLineDto> lines)
    {
        await db.ExecuteAsync("DELETE FROM dbo.wsm_quotation_lines WHERE quotation_id = @quotationId", new { quotationId });
        decimal gross = 0, discount = 0, vat = 0, maxDisc = 0;
        var rows = lines.Select((l, i) =>
        {
            // Stored as 2 decimals, so the amounts are calculated from the stored values.
            l.Quantity = Math.Round(l.Quantity, 2, MidpointRounding.AwayFromZero);
            l.UnitPrice = Math.Round(l.UnitPrice, 2, MidpointRounding.AwayFromZero);
            l.DiscountPct = Math.Round(l.DiscountPct, 2, MidpointRounding.AwayFromZero);
            l.VatPct = Math.Round(l.VatPct, 2, MidpointRounding.AwayFromZero);
            var m = QuoteMath.Line(l.Quantity, l.UnitPrice, l.DiscountPct, l.VatPct);
            gross += m.Gross; discount += m.Discount; vat += m.Vat; maxDisc = Math.Max(maxDisc, l.DiscountPct);
            return new
            {
                quotationId, companyId, SortOrder = i + 1, l.ProductId, l.Description, l.Unit, l.Quantity, l.UnitPrice,
                l.DiscountPct, l.VatPct, NetAmount = m.Net, VatAmount = m.Vat
            };
        }).ToList();
        // A product id from another company is dropped (the line stays as free text).
        await db.ExecuteAsync(@"
            INSERT INTO dbo.wsm_quotation_lines (quotation_id, sort_order, product_id, description, unit, quantity, unit_price, discount_pct, vat_pct, net_amount, vat_amount)
            VALUES (@quotationId, @SortOrder,
                    (SELECT product_id FROM dbo.wsm_products WHERE product_id = @ProductId AND company_id = @companyId),
                    @Description, @Unit, @Quantity, @UnitPrice, @DiscountPct, @VatPct, @NetAmount, @VatAmount)", rows);
        await db.ExecuteAsync(@"
            UPDATE dbo.wsm_quotations
            SET subtotal = @gross, discount_total = @discount, vat_total = @vat, grand_total = @gross - @discount + @vat,
                max_line_discount = @maxDisc, updated_at = SYSUTCDATETIME()
            WHERE quotation_id = @quotationId", new { quotationId, gross, discount, vat, maxDisc });
    }

    public async Task<QuotationRow?> CreateAsync(int companyId, SaveQuotationDto dto, string approvalStatus, int userId)
    {
        using var db = _factory.CreateConnection();
        var id = await db.ExecuteScalarAsync<int>(@"
            DECLARE @year INT = YEAR(@QuoteDate);
            INSERT INTO dbo.wsm_quotations (company_id, quote_year, quote_seq, revision, lead_id, subject, quote_date, valid_until,
                                            payment_terms, terms, notes, approval_status, created_by)
            SELECT @companyId, @year, ISNULL(MAX(quote_seq), 0) + 1, 0, @LeadId, @Subject, @QuoteDate, @ValidUntil,
                   @PaymentTerms, @Terms, @Notes, @approvalStatus, @userId
            FROM dbo.wsm_quotations WITH (UPDLOCK, HOLDLOCK) WHERE company_id = @companyId AND quote_year = @year;
            SELECT CAST(SCOPE_IDENTITY() AS INT);",
            new
            {
                companyId, userId, approvalStatus, dto.LeadId, dto.Subject, QuoteDate = dto.QuoteDate.Date, ValidUntil = dto.ValidUntil.Date,
                dto.PaymentTerms, dto.Terms, dto.Notes
            });
        await SaveLinesAsync(db, companyId, id, dto.Lines);
        return await GetByIdAsync(companyId, id);
    }

    public async Task<QuotationRow?> UpdateAsync(int companyId, int quotationId, SaveQuotationDto dto, string approvalStatus)
    {
        using var db = _factory.CreateConnection();
        var n = await db.ExecuteAsync(@"
            UPDATE dbo.wsm_quotations
            SET subject = @Subject, quote_date = @QuoteDate, valid_until = @ValidUntil, payment_terms = @PaymentTerms,
                terms = @Terms, notes = @Notes, approval_status = @approvalStatus,
                approved_by = CASE WHEN @approvalStatus = 'APPROVED' THEN approved_by END,
                approved_at = CASE WHEN @approvalStatus = 'APPROVED' THEN approved_at END
            WHERE company_id = @companyId AND quotation_id = @quotationId AND status = 'DRAFT'",
            new
            {
                companyId, quotationId, approvalStatus, dto.Subject, QuoteDate = dto.QuoteDate.Date, ValidUntil = dto.ValidUntil.Date,
                dto.PaymentTerms, dto.Terms, dto.Notes
            });
        if (n == 0) return null;
        await SaveLinesAsync(db, companyId, quotationId, dto.Lines);
        return await GetByIdAsync(companyId, quotationId);
    }

    public async Task<bool> DeleteDraftAsync(int companyId, int quotationId)
    {
        using var db = _factory.CreateConnection();
        return await db.ExecuteAsync(
            "DELETE FROM dbo.wsm_quotations WHERE company_id = @companyId AND quotation_id = @quotationId AND status = 'DRAFT'",
            new { companyId, quotationId }) > 0;
    }

    public async Task<QuotationRow?> ReviseAsync(int companyId, int quotationId, int userId)
    {
        using var db = _factory.CreateConnection();
        var id = await db.ExecuteScalarAsync<int?>(@"
            DECLARE @year INT, @seq INT;
            SELECT @year = quote_year, @seq = quote_seq FROM dbo.wsm_quotations
            WHERE company_id = @companyId AND quotation_id = @quotationId AND status IN ('SENT', 'REJECTED');
            IF @seq IS NULL BEGIN SELECT CAST(NULL AS INT); RETURN; END

            INSERT INTO dbo.wsm_quotations (company_id, quote_year, quote_seq, revision, lead_id, subject, quote_date, valid_until,
                   subtotal, discount_total, vat_total, grand_total, max_line_discount, payment_terms, terms, notes, approval_status, created_by)
            SELECT company_id, quote_year, quote_seq,
                   (SELECT MAX(revision) + 1 FROM dbo.wsm_quotations WHERE company_id = @companyId AND quote_year = @year AND quote_seq = @seq),
                   lead_id, subject, CAST(SYSUTCDATETIME() AS DATE), DATEADD(DAY, DATEDIFF(DAY, quote_date, valid_until), CAST(SYSUTCDATETIME() AS DATE)),
                   subtotal, discount_total, vat_total, grand_total, max_line_discount, payment_terms, terms, notes,
                   CASE WHEN approval_status = 'NONE' THEN 'NONE' ELSE 'PENDING' END, @userId
            FROM dbo.wsm_quotations WHERE quotation_id = @quotationId;
            DECLARE @id INT = CAST(SCOPE_IDENTITY() AS INT);

            INSERT INTO dbo.wsm_quotation_lines (quotation_id, sort_order, product_id, description, unit, quantity, unit_price, discount_pct, vat_pct, net_amount, vat_amount)
            SELECT @id, sort_order, product_id, description, unit, quantity, unit_price, discount_pct, vat_pct, net_amount, vat_amount
            FROM dbo.wsm_quotation_lines WHERE quotation_id = @quotationId;

            UPDATE dbo.wsm_quotations SET status = 'REVISED', updated_at = SYSUTCDATETIME() WHERE quotation_id = @quotationId;
            SELECT @id;", new { companyId, quotationId, userId });
        return id is null ? null : await GetByIdAsync(companyId, id.Value);
    }

    public async Task ApproveAsync(int companyId, int quotationId, int userId)
    {
        using var db = _factory.CreateConnection();
        await db.ExecuteAsync(@"
            UPDATE dbo.wsm_quotations SET approval_status = 'APPROVED', approved_by = @userId, approved_at = SYSUTCDATETIME(),
                   updated_at = SYSUTCDATETIME()
            WHERE company_id = @companyId AND quotation_id = @quotationId AND approval_status = 'PENDING'", new { companyId, quotationId, userId });
    }

    // Re-sending a sent quotation keeps it SENT (e.g. by WhatsApp after email).
    public async Task MarkSentAsync(int companyId, int quotationId)
    {
        using var db = _factory.CreateConnection();
        await db.ExecuteAsync(@"
            UPDATE dbo.wsm_quotations SET status = 'SENT', sent_at = ISNULL(sent_at, SYSUTCDATETIME()), updated_at = SYSUTCDATETIME()
            WHERE company_id = @companyId AND quotation_id = @quotationId AND status IN ('DRAFT', 'SENT')", new { companyId, quotationId });
    }

    public async Task CloseAsync(int companyId, int quotationId, bool accepted, string? reason)
    {
        using var db = _factory.CreateConnection();
        await db.ExecuteAsync(@"
            UPDATE dbo.wsm_quotations
            SET status = @status, closed_at = SYSUTCDATETIME(), reject_reason = @reason, updated_at = SYSUTCDATETIME()
            WHERE company_id = @companyId AND quotation_id = @quotationId AND status = 'SENT'",
            new { companyId, quotationId, status = accepted ? "ACCEPTED" : "REJECTED", reason = accepted ? null : reason });
    }
}
