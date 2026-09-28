namespace IStreamsCrm.Api.DTOs;

public class DashboardStats
{
    public int TotalCustomers { get; set; }
    public int NewToday { get; set; }
    public int Unassigned { get; set; }
    public int UnreadChats { get; set; }
    public int MessagesToday { get; set; }
    public int OpenWindows { get; set; }
}

public class StaffLoad
{
    public int UserId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string IsActive { get; set; } = "T";
    public int Customers { get; set; }
    public int UnreadChats { get; set; }
    public int RepliesToday { get; set; }
    public int OpenLeads { get; set; }
    public int OverdueFollowUps { get; set; }
    public int DealsWonMonth { get; set; }
    public decimal DealValueMonth { get; set; }
}

public class DashboardWork
{
    public int OverdueFollowUps { get; set; }
    public int DueToday { get; set; }
    public int DemosToday { get; set; }
    public int DemosTomorrow { get; set; }
    public int NewLeadsToday { get; set; }
    public int UnassignedLeads { get; set; }
    public int ColdLeads { get; set; }
}

public class DashboardActivity
{
    public int ActivityId { get; set; }
    public int LeadId { get; set; }
    public int LeadSeq { get; set; }
    public string LeadNo => $"LD-{LeadSeq:D5}";
    public string? CustomerName { get; set; }
    public string? WhatsappName { get; set; }
    public string? MobileNo { get; set; }
    public string? Email { get; set; }
    public string? AccountName { get; set; }
    public string ActivityType { get; set; } = string.Empty;
    public string? Body { get; set; }
    public string? Outcome { get; set; }
    public string? StatusTo { get; set; }
    public string? LeadSource { get; set; }
    public string? ByName { get; set; }
    public DateTime CreatedAt { get; set; }
}
