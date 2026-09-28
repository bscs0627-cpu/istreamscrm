using Microsoft.AspNetCore.Mvc;
using IStreamsCrm.Api.Repositories;
using IStreamsCrm.Api.Services;

namespace IStreamsCrm.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DashboardController : ControllerBase
{
    private readonly IDashboardRepository _repo;
    private readonly IFollowUpRepository _followUps;
    private readonly ILeadRepository _leads;
    private readonly IReportRepository _reports;
    private readonly ISubscriptionRepository _subs;
    private readonly ITicketRepository _tickets;

    public DashboardController(IDashboardRepository repo, IFollowUpRepository followUps, ILeadRepository leads, IReportRepository reports,
        ISubscriptionRepository subs, ITicketRepository tickets)
    {
        _repo = repo;
        _followUps = followUps;
        _leads = leads;
        _reports = reports;
        _subs = subs;
        _tickets = tickets;
    }

    // tzOffset: the browser's getTimezoneOffset() in minutes, so "today" and "this month" mean the user's local calendar.
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] int tzOffset = 0)
    {
        tzOffset = Math.Clamp(tzOffset, -840, 840);
        var localNow = DateTime.UtcNow.AddMinutes(-tzOffset);
        var todayStartUtc = localNow.Date.AddMinutes(tzOffset);
        var monthStartUtc = new DateTime(localNow.Year, localNow.Month, 1).AddMinutes(tzOffset);
        var companyId = User.CompanyId();
        var admin = User.IsAdmin();
        int? scope = admin ? null : User.UserId();

        // Overdue first, then the rest of today.
        var nextFollowUps = (await _followUps.GetListAsync(companyId, scope, "overdue", tzOffset, null))
            .Concat(await _followUps.GetListAsync(companyId, scope, "today", tzOffset, null))
            .Take(5);
        var month = await _reports.LeadsAsync(companyId, monthStartUtc, todayStartUtc.AddDays(1), tzOffset, scope);
        var revenue = await _reports.RevenueAsync(companyId, monthStartUtc, todayStartUtc.AddDays(1), tzOffset, scope);

        return Ok(new
        {
            stats = await _repo.GetStatsAsync(companyId, scope, todayStartUtc),
            work = await _repo.GetWorkAsync(companyId, scope, todayStartUtc),
            nextFollowUps,
            month = month.Summary,
            revenue = revenue.Summary,
            subscriptions = await _subs.SummaryAsync(companyId, scope, todayStartUtc),
            tickets = await _tickets.SummaryAsync(companyId, scope, User.UserId()),
            pipeline = await _leads.StatusCountsAsync(companyId, scope),
            activity = await _repo.GetRecentActivityAsync(companyId, scope),
            staff = admin ? await _repo.GetStaffLoadAsync(companyId, todayStartUtc, monthStartUtc) : null
        });
    }
}
