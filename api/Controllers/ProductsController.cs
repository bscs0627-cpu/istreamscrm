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

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var product = await _repo.GetByIdAsync(User.CompanyId(), id);
        return product is null ? NotFound() : Ok(new { product, subProducts = await _repo.GetSubsAsync(User.CompanyId(), id) });
    }

    [HttpGet("subs")]
    public async Task<IActionResult> SubOptions() => Ok(await _repo.GetSubOptionsAsync(User.CompanyId()));

    [HttpPost("{id:int}/subs")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> CreateSub(int id, [FromBody] SaveSubProductDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var row = await _repo.SaveSubAsync(User.CompanyId(), id, null, CleanSub(dto));
        return row is null ? NotFound() : Ok(row);
    }

    [HttpPut("{id:int}/subs/{subId:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> UpdateSub(int id, int subId, [FromBody] SaveSubProductDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var row = await _repo.SaveSubAsync(User.CompanyId(), id, subId, CleanSub(dto));
        return row is null ? NotFound() : Ok(row);
    }

    [HttpDelete("{id:int}/subs/{subId:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> DeleteSub(int id, int subId)
        => await _repo.DeleteSubAsync(User.CompanyId(), id, subId) ? NoContent() : NotFound();

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

    private static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static SaveSubProductDto CleanSub(SaveSubProductDto dto)
    {
        dto.SubName = dto.SubName.Trim();
        dto.Detail = Blank(dto.Detail);
        dto.Image = Blank(dto.Image);
        return dto;
    }

    private static SaveProductDto Clean(SaveProductDto dto)
    {
        dto.ProductCode = dto.ProductCode.Trim().ToUpperInvariant();
        dto.ProductName = dto.ProductName.Trim();
        dto.Category = dto.Category.Trim();
        dto.Description = Blank(dto.Description);
        dto.SupplierRef = Blank(dto.SupplierRef);
        dto.SubCategory = Blank(dto.SubCategory);
        dto.Image = Blank(dto.Image);
        dto.Specifications = Blank(dto.Specifications);
        dto.SubDetailType = Blank(dto.SubDetailType);
        if (dto.HasSubProducts != "T") { dto.SubDetailType = null; dto.SubUom = null; dto.ConversionRate = 1; }
        return dto;
    }
}
