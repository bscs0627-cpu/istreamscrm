using Dapper;
using IStreamsCrm.Api.Data;
using IStreamsCrm.Api.DTOs;

namespace IStreamsCrm.Api.Repositories;

public interface IProductRepository
{
    Task<IEnumerable<ProductRow>> GetAllAsync(int companyId, string? search, string? category, string? itemType, bool activeOnly);
    Task<ProductRow?> GetByIdAsync(int companyId, int productId);
    Task<(ProductRow? Row, string? Error)> CreateAsync(int companyId, SaveProductDto dto);
    Task<(ProductRow? Row, string? Error)> UpdateAsync(int companyId, int productId, SaveProductDto dto);
    Task<string?> DeleteAsync(int companyId, int productId);
    Task<IEnumerable<string>> CategoriesAsync(int companyId);
}

public class ProductRepository : IProductRepository
{
    private readonly IDbConnectionFactory _factory;
    public ProductRepository(IDbConnectionFactory factory) => _factory = factory;

    private static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    public async Task<IEnumerable<ProductRow>> GetAllAsync(int companyId, string? search, string? category, string? itemType, bool activeOnly)
    {
        using var db = _factory.CreateConnection();
        return await db.QueryAsync<ProductRow>(@"
            SELECT * FROM dbo.wsm_products
            WHERE company_id = @companyId
              AND (@activeOnly = 0 OR is_active = 'T')
              AND (@category IS NULL OR category = @category)
              AND (@itemType IS NULL OR item_type = @itemType)
              AND (@search IS NULL OR product_code LIKE '%' + @search + '%' OR product_name LIKE '%' + @search + '%'
                   OR description LIKE '%' + @search + '%')
            ORDER BY category, product_name",
            new { companyId, activeOnly, search = Blank(search), category = Blank(category), itemType = Blank(itemType) });
    }

    public async Task<ProductRow?> GetByIdAsync(int companyId, int productId)
    {
        using var db = _factory.CreateConnection();
        return await db.QuerySingleOrDefaultAsync<ProductRow>(
            "SELECT * FROM dbo.wsm_products WHERE company_id = @companyId AND product_id = @productId", new { companyId, productId });
    }

    private static async Task<bool> CodeTakenAsync(System.Data.IDbConnection db, int companyId, string code, int? exceptId) =>
        await db.ExecuteScalarAsync<int>(@"
            SELECT COUNT(*) FROM dbo.wsm_products
            WHERE company_id = @companyId AND product_code = @code AND (@exceptId IS NULL OR product_id <> @exceptId)",
            new { companyId, code, exceptId }) > 0;

    public async Task<(ProductRow?, string?)> CreateAsync(int companyId, SaveProductDto dto)
    {
        using var db = _factory.CreateConnection();
        if (await CodeTakenAsync(db, companyId, dto.ProductCode, null)) return (null, $"Product code {dto.ProductCode} is already used.");
        var id = await db.ExecuteScalarAsync<int>(@"
            INSERT INTO dbo.wsm_products (company_id, product_code, product_name, category, item_type, unit, price, vat_pct, description, is_active)
            VALUES (@companyId, @ProductCode, @ProductName, @Category, @ItemType, @Unit, @Price, @VatPct, @Description, @IsActive);
            SELECT CAST(SCOPE_IDENTITY() AS INT);",
            new { companyId, dto.ProductCode, dto.ProductName, dto.Category, dto.ItemType, dto.Unit, dto.Price, dto.VatPct, dto.Description, dto.IsActive });
        return (await GetByIdAsync(companyId, id), null);
    }

    public async Task<(ProductRow?, string?)> UpdateAsync(int companyId, int productId, SaveProductDto dto)
    {
        using var db = _factory.CreateConnection();
        if (await CodeTakenAsync(db, companyId, dto.ProductCode, productId)) return (null, $"Product code {dto.ProductCode} is already used.");
        var n = await db.ExecuteAsync(@"
            UPDATE dbo.wsm_products
            SET product_code = @ProductCode, product_name = @ProductName, category = @Category, item_type = @ItemType, unit = @Unit,
                price = @Price, vat_pct = @VatPct, description = @Description, is_active = @IsActive, updated_at = SYSUTCDATETIME()
            WHERE company_id = @companyId AND product_id = @productId",
            new { companyId, productId, dto.ProductCode, dto.ProductName, dto.Category, dto.ItemType, dto.Unit, dto.Price, dto.VatPct, dto.Description, dto.IsActive });
        return n == 0 ? (null, "Product not found.") : (await GetByIdAsync(companyId, productId), null);
    }

    // A product on any lead stays (history); it can only be made inactive.
    public async Task<string?> DeleteAsync(int companyId, int productId)
    {
        using var db = _factory.CreateConnection();
        if (await db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM dbo.wsm_lead_products WHERE product_id = @productId", new { productId }) > 0)
            return "This product is on one or more leads. Mark it Inactive instead of deleting it.";
        var n = await db.ExecuteAsync("DELETE FROM dbo.wsm_products WHERE company_id = @companyId AND product_id = @productId",
            new { companyId, productId });
        return n == 0 ? "Product not found." : null;
    }

    public async Task<IEnumerable<string>> CategoriesAsync(int companyId)
    {
        using var db = _factory.CreateConnection();
        return await db.QueryAsync<string>(
            "SELECT DISTINCT category FROM dbo.wsm_products WHERE company_id = @companyId ORDER BY category", new { companyId });
    }
}
