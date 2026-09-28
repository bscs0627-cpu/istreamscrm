using Microsoft.AspNetCore.Mvc;
using IStreamsCrm.Api.Repositories;
using IStreamsCrm.Api.Services;

namespace IStreamsCrm.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReportsController : ControllerBase
{
    private readonly IReportRepository _repo;
    public ReportsController(IReportRepository repo) => _repo = repo;

    // from / to are the user's local calendar dates (to inclusive); tzOffset is JavaScript's getTimezoneOffset().
    [HttpGet("leads")]
    public async Task<IActionResult> Leads([FromQuery] DateTime from, [FromQuery] DateTime to, [FromQuery] int tzOffset, [FromQuery] int? agentId)
    {
        if (to < from) return BadRequest(new { message = "The end date is before the start date." });
        if ((to - from).TotalDays > 731) return BadRequest(new { message = "Choose a period of up to 2 years." });

        var offset = TimeSpan.FromMinutes(Math.Clamp(tzOffset, -840, 840));
        var agent = User.IsAdmin() ? agentId : User.UserId();
        return Ok(await _repo.LeadsAsync(User.CompanyId(), from.Date + offset, to.Date.AddDays(1) + offset, (int)offset.TotalMinutes, agent));
    }

    [HttpGet("revenue")]
    public async Task<IActionResult> Revenue([FromQuery] DateTime from, [FromQuery] DateTime to, [FromQuery] int tzOffset, [FromQuery] int? agentId)
    {
        if (to < from) return BadRequest(new { message = "The end date is before the start date." });
        if ((to - from).TotalDays > 731) return BadRequest(new { message = "Choose a period of up to 2 years." });

        var offset = TimeSpan.FromMinutes(Math.Clamp(tzOffset, -840, 840));
        var agent = User.IsAdmin() ? agentId : User.UserId();
        return Ok(await _repo.RevenueAsync(User.CompanyId(), from.Date + offset, to.Date.AddDays(1) + offset, (int)offset.TotalMinutes, agent));
    }

    [HttpGet("tickets")]
    public async Task<IActionResult> Tickets([FromQuery] DateTime from, [FromQuery] DateTime to, [FromQuery] int tzOffset, [FromQuery] int? agentId)
    {
        if (to < from) return BadRequest(new { message = "The end date is before the start date." });
        if ((to - from).TotalDays > 731) return BadRequest(new { message = "Choose a period of up to 2 years." });

        var offset = TimeSpan.FromMinutes(Math.Clamp(tzOffset, -840, 840));
        var agent = User.IsAdmin() ? agentId : User.UserId();
        return Ok(await _repo.TicketsAsync(User.CompanyId(), from.Date + offset, to.Date.AddDays(1) + offset, agent));
    }
}
