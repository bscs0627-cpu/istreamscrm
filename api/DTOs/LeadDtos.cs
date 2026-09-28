using System.ComponentModel.DataAnnotations;

namespace IStreamsCrm.Api.DTOs;

public static class LeadCodes
{
    public const string Sources = "^(?:WHATSAPP|EMAIL|WEBSITE|REFERRAL|LINKEDIN|GOOGLE|FACEBOOK|INSTAGRAM|EXHIBITION|COLD_CALL|PARTNER|EXISTING_CUSTOMER|IMPORT|OTHER)$";
    public const string Statuses = "^(?:NEW|CONTACTED|DEMO_SCHEDULED|DEMO_DONE|REQUIREMENTS|QUOTATION_SENT|NEGOTIATION|WON|NO_ANSWER|FOLLOW_UP_LATER|NOT_INTERESTED|LOST)$";
    public const string LostReasons = "^(?:PRICE|COMPETITOR|NO_BUDGET|FEATURES|NO_DECISION|NOT_REACHABLE|JUNK|OTHER)$";
    public static readonly string[] Closed = { "WON", "NOT_INTERESTED", "LOST" };
}

public class LeadRow
{
    public int LeadId { get; set; }
    public int LeadSeq { get; set; }
    public string LeadNo => $"LD-{LeadSeq:D5}";
    public int CustomerId { get; set; }
    public string? CustomerName { get; set; }
    public string? WhatsappName { get; set; }
    public string? MobileNo { get; set; }
    public string? Email { get; set; }
    public string? JobTitle { get; set; }
    public int? AccountId { get; set; }
    public string? AccountName { get; set; }
    public string? Title { get; set; }
    public string Source { get; set; } = string.Empty;
    public int? UsersCount { get; set; }
    public string? Deployment { get; set; }
    public string? CurrentSystem { get; set; }
    public decimal? Budget { get; set; }
    public DateTime? DecisionDate { get; set; }
    public string? DecisionMaker { get; set; }
    public string? Requirements { get; set; }
    public decimal? ExpectedValue { get; set; }
    public string Status { get; set; } = "NEW";
    public string Priority { get; set; } = "WARM";
    public string? LostReason { get; set; }
    public decimal? DealValue { get; set; }
    public DateTime? ClosedAt { get; set; }
    public int? AssignedTo { get; set; }
    public string? AssignedToName { get; set; }
    public DateTime? NextFollowUpAt { get; set; }
    public DateTime? LastActivityAt { get; set; }
    // "ERP Cloud, Implementation" and the ids, for the form.
    public string? ProductNames { get; set; }
    public string? ProductIdList { get; set; }
    public List<int> ProductIds => string.IsNullOrEmpty(ProductIdList) ? new() : ProductIdList.Split(',').Select(int.Parse).ToList();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class SaveLeadDto
{
    // Either an existing contact, or a new contact (mobile and/or email) with an optional company name.
    public int? CustomerId { get; set; }
    [MaxLength(150)] public string? CustomerName { get; set; }
    [RegularExpression(@"^\d{8,15}$", ErrorMessage = "Mobile number must be 8-15 digits with country code.")]
    public string? MobileNo { get; set; }
    [EmailAddress, MaxLength(150)] public string? Email { get; set; }
    [MaxLength(200)] public string? AccountName { get; set; }

    [MaxLength(200)] public string? Title { get; set; }
    [Required, RegularExpression(LeadCodes.Sources)] public string Source { get; set; } = "OTHER";
    public List<int> ProductIds { get; set; } = new();
    [Range(1, 100000)] public int? UsersCount { get; set; }
    [RegularExpression("CLOUD|ON_PREMISE|ANY")] public string? Deployment { get; set; }
    [MaxLength(150)] public string? CurrentSystem { get; set; }
    [Range(0, 10000000000)] public decimal? Budget { get; set; }
    public DateTime? DecisionDate { get; set; }
    [MaxLength(150)] public string? DecisionMaker { get; set; }
    [MaxLength(2000)] public string? Requirements { get; set; }
    [Range(0, 10000000000)] public decimal? ExpectedValue { get; set; }
    [Required, RegularExpression("HOT|WARM|COLD")] public string Priority { get; set; } = "WARM";
    public int? AssignedTo { get; set; }
}

public class SetLeadStatusDto
{
    [Required, RegularExpression(LeadCodes.Statuses)] public string Status { get; set; } = string.Empty;
    [RegularExpression(LeadCodes.LostReasons)] public string? LostReason { get; set; }
    [Range(0, 10000000000)] public decimal? DealValue { get; set; }
    [MaxLength(2000)] public string? Note { get; set; }
}

public class LeadStatusCount
{
    public string Status { get; set; } = string.Empty;
    public int Leads { get; set; }
}

// One row of a lead's timeline: CRM activities plus the contact's WhatsApp messages and emails.
public class TimelineRow
{
    public string Kind { get; set; } = string.Empty;          // ACTIVITY / WHATSAPP / EMAIL
    public int Id { get; set; }
    public string? ActivityType { get; set; }
    public string? Direction { get; set; }
    public string? Subject { get; set; }
    public string? Body { get; set; }
    public string? Outcome { get; set; }
    public string? StatusFrom { get; set; }
    public string? StatusTo { get; set; }
    public string? ByName { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class AddActivityDto
{
    [Required, RegularExpression("NOTE|CALL|MEETING|DEMO")] public string ActivityType { get; set; } = "NOTE";
    [MaxLength(2000)] public string? Body { get; set; }
    [RegularExpression("ANSWERED|NO_ANSWER|BUSY|SWITCHED_OFF|WRONG_NUMBER")] public string? Outcome { get; set; }
}

public class FollowUpRow
{
    public int FollowUpId { get; set; }
    public int LeadId { get; set; }
    public int LeadSeq { get; set; }
    public string LeadNo => $"LD-{LeadSeq:D5}";
    public int CustomerId { get; set; }
    public string? CustomerName { get; set; }
    public string? WhatsappName { get; set; }
    public string? MobileNo { get; set; }
    public string? Email { get; set; }
    public string? AccountName { get; set; }
    public string LeadStatus { get; set; } = string.Empty;
    public string FollowUpType { get; set; } = string.Empty;
    public DateTime DueAt { get; set; }
    public string? Notes { get; set; }
    public int? AssignedTo { get; set; }
    public string? AssignedToName { get; set; }
    public string IsDone { get; set; } = "F";
    public DateTime? DoneAt { get; set; }
    public string? DoneByName { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class SaveFollowUpDto
{
    [Required, RegularExpression("CALL|WHATSAPP|EMAIL|MEETING|DEMO")] public string FollowUpType { get; set; } = "CALL";
    [Required] public DateTime DueAt { get; set; }
    [MaxLength(1000)] public string? Notes { get; set; }
}

public class CompleteFollowUpDto
{
    [MaxLength(2000)] public string? Result { get; set; }
}

// ---------- Lead import / bulk assign ----------

// Raw spreadsheet cells, already matched to CRM fields by the browser.
public class ImportRowDto
{
    public string? CustomerName { get; set; }
    public string? MobileNo { get; set; }
    public string? Email { get; set; }
    public string? AccountName { get; set; }
    public string? Source { get; set; }
    public string? Products { get; set; }
    public string? UsersCount { get; set; }
    public string? Budget { get; set; }
    public string? CurrentSystem { get; set; }
    public string? Priority { get; set; }
    public string? Requirements { get; set; }
}

public class ImportLeadsDto
{
    [Required, MinLength(1), MaxLength(2000)] public List<ImportRowDto> Rows { get; set; } = new();
    public bool DryRun { get; set; } = true;
    [Required, RegularExpression(LeadCodes.Sources)] public string DefaultSource { get; set; } = "IMPORT";
    // Contacts who already have an open lead are skipped instead of getting a second one.
    public bool SkipOpenDuplicates { get; set; } = true;
    // Empty = unassigned, one = all to that person, several = round-robin.
    public List<int> AssignUserIds { get; set; } = new();
}

public class ImportRowResult
{
    public int Row { get; set; }
    public string Outcome { get; set; } = string.Empty;       // NEW / EXISTING / DUPLICATE / ERROR
    public string? Message { get; set; }
    public string? CustomerName { get; set; }
    public string? MobileNo { get; set; }
    public string? Email { get; set; }
    public string? AccountName { get; set; }
    public SaveLeadDto? Lead { get; set; }
    public string? ProductNames { get; set; }
    public int? AssignTo { get; set; }
    public int? LeadId { get; set; }
}

public class ImportResult
{
    public bool DryRun { get; set; }
    public int NewCustomers { get; set; }
    public int ExistingCustomers { get; set; }
    public int Duplicates { get; set; }
    public int Errors { get; set; }
    public int LeadsCreated { get; set; }
    public List<ImportRowResult> Rows { get; set; } = new();
}

public class BulkAssignDto
{
    [Required, MinLength(1), MaxLength(2000)] public List<int> LeadIds { get; set; } = new();
    // Empty = unassign, one = all to that person, several = round-robin.
    public List<int> UserIds { get; set; } = new();
}
