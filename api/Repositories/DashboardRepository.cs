using Dapper;
using IStreamsCrm.Api.Data;
using IStreamsCrm.Api.DTOs;

namespace IStreamsCrm.Api.Repositories;

public interface IDashboardRepository
{
    Task<DashboardStats> GetStatsAsync(int companyId, int? onlyUserId, DateTime todayStartUtc);
    Task<IEnumerable<StaffLoad>> GetStaffLoadAsync(int companyId, DateTime todayStartUtc, DateTime monthStartUtc);
    Task<DashboardWork> GetWorkAsync(int companyId, int? onlyUserId, DateTime todayStartUtc);
    Task<IEnumerable<DashboardActivity>> GetRecentActivityAsync(int companyId, int? onlyUserId);
}

public class DashboardRepository : IDashboardRepository
{
    private readonly IDbConnectionFactory _factory;
    public DashboardRepository(IDbConnectionFactory factory) => _factory = factory;

    public async Task<DashboardStats> GetStatsAsync(int companyId, int? onlyUserId, DateTime todayStartUtc)
    {
        const string sql = @"
            SELECT
                COUNT(*) AS total_customers,
                ISNULL(SUM(CASE WHEN c.created_at >= @today THEN 1 ELSE 0 END), 0) AS new_today,
                ISNULL(SUM(CASE WHEN c.assigned_to IS NULL THEN 1 ELSE 0 END), 0) AS unassigned,
                ISNULL(SUM(CASE WHEN c.unread_count > 0 THEN 1 ELSE 0 END), 0) AS unread_chats,
                ISNULL(SUM(CASE WHEN c.last_inbound_at > DATEADD(HOUR, -24, SYSUTCDATETIME()) THEN 1 ELSE 0 END), 0) AS open_windows,
                (SELECT COUNT(*) FROM dbo.wsm_messages m
                 JOIN dbo.wsm_customers mc ON mc.customer_id = m.customer_id
                 WHERE m.company_id = @companyId AND m.created_at >= @today
                   AND (@onlyUserId IS NULL OR mc.assigned_to = @onlyUserId)) AS messages_today
            FROM dbo.wsm_customers c
            WHERE c.company_id = @companyId AND (@onlyUserId IS NULL OR c.assigned_to = @onlyUserId)";

        using var db = _factory.CreateConnection();
        return await db.QuerySingleAsync<DashboardStats>(sql, new { companyId, onlyUserId, today = todayStartUtc });
    }

    public async Task<IEnumerable<StaffLoad>> GetStaffLoadAsync(int companyId, DateTime todayStartUtc, DateTime monthStartUtc)
    {
        const string sql = @"
            SELECT u.user_id, u.full_name, u.is_active,
                   (SELECT COUNT(*) FROM dbo.wsm_customers c WHERE c.assigned_to = u.user_id) AS customers,
                   (SELECT COUNT(*) FROM dbo.wsm_customers c WHERE c.assigned_to = u.user_id AND c.unread_count > 0) AS unread_chats,
                   (SELECT COUNT(*) FROM dbo.wsm_messages m WHERE m.sent_by = u.user_id AND m.created_at >= @today) AS replies_today,
                   (SELECT COUNT(*) FROM dbo.wsm_leads l WHERE l.assigned_to = u.user_id
                        AND l.status NOT IN ('WON', 'NOT_INTERESTED', 'LOST')) AS open_leads,
                   (SELECT COUNT(*) FROM dbo.wsm_follow_ups f WHERE f.assigned_to = u.user_id AND f.is_done = 'F'
                        AND f.due_at < SYSUTCDATETIME()) AS overdue_follow_ups,
                   (SELECT COUNT(*) FROM dbo.wsm_leads l WHERE l.assigned_to = u.user_id AND l.status = 'WON'
                        AND l.closed_at >= @month) AS deals_won_month,
                   (SELECT ISNULL(SUM(l.deal_value), 0) FROM dbo.wsm_leads l WHERE l.assigned_to = u.user_id AND l.status = 'WON'
                        AND l.closed_at >= @month) AS deal_value_month
            FROM dbo.wsm_users u
            WHERE u.company_id = @companyId
            ORDER BY u.is_active DESC, u.full_name";

        using var db = _factory.CreateConnection();
        return await db.QueryAsync<StaffLoad>(sql, new { companyId, today = todayStartUtc, month = monthStartUtc });
    }

    public async Task<DashboardWork> GetWorkAsync(int companyId, int? onlyUserId, DateTime todayStartUtc)
    {
        const string sql = @"
            DECLARE @tomorrow DATETIME2 = DATEADD(DAY, 1, @today), @dayAfter DATETIME2 = DATEADD(DAY, 2, @today);
            SELECT
                (SELECT COUNT(*) FROM dbo.wsm_follow_ups f WHERE f.company_id = @companyId AND f.is_done = 'F'
                    AND f.due_at < SYSUTCDATETIME() AND (@onlyUserId IS NULL OR f.assigned_to = @onlyUserId)) AS overdue_follow_ups,
                (SELECT COUNT(*) FROM dbo.wsm_follow_ups f WHERE f.company_id = @companyId AND f.is_done = 'F'
                    AND f.due_at >= SYSUTCDATETIME() AND f.due_at < @tomorrow AND (@onlyUserId IS NULL OR f.assigned_to = @onlyUserId)) AS due_today,
                (SELECT COUNT(*) FROM dbo.wsm_follow_ups f WHERE f.company_id = @companyId AND f.is_done = 'F' AND f.follow_up_type = 'DEMO'
                    AND f.due_at >= @today AND f.due_at < @tomorrow AND (@onlyUserId IS NULL OR f.assigned_to = @onlyUserId)) AS demos_today,
                (SELECT COUNT(*) FROM dbo.wsm_follow_ups f WHERE f.company_id = @companyId AND f.is_done = 'F' AND f.follow_up_type = 'DEMO'
                    AND f.due_at >= @tomorrow AND f.due_at < @dayAfter AND (@onlyUserId IS NULL OR f.assigned_to = @onlyUserId)) AS demos_tomorrow,
                (SELECT COUNT(*) FROM dbo.wsm_leads l WHERE l.company_id = @companyId AND l.created_at >= @today
                    AND (@onlyUserId IS NULL OR l.assigned_to = @onlyUserId)) AS new_leads_today,
                (SELECT COUNT(*) FROM dbo.wsm_leads l WHERE l.company_id = @companyId AND l.assigned_to IS NULL
                    AND l.status NOT IN ('WON', 'NOT_INTERESTED', 'LOST')) AS unassigned_leads,
                -- Open leads with no activity (and no follow-up scheduled) for 7 days.
                (SELECT COUNT(*) FROM dbo.wsm_leads l WHERE l.company_id = @companyId
                    AND l.status NOT IN ('WON', 'NOT_INTERESTED', 'LOST') AND (@onlyUserId IS NULL OR l.assigned_to = @onlyUserId)
                    AND l.updated_at < DATEADD(DAY, -7, SYSUTCDATETIME())
                    AND NOT EXISTS (SELECT 1 FROM dbo.wsm_follow_ups f WHERE f.lead_id = l.lead_id AND f.is_done = 'F')) AS cold_leads";

        using var db = _factory.CreateConnection();
        return await db.QuerySingleAsync<DashboardWork>(sql, new { companyId, onlyUserId, today = todayStartUtc });
    }

    public async Task<IEnumerable<DashboardActivity>> GetRecentActivityAsync(int companyId, int? onlyUserId)
    {
        const string sql = @"
            SELECT TOP 10 a.activity_id, a.lead_id, l.lead_seq, c.customer_name, c.whatsapp_name, c.mobile_no, c.email, ac.account_name,
                   a.activity_type, a.body, a.outcome, a.status_to, l.source AS lead_source, u.full_name AS by_name, a.created_at
            FROM dbo.wsm_lead_activities a
            JOIN dbo.wsm_leads l ON l.lead_id = a.lead_id
            JOIN dbo.wsm_customers c ON c.customer_id = l.customer_id
            LEFT JOIN dbo.wsm_accounts ac ON ac.account_id = c.account_id
            LEFT JOIN dbo.wsm_users u ON u.user_id = a.created_by
            WHERE a.company_id = @companyId AND a.activity_type IN ('CREATED', 'STATUS', 'DEMO', 'MEETING', 'CALL', 'QUOTE', 'INVOICE', 'SUBSCR')
              AND (@onlyUserId IS NULL OR l.assigned_to = @onlyUserId)
            ORDER BY a.created_at DESC, a.activity_id DESC";

        using var db = _factory.CreateConnection();
        return await db.QueryAsync<DashboardActivity>(sql, new { companyId, onlyUserId });
    }
}
