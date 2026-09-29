using System.ComponentModel.DataAnnotations;

namespace IStreamsCrm.Api.DTOs;

// ---------- Accounts (customer companies) ----------

public class AccountRow
{
    public int AccountId { get; set; }
    public string AccountName { get; set; } = string.Empty;
    public string? Trn { get; set; }
    public string? Industry { get; set; }
    public string? CompanySize { get; set; }
    public string? Website { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Address { get; set; }
    public string? City { get; set; }
    public string? Country { get; set; }
    public string? State { get; set; }
    public string? GroupName { get; set; }
    public string? OtherIndustry { get; set; }
    public string? InvoiceAddress { get; set; }
    public string? DeliveryAddress { get; set; }
    public string? Notes { get; set; }
    public int Contacts { get; set; }
    public int OpenLeads { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class SaveAccountDto
{
    [Required, MaxLength(200)] public string AccountName { get; set; } = string.Empty;
    [MaxLength(20)] public string? Trn { get; set; }
    [MaxLength(100)] public string? Industry { get; set; }
    [RegularExpression("1-10|11-50|51-200|201-500|500\\+")] public string? CompanySize { get; set; }
    [MaxLength(200)] public string? Website { get; set; }
    [MaxLength(30)] public string? Phone { get; set; }
    [EmailAddress, MaxLength(150)] public string? Email { get; set; }
    [MaxLength(500)] public string? Address { get; set; }
    [MaxLength(100)] public string? City { get; set; }
    [MaxLength(100)] public string? Country { get; set; }
    [MaxLength(100)] public string? State { get; set; }
    [MaxLength(200)] public string? GroupName { get; set; }
    [MaxLength(100)] public string? OtherIndustry { get; set; }
    [MaxLength(500)] public string? InvoiceAddress { get; set; }
    [MaxLength(500)] public string? DeliveryAddress { get; set; }
    [MaxLength(2000)] public string? Notes { get; set; }
}

// ---------- Products & price list ----------

public static class ProductCodes
{
    public const string ItemTypes = "^(?:LICENSE|SUBSCRIPTION|IMPLEMENTATION|CUSTOMIZATION|AMC|TRAINING|HARDWARE|OTHER)$";
    public const string Units = "^(?:PER_LICENSE|PER_USER|PER_USER_MONTH|PER_USER_YEAR|PER_MONTH|PER_YEAR|PER_HOUR|PER_DAY|FIXED)$";
}

public class ProductRow
{
    public int ProductId { get; set; }
    public string ProductCode { get; set; } = string.Empty;
    public string ProductName { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string ItemType { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public decimal VatPct { get; set; }
    public string? Description { get; set; }
    public string IsActive { get; set; } = "T";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class SaveProductDto
{
    [Required, MaxLength(30), RegularExpression(@"^[A-Za-z0-9\-_]+$", ErrorMessage = "Code: letters, numbers, - and _ only.")]
    public string ProductCode { get; set; } = string.Empty;
    [Required, MaxLength(200)] public string ProductName { get; set; } = string.Empty;
    [Required, MaxLength(50)] public string Category { get; set; } = string.Empty;
    [Required, RegularExpression(ProductCodes.ItemTypes)] public string ItemType { get; set; } = "LICENSE";
    [Required, RegularExpression(ProductCodes.Units)] public string Unit { get; set; } = "FIXED";
    [Range(0, 10000000000)] public decimal Price { get; set; }
    [Range(0, 100)] public decimal VatPct { get; set; } = 5;
    [MaxLength(2000)] public string? Description { get; set; }
    [Required, RegularExpression("T|F")] public string IsActive { get; set; } = "T";
}
