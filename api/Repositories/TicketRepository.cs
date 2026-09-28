using Dapper;
using IStreamsCrm.Api.Data;
using IStreamsCrm.Api.DTOs;

namespace IStreamsCrm.Api.Repositories;

public interface ITicketRepository
{
    // onlyUserId (staff): tickets assigned to them plus the unassigned queue. userId decides the MINE view.
    Task<IEnumerable<TicketRow>> GetAllAsync(int companyId, int? onlyUserId, int userId, TicketFilter f);
    Task<TicketSummary> SummaryAsync(int companyId, int? onlyUserId, int userId);
    Task<TicketRow?> GetByIdAsync(int companyId, int ticketId);
    Task<TicketRow?> CreateAsync(int companyId, SaveTicketDto dto, int userId);
    Task<TicketRow?> UpdateAsync(int companyId, int ticketId, SaveTicketDto dto);
    Task SetStatusAsync(int ticketId, string from, string to, string? note, int? userId);
    Task AssignAsync(int ticketId, int? toUserId, string text, int userId);
    Task AddCommentAsync(int ticketId, string kind, string? channel, string body, int? userId);
    Task SetEstimateAsync(int ticketId, decimal hours, decimal rate, int userId);
    Task LinkQuotationAsync(int ticketId, int leadId, int quotationId);
    // A quotation made for change requests was accepted / declined.
    Task QuotationClosedAsync(int companyId, int leadId, bool accepted, string quoteNo);
    Task<bool> DeleteAsync(int companyId, int ticketId);
}

public class TicketRepository : ITicketRepository
{
    private readonly IDbConnectionFactory _factory;
    public TicketRepository(IDbConnectionFactory factory) => _factory = factory;

    private const string Select = @"
        SELECT t.*, c.customer_name, c.whatsapp_name, c.mobile_no, c.email, c.account_id, a.account_name,
               p.product_code, p.product_name, u.full_name AS assigned_to_name, cb.full_name AS created_by_name,
               l.lead_seq, q.status AS quote_status, q.quotation_id AS quote_latest_id,
               CASE WHEN q.quotation_id IS NULL THEN NULL
                    ELSE CONCAT('QT-', q.quote_year, '-', RIGHT('0000' + CAST(q.quote_seq AS VARCHAR(10)), 4),
                                CASE WHEN q.revision > 0 THEN CONCAT('-R', q.revision) ELSE '' END) END AS quote_no,
               CAST(CASE WHEN t.status NOT IN ('RESOLVED', 'CLOSED', 'REJECTED') AND t.due_at < SYSUTCDATETIME() THEN 1 ELSE 0 END AS BIT) AS is_overdue,
               cov.description AS coverage_name, cov.end_date AS coverage_until,
               (SELECT COUNT(*) FROM dbo.wsm_ticket_comments k WHERE k.ticket_id = t.ticket_id AND k.kind <> 'STATUS') AS comment_count
        FROM dbo.wsm_tickets t
        JOIN dbo.wsm_customers c ON c.customer_id = t.customer_id
        LEFT JOIN dbo.wsm_accounts a ON a.account_id = c.account_id
        LEFT JOIN dbo.wsm_products p ON p.product_id = t.product_id AND p.company_id = t.company_id
        LEFT JOIN dbo.wsm_users u ON u.user_id = t.assigned_to
        LEFT JOIN dbo.wsm_users cb ON cb.user_id = t.created_by
        LEFT JOIN dbo.wsm_leads l ON l.lead_id = t.lead_id AND l.company_id = t.company_id
        -- The latest revision of the quotation made for a change request.
        OUTER APPLY (SELECT TOP 1 q2.quotation_id, q2.quote_year, q2.quote_seq, q2.revision, q2.status
                     FROM dbo.wsm_quotations q0
                     JOIN dbo.wsm_quotations q2 ON q2.company_id = q0.company_id AND q2.quote_year = q0.quote_year AND q2.quote_seq = q0.quote_seq
                     WHERE q0.quotation_id = t.quotation_id AND q0.company_id = t.company_id
                     ORDER BY q2.revision DESC) q
        OUTER APPLY (SELECT TOP 1 s.description, s.end_date
                     FROM dbo.wsm_subscriptions s
                     JOIN dbo.wsm_leads sl ON sl.lead_id = s.lead_id
                     JOIN dbo.wsm_customers sc ON sc.customer_id = sl.customer_id
                     WHERE s.company_id = t.company_id AND s.status = 'ACTIVE' AND s.end_date >= CAST(SYSUTCDATETIME() AS DATE)
                       AND (sc.customer_id = t.customer_id OR (c.account_id IS NOT NULL AND sc.account_id = c.account_id))
                     ORDER BY s.end_date DESC) cov";

    private const string Scope = "(@onlyUserId IS NULL OR t.assigned_to = @onlyUserId OR t.assigned_to IS NULL)";

    public async Task<IEnumerable<TicketRow>> GetAllAsync(int companyId, int? onlyUserId, int userId, TicketFilter f)
    {
        var search = string.IsNullOrWhiteSpace(f.Search) ? null : f.Search.Trim();
        int? seq = null;
        if (search is not null)
        {
            var digits = search.Split('-').Last();
            if (int.TryParse(digits, out var n)) seq = n;
        }
        var view = f.View switch
        {
            "OPEN" => "AND t.status NOT IN ('RESOLVED', 'CLOSED', 'REJECTED')",
            "MINE" => "AND t.status NOT IN ('RESOLVED', 'CLOSED', 'REJECTED') AND t.assigned_to = @userId",
            "UNASSIGNED" => "AND t.status NOT IN ('RESOLVED', 'CLOSED', 'REJECTED') AND t.assigned_to IS NULL",
            "OVERDUE" => "AND t.status NOT IN ('RESOLVED', 'CLOSED', 'REJECTED') AND t.due_at < SYSUTCDATETIME()",
            "WAITING" => "AND t.status = 'WAITING'",
            "DONE" => "AND t.status IN ('RESOLVED', 'CLOSED', 'REJECTED')",
            _ => ""
        };
        using var db = _factory.CreateConnection();
        return await db.QueryAsync<TicketRow>(Select + $@"
            WHERE t.company_id = @companyId AND {Scope} {view}
              AND (@type IS NULL OR t.ticket_type = @type)
              AND (@priority IS NULL OR t.priority = @priority)
              AND (@customerId IS NULL OR t.customer_id = @customerId)
              AND (@accountId IS NULL OR c.account_id = @accountId)
              AND (@search IS NULL OR t.tk_seq = @seq OR t.subject LIKE '%' + @search + '%' OR c.customer_name LIKE '%' + @search + '%'
                   OR a.account_name LIKE '%' + @search + '%' OR c.mobile_no LIKE '%' + @search + '%')
            ORDER BY CASE WHEN t.status IN ('RESOLVED', 'CLOSED', 'REJECTED') THEN 1 ELSE 0 END,
                     CASE WHEN t.status IN ('RESOLVED', 'CLOSED', 'REJECTED') THEN NULL ELSE t.due_at END,
                     t.updated_at DESC",
            new
            {
                companyId, onlyUserId, userId, search, seq, f.CustomerId, f.AccountId,
                type = string.IsNullOrWhiteSpace(f.Type) ? null : f.Type,
                priority = string.IsNullOrWhiteSpace(f.Priority) ? null : f.Priority
            });
    }

    public async Task<TicketSummary> SummaryAsync(int companyId, int? onlyUserId, int userId)
    {
        using var db = _factory.CreateConnection();
        return await db.QuerySingleAsync<TicketSummary>($@"
            SELECT ISNULL(SUM(1), 0) AS [open],
                   ISNULL(SUM(CASE WHEN t.due_at < SYSUTCDATETIME() THEN 1 ELSE 0 END), 0) AS overdue,
                   ISNULL(SUM(CASE WHEN t.assigned_to IS NULL THEN 1 ELSE 0 END), 0) AS unassigned,
                   ISNULL(SUM(CASE WHEN t.status = 'WAITING' THEN 1 ELSE 0 END), 0) AS waiting,
                   ISNULL(SUM(CASE WHEN t.assigned_to = @userId THEN 1 ELSE 0 END), 0) AS mine,
                   ISNULL(SUM(CASE WHEN t.ticket_type = 'CHANGE' THEN 1 ELSE 0 END), 0) AS open_changes
            FROM dbo.wsm_tickets t
            WHERE t.company_id = @companyId AND {Scope} AND t.status NOT IN ('RESOLVED', 'CLOSED', 'REJECTED')",
            new { companyId, onlyUserId, userId });
    }

    public async Task<TicketRow?> GetByIdAsync(int companyId, int ticketId)
    {
        using var db = _factory.CreateConnection();
        var t = await db.QuerySingleOrDefaultAsync<TicketRow>(Select + " WHERE t.company_id = @companyId AND t.ticket_id = @ticketId",
            new { companyId, ticketId });
        if (t is null) return null;
        t.Comments = (await db.QueryAsync<TicketCommentRow>(@"
            SELECT k.*, u.full_name AS created_by_name FROM dbo.wsm_ticket_comments k
            LEFT JOIN dbo.wsm_users u ON u.user_id = k.created_by
            WHERE k.ticket_id = @ticketId ORDER BY k.comment_id", new { ticketId })).ToList();
        return t;
    }

    public async Task<TicketRow?> CreateAsync(int companyId, SaveTicketDto dto, int userId)
    {
        var now = DateTime.UtcNow;
        using var db = _factory.CreateConnection();
        var id = await db.ExecuteScalarAsync<int>(@"
            INSERT INTO dbo.wsm_tickets (company_id, tk_year, tk_seq, ticket_type, customer_id, product_id, subject, description, category,
                                         priority, channel, assigned_to, due_at, created_by, created_at, updated_at)
            VALUES (@companyId, @year,
                    (SELECT ISNULL(MAX(tk_seq), 0) + 1 FROM dbo.wsm_tickets WITH (UPDLOCK, HOLDLOCK) WHERE company_id = @companyId AND tk_year = @year),
                    @TicketType, @CustomerId, @ProductId, @Subject, @Description, @Category, @Priority, @Channel, @AssignedTo, @dueAt, @userId, @now, @now);
            SELECT CAST(SCOPE_IDENTITY() AS INT);",
            new
            {
                companyId, year = now.AddHours(4).Year, dto.TicketType, dto.CustomerId, dto.ProductId, dto.Subject, dto.Description, dto.Category,
                dto.Priority, dto.Channel, dto.AssignedTo, dueAt = now + TicketCodes.Sla(dto.Priority), userId, now
            });
        return await GetByIdAsync(companyId, id);
    }

    // A new priority moves the resolve-by time (counted from when the ticket was opened).
    public async Task<TicketRow?> UpdateAsync(int companyId, int ticketId, SaveTicketDto dto)
    {
        using var db = _factory.CreateConnection();
        await db.ExecuteAsync(@"
            UPDATE dbo.wsm_tickets
            SET due_at = CASE WHEN priority = @Priority THEN due_at ELSE DATEADD(MINUTE, @slaMinutes, created_at) END,
                product_id = @ProductId, subject = @Subject, description = @Description, category = @Category,
                priority = @Priority, channel = @Channel, updated_at = SYSUTCDATETIME()
            WHERE company_id = @companyId AND ticket_id = @ticketId",
            new
            {
                companyId, ticketId, dto.ProductId, dto.Subject, dto.Description, dto.Category, dto.Priority, dto.Channel,
                slaMinutes = (int)TicketCodes.Sla(dto.Priority).TotalMinutes
            });
        return await GetByIdAsync(companyId, ticketId);
    }

    public async Task SetStatusAsync(int ticketId, string from, string to, string? note, int? userId)
    {
        using var db = _factory.CreateConnection();
        await db.ExecuteAsync(@"
            UPDATE dbo.wsm_tickets
            SET status = @to,
                resolved_at = CASE WHEN @to = 'RESOLVED' THEN ISNULL(resolved_at, SYSUTCDATETIME())
                                   WHEN @to IN ('CLOSED', 'REJECTED') THEN resolved_at ELSE NULL END,
                closed_at = CASE WHEN @to IN ('CLOSED', 'REJECTED') THEN SYSUTCDATETIME() ELSE NULL END,
                updated_at = SYSUTCDATETIME()
            WHERE ticket_id = @ticketId;
            INSERT INTO dbo.wsm_ticket_comments (ticket_id, kind, body, created_by)
            VALUES (@ticketId, 'STATUS', @body, @userId);",
            new { ticketId, to, userId, body = $"{from} → {to}" + (string.IsNullOrWhiteSpace(note) ? "" : $"\n{note.Trim()}") });
    }

    public async Task AssignAsync(int ticketId, int? toUserId, string text, int userId)
    {
        using var db = _factory.CreateConnection();
        await db.ExecuteAsync(@"
            UPDATE dbo.wsm_tickets SET assigned_to = @toUserId, updated_at = SYSUTCDATETIME() WHERE ticket_id = @ticketId;
            INSERT INTO dbo.wsm_ticket_comments (ticket_id, kind, body, created_by) VALUES (@ticketId, 'STATUS', @text, @userId);",
            new { ticketId, toUserId, text, userId });
    }

    // A reply is the first response if none was sent yet; a customer message on a WAITING ticket puts it back in progress.
    public async Task AddCommentAsync(int ticketId, string kind, string? channel, string body, int? userId)
    {
        using var db = _factory.CreateConnection();
        await db.ExecuteAsync(@"
            INSERT INTO dbo.wsm_ticket_comments (ticket_id, kind, channel, body, created_by) VALUES (@ticketId, @kind, @channel, @body, @userId);
            UPDATE dbo.wsm_tickets
            SET first_response_at = CASE WHEN @kind = 'REPLY' THEN ISNULL(first_response_at, SYSUTCDATETIME()) ELSE first_response_at END,
                updated_at = SYSUTCDATETIME()
            WHERE ticket_id = @ticketId;
            IF @kind = 'CUSTOMER' AND EXISTS (SELECT 1 FROM dbo.wsm_tickets WHERE ticket_id = @ticketId AND status = 'WAITING')
            BEGIN
                UPDATE dbo.wsm_tickets SET status = 'IN_PROGRESS' WHERE ticket_id = @ticketId;
                INSERT INTO dbo.wsm_ticket_comments (ticket_id, kind, body, created_by) VALUES (@ticketId, 'STATUS', N'WAITING → IN_PROGRESS (customer replied)', @userId);
            END",
            new { ticketId, kind, channel, body, userId });
    }

    public async Task SetEstimateAsync(int ticketId, decimal hours, decimal rate, int userId)
    {
        using var db = _factory.CreateConnection();
        await db.ExecuteAsync(@"
            UPDATE dbo.wsm_tickets SET estimated_hours = @hours, hourly_rate = @rate, updated_at = SYSUTCDATETIME(),
                   status = CASE WHEN status = 'OPEN' THEN 'ESTIMATED' ELSE status END
            WHERE ticket_id = @ticketId;
            INSERT INTO dbo.wsm_ticket_comments (ticket_id, kind, body, created_by)
            VALUES (@ticketId, 'STATUS', CONCAT(N'Estimate: ', FORMAT(@hours, '0.##'), N' h × AED ', FORMAT(@rate, 'N2'), N' = AED ', FORMAT(ROUND(@hours * @rate, 2), 'N2')), @userId);",
            new { ticketId, hours = Math.Round(hours, 2), rate = Math.Round(rate, 2), userId });
    }

    public async Task LinkQuotationAsync(int ticketId, int leadId, int quotationId)
    {
        using var db = _factory.CreateConnection();
        await db.ExecuteAsync("UPDATE dbo.wsm_tickets SET lead_id = @leadId, quotation_id = @quotationId, updated_at = SYSUTCDATETIME() WHERE ticket_id = @ticketId",
            new { ticketId, leadId, quotationId });
    }

    public async Task QuotationClosedAsync(int companyId, int leadId, bool accepted, string quoteNo)
    {
        using var db = _factory.CreateConnection();
        var ids = (await db.QueryAsync<(int Id, string Status)>(@"
            SELECT ticket_id, status FROM dbo.wsm_tickets
            WHERE company_id = @companyId AND lead_id = @leadId AND ticket_type = 'CHANGE' AND status IN ('OPEN', 'ESTIMATED', 'WAITING')",
            new { companyId, leadId })).ToList();
        foreach (var (id, status) in ids)
            await SetStatusAsync(id, status, accepted ? "APPROVED" : "REJECTED",
                accepted ? $"Customer accepted {quoteNo}" : $"Customer declined {quoteNo}", null);
    }

    public async Task<bool> DeleteAsync(int companyId, int ticketId)
    {
        using var db = _factory.CreateConnection();
        return await db.ExecuteAsync("DELETE FROM dbo.wsm_tickets WHERE company_id = @companyId AND ticket_id = @ticketId",
            new { companyId, ticketId }) > 0;
    }
}
