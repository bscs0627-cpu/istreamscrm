using System.ComponentModel.DataAnnotations;

namespace IStreamsCrm.Api.DTOs;

public class InvoiceRow
{
    public int InvoiceId { get; set; }
    public int? InvYear { get; set; }
    public int? InvSeq { get; set; }
    public string InvoiceNo => InvSeq is null ? $"Draft #{InvoiceId}" : $"INV-{InvYear}-{InvSeq:D4}";
    public int? QuotationId { get; set; }
    public int? SubscriptionId { get; set; }
    public DateTime? PeriodStart { get; set; }
    public DateTime? PeriodEnd { get; set; }
    public int? QuoteYear { get; set; }
    public int? QuoteSeq { get; set; }
    public int? QuoteRevision { get; set; }
    public string? QuoteNo => QuoteSeq is null ? null : $"QT-{QuoteYear}-{QuoteSeq:D4}" + (QuoteRevision > 0 ? $"-R{QuoteRevision}" : "");
    public int LeadId { get; set; }
    public int LeadSeq { get; set; }
    public string LeadNo => $"LD-{LeadSeq:D5}";
    public int? LeadAssignedTo { get; set; }
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
    public string? Stage { get; set; }
    public DateTime InvoiceDate { get; set; }
    public DateTime DueDate { get; set; }
    public string Status { get; set; } = "DRAFT";
    public string? BillToName { get; set; }
    public string? BillToTrn { get; set; }
    public string? BillToAddress { get; set; }
    public decimal Subtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal VatTotal { get; set; }
    public decimal GrandTotal { get; set; }
    public decimal NetTotal => Subtotal - DiscountTotal;
    public decimal AmountPaid { get; set; }
    public decimal Balance => Status == "CANCELLED" ? 0 : GrandTotal - AmountPaid;
    // UNPAID / PARTIAL / PAID / OVERDUE for issued invoices; the status itself otherwise.
    public string PaymentStatus { get; set; } = string.Empty;
    public int DaysOverdue { get; set; }
    public string? Terms { get; set; }
    public string? Notes { get; set; }
    public DateTime? IssuedAt { get; set; }
    public DateTime? SentAt { get; set; }
    public DateTime? CancelledAt { get; set; }
    public string? CancelReason { get; set; }
    public string? CreatedByName { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public List<QuotationLineRow> Lines { get; set; } = new();
    public List<PaymentRow> Payments { get; set; } = new();
}

public class PaymentRow
{
    public int PaymentId { get; set; }
    public int InvoiceId { get; set; }
    public DateTime PaymentDate { get; set; }
    public decimal Amount { get; set; }
    public string Method { get; set; } = string.Empty;
    public string? Reference { get; set; }
    public string? Notes { get; set; }
    public string? CreatedByName { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class InvoiceFromQuoteDto
{
    // 100 = full invoice with the quotation's lines; less = one line per VAT rate for that share (advance / milestone).
    [Range(0.01, 100)] public decimal Percent { get; set; } = 100;
    [MaxLength(100)] public string? Stage { get; set; }
}

public class SaveInvoiceDto
{
    [MaxLength(100)] public string? Stage { get; set; }
    [Required] public DateTime InvoiceDate { get; set; }
    [Required] public DateTime DueDate { get; set; }
    [MaxLength(20000)] public string? Terms { get; set; }
    [MaxLength(2000)] public string? Notes { get; set; }
    [Required, MinLength(1, ErrorMessage = "Add at least one line."), MaxLength(100)] public List<SaveQuotationLineDto> Lines { get; set; } = new();
}

public class SavePaymentDto
{
    [Required] public DateTime PaymentDate { get; set; }
    [Range(0.01, 10000000000)] public decimal Amount { get; set; }
    [Required, RegularExpression("^(?:BANK_TRANSFER|CHEQUE|CASH|CARD|ONLINE)$")] public string Method { get; set; } = "BANK_TRANSFER";
    [MaxLength(100)] public string? Reference { get; set; }
    [MaxLength(500)] public string? Notes { get; set; }
}

public class CancelInvoiceDto
{
    [Required, MaxLength(500)] public string Reason { get; set; } = string.Empty;
}

public class InvoiceFilter
{
    public string? Search { get; set; }
    public string? Status { get; set; }          // DRAFT / ISSUED / CANCELLED
    public string? Payment { get; set; }         // UNPAID / PARTIAL / PAID / OVERDUE / OUTSTANDING
    public int? LeadId { get; set; }
    public int? QuotationId { get; set; }
    public int? AccountId { get; set; }
}

// Outstanding issued invoices grouped by customer, split by how many days past due.
public class AgingRow
{
    public int? AccountId { get; set; }
    public string Customer { get; set; } = string.Empty;
    public int Invoices { get; set; }
    public decimal NotDue { get; set; }
    public decimal Days1To30 { get; set; }
    public decimal Days31To60 { get; set; }
    public decimal Days61To90 { get; set; }
    public decimal Over90 { get; set; }
    public decimal Total { get; set; }
}
