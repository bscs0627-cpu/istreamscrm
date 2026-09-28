using System.ComponentModel.DataAnnotations;

namespace IStreamsCrm.Api.DTOs;

public class SubscriptionRow
{
    public int SubscriptionId { get; set; }
    public int CompanyId { get; set; }
    public int LeadId { get; set; }
    public int LeadSeq { get; set; }
    public string LeadNo => $"LD-{LeadSeq:D5}";
    public int? LeadAssignedTo { get; set; }
    public string? AssignedToName { get; set; }
    public int CustomerId { get; set; }
    public string? CustomerName { get; set; }
    public string? WhatsappName { get; set; }
    public string? MobileNo { get; set; }
    public string? Email { get; set; }
    public int? AccountId { get; set; }
    public string? AccountName { get; set; }
    public int? QuotationId { get; set; }
    public int? ProductId { get; set; }
    public string? ProductCode { get; set; }
    public string Description { get; set; } = string.Empty;
    public string? Unit { get; set; }
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountPct { get; set; }
    public decimal VatPct { get; set; }
    public string BillingCycle { get; set; } = "YEARLY";
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public string AutoRenew { get; set; } = "T";
    public string Status { get; set; } = "ACTIVE";
    public DateTime? CancelledAt { get; set; }
    public string? CancelReason { get; set; }
    public string? Notes { get; set; }
    // ACTIVE / DUE (inside the renewal window: 7 / 15 / 30 days by cycle) / EXPIRED (end passed) / CANCELLED
    public string State { get; set; } = "ACTIVE";
    public int DaysLeft { get; set; }
    // One billing cycle, before VAT, and the same normalised to a month (for MRR).
    public decimal CycleAmount { get; set; }
    public decimal MonthlyValue { get; set; }
    // The draft / issued invoice for the next period, if one exists.
    public int? RenewalInvoiceId { get; set; }
    public string? RenewalInvoiceStatus { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class SaveSubscriptionDto
{
    public int LeadId { get; set; }
    public int? ProductId { get; set; }
    [Required, MaxLength(500)] public string Description { get; set; } = string.Empty;
    [RegularExpression(ProductCodes.Units)] public string? Unit { get; set; }
    [Range(0.01, 1000000)] public decimal Quantity { get; set; } = 1;
    [Range(0, 10000000000)] public decimal UnitPrice { get; set; }
    [Range(0, 100)] public decimal DiscountPct { get; set; }
    [Range(0, 100)] public decimal VatPct { get; set; } = 5;
    [Required, RegularExpression("^(?:MONTHLY|QUARTERLY|YEARLY)$")] public string BillingCycle { get; set; } = "YEARLY";
    [Required] public DateTime StartDate { get; set; }
    [Required] public DateTime EndDate { get; set; }
    [Required, RegularExpression("^(?:T|F)$")] public string AutoRenew { get; set; } = "T";
    [MaxLength(1000)] public string? Notes { get; set; }
}

public class SubscriptionSummary
{
    public int Active { get; set; }
    public int DueSoon { get; set; }
    public int Expired { get; set; }
    public decimal Mrr { get; set; }
    public decimal Arr { get; set; }
    public decimal DueValue { get; set; }
}

public class SubscriptionFilter
{
    public string? Search { get; set; }
    public string? View { get; set; }        // ACTIVE / DUE / EXPIRED / CANCELLED
    public int? LeadId { get; set; }
    public int? AccountId { get; set; }
}

public class ReminderDto
{
    [Required, RegularExpression("^(?:EMAIL|WHATSAPP)$")] public string Channel { get; set; } = "EMAIL";
    [MaxLength(2000)] public string? Message { get; set; }
}
