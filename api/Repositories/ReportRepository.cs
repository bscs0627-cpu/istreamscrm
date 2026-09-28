using Dapper;
using IStreamsCrm.Api.Data;

namespace IStreamsCrm.Api.Repositories;

public class ReportSummary
{
    public int NewLeads { get; set; }
    public int NewLeadsWon { get; set; }
    public int DealsWon { get; set; }
    public int DealsLost { get; set; }
    public decimal DealValue { get; set; }
    public int OpenLeads { get; set; }
    public int OverdueFollowUps { get; set; }
}

public class ReportCount
{
    public string Key { get; set; } = string.Empty;
    public int Leads { get; set; }
    public int Won { get; set; }
}

public class ReportAgentRow
{
    public int? UserId { get; set; }
    public string? FullName { get; set; }
    public int Leads { get; set; }
    public int Open { get; set; }
    public int Won { get; set; }
    public int Lost { get; set; }
    public int DealsWon { get; set; }
    public decimal DealValue { get; set; }
    public int FollowUpsDone { get; set; }
    public int OverdueFollowUps { get; set; }
}

public class ReportDay
{
    public DateTime Day { get; set; }
    public int Leads { get; set; }
}

public class LeadReport
{
    public ReportSummary Summary { get; set; } = new();
    public IEnumerable<ReportCount> ByStatus { get; set; } = Enumerable.Empty<ReportCount>();
    public IEnumerable<ReportCount> BySource { get; set; } = Enumerable.Empty<ReportCount>();
    public IEnumerable<ReportAgentRow> ByAgent { get; set; } = Enumerable.Empty<ReportAgentRow>();
    public IEnumerable<ReportDay> ByDay { get; set; } = Enumerable.Empty<ReportDay>();
}

public class RevenueSummary
{
    public int QuotesSent { get; set; }
    public int QuotesAccepted { get; set; }
    public int QuotesRejected { get; set; }
    public decimal QuotedValue { get; set; }
    public decimal AcceptedValue { get; set; }
    public int InvoicesIssued { get; set; }
    public decimal Invoiced { get; set; }
    public decimal Collected { get; set; }
    public decimal OutstandingNow { get; set; }
    public decimal OverdueNow { get; set; }
    public decimal Mrr { get; set; }
    public decimal Arr { get; set; }
}

public class RevenueDay
{
    public DateTime Day { get; set; }
    public decimal Invoiced { get; set; }
    public decimal Collected { get; set; }
}

public class RevenueProductRow
{
    public string? ProductCode { get; set; }
    public string Product { get; set; } = string.Empty;
    public int Lines { get; set; }
    public decimal Amount { get; set; }
}

public class RevenueReport
{
    public RevenueSummary Summary { get; set; } = new();
    public IEnumerable<RevenueDay> ByDay { get; set; } = Enumerable.Empty<RevenueDay>();
    public IEnumerable<RevenueProductRow> ByProduct { get; set; } = Enumerable.Empty<RevenueProductRow>();
}

public class TicketSlaSummary
{
    public int Opened { get; set; }
    public int Resolved { get; set; }
    public int Reopened { get; set; }
    public int MetSla { get; set; }
    public int MissedSla { get; set; }
    public double? AvgResolutionHours { get; set; }
    public double? AvgFirstResponseHours { get; set; }
    public int StillOpen { get; set; }
    public int StillOverdue { get; set; }
}

public class TicketCountRow
{
    public string Key { get; set; } = string.Empty;
    public int Count { get; set; }
}

public class TicketAgentRow
{
    public int? UserId { get; set; }
    public string? FullName { get; set; }
    public int Resolved { get; set; }
    public int MetSla { get; set; }
    public double? AvgResolutionHours { get; set; }
}

public class TicketReport
{
    public TicketSlaSummary Summary { get; set; } = new();
    public IEnumerable<TicketCountRow> ByCategory { get; set; } = Enumerable.Empty<TicketCountRow>();
    public IEnumerable<TicketCountRow> ByType { get; set; } = Enumerable.Empty<TicketCountRow>();
    public IEnumerable<TicketAgentRow> ByAgent { get; set; } = Enumerable.Empty<TicketAgentRow>();
}

public interface IReportRepository
{
    // fromUtc / toUtc: the period's boundaries (end exclusive). agentId: one agent's leads (staff always see only theirs).
    Task<LeadReport> LeadsAsync(int companyId, DateTime fromUtc, DateTime toUtc, int tzOffsetMinutes, int? agentId);
    Task<RevenueReport> RevenueAsync(int companyId, DateTime fromUtc, DateTime toUtc, int tzOffsetMinutes, int? agentId);
    Task<TicketReport> TicketsAsync(int companyId, DateTime fromUtc, DateTime toUtc, int? agentId);
}

// "New" figures count leads created in the period; "deals" count leads closed (Won / Lost) in the period.
public class ReportRepository : IReportRepository
{
    private readonly IDbConnectionFactory _factory;
    public ReportRepository(IDbConnectionFactory factory) => _factory = factory;

    public async Task<LeadReport> LeadsAsync(int companyId, DateTime fromUtc, DateTime toUtc, int tzOffsetMinutes, int? agentId)
    {
        const string created = "l.company_id = @companyId AND l.created_at >= @fromUtc AND l.created_at < @toUtc AND (@agentId IS NULL OR l.assigned_to = @agentId)";
        const string closed = "l.company_id = @companyId AND l.closed_at >= @fromUtc AND l.closed_at < @toUtc AND (@agentId IS NULL OR l.assigned_to = @agentId)";
        var sql = $@"
            SELECT
                (SELECT COUNT(*) FROM dbo.wsm_leads l WHERE {created}) AS new_leads,
                (SELECT COUNT(*) FROM dbo.wsm_leads l WHERE {created} AND l.status = 'WON') AS new_leads_won,
                (SELECT COUNT(*) FROM dbo.wsm_leads l WHERE {closed} AND l.status = 'WON') AS deals_won,
                (SELECT COUNT(*) FROM dbo.wsm_leads l WHERE {closed} AND l.status IN ('LOST', 'NOT_INTERESTED')) AS deals_lost,
                (SELECT ISNULL(SUM(l.deal_value), 0) FROM dbo.wsm_leads l WHERE {closed} AND l.status = 'WON') AS deal_value,
                (SELECT COUNT(*) FROM dbo.wsm_leads l WHERE l.company_id = @companyId AND (@agentId IS NULL OR l.assigned_to = @agentId)
                    AND l.status NOT IN ('WON', 'NOT_INTERESTED', 'LOST')) AS open_leads,
                (SELECT COUNT(*) FROM dbo.wsm_follow_ups f WHERE f.company_id = @companyId AND f.is_done = 'F' AND f.due_at < SYSUTCDATETIME()
                    AND (@agentId IS NULL OR f.assigned_to = @agentId)) AS overdue_follow_ups;

            SELECT l.status AS [key], COUNT(*) AS leads, 0 AS won FROM dbo.wsm_leads l WHERE {created} GROUP BY l.status;

            SELECT l.source AS [key], COUNT(*) AS leads, SUM(CASE WHEN l.status = 'WON' THEN 1 ELSE 0 END) AS won
            FROM dbo.wsm_leads l WHERE {created} GROUP BY l.source ORDER BY COUNT(*) DESC;

            SELECT l.assigned_to AS user_id, COUNT(*) AS leads,
                   SUM(CASE WHEN l.status NOT IN ('WON', 'NOT_INTERESTED', 'LOST') THEN 1 ELSE 0 END) AS [open],
                   SUM(CASE WHEN l.status = 'WON' THEN 1 ELSE 0 END) AS won,
                   SUM(CASE WHEN l.status IN ('LOST', 'NOT_INTERESTED') THEN 1 ELSE 0 END) AS lost
            FROM dbo.wsm_leads l WHERE {created} GROUP BY l.assigned_to;

            SELECT l.assigned_to AS user_id, COUNT(*) AS deals_won, ISNULL(SUM(l.deal_value), 0) AS deal_value
            FROM dbo.wsm_leads l WHERE {closed} AND l.status = 'WON' GROUP BY l.assigned_to;

            SELECT f.assigned_to AS user_id,
                   SUM(CASE WHEN f.is_done = 'T' AND f.done_at >= @fromUtc AND f.done_at < @toUtc THEN 1 ELSE 0 END) AS follow_ups_done,
                   SUM(CASE WHEN f.is_done = 'F' AND f.due_at < SYSUTCDATETIME() THEN 1 ELSE 0 END) AS overdue_follow_ups
            FROM dbo.wsm_follow_ups f
            WHERE f.company_id = @companyId AND (@agentId IS NULL OR f.assigned_to = @agentId)
            GROUP BY f.assigned_to;

            SELECT user_id, full_name FROM dbo.wsm_users WHERE company_id = @companyId;

            SELECT CAST(DATEADD(MINUTE, -@tzOffsetMinutes, l.created_at) AS DATE) AS day, COUNT(*) AS leads
            FROM dbo.wsm_leads l WHERE {created}
            GROUP BY CAST(DATEADD(MINUTE, -@tzOffsetMinutes, l.created_at) AS DATE) ORDER BY day;";

        using var db = _factory.CreateConnection();
        using var grid = await db.QueryMultipleAsync(sql, new { companyId, fromUtc, toUtc, tzOffsetMinutes, agentId });
        var report = new LeadReport
        {
            Summary = await grid.ReadSingleAsync<ReportSummary>(),
            ByStatus = (await grid.ReadAsync<ReportCount>()).ToList(),
            BySource = (await grid.ReadAsync<ReportCount>()).ToList(),
        };
        var created_ = (await grid.ReadAsync<ReportAgentRow>()).ToDictionary(r => r.UserId ?? 0);
        var deals = (await grid.ReadAsync<ReportAgentRow>()).ToList();
        var followUps = (await grid.ReadAsync<ReportAgentRow>()).ToList();
        var names = (await grid.ReadAsync<(int UserId, string FullName)>()).ToDictionary(u => u.UserId, u => u.FullName);
        report.ByDay = (await grid.ReadAsync<ReportDay>()).ToList();

        // One row per agent (0 = unassigned) across the three agent queries.
        ReportAgentRow Row(int? userId) =>
            created_.TryGetValue(userId ?? 0, out var r) ? r : created_[userId ?? 0] = new ReportAgentRow { UserId = userId };
        foreach (var d in deals) { var r = Row(d.UserId); r.DealsWon = d.DealsWon; r.DealValue = d.DealValue; }
        foreach (var f in followUps) { var r = Row(f.UserId); r.FollowUpsDone = f.FollowUpsDone; r.OverdueFollowUps = f.OverdueFollowUps; }
        foreach (var r in created_.Values)
            r.FullName = r.UserId is null ? null : names.GetValueOrDefault(r.UserId.Value);
        report.ByAgent = created_.Values
            .Where(r => r.Leads + r.DealsWon + r.FollowUpsDone + r.OverdueFollowUps > 0)
            .OrderByDescending(r => r.DealValue).ThenByDescending(r => r.Won).ThenByDescending(r => r.Leads)
            .ToList();
        return report;
    }

    // Quotations/invoices count in the period by when they were sent / issued; "now" figures (outstanding, MRR) ignore the period.
    public async Task<RevenueReport> RevenueAsync(int companyId, DateTime fromUtc, DateTime toUtc, int tzOffsetMinutes, int? agentId)
    {
        const string quoted = @"q.company_id = @companyId AND q.sent_at >= @fromUtc AND q.sent_at < @toUtc
                                 AND (@agentId IS NULL OR l.assigned_to = @agentId)";
        const string issued = @"i.company_id = @companyId AND i.issued_at >= @fromUtc AND i.issued_at < @toUtc
                                 AND (@agentId IS NULL OR l.assigned_to = @agentId)";
        var sql = $@"
            SELECT
                (SELECT COUNT(*) FROM dbo.wsm_quotations q JOIN dbo.wsm_leads l ON l.lead_id = q.lead_id WHERE {quoted}) AS quotes_sent,
                (SELECT COUNT(*) FROM dbo.wsm_quotations q JOIN dbo.wsm_leads l ON l.lead_id = q.lead_id
                    WHERE {quoted} AND q.status = 'ACCEPTED') AS quotes_accepted,
                (SELECT COUNT(*) FROM dbo.wsm_quotations q JOIN dbo.wsm_leads l ON l.lead_id = q.lead_id
                    WHERE {quoted} AND q.status = 'REJECTED') AS quotes_rejected,
                (SELECT ISNULL(SUM(q.subtotal - q.discount_total), 0) FROM dbo.wsm_quotations q JOIN dbo.wsm_leads l ON l.lead_id = q.lead_id WHERE {quoted}) AS quoted_value,
                (SELECT ISNULL(SUM(q.subtotal - q.discount_total), 0) FROM dbo.wsm_quotations q JOIN dbo.wsm_leads l ON l.lead_id = q.lead_id
                    WHERE {quoted} AND q.status = 'ACCEPTED') AS accepted_value,
                (SELECT COUNT(*) FROM dbo.wsm_invoices i JOIN dbo.wsm_leads l ON l.lead_id = i.lead_id WHERE {issued}) AS invoices_issued,
                (SELECT ISNULL(SUM(i.grand_total), 0) FROM dbo.wsm_invoices i JOIN dbo.wsm_leads l ON l.lead_id = i.lead_id WHERE {issued}) AS invoiced,
                (SELECT ISNULL(SUM(p.amount), 0) FROM dbo.wsm_payments p JOIN dbo.wsm_invoices i ON i.invoice_id = p.invoice_id JOIN dbo.wsm_leads l ON l.lead_id = i.lead_id
                    WHERE i.company_id = @companyId AND p.payment_date >= @fromDate AND p.payment_date < @toDate
                      AND (@agentId IS NULL OR l.assigned_to = @agentId)) AS collected,
                (SELECT ISNULL(SUM(i.grand_total - i.amount_paid), 0) FROM dbo.wsm_invoices i JOIN dbo.wsm_leads l ON l.lead_id = i.lead_id
                    WHERE i.company_id = @companyId AND i.status = 'ISSUED' AND (@agentId IS NULL OR l.assigned_to = @agentId)) AS outstanding_now,
                (SELECT ISNULL(SUM(i.grand_total - i.amount_paid), 0) FROM dbo.wsm_invoices i JOIN dbo.wsm_leads l ON l.lead_id = i.lead_id
                    WHERE i.company_id = @companyId AND i.status = 'ISSUED' AND i.due_date < CAST(SYSUTCDATETIME() AS DATE)
                      AND (@agentId IS NULL OR l.assigned_to = @agentId)) AS overdue_now,
                (SELECT ISNULL(SUM(CAST(ROUND(s.quantity * s.unit_price * (100 - s.discount_pct) / 100, 2)
                                        / CASE s.billing_cycle WHEN 'MONTHLY' THEN 1 WHEN 'QUARTERLY' THEN 3 ELSE 12 END AS DECIMAL(18,2))), 0)
                    FROM dbo.wsm_subscriptions s JOIN dbo.wsm_leads l ON l.lead_id = s.lead_id
                    WHERE s.company_id = @companyId AND s.status = 'ACTIVE' AND (@agentId IS NULL OR l.assigned_to = @agentId)) AS mrr;

            SELECT CAST(DATEADD(MINUTE, -@tzOffsetMinutes, i.issued_at) AS DATE) AS day, SUM(i.grand_total) AS invoiced, 0 AS collected
            FROM dbo.wsm_invoices i JOIN dbo.wsm_leads l ON l.lead_id = i.lead_id WHERE {issued}
            GROUP BY CAST(DATEADD(MINUTE, -@tzOffsetMinutes, i.issued_at) AS DATE);

            SELECT CAST(p.payment_date AS DATE) AS day, 0 AS invoiced, SUM(p.amount) AS collected
            FROM dbo.wsm_payments p JOIN dbo.wsm_invoices i ON i.invoice_id = p.invoice_id JOIN dbo.wsm_leads l ON l.lead_id = i.lead_id
            WHERE i.company_id = @companyId AND p.payment_date >= @fromDate AND p.payment_date < @toDate
              AND (@agentId IS NULL OR l.assigned_to = @agentId)
            GROUP BY CAST(p.payment_date AS DATE);

            SELECT p.product_code, ISNULL(p.product_name, 'Other / custom') AS product, COUNT(*) AS lines, SUM(il.net_amount) AS amount
            FROM dbo.wsm_invoice_lines il
            JOIN dbo.wsm_invoices i ON i.invoice_id = il.invoice_id
            JOIN dbo.wsm_leads l ON l.lead_id = i.lead_id
            LEFT JOIN dbo.wsm_products p ON p.product_id = il.product_id
            WHERE {issued}
            GROUP BY p.product_code, p.product_name
            ORDER BY SUM(il.net_amount) DESC;";

        using var db = _factory.CreateConnection();
        using var grid = await db.QueryMultipleAsync(sql, new
        {
            companyId, fromUtc, toUtc, tzOffsetMinutes, agentId,
            fromDate = fromUtc.AddMinutes(-tzOffsetMinutes).Date, toDate = toUtc.AddMinutes(-tzOffsetMinutes).Date
        });
        var report = new RevenueReport { Summary = await grid.ReadSingleAsync<RevenueSummary>() };
        report.Summary.Arr = report.Summary.Mrr * 12;
        var byDay = (await grid.ReadAsync<RevenueDay>()).Concat(await grid.ReadAsync<RevenueDay>())
            .GroupBy(d => d.Day).Select(g => new RevenueDay { Day = g.Key, Invoiced = g.Sum(x => x.Invoiced), Collected = g.Sum(x => x.Collected) })
            .OrderBy(d => d.Day).ToList();
        report.ByDay = byDay;
        report.ByProduct = (await grid.ReadAsync<RevenueProductRow>()).ToList();
        return report;
    }

    // "Opened"/"resolved" count in the period; SLA compliance is measured against tickets resolved in the period.
    public async Task<TicketReport> TicketsAsync(int companyId, DateTime fromUtc, DateTime toUtc, int? agentId)
    {
        const string opened = "t.company_id = @companyId AND t.created_at >= @fromUtc AND t.created_at < @toUtc AND (@agentId IS NULL OR t.assigned_to = @agentId)";
        const string resolved = @"t.company_id = @companyId AND t.resolved_at >= @fromUtc AND t.resolved_at < @toUtc
                                   AND (@agentId IS NULL OR t.assigned_to = @agentId)";
        var sql = $@"
            SELECT
                (SELECT COUNT(*) FROM dbo.wsm_tickets t WHERE {opened}) AS opened,
                (SELECT COUNT(*) FROM dbo.wsm_tickets t WHERE {resolved}) AS resolved,
                (SELECT COUNT(*) FROM dbo.wsm_ticket_comments k JOIN dbo.wsm_tickets t ON t.ticket_id = k.ticket_id
                    WHERE k.kind = 'STATUS' AND k.body LIKE N'WAITING → IN_PROGRESS%' AND k.created_at >= @fromUtc AND k.created_at < @toUtc
                      AND t.company_id = @companyId AND (@agentId IS NULL OR t.assigned_to = @agentId)) AS reopened,
                (SELECT COUNT(*) FROM dbo.wsm_tickets t WHERE {resolved} AND t.resolved_at <= t.due_at) AS met_sla,
                (SELECT COUNT(*) FROM dbo.wsm_tickets t WHERE {resolved} AND t.resolved_at > t.due_at) AS missed_sla,
                (SELECT AVG(CAST(DATEDIFF(MINUTE, t.created_at, t.resolved_at) AS FLOAT) / 60)
                    FROM dbo.wsm_tickets t WHERE {resolved}) AS avg_resolution_hours,
                (SELECT AVG(CAST(DATEDIFF(MINUTE, t.created_at, t.first_response_at) AS FLOAT) / 60)
                    FROM dbo.wsm_tickets t WHERE t.company_id = @companyId AND t.first_response_at >= @fromUtc AND t.first_response_at < @toUtc
                      AND (@agentId IS NULL OR t.assigned_to = @agentId)) AS avg_first_response_hours,
                (SELECT COUNT(*) FROM dbo.wsm_tickets t WHERE t.company_id = @companyId AND t.status NOT IN ('RESOLVED', 'CLOSED', 'REJECTED')
                    AND (@agentId IS NULL OR t.assigned_to = @agentId)) AS still_open,
                (SELECT COUNT(*) FROM dbo.wsm_tickets t WHERE t.company_id = @companyId AND t.status NOT IN ('RESOLVED', 'CLOSED', 'REJECTED')
                    AND t.due_at < SYSUTCDATETIME() AND (@agentId IS NULL OR t.assigned_to = @agentId)) AS still_overdue;

            SELECT t.category AS [key], COUNT(*) AS count FROM dbo.wsm_tickets t WHERE {opened} GROUP BY t.category ORDER BY COUNT(*) DESC;

            SELECT t.ticket_type AS [key], COUNT(*) AS count FROM dbo.wsm_tickets t WHERE {opened} GROUP BY t.ticket_type;

            SELECT t.assigned_to AS user_id, u.full_name,
                   COUNT(*) AS resolved,
                   SUM(CASE WHEN t.resolved_at <= t.due_at THEN 1 ELSE 0 END) AS met_sla,
                   AVG(CAST(DATEDIFF(MINUTE, t.created_at, t.resolved_at) AS FLOAT) / 60) AS avg_resolution_hours
            FROM dbo.wsm_tickets t LEFT JOIN dbo.wsm_users u ON u.user_id = t.assigned_to
            WHERE {resolved}
            GROUP BY t.assigned_to, u.full_name
            ORDER BY COUNT(*) DESC;";

        using var db = _factory.CreateConnection();
        using var grid = await db.QueryMultipleAsync(sql, new { companyId, fromUtc, toUtc, agentId });
        return new TicketReport
        {
            Summary = await grid.ReadSingleAsync<TicketSlaSummary>(),
            ByCategory = (await grid.ReadAsync<TicketCountRow>()).ToList(),
            ByType = (await grid.ReadAsync<TicketCountRow>()).ToList(),
            ByAgent = (await grid.ReadAsync<TicketAgentRow>()).ToList()
        };
    }
}
