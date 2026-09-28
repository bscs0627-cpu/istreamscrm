using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using IStreamsCrm.Api.DTOs;
using IStreamsCrm.Api.Repositories;
using IStreamsCrm.Api.Services;

namespace IStreamsCrm.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CustomersController : ControllerBase
{
    private readonly ICustomerRepository _repo;
    private readonly IUserRepository _users;
    private readonly IAccountRepository _accounts;
    private readonly IInvoiceRepository _invoices;

    public CustomersController(ICustomerRepository repo, IUserRepository users, IAccountRepository accounts, IInvoiceRepository invoices)
    {
        _invoices = invoices;
        _repo = repo;
        _users = users;
        _accounts = accounts;
    }

    // Staff only ever see customers assigned to them.
    private int? Scope => User.IsAdmin() ? null : User.UserId();

    private async Task<CustomerRow?> GetAccessibleAsync(int id)
    {
        var c = await _repo.GetByIdAsync(User.CompanyId(), id);
        return c is not null && (User.IsAdmin() || c.AssignedTo == User.UserId()) ? c : null;
    }

    private async Task<string?> CheckAsync(SaveCustomerDto dto)
    {
        dto.MobileNo = string.IsNullOrWhiteSpace(dto.MobileNo) ? null : dto.MobileNo.Trim();
        dto.Email = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim();
        dto.JobTitle = string.IsNullOrWhiteSpace(dto.JobTitle) ? null : dto.JobTitle.Trim();
        if (dto.MobileNo is null && dto.Email is null) return "Enter a mobile number or an email ID.";
        if (dto.AccountId is not null && await _accounts.GetByIdAsync(User.CompanyId(), dto.AccountId.Value) is null)
            return "Company not found.";
        return null;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? search, [FromQuery] string? filter, [FromQuery] int? accountId)
        => Ok(await _repo.GetAllAsync(User.CompanyId(), Scope, search, filter is "unassigned" or "assigned" ? filter : null, accountId));

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Create([FromBody] SaveCustomerDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        if (await CheckAsync(dto) is { } invalid) return BadRequest(new { message = invalid });
        var (row, error) = await _repo.CreateAsync(User.CompanyId(), dto);
        return error is not null ? Conflict(new { message = error }) : Ok(row);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] SaveCustomerDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        if (await CheckAsync(dto) is { } invalid) return BadRequest(new { message = invalid });
        if (await GetAccessibleAsync(id) is null) return NotFound();
        var (row, error) = await _repo.UpdateAsync(User.CompanyId(), id, dto);
        return error is not null ? Conflict(new { message = error }) : Ok(row);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(int id)
    {
        if (await _invoices.IssuedCountForLeadsAsync(User.CompanyId(), "l.customer_id = @id", new { id }) > 0)
            return Conflict(new { message = "This contact has issued invoices, which must be kept, so the contact cannot be deleted." });
        return await _repo.DeleteAsync(User.CompanyId(), id) ? NoContent() : NotFound();
    }

    [HttpPut("{id:int}/assign")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Assign(int id, [FromBody] AssignDto dto)
    {
        if (await _repo.GetByIdAsync(User.CompanyId(), id) is null) return NotFound();
        if (dto.UserId is not null && !await _users.IsActiveMemberAsync(User.CompanyId(), dto.UserId.Value))
            return BadRequest(new { message = "Choose an active staff member of your company." });

        await _repo.AssignAsync(User.CompanyId(), id, dto.UserId, User.UserId());
        return Ok(await _repo.GetByIdAsync(User.CompanyId(), id));
    }

    [HttpGet("{id:int}/history")]
    public async Task<IActionResult> History(int id)
    {
        if (await GetAccessibleAsync(id) is null) return NotFound();
        return Ok(await _repo.GetAssignmentHistoryAsync(User.CompanyId(), id));
    }
}
