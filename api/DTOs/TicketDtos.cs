using System.ComponentModel.DataAnnotations;

namespace IStreamsCrm.Api.DTOs;

public static class TicketCodes
{
    public const string Types = "^(?:SUPPORT|CHANGE)$";
    public const string Categories = "^(?:BUG|HOW_TO|DATA_FIX|ACCESS|PERFORMANCE|NEW_FEATURE|REPORT|INTEGRATION|OTHER)$";
    public const string Priorities = "^(?:LOW|MEDIUM|HIGH|URGENT)$";
    public const string Channels = "^(?:WHATSAPP|EMAIL|PHONE|OTHER)$";
    public const string Statuses = "^(?:OPEN|ESTIMATED|APPROVED|IN_PROGRESS|WAITING|TESTING|RESOLVED|CLOSED|REJECTED)$";

    // Allowed statuses per type. RESOLVED is shown as "Delivered" for a change request.
    public static readonly string[] SupportStatuses = { "OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED" };
    public static readonly string[] ChangeStatuses = { "OPEN", "ESTIMATED", "APPROVED", "IN_PROGRESS", "WAITING", "TESTING", "RESOLVED", "CLOSED", "REJECTED" };
    public static readonly string[] Done = { "RESOLVED", "CLOSED", "REJECTED" };

    // Resolve-by time from the priority.
    public static TimeSpan Sla(string priority) => priority switch
    {
        "URGENT" => TimeSpan.FromHours(4),
        "HIGH" => TimeSpan.FromHours(24),
        "LOW" => TimeSpan.FromDays(5),
        _ => TimeSpan.FromDays(3)
    };
}

public class TicketRow
{
    public int TicketId { get; set; }
    public int TkYear { get; set; }
    public int TkSeq { get; set; }
    public string TicketNo => $"TK-{TkYear}-{TkSeq:D4}";
    public string TicketType { get; set; } = "SUPPORT";
    public int CustomerId { get; set; }
    public string? CustomerName { get; set; }
    public string? WhatsappName { get; set; }
    public string? MobileNo { get; set; }
    public string? Email { get; set; }
    public int? AccountId { get; set; }
    public string? AccountName { get; set; }
    public int? ProductId { get; set; }
    public string? ProductCode { get; set; }
    public string? ProductName { get; set; }
    public string Subject { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Category { get; set; } = "OTHER";
    public string Priority { get; set; } = "MEDIUM";
    public string Status { get; set; } = "OPEN";
    public string Channel { get; set; } = "PHONE";
    public int? AssignedTo { get; set; }
    public string? AssignedToName { get; set; }
    public DateTime DueAt { get; set; }
    public bool IsOverdue { get; set; }
    public DateTime? FirstResponseAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public DateTime? ClosedAt { get; set; }
    public decimal? EstimatedHours { get; set; }
    public decimal? HourlyRate { get; set; }
    public decimal? EstimateAmount => EstimatedHours is null || HourlyRate is null ? null : Math.Round(EstimatedHours.Value * HourlyRate.Value, 2);
    public int? LeadId { get; set; }
    public int? LeadSeq { get; set; }
    public string? LeadNo => LeadSeq is null ? null : $"LD-{LeadSeq:D5}";
    public int? QuotationId { get; set; }
    public int? QuoteLatestId { get; set; }
    public string? QuoteNo { get; set; }
    public string? QuoteStatus { get; set; }
    // The customer's active subscription / AMC with the latest end date (same company, or the same contact when no company).
    public string? CoverageName { get; set; }
    public DateTime? CoverageUntil { get; set; }
    public int CommentCount { get; set; }
    public string? CreatedByName { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public List<TicketCommentRow> Comments { get; set; } = new();
}

public class TicketCommentRow
{
    public int CommentId { get; set; }
    public int TicketId { get; set; }
    public string Kind { get; set; } = "NOTE";
    public string? Channel { get; set; }
    public string Body { get; set; } = string.Empty;
    public int? CreatedBy { get; set; }
    public string? CreatedByName { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class SaveTicketDto
{
    public int CustomerId { get; set; }
    [Required, RegularExpression(TicketCodes.Types)] public string TicketType { get; set; } = "SUPPORT";
    public int? ProductId { get; set; }
    [Required, MaxLength(200)] public string Subject { get; set; } = string.Empty;
    [MaxLength(8000)] public string? Description { get; set; }
    [Required, RegularExpression(TicketCodes.Categories)] public string Category { get; set; } = "OTHER";
    [Required, RegularExpression(TicketCodes.Priorities)] public string Priority { get; set; } = "MEDIUM";
    [Required, RegularExpression(TicketCodes.Channels)] public string Channel { get; set; } = "PHONE";
    public int? AssignedTo { get; set; }
}

public class TicketStatusDto
{
    [Required, RegularExpression(TicketCodes.Statuses)] public string Status { get; set; } = string.Empty;
    [MaxLength(2000)] public string? Note { get; set; }
}

public class TicketAssignDto
{
    public int? UserId { get; set; }
}

public class TicketCommentDto
{
    // NOTE (internal) / REPLY (sent to the customer) / CUSTOMER (what the customer said, logged by staff)
    [Required, RegularExpression("^(?:NOTE|REPLY|CUSTOMER)$")] public string Kind { get; set; } = "NOTE";
    [RegularExpression("^(?:EMAIL|WHATSAPP)$")] public string? Channel { get; set; }
    [Required, MaxLength(4000)] public string Body { get; set; } = string.Empty;
}

public class TicketEstimateDto
{
    [Range(0.25, 10000)] public decimal EstimatedHours { get; set; }
    [Range(0, 100000)] public decimal HourlyRate { get; set; }
}

public class TicketFilter
{
    public string? Search { get; set; }
    // OPEN (not done) / MINE / UNASSIGNED / OVERDUE / WAITING / DONE, or empty for all
    public string? View { get; set; }
    public string? Type { get; set; }
    public string? Priority { get; set; }
    public int? CustomerId { get; set; }
    public int? AccountId { get; set; }
}

public class TicketSummary
{
    public int Open { get; set; }
    public int Overdue { get; set; }
    public int Unassigned { get; set; }
    public int Waiting { get; set; }
    public int Mine { get; set; }
    public int OpenChanges { get; set; }
}
