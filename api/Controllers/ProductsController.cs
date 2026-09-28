using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using IStreamsCrm.Api.DTOs;
using IStreamsCrm.Api.Repositories;
using IStreamsCrm.Api.Services;

namespace IStreamsCrm.Api.Controllers;

// The price list. Everyone reads it (leads, quotations); only admins change it.
[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    private readonly IProductRepository _repo;
    public ProductsController(IProductRepository repo) => _repo = repo;

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? search, [FromQuery] string? category, [FromQuery] string? itemType,
        [FromQuery] bool activeOnly = false)
        => Ok(await _repo.GetAllAsync(User.CompanyId(), search, category, itemType, activeOnly));

    [HttpGet("categories")]
    public async Task<IActionResult> Categories() => Ok(await _repo.CategoriesAsync(User.CompanyId()));

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Create([FromBody] SaveProductDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var (row, error) = await _repo.CreateAsync(User.CompanyId(), Clean(dto));
        return error is not null ? Conflict(new { message = error }) : Ok(row);
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Update(int id, [FromBody] SaveProductDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var (row, error) = await _repo.UpdateAsync(User.CompanyId(), id, Clean(dto));
        return error is not null ? Conflict(new { message = error }) : Ok(row);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(int id)
    {
        var error = await _repo.DeleteAsync(User.CompanyId(), id);
        return error is null ? NoContent() : Conflict(new { message = error });
    }

    private static SaveProductDto Clean(SaveProductDto dto)
    {
        dto.ProductCode = dto.ProductCode.Trim().ToUpperInvariant();
        dto.ProductName = dto.ProductName.Trim();
        dto.Category = dto.Category.Trim();
        dto.Description = string.IsNullOrWhiteSpace(dto.Description) ? null : dto.Description.Trim();
        return dto;
    }
}
