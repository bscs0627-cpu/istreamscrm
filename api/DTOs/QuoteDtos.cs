using System.ComponentModel.DataAnnotations;

namespace IStreamsCrm.Api.DTOs;

// ---------- Company profile (the seller, printed on quotations / invoices) ----------

public class CompanyProfile
{
    public int CompanyId { get; set; }
    public string? LegalName { get; set; }
    public string? Trn { get; set; }
    public string? Address { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Website { get; set; }
    public string? BankName { get; set; }
    public string? BankAccountName { get; set; }
    public string? BankAccountNo { get; set; }
    public string? Iban { get; set; }
    public string? Swift { get; set; }
    public string HasLogo { get; set; } = "F";
    public int QuoteValidityDays { get; set; } = 30;
    public decimal MaxDiscountPct { get; set; } = 10;
    public string? QuotePaymentTerms { get; set; }
    public string? QuoteTerms { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

public class SaveCompanyProfileDto
{
    [MaxLength(200)] public string? LegalName { get; set; }
    [RegularExpression(@"^\d{15}$", ErrorMessage = "TRN must be 15 digits.")] public string? Trn { get; set; }
    [MaxLength(500)] public string? Address { get; set; }
    [MaxLength(50)] public string? Phone { get; set; }
    [EmailAddress, MaxLength(150)] public string? Email { get; set; }
    [MaxLength(200)] public string? Website { get; set; }
    [MaxLength(150)] public string? BankName { get; set; }
    [MaxLength(200)] public string? BankAccountName { get; set; }
    [MaxLength(50)] public string? BankAccountNo { get; set; }
    [MaxLength(50)] public string? Iban { get; set; }
    [MaxLength(20)] public string? Swift { get; set; }
    [Range(1, 365)] public int QuoteValidityDays { get; set; } = 30;
    [Range(0, 100)] public decimal MaxDiscountPct { get; set; } = 10;
    [MaxLength(1000)] public string? QuotePaymentTerms { get; set; }
    [MaxLength(20000)] public string? QuoteTerms { get; set; }
}

// ---------- Quotations ----------

public static class QuoteCodes
{
    public const string Statuses = "^(?:DRAFT|SENT|ACCEPTED|REJECTED|REVISED)$";
}

public class QuotationRow
{
    public int QuotationId { get; set; }
    public int QuoteYear { get; set; }
    public int QuoteSeq { get; set; }
    public int Revision { get; set; }
    public string QuoteNo => $"QT-{QuoteYear}-{QuoteSeq:D4}" + (Revision > 0 ? $"-R{Revision}" : "");
    public int LeadId { get; set; }
    public int LeadSeq { get; set; }
    public string LeadNo => $"LD-{LeadSeq:D5}";
    public int? LeadAssignedTo { get; set; }
    public string? LeadStatus { get; set; }
    public int CustomerId { get; set; }
    public string? CustomerName { get; set; }
    public string? WhatsappName { get; set; }
    public string? MobileNo { get; set; }
    public string? Email { get; set; }
    public string? JobTitle { get; set; }
    public int? AccountId { get; set; }
    public string? AccountName { get; set; }
    public string? AccountTrn { get; set; }
    public string? AccountAddress { get; set; }
    public string? AccountCity { get; set; }
    public string? AccountCountry { get; set; }
    public string? Subject { get; set; }
    public DateTime QuoteDate { get; set; }
    public DateTime ValidUntil { get; set; }
    public string Status { get; set; } = "DRAFT";
    public decimal Subtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal VatTotal { get; set; }
    public decimal GrandTotal { get; set; }
    public decimal NetTotal => Subtotal - DiscountTotal;
    public decimal MaxLineDiscount { get; set; }
    public string? PaymentTerms { get; set; }
    public string? Terms { get; set; }
    public string? Notes { get; set; }
    public string ApprovalStatus { get; set; } = "NONE";
    public string? ApprovedByName { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public DateTime? SentAt { get; set; }
    public DateTime? ClosedAt { get; set; }
    public string? RejectReason { get; set; }
    public string? CreatedByName { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public List<QuotationLineRow> Lines { get; set; } = new();
}

public class QuotationLineRow
{
    public int LineId { get; set; }
    public int SortOrder { get; set; }
    public int? ProductId { get; set; }
    public string? ProductCode { get; set; }
    public string Description { get; set; } = string.Empty;
    public string? Unit { get; set; }
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountPct { get; set; }
    public decimal VatPct { get; set; }
    public decimal NetAmount { get; set; }
    public decimal VatAmount { get; set; }
}

public class SaveQuotationLineDto
{
    public int? ProductId { get; set; }
    [Required, MaxLength(1000)] public string Description { get; set; } = string.Empty;
    [RegularExpression(ProductCodes.Units)] public string? Unit { get; set; }
    [Range(0.01, 1000000)] public decimal Quantity { get; set; } = 1;
    [Range(0, 10000000000)] public decimal UnitPrice { get; set; }
    [Range(0, 100)] public decimal DiscountPct { get; set; }
    [Range(0, 100)] public decimal VatPct { get; set; } = 5;
}

public class SaveQuotationDto
{
    public int LeadId { get; set; }
    [MaxLength(200)] public string? Subject { get; set; }
    [Required] public DateTime QuoteDate { get; set; }
    [Required] public DateTime ValidUntil { get; set; }
    [MaxLength(1000)] public string? PaymentTerms { get; set; }
    [MaxLength(20000)] public string? Terms { get; set; }
    [MaxLength(2000)] public string? Notes { get; set; }
    [Required, MinLength(1, ErrorMessage = "Add at least one line."), MaxLength(100)] public List<SaveQuotationLineDto> Lines { get; set; } = new();
}

public class SendQuotationDto
{
    [Required, RegularExpression("^(?:EMAIL|WHATSAPP)$")] public string Channel { get; set; } = "EMAIL";
    [MaxLength(2000)] public string? Message { get; set; }
}

public class CloseQuotationDto
{
    public bool Accepted { get; set; }
    [MaxLength(500)] public string? Reason { get; set; }
}
