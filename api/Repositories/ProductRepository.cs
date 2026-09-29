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
    Task<IEnumerable<SubProductRow>> GetSubsAsync(int companyId, int productId);
    Task<IEnumerable<SubProductOptionRow>> GetSubOptionsAsync(int companyId);
    Task<SubProductRow?> SaveSubAsync(int companyId, int productId, int? subId, SaveSubProductDto dto);
    Task<bool> DeleteSubAsync(int companyId, int productId, int subId);
}

public class ProductRepository : IProductRepository
{
    private readonly IDbConnectionFactory _factory;
    public ProductRepository(IDbConnectionFactory factory) => _factory = factory;

    private const string ExtraColumns = @"supplier_ref = @SupplierRef, margin_pct = @MarginPct, sub_category = @SubCategory, image = @Image,
        specifications = @Specifications, has_sub_products = @HasSubProducts, sub_detail_type = @SubDetailType, sub_uom = @SubUom,
        conversion_rate = @ConversionRate";

    private static object ExtraParams(SaveProductDto d, int id) => new
    {
        id, d.SupplierRef, d.MarginPct, d.SubCategory, d.Image, d.Specifications, d.HasSubProducts, d.SubDetailType, d.SubUom, d.ConversionRate,
    };

    private static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    public async Task<IEnumerable<ProductRow>> GetAllAsync(int companyId, string? search, string? category, string? itemType, bool activeOnly)
    {
        using var db = _factory.CreateConnection();
        return await db.QueryAsync<ProductRow>(@"
            SELECT product_id, company_id, product_code, product_name, category, sub_category, item_type, unit, price, vat_pct,
                   description, is_active, supplier_ref, margin_pct, has_sub_products, sub_detail_type, sub_uom, conversion_rate,
                   created_at, updated_at
            FROM dbo.wsm_products
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
        if (dto.ProductCode.Length == 0)
        {
            var next = await db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM dbo.wsm_products WHERE company_id = @companyId", new { companyId });
            do dto.ProductCode = $"ITM{++next:00000}"; while (await CodeTakenAsync(db, companyId, dto.ProductCode, null));
        }
        if (await CodeTakenAsync(db, companyId, dto.ProductCode, null)) return (null, $"Product code {dto.ProductCode} is already used.");
        var id = await db.ExecuteScalarAsync<int>(@"
            INSERT INTO dbo.wsm_products (company_id, product_code, product_name, category, item_type, unit, price, vat_pct, description, is_active)
            VALUES (@companyId, @ProductCode, @ProductName, @Category, @ItemType, @Unit, @Price, @VatPct, @Description, @IsActive);
            SELECT CAST(SCOPE_IDENTITY() AS INT);",
            new { companyId, dto.ProductCode, dto.ProductName, dto.Category, dto.ItemType, dto.Unit, dto.Price, dto.VatPct, dto.Description, dto.IsActive });
        await db.ExecuteAsync($"UPDATE dbo.wsm_products SET {ExtraColumns} WHERE product_id = @id", ExtraParams(dto, id));
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
        if (n == 0) return (null, "Product not found.");
        await db.ExecuteAsync($"UPDATE dbo.wsm_products SET {ExtraColumns} WHERE product_id = @id", ExtraParams(dto, productId));
        return (await GetByIdAsync(companyId, productId), null);
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

    public async Task<IEnumerable<SubProductRow>> GetSubsAsync(int companyId, int productId)
    {
        using var db = _factory.CreateConnection();
        return await db.QueryAsync<SubProductRow>(
            "SELECT sub_id, product_id, sub_name, detail, price, image, is_active FROM dbo.wsm_product_subs WHERE company_id = @companyId AND product_id = @productId ORDER BY sub_id",
            new { companyId, productId });
    }

    public async Task<IEnumerable<SubProductOptionRow>> GetSubOptionsAsync(int companyId)
    {
        using var db = _factory.CreateConnection();
        return await db.QueryAsync<SubProductOptionRow>(@"
            SELECT s.sub_id, s.product_id, s.sub_name, s.detail, s.price
            FROM dbo.wsm_product_subs s JOIN dbo.wsm_products p ON p.product_id = s.product_id
            WHERE s.company_id = @companyId AND s.is_active = 'T' AND p.is_active = 'T'
            ORDER BY p.product_name, s.sub_name", new { companyId });
    }

    public async Task<SubProductRow?> SaveSubAsync(int companyId, int productId, int? subId, SaveSubProductDto dto)
    {
        using var db = _factory.CreateConnection();
        if (await db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM dbo.wsm_products WHERE company_id = @companyId AND product_id = @productId",
                new { companyId, productId }) == 0) return null;
        var p = new { companyId, productId, subId, dto.SubName, dto.Detail, dto.Price, dto.Image, dto.IsActive };
        if (subId is null)
            subId = await db.ExecuteScalarAsync<int>(@"
                INSERT INTO dbo.wsm_product_subs (company_id, product_id, sub_name, detail, price, image, is_active)
                VALUES (@companyId, @productId, @SubName, @Detail, @Price, @Image, @IsActive);
                SELECT CAST(SCOPE_IDENTITY() AS INT);", p);
        else if (await db.ExecuteAsync(@"
                UPDATE dbo.wsm_product_subs SET sub_name = @SubName, detail = @Detail, price = @Price, image = @Image, is_active = @IsActive
                WHERE company_id = @companyId AND product_id = @productId AND sub_id = @subId", p) == 0) return null;
        return await db.QuerySingleOrDefaultAsync<SubProductRow>(
            "SELECT sub_id, product_id, sub_name, detail, price, image, is_active FROM dbo.wsm_product_subs WHERE sub_id = @subId", new { subId });
    }

    public async Task<bool> DeleteSubAsync(int companyId, int productId, int subId)
    {
        using var db = _factory.CreateConnection();
        return await db.ExecuteAsync("DELETE FROM dbo.wsm_product_subs WHERE company_id = @companyId AND product_id = @productId AND sub_id = @subId",
            new { companyId, productId, subId }) > 0;
    }
}
