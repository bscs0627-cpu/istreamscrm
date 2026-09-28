using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using IStreamsCrm.Api.DTOs;
using IStreamsCrm.Api.Repositories;
using IStreamsCrm.Api.Services;

namespace IStreamsCrm.Api.Controllers;

// Your own company's details for quotations and invoices. Everyone can read them; admins change them.
[ApiController]
[Route("api/company-profile")]
public class CompanyProfileController : ControllerBase
{
    private const long MaxLogoBytes = 1024 * 1024;
    private readonly ICompanyProfileRepository _repo;
    public CompanyProfileController(ICompanyProfileRepository repo) => _repo = repo;

    [HttpGet]
    public async Task<IActionResult> Get() => Ok(await _repo.GetAsync(User.CompanyId()));

    [HttpPut]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Save([FromBody] SaveCompanyProfileDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
        dto.LegalName = Blank(dto.LegalName); dto.Trn = Blank(dto.Trn); dto.Address = Blank(dto.Address);
        dto.Phone = Blank(dto.Phone); dto.Email = Blank(dto.Email); dto.Website = Blank(dto.Website);
        dto.BankName = Blank(dto.BankName); dto.BankAccountName = Blank(dto.BankAccountName);
        dto.BankAccountNo = Blank(dto.BankAccountNo); dto.Iban = Blank(dto.Iban)?.Replace(" ", "").ToUpperInvariant();
        dto.Swift = Blank(dto.Swift)?.ToUpperInvariant(); dto.QuotePaymentTerms = Blank(dto.QuotePaymentTerms);
        dto.QuoteTerms = Blank(dto.QuoteTerms); dto.InvoiceTerms = Blank(dto.InvoiceTerms);
        await _repo.SaveAsync(User.CompanyId(), dto);
        return Ok(await _repo.GetAsync(User.CompanyId()));
    }

    [HttpGet("logo")]
    public async Task<IActionResult> Logo()
    {
        var (logo, type) = await _repo.GetLogoAsync(User.CompanyId());
        return logo is null ? NotFound() : File(logo, type ?? "image/png");
    }

    [HttpPost("logo")]
    [Authorize(Roles = Roles.Admin)]
    [RequestSizeLimit(2 * 1024 * 1024)]
    public async Task<IActionResult> UploadLogo(IFormFile file)
    {
        var type = Path.GetExtension(file.FileName).ToLowerInvariant() switch
        {
            ".png" => "image/png", ".jpg" or ".jpeg" => "image/jpeg", _ => null
        };
        if (type is null) return BadRequest(new { message = "Use a PNG or JPG logo." });
        if (file.Length > MaxLogoBytes) return BadRequest(new { message = "The logo must be under 1 MB." });
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        await _repo.SetLogoAsync(User.CompanyId(), ms.ToArray(), type);
        return Ok(await _repo.GetAsync(User.CompanyId()));
    }

    [HttpDelete("logo")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> DeleteLogo()
    {
        await _repo.SetLogoAsync(User.CompanyId(), null, null);
        return Ok(await _repo.GetAsync(User.CompanyId()));
    }
}
