using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using IStreamsCrm.Api.DTOs;
using IStreamsCrm.Api.Repositories;
using IStreamsCrm.Api.Services;

namespace IStreamsCrm.Api.Controllers;

// Recurring items (cloud plans, AMC). The lead's agent manages them; cancelling one is an admin task.
[ApiController]
[Route("api/[controller]")]
public class SubscriptionsController : ControllerBase
{
    private static readonly string[] RecurringTypes = { "SUBSCRIPTION", "AMC" };
    private static readonly string[] RecurringUnits = { "PER_USER_MONTH", "PER_USER_YEAR", "PER_MONTH", "PER_YEAR" };

    private readonly ISubscriptionRepository _repo;
    private readonly ILeadRepository _leads;
    private readonly IQuotationRepository _quotes;
    private readonly IProductRepository _products;
    private readonly ICustomerRepository _customers;
    private readonly ICompanyProfileRepository _profile;
    private readonly IEmailSettingsRepository _emailSettings;
    private readonly ISettingsRepository _whatsAppSettings;
    private readonly IMailboxService _mailbox;
    private readonly IWhatsAppService _whatsApp;
    private readonly RenewalService _renewals;
    private readonly RenewalWorker _worker;

    public SubscriptionsController(ISubscriptionRepository repo, ILeadRepository leads, IQuotationRepository quotes, IProductRepository products,
        ICustomerRepository customers, ICompanyProfileRepository profile, IEmailSettingsRepository emailSettings,
        ISettingsRepository whatsAppSettings, IMailboxService mailbox, IWhatsAppService whatsApp, RenewalService renewals, RenewalWorker worker)
    {
        _repo = repo;
        _leads = leads;
        _quotes = quotes;
        _products = products;
        _customers = customers;
        _profile = profile;
        _emailSettings = emailSettings;
        _whatsAppSettings = whatsAppSettings;
        _mailbox = mailbox;
        _whatsApp = whatsApp;
        _renewals = renewals;
        _worker = worker;
    }

    private int? Scope => User.IsAdmin() ? null : User.UserId();
    private static DateTime Today(int tzOffset) => DateTime.UtcNow.AddMinutes(-Math.Clamp(tzOffset, -840, 840)).Date;
    private static string D(DateTime d) => d.ToString("dd-MMM-yyyy", DocumentPdf.En);

    private async Task<SubscriptionRow?> GetAccessibleAsync(int id, int tzOffset)
    {
        var s = await _repo.GetByIdAsync(User.CompanyId(), id, Today(tzOffset));
        return s is not null && (User.IsAdmin() || s.LeadAssignedTo == User.UserId()) ? s : null;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] SubscriptionFilter filter, [FromQuery] int tzOffset)
        => Ok(await _repo.GetAllAsync(User.CompanyId(), Scope, filter, Today(tzOffset)));

    [HttpGet("summary")]
    public async Task<IActionResult> Summary([FromQuery] int tzOffset)
        => Ok(await _repo.SummaryAsync(User.CompanyId(), Scope, Today(tzOffset)));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, [FromQuery] int tzOffset)
    {
        var s = await GetAccessibleAsync(id, tzOffset);
        return s is null ? NotFound() : Ok(s);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SaveSubscriptionDto dto, [FromQuery] int tzOffset)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var lead = await _leads.GetByIdAsync(User.CompanyId(), dto.LeadId);
        if (lead is null || (!User.IsAdmin() && lead.AssignedTo != User.UserId())) return NotFound();
        if (Check(dto) is { } invalid) return BadRequest(new { message = invalid });
        var s = await _repo.CreateAsync(User.CompanyId(), dto, null, User.UserId(), Today(tzOffset));
        await _leads.LogActivityAsync(User.CompanyId(), dto.LeadId, "SUBSCR", $"Subscription added: {s!.Description} until {D(s.EndDate)}", User.UserId());
        return Ok(s);
    }

    // One subscription per recurring line (subscription / AMC products, or monthly / yearly prices) of an accepted quotation.
    // The quotation is taken to bill the first period, which starts today.
    [HttpPost("from-quotation/{quotationId:int}")]
    public async Task<IActionResult> FromQuotation(int quotationId, [FromQuery] int tzOffset)
    {
        var q = await _quotes.GetByIdAsync(User.CompanyId(), quotationId);
        if (q is null || (!User.IsAdmin() && q.LeadAssignedTo != User.UserId())) return NotFound();
        if (q.Status != "ACCEPTED") return BadRequest(new { message = "Subscriptions are created from an accepted quotation." });
        if (await _repo.ExistsForQuotationAsync(User.CompanyId(), quotationId))
            return BadRequest(new { message = "Subscriptions were already created from this quotation." });

        var today = Today(tzOffset);
        var created = new List<SubscriptionRow>();
        foreach (var line in q.Lines)
        {
            var product = line.ProductId is null ? null : await _products.GetByIdAsync(User.CompanyId(), line.ProductId.Value);
            var unit = line.Unit ?? product?.Unit;
            if (!(product is not null && RecurringTypes.Contains(product.ItemType)) && !(unit is not null && RecurringUnits.Contains(unit))) continue;
            var cycle = unit is "PER_USER_MONTH" or "PER_MONTH" ? "MONTHLY" : "YEARLY";
            var end = today.AddMonths(Cycles.Months(cycle)).AddDays(-1);
            var s = await _repo.CreateAsync(User.CompanyId(), new SaveSubscriptionDto
            {
                LeadId = q.LeadId,
                ProductId = line.ProductId,
                Description = (product?.ProductName ?? line.Description.Split('\n')[0]).Trim(),
                Unit = unit,
                Quantity = line.Quantity,
                UnitPrice = line.UnitPrice,
                DiscountPct = line.DiscountPct,
                VatPct = line.VatPct,
                BillingCycle = cycle,
                StartDate = today,
                EndDate = end,
                AutoRenew = "T"
            }, quotationId, User.UserId(), today);
            created.Add(s!);
        }
        if (created.Count == 0)
            return BadRequest(new { message = "This quotation has no recurring lines (subscription or AMC products, or monthly / yearly prices)." });
        await _leads.LogActivityAsync(User.CompanyId(), q.LeadId, "SUBSCR",
            $"{created.Count} subscription(s) started from {q.QuoteNo}: {string.Join(", ", created.Select(s => s.Description))}", User.UserId());
        return Ok(created);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] SaveSubscriptionDto dto, [FromQuery] int tzOffset)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var existing = await GetAccessibleAsync(id, tzOffset);
        if (existing is null) return NotFound();
        if (existing.Status != "ACTIVE") return BadRequest(new { message = "A cancelled subscription cannot be changed." });
        if (Check(dto) is { } invalid) return BadRequest(new { message = invalid });
        dto.LeadId = existing.LeadId;
        return Ok(await _repo.UpdateAsync(User.CompanyId(), id, dto, Today(tzOffset)));
    }

    [HttpPost("{id:int}/cancel")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Cancel(int id, [FromBody] CancelInvoiceDto dto, [FromQuery] int tzOffset)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var s = await GetAccessibleAsync(id, tzOffset);
        if (s is null) return NotFound();
        if (!await _repo.CancelAsync(User.CompanyId(), id, dto.Reason.Trim())) return BadRequest(new { message = "Already cancelled." });
        await _leads.LogActivityAsync(User.CompanyId(), s.LeadId, "SUBSCR", $"Subscription cancelled: {s.Description} — {dto.Reason.Trim()}", User.UserId());
        return Ok(await _repo.GetByIdAsync(User.CompanyId(), id, Today(tzOffset)));
    }

    [HttpPost("{id:int}/renew")]
    public async Task<IActionResult> Renew(int id, [FromQuery] int tzOffset)
    {
        var s = await GetAccessibleAsync(id, tzOffset);
        if (s is null) return NotFound();
        if (s.Status != "ACTIVE") return BadRequest(new { message = "A cancelled subscription cannot be renewed." });
        if (s.RenewalInvoiceId is not null)
            return Conflict(new { message = "A renewal invoice for the next period already exists.", invoiceId = s.RenewalInvoiceId });
        return Ok(await _renewals.DraftRenewalAsync(User.CompanyId(), s, User.UserId(), Today(tzOffset)));
    }

    // A text reminder that the subscription is ending; the renewal invoice itself is sent from the invoice page.
    [HttpPost("{id:int}/remind")]
    public async Task<IActionResult> Remind(int id, [FromBody] ReminderDto dto, [FromQuery] int tzOffset)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var s = await GetAccessibleAsync(id, tzOffset);
        if (s is null) return NotFound();
        var customer = (await _customers.GetByIdAsync(User.CompanyId(), s.CustomerId))!;
        var profile = await _profile.GetAsync(User.CompanyId());
        var ended = s.EndDate.Date < Today(tzOffset);
        var message = !string.IsNullOrWhiteSpace(dto.Message) ? dto.Message.Trim()
            : $"Dear {customer.CustomerName ?? customer.WhatsappName ?? "Sir / Madam"},\n\nYour {s.Description} {(ended ? "expired" : "is due for renewal")} on {D(s.EndDate)}. " +
              $"The renewal for the next {(s.BillingCycle == "MONTHLY" ? "month" : s.BillingCycle == "QUARTERLY" ? "quarter" : "year")} is AED {s.CycleAmount:N2} plus VAT. " +
              $"Please confirm and we will send the invoice, so there is no interruption.\n\nKind regards,\n{User.Identity?.Name}\n{profile.LegalName}";

        (bool ok, string? error) result;
        if (dto.Channel == "EMAIL")
        {
            if (string.IsNullOrEmpty(customer.Email)) return BadRequest(new { message = "This contact has no email ID." });
            var settings = await _emailSettings.GetAsync(User.CompanyId());
            if (settings is null || settings.IsVerified != "T") return BadRequest(new { message = "Email is not connected. Ask your admin to set up Email Settings." });
            result = await _mailbox.SendAsync(settings, customer, $"Renewal reminder – {s.Description}", message, User.UserId());
        }
        else
        {
            if (string.IsNullOrEmpty(customer.MobileNo)) return BadRequest(new { message = "This contact has no mobile number." });
            if (customer.LastInboundAt is null || DateTime.UtcNow - customer.LastInboundAt > TimeSpan.FromHours(24))
                return BadRequest(new { message = "WhatsApp only allows sending within 24 hours of the customer's last message. Send by email instead." });
            var settings = await _whatsAppSettings.GetAsync(User.CompanyId());
            if (settings is null || string.IsNullOrEmpty(settings.AccessToken) || string.IsNullOrEmpty(settings.PhoneNumberId))
                return BadRequest(new { message = "WhatsApp is not configured. Ask your admin to fill in WhatsApp Settings." });
            result = await _whatsApp.SendFromStaffAsync(settings, customer, message, User.UserId());
        }
        if (!result.ok) return BadRequest(new { message = $"Not sent: {result.error}" });
        await _leads.LogActivityAsync(User.CompanyId(), s.LeadId, "SUBSCR",
            $"Renewal reminder sent by {(dto.Channel == "EMAIL" ? "email" : "WhatsApp")}: {s.Description}", User.UserId());
        return NoContent();
    }

    // Runs the automatic renewal check now instead of waiting for the next scheduled run.
    [HttpPost("run-renewals")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> RunRenewals() => Ok(new { drafted = await _worker.RunOnceAsync() });

    private static string? Check(SaveSubscriptionDto dto)
    {
        dto.Description = dto.Description.Trim();
        dto.Notes = string.IsNullOrWhiteSpace(dto.Notes) ? null : dto.Notes.Trim();
        if (dto.Description.Length == 0) return "Enter a description.";
        if (dto.EndDate.Date < dto.StartDate.Date) return "The end date is before the start date.";
        return null;
    }
}
