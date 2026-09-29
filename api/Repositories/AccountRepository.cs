using Dapper;
using IStreamsCrm.Api.Data;
using IStreamsCrm.Api.DTOs;

namespace IStreamsCrm.Api.Repositories;

public interface IAccountRepository
{
    // onlyUserId: staff see accounts that have at least one contact assigned to them.
    Task<IEnumerable<AccountRow>> GetAllAsync(int companyId, int? onlyUserId, string? search);
    Task<AccountRow?> GetByIdAsync(int companyId, int accountId);
    Task<AccountRow?> CreateAsync(int companyId, SaveAccountDto dto);
    Task<AccountRow?> UpdateAsync(int companyId, int accountId, SaveAccountDto dto);
    Task<bool> DeleteAsync(int companyId, int accountId);
    // Same name (case-insensitive) = same company, so imports and the bot don't create duplicates.
    Task<int> FindOrCreateAsync(int companyId, string accountName);
}

public class AccountRepository : IAccountRepository
{
    private readonly IDbConnectionFactory _factory;
    public AccountRepository(IDbConnectionFactory factory) => _factory = factory;

    private const string Select = @"
        SELECT a.*,
               (SELECT COUNT(*) FROM dbo.wsm_customers c WHERE c.account_id = a.account_id) AS contacts,
               (SELECT COUNT(*) FROM dbo.wsm_leads l JOIN dbo.wsm_customers c ON c.customer_id = l.customer_id
                 WHERE c.account_id = a.account_id AND l.status NOT IN ('WON', 'NOT_INTERESTED', 'LOST')) AS open_leads
        FROM dbo.wsm_accounts a";

    public async Task<IEnumerable<AccountRow>> GetAllAsync(int companyId, int? onlyUserId, string? search)
    {
        using var db = _factory.CreateConnection();
        return await db.QueryAsync<AccountRow>(Select + @"
            WHERE a.company_id = @companyId
              AND (@onlyUserId IS NULL OR EXISTS (SELECT 1 FROM dbo.wsm_customers c WHERE c.account_id = a.account_id AND c.assigned_to = @onlyUserId))
              AND (@search IS NULL OR a.account_name LIKE '%' + @search + '%' OR a.trn LIKE '%' + @search + '%'
                   OR a.email LIKE '%' + @search + '%' OR a.phone LIKE '%' + @search + '%' OR a.industry LIKE '%' + @search + '%')
            ORDER BY a.account_name",
            new { companyId, onlyUserId, search = string.IsNullOrWhiteSpace(search) ? null : search.Trim() });
    }

    public async Task<AccountRow?> GetByIdAsync(int companyId, int accountId)
    {
        using var db = _factory.CreateConnection();
        return await db.QuerySingleOrDefaultAsync<AccountRow>(
            Select + " WHERE a.company_id = @companyId AND a.account_id = @accountId", new { companyId, accountId });
    }

    private const string Columns = @"
        account_name = @AccountName, trn = @Trn, industry = @Industry, company_size = @CompanySize, website = @Website,
        phone = @Phone, email = @Email, address = @Address, city = @City, country = @Country,
        state = @State, group_name = @GroupName, other_industry = @OtherIndustry, invoice_address = @InvoiceAddress,
        delivery_address = @DeliveryAddress, notes = @Notes";

    public async Task<AccountRow?> CreateAsync(int companyId, SaveAccountDto dto)
    {
        using var db = _factory.CreateConnection();
        var id = await db.ExecuteScalarAsync<int>(@"
            INSERT INTO dbo.wsm_accounts (company_id, account_name) VALUES (@companyId, @AccountName);
            SELECT CAST(SCOPE_IDENTITY() AS INT);", new { companyId, dto.AccountName });
        var p = new DynamicParameters(dto);
        p.Add("id", id);
        await db.ExecuteAsync($"UPDATE dbo.wsm_accounts SET {Columns} WHERE account_id = @id", p);
        return await GetByIdAsync(companyId, id);
    }

    public async Task<AccountRow?> UpdateAsync(int companyId, int accountId, SaveAccountDto dto)
    {
        using var db = _factory.CreateConnection();
        var p = new DynamicParameters(dto);
        p.AddDynamicParams(new { companyId, accountId });
        var n = await db.ExecuteAsync($@"
            UPDATE dbo.wsm_accounts SET {Columns}, updated_at = SYSUTCDATETIME()
            WHERE company_id = @companyId AND account_id = @accountId", p);
        return n == 0 ? null : await GetByIdAsync(companyId, accountId);
    }

    // Contacts stay; they just lose the company link.
    public async Task<bool> DeleteAsync(int companyId, int accountId)
    {
        using var db = _factory.CreateConnection();
        return await db.ExecuteAsync("DELETE FROM dbo.wsm_accounts WHERE company_id = @companyId AND account_id = @accountId",
            new { companyId, accountId }) > 0;
    }

    public async Task<int> FindOrCreateAsync(int companyId, string accountName)
    {
        var name = accountName.Trim();
        using var db = _factory.CreateConnection();
        return await db.ExecuteScalarAsync<int>(@"
            DECLARE @id INT = (SELECT TOP 1 account_id FROM dbo.wsm_accounts
                               WHERE company_id = @companyId AND LOWER(account_name) = LOWER(@name) ORDER BY account_id);
            IF @id IS NULL
            BEGIN
                INSERT INTO dbo.wsm_accounts (company_id, account_name) VALUES (@companyId, @name);
                SET @id = CAST(SCOPE_IDENTITY() AS INT);
            END
            SELECT @id;", new { companyId, name = name.Length > 200 ? name[..200] : name });
    }
}
