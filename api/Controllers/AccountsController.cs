using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using IStreamsCrm.Api.DTOs;
using IStreamsCrm.Api.Repositories;
using IStreamsCrm.Api.Services;

namespace IStreamsCrm.Api.Controllers;

// Customer companies. Staff see companies whose contacts are assigned to them; only admins delete.
[ApiController]
[Route("api/[controller]")]
public class AccountsController : ControllerBase
{
    private readonly IAccountRepository _repo;
    private readonly ICustomerRepository _customers;

    public AccountsController(IAccountRepository repo, ICustomerRepository customers)
    {
        _repo = repo;
        _customers = customers;
    }

    private int? Scope => User.IsAdmin() ? null : User.UserId();

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? search)
        => Ok(await _repo.GetAllAsync(User.CompanyId(), Scope, search));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var account = await _repo.GetByIdAsync(User.CompanyId(), id);
        if (account is null) return NotFound();
        return Ok(new { account, contacts = await _customers.GetAllAsync(User.CompanyId(), Scope, null, null, id) });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SaveAccountDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        return Ok(await _repo.CreateAsync(User.CompanyId(), Clean(dto)));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] SaveAccountDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var row = await _repo.UpdateAsync(User.CompanyId(), id, Clean(dto));
        return row is null ? NotFound() : Ok(row);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(int id)
        => await _repo.DeleteAsync(User.CompanyId(), id) ? NoContent() : NotFound();

    private static SaveAccountDto Clean(SaveAccountDto dto)
    {
        static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
        dto.AccountName = dto.AccountName.Trim();
        dto.Trn = Blank(dto.Trn);
        dto.Industry = Blank(dto.Industry);
        dto.CompanySize = Blank(dto.CompanySize);
        dto.Website = Blank(dto.Website);
        dto.Phone = Blank(dto.Phone);
        dto.Email = Blank(dto.Email);
        dto.Address = Blank(dto.Address);
        dto.City = Blank(dto.City);
        dto.Country = Blank(dto.Country);
        dto.Notes = Blank(dto.Notes);
        return dto;
    }
}
