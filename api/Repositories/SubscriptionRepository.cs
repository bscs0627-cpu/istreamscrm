using Dapper;
using IStreamsCrm.Api.Data;
using IStreamsCrm.Api.DTOs;

namespace IStreamsCrm.Api.Repositories;

public interface ISubscriptionRepository
{
    // today = the user's local date. onlyUserId (staff) = subscriptions of leads assigned to them.
    Task<IEnumerable<SubscriptionRow>> GetAllAsync(int companyId, int? onlyUserId, SubscriptionFilter f, DateTime today);
    Task<SubscriptionRow?> GetByIdAsync(int companyId, int subscriptionId, DateTime today);
    Task<SubscriptionSummary> SummaryAsync(int companyId, int? onlyUserId, DateTime today);
    Task<SubscriptionRow?> CreateAsync(int companyId, SaveSubscriptionDto dto, int? quotationId, int userId, DateTime today);
    Task<SubscriptionRow?> UpdateAsync(int companyId, int subscriptionId, SaveSubscriptionDto dto, DateTime today);
    Task<bool> CancelAsync(int companyId, int subscriptionId, string reason);
    Task<bool> ExistsForQuotationAsync(int companyId, int quotationId);
    // Called when a renewal invoice is issued: the customer is now paid up to periodEnd.
    Task ExtendAsync(int subscriptionId, DateTime periodEnd);
    // Called when that invoice is cancelled: back to the day before the period, if nothing later was billed since.
    Task RevertAsync(int subscriptionId, DateTime periodStart, DateTime periodEnd);
    // All companies: active auto-renew subscriptions inside their renewal window with no renewal invoice yet.
    Task<IEnumerable<SubscriptionRow>> DueForAutoRenewalAsync(DateTime today);
}

public static class Cycles
{
    public static int Months(string cycle) => cycle switch { "MONTHLY" => 1, "QUARTERLY" => 3, _ => 12 };

    // The next period after a subscription's paid-up date.
    public static (DateTime Start, DateTime End) NextPeriod(DateTime endDate, string cycle)
    {
        var start = endDate.Date.AddDays(1);
        return (start, start.AddMonths(Months(cycle)).AddDays(-1));
    }
}

public class SubscriptionRepository : ISubscriptionRepository
{
    private readonly IDbConnectionFactory _factory;
    public SubscriptionRepository(IDbConnectionFactory factory) => _factory = factory;

    private const string Select = @"
        SELECT s.*, l.lead_seq, l.assigned_to AS lead_assigned_to, u.full_name AS assigned_to_name, l.customer_id,
               c.customer_name, c.whatsapp_name, c.mobile_no, c.email, a.account_id, a.account_name, p.product_code,
               CASE WHEN s.status = 'CANCELLED' THEN 'CANCELLED'
                    WHEN s.end_date < @today THEN 'EXPIRED'
                    WHEN s.end_date <= DATEADD(DAY, w.lead_days, @today) THEN 'DUE'
                    ELSE 'ACTIVE' END AS state,
               DATEDIFF(DAY, @today, s.end_date) AS days_left,
               v.cycle_amount, w.lead_days,
               CAST(v.cycle_amount * 12 / CASE s.billing_cycle WHEN 'MONTHLY' THEN 1 WHEN 'QUARTERLY' THEN 3 ELSE 12 END AS DECIMAL(18,2)) AS annual_value,
               CAST(v.cycle_amount / CASE s.billing_cycle WHEN 'MONTHLY' THEN 1 WHEN 'QUARTERLY' THEN 3 ELSE 12 END AS DECIMAL(18,2)) AS monthly_value,
               r.invoice_id AS renewal_invoice_id, r.status AS renewal_invoice_status
        FROM dbo.wsm_subscriptions s
        JOIN dbo.wsm_leads l ON l.lead_id = s.lead_id
        JOIN dbo.wsm_customers c ON c.customer_id = l.customer_id
        LEFT JOIN dbo.wsm_accounts a ON a.account_id = c.account_id
        LEFT JOIN dbo.wsm_users u ON u.user_id = l.assigned_to
        LEFT JOIN dbo.wsm_products p ON p.product_id = s.product_id
        CROSS APPLY (SELECT ROUND(s.quantity * s.unit_price * (100 - s.discount_pct) / 100, 2) AS cycle_amount) v
        -- How far ahead of the end a renewal is due: a week for monthly plans, 15 days quarterly, 30 days yearly.
        CROSS APPLY (SELECT CASE s.billing_cycle WHEN 'MONTHLY' THEN 7 WHEN 'QUARTERLY' THEN 15 ELSE 30 END AS lead_days) w
        OUTER APPLY (SELECT TOP 1 i.invoice_id, i.status FROM dbo.wsm_invoices i
                     WHERE i.subscription_id = s.subscription_id AND i.status <> 'CANCELLED'
                       AND i.period_start = DATEADD(DAY, 1, s.end_date)
                     ORDER BY i.invoice_id DESC) r";

    public async Task<IEnumerable<SubscriptionRow>> GetAllAsync(int companyId, int? onlyUserId, SubscriptionFilter f, DateTime today)
    {
        using var db = _factory.CreateConnection();
        return await db.QueryAsync<SubscriptionRow>($@"
            SELECT * FROM ({Select}
                WHERE s.company_id = @companyId
                  AND (@onlyUserId IS NULL OR l.assigned_to = @onlyUserId)
                  AND (@leadId IS NULL OR s.lead_id = @leadId)
                  AND (@accountId IS NULL OR a.account_id = @accountId)
                  AND (@search IS NULL OR s.description LIKE '%' + @search + '%' OR a.account_name LIKE '%' + @search + '%'
                       OR c.customer_name LIKE '%' + @search + '%' OR p.product_code LIKE '%' + @search + '%')
            ) x
            WHERE @view IS NULL OR x.state = @view
            ORDER BY CASE x.state WHEN 'EXPIRED' THEN 0 WHEN 'DUE' THEN 1 WHEN 'ACTIVE' THEN 2 ELSE 3 END, x.end_date",
            new
            {
                companyId, onlyUserId, today, f.LeadId, f.AccountId,
                search = string.IsNullOrWhiteSpace(f.Search) ? null : f.Search.Trim(),
                view = string.IsNullOrWhiteSpace(f.View) ? null : f.View
            });
    }

    public async Task<SubscriptionRow?> GetByIdAsync(int companyId, int subscriptionId, DateTime today)
    {
        using var db = _factory.CreateConnection();
        return await db.QuerySingleOrDefaultAsync<SubscriptionRow>(
            Select + " WHERE s.company_id = @companyId AND s.subscription_id = @subscriptionId", new { companyId, subscriptionId, today });
    }

    // Expired subscriptions still count as recurring revenue until someone cancels them.
    public async Task<SubscriptionSummary> SummaryAsync(int companyId, int? onlyUserId, DateTime today)
    {
        using var db = _factory.CreateConnection();
        return await db.QuerySingleAsync<SubscriptionSummary>($@"
            SELECT ISNULL(SUM(CASE WHEN x.state <> 'CANCELLED' THEN 1 ELSE 0 END), 0) AS active,
                   ISNULL(SUM(CASE WHEN x.state = 'DUE' THEN 1 ELSE 0 END), 0) AS due_soon,
                   ISNULL(SUM(CASE WHEN x.state = 'EXPIRED' THEN 1 ELSE 0 END), 0) AS expired,
                   ISNULL(SUM(CASE WHEN x.state <> 'CANCELLED' THEN x.monthly_value ELSE 0 END), 0) AS mrr,
                   ISNULL(SUM(CASE WHEN x.state <> 'CANCELLED' THEN x.annual_value ELSE 0 END), 0) AS arr,
                   ISNULL(SUM(CASE WHEN x.state IN ('DUE', 'EXPIRED') THEN x.cycle_amount ELSE 0 END), 0) AS due_value
            FROM ({Select} WHERE s.company_id = @companyId AND (@onlyUserId IS NULL OR l.assigned_to = @onlyUserId)) x",
            new { companyId, onlyUserId, today });
    }

    private const string Columns = @"
        product_id = (SELECT product_id FROM dbo.wsm_products WHERE product_id = @ProductId AND company_id = @companyId),
        description = @Description, unit = @Unit, quantity = @Quantity, unit_price = @UnitPrice, discount_pct = @DiscountPct,
        vat_pct = @VatPct, billing_cycle = @BillingCycle, start_date = @StartDate, end_date = @EndDate, auto_renew = @AutoRenew,
        notes = @Notes";

    private static DynamicParameters Params(SaveSubscriptionDto dto, object extra)
    {
        var p = new DynamicParameters(new
        {
            dto.ProductId, dto.Description, dto.Unit, dto.Quantity, UnitPrice = Math.Round(dto.UnitPrice, 2), dto.DiscountPct, dto.VatPct,
            dto.BillingCycle, StartDate = dto.StartDate.Date, EndDate = dto.EndDate.Date, dto.AutoRenew, dto.Notes
        });
        p.AddDynamicParams(extra);
        return p;
    }

    public async Task<SubscriptionRow?> CreateAsync(int companyId, SaveSubscriptionDto dto, int? quotationId, int userId, DateTime today)
    {
        using var db = _factory.CreateConnection();
        var id = await db.ExecuteScalarAsync<int>(@"
            INSERT INTO dbo.wsm_subscriptions (company_id, lead_id, quotation_id, description, quantity, unit_price, billing_cycle,
                                               start_date, end_date, created_by)
            VALUES (@companyId, @LeadId, @quotationId, @Description, 1, 0, 'YEARLY', @StartDate, @EndDate, @userId);
            SELECT CAST(SCOPE_IDENTITY() AS INT);",
            new { companyId, dto.LeadId, quotationId, dto.Description, StartDate = dto.StartDate.Date, EndDate = dto.EndDate.Date, userId });
        await db.ExecuteAsync($"UPDATE dbo.wsm_subscriptions SET {Columns} WHERE subscription_id = @id", Params(dto, new { id, companyId }));
        return await GetByIdAsync(companyId, id, today);
    }

    public async Task<SubscriptionRow?> UpdateAsync(int companyId, int subscriptionId, SaveSubscriptionDto dto, DateTime today)
    {
        using var db = _factory.CreateConnection();
        var n = await db.ExecuteAsync($@"
            UPDATE dbo.wsm_subscriptions SET {Columns}, updated_at = SYSUTCDATETIME()
            WHERE company_id = @companyId AND subscription_id = @subscriptionId AND status = 'ACTIVE'",
            Params(dto, new { companyId, subscriptionId }));
        return n == 0 ? null : await GetByIdAsync(companyId, subscriptionId, today);
    }

    public async Task<bool> CancelAsync(int companyId, int subscriptionId, string reason)
    {
        using var db = _factory.CreateConnection();
        return await db.ExecuteAsync(@"
            UPDATE dbo.wsm_subscriptions SET status = 'CANCELLED', cancelled_at = SYSUTCDATETIME(), cancel_reason = @reason,
                   auto_renew = 'F', updated_at = SYSUTCDATETIME()
            WHERE company_id = @companyId AND subscription_id = @subscriptionId AND status = 'ACTIVE'",
            new { companyId, subscriptionId, reason }) > 0;
    }

    public async Task<bool> ExistsForQuotationAsync(int companyId, int quotationId)
    {
        using var db = _factory.CreateConnection();
        return await db.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM dbo.wsm_subscriptions WHERE company_id = @companyId AND quotation_id = @quotationId",
            new { companyId, quotationId }) > 0;
    }

    public async Task ExtendAsync(int subscriptionId, DateTime periodEnd)
    {
        using var db = _factory.CreateConnection();
        await db.ExecuteAsync(@"
            UPDATE dbo.wsm_subscriptions SET end_date = @periodEnd, updated_at = SYSUTCDATETIME()
            WHERE subscription_id = @subscriptionId AND end_date < @periodEnd",
            new { subscriptionId, periodEnd = periodEnd.Date });
    }

    public async Task RevertAsync(int subscriptionId, DateTime periodStart, DateTime periodEnd)
    {
        using var db = _factory.CreateConnection();
        await db.ExecuteAsync(@"
            UPDATE dbo.wsm_subscriptions SET end_date = @before, updated_at = SYSUTCDATETIME()
            WHERE subscription_id = @subscriptionId AND end_date = @periodEnd",
            new { subscriptionId, periodEnd = periodEnd.Date, before = periodStart.Date.AddDays(-1) });
    }

    public async Task<IEnumerable<SubscriptionRow>> DueForAutoRenewalAsync(DateTime today)
    {
        using var db = _factory.CreateConnection();
        return await db.QueryAsync<SubscriptionRow>(Select + @"
            WHERE s.status = 'ACTIVE' AND s.auto_renew = 'T' AND s.end_date <= DATEADD(DAY, w.lead_days, @today) AND r.invoice_id IS NULL",
            new { today = today.Date });
    }
}
