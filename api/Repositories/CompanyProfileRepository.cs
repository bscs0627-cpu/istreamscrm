using Dapper;
using IStreamsCrm.Api.Data;
using IStreamsCrm.Api.DTOs;

namespace IStreamsCrm.Api.Repositories;

public interface ICompanyProfileRepository
{
    // Never null: a company without a saved profile gets defaults and its own name.
    Task<CompanyProfile> GetAsync(int companyId);
    Task SaveAsync(int companyId, SaveCompanyProfileDto dto);
    Task SetLogoAsync(int companyId, byte[]? logo, string? contentType);
    Task<(byte[]? Logo, string? ContentType)> GetLogoAsync(int companyId);
}

public class CompanyProfileRepository : ICompanyProfileRepository
{
    private readonly IDbConnectionFactory _factory;
    public CompanyProfileRepository(IDbConnectionFactory factory) => _factory = factory;

    public async Task<CompanyProfile> GetAsync(int companyId)
    {
        using var db = _factory.CreateConnection();
        var row = await db.QuerySingleOrDefaultAsync<CompanyProfile>(@"
            SELECT company_id, legal_name, trn, address, phone, email, website, bank_name, bank_account_name, bank_account_no,
                   iban, swift, CASE WHEN logo IS NULL THEN 'F' ELSE 'T' END AS has_logo, quote_validity_days, max_discount_pct,
                   quote_payment_terms, quote_terms, invoice_due_days, invoice_terms, updated_at
            FROM dbo.wsm_company_profile WHERE company_id = @companyId", new { companyId });
        if (row is not null) return row;
        var name = await db.ExecuteScalarAsync<string>("SELECT company_name FROM dbo.wsm_companies WHERE company_id = @companyId", new { companyId });
        return new CompanyProfile { CompanyId = companyId, LegalName = name };
    }

    public async Task SaveAsync(int companyId, SaveCompanyProfileDto dto)
    {
        using var db = _factory.CreateConnection();
        var p = new DynamicParameters(dto);
        p.Add("companyId", companyId);
        await db.ExecuteAsync(@"
            IF NOT EXISTS (SELECT 1 FROM dbo.wsm_company_profile WHERE company_id = @companyId)
                INSERT INTO dbo.wsm_company_profile (company_id) VALUES (@companyId);
            UPDATE dbo.wsm_company_profile
            SET legal_name = @LegalName, trn = @Trn, address = @Address, phone = @Phone, email = @Email, website = @Website,
                bank_name = @BankName, bank_account_name = @BankAccountName, bank_account_no = @BankAccountNo, iban = @Iban,
                swift = @Swift, quote_validity_days = @QuoteValidityDays, max_discount_pct = @MaxDiscountPct,
                quote_payment_terms = @QuotePaymentTerms, quote_terms = @QuoteTerms, invoice_due_days = @InvoiceDueDays,
                invoice_terms = @InvoiceTerms, updated_at = SYSUTCDATETIME()
            WHERE company_id = @companyId", p);
    }

    public async Task SetLogoAsync(int companyId, byte[]? logo, string? contentType)
    {
        using var db = _factory.CreateConnection();
        await db.ExecuteAsync(@"
            IF NOT EXISTS (SELECT 1 FROM dbo.wsm_company_profile WHERE company_id = @companyId)
                INSERT INTO dbo.wsm_company_profile (company_id) VALUES (@companyId);
            UPDATE dbo.wsm_company_profile SET logo = @logo, logo_content_type = @contentType, updated_at = SYSUTCDATETIME()
            WHERE company_id = @companyId", new { companyId, logo, contentType });
    }

    public async Task<(byte[]?, string?)> GetLogoAsync(int companyId)
    {
        using var db = _factory.CreateConnection();
        var row = await db.QuerySingleOrDefaultAsync<(byte[]? Logo, string? ContentType)>(
            "SELECT logo, logo_content_type FROM dbo.wsm_company_profile WHERE company_id = @companyId", new { companyId });
        return (row.Logo, row.ContentType);
    }
}
