using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using IStreamsCrm.Api.DTOs;
using IStreamsCrm.Api.Repositories;
using IStreamsCrm.Api.Services;

namespace IStreamsCrm.Api.Controllers;

// Quotations belong to a lead. Staff work on quotations of their own leads; discounts above the company
// limit need an admin's approval before the quotation can be sent.
[ApiController]
[Route("api/[controller]")]
public class QuotationsController : ControllerBase
{
    private static readonly string[] EarlyStages = { "NEW", "CONTACTED", "DEMO_SCHEDULED", "DEMO_DONE", "REQUIREMENTS", "NO_ANSWER", "FOLLOW_UP_LATER" };
    private static readonly string[] PerUserUnits = { "PER_USER", "PER_USER_MONTH", "PER_USER_YEAR" };

    private readonly IQuotationRepository _repo;
    private readonly ILeadRepository _leads;
    private readonly IProductRepository _products;
    private readonly ICompanyProfileRepository _profile;
    private readonly ICustomerRepository _customers;
    private readonly IEmailSettingsRepository _emailSettings;
    private readonly ISettingsRepository _whatsAppSettings;
    private readonly IMailboxService _mailbox;
    private readonly IWhatsAppService _whatsApp;
    private readonly ITicketRepository _tickets;

    public QuotationsController(IQuotationRepository repo, ILeadRepository leads, IProductRepository products,
        ICompanyProfileRepository profile, ICustomerRepository customers, IEmailSettingsRepository emailSettings,
        ISettingsRepository whatsAppSettings, IMailboxService mailbox, IWhatsAppService whatsApp, ITicketRepository tickets)
    {
        _repo = repo;
        _leads = leads;
        _products = products;
        _profile = profile;
        _customers = customers;
        _emailSettings = emailSettings;
        _whatsAppSettings = whatsAppSettings;
        _mailbox = mailbox;
        _whatsApp = whatsApp;
        _tickets = tickets;
    }

    private int? Scope => User.IsAdmin() ? null : User.UserId();

    private async Task<QuotationRow?> GetAccessibleAsync(int id)
    {
        var q = await _repo.GetByIdAsync(User.CompanyId(), id);
        return q is not null && (User.IsAdmin() || q.LeadAssignedTo == User.UserId()) ? q : null;
    }

    private async Task<LeadRow?> GetLeadAsync(int leadId)
    {
        var l = await _leads.GetByIdAsync(User.CompanyId(), leadId);
        return l is not null && (User.IsAdmin() || l.AssignedTo == User.UserId()) ? l : null;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] QuotationFilter filter)
        => Ok(await _repo.GetAllAsync(User.CompanyId(), Scope, filter));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var q = await GetAccessibleAsync(id);
        return q is null ? NotFound() : Ok(q);
    }

    // A draft pre-filled from the lead: its products (quantity = users for per-user prices) and the company's default terms.
    [HttpPost("from-lead/{leadId:int}")]
    public async Task<IActionResult> FromLead(int leadId, [FromQuery] int tzOffset = 0)
    {
        var lead = await GetLeadAsync(leadId);
        if (lead is null) return NotFound();
        var profile = await _profile.GetAsync(User.CompanyId());
        var today = DateTime.UtcNow.AddMinutes(-Math.Clamp(tzOffset, -840, 840)).Date;

        var lines = new List<SaveQuotationLineDto>();
        foreach (var pid in lead.ProductIds)
        {
            var p = await _products.GetByIdAsync(User.CompanyId(), pid);
            if (p is null) continue;
            lines.Add(new SaveQuotationLineDto
            {
                ProductId = p.ProductId,
                Description = string.IsNullOrWhiteSpace(p.Description) ? p.ProductName : $"{p.ProductName}\n{p.Description}",
                Unit = p.Unit,
                Quantity = PerUserUnits.Contains(p.Unit) && lead.UsersCount is > 0 ? lead.UsersCount.Value : 1,
                UnitPrice = p.Price,
                VatPct = p.VatPct
            });
        }
        if (lines.Count == 0) lines.Add(new SaveQuotationLineDto { Description = lead.Title ?? "Software and services", Quantity = 1, UnitPrice = 0, VatPct = 5 });

        var dto = new SaveQuotationDto
        {
            LeadId = leadId,
            Subject = lead.Title ?? lead.ProductNames,
            QuoteDate = today,
            ValidUntil = today.AddDays(profile.QuoteValidityDays),
            PaymentTerms = profile.QuotePaymentTerms,
            Terms = profile.QuoteTerms,
            Lines = lines
        };
        var q = await _repo.CreateAsync(User.CompanyId(), dto, "NONE", User.UserId());
        await _leads.LogActivityAsync(User.CompanyId(), leadId, "QUOTE", $"{q!.QuoteNo} drafted", User.UserId());
        return Ok(q);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] SaveQuotationDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var existing = await GetAccessibleAsync(id);
        if (existing is null) return NotFound();
        if (existing.Status != "DRAFT") return BadRequest(new { message = "Only a draft can be edited. Create a revision instead." });
        if (Check(dto) is { } invalid) return BadRequest(new { message = invalid });
        dto.LeadId = existing.LeadId;

        var profile = await _profile.GetAsync(User.CompanyId());
        var needsApproval = dto.Lines.Max(l => l.DiscountPct) > profile.MaxDiscountPct;
        var q = await _repo.UpdateAsync(User.CompanyId(), id, dto, needsApproval ? "PENDING" : "NONE");
        // An admin's own discount needs no second approval.
        if (needsApproval && User.IsAdmin()) await _repo.ApproveAsync(User.CompanyId(), id, User.UserId());
        return Ok(await _repo.GetByIdAsync(User.CompanyId(), q!.QuotationId));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var q = await GetAccessibleAsync(id);
        if (q is null) return NotFound();
        if (!await _repo.DeleteDraftAsync(User.CompanyId(), id)) return BadRequest(new { message = "Only a draft can be deleted." });
        await _leads.LogActivityAsync(User.CompanyId(), q.LeadId, "QUOTE", $"{q.QuoteNo} draft deleted", User.UserId());
        return NoContent();
    }

    [HttpPost("{id:int}/revise")]
    public async Task<IActionResult> Revise(int id)
    {
        var q = await GetAccessibleAsync(id);
        if (q is null) return NotFound();
        var revision = await _repo.ReviseAsync(User.CompanyId(), id, User.UserId());
        if (revision is null) return BadRequest(new { message = "Only a sent or rejected quotation can be revised." });
        await _leads.LogActivityAsync(User.CompanyId(), q.LeadId, "QUOTE", $"{revision.QuoteNo} revision drafted (from {q.QuoteNo})", User.UserId());
        return Ok(revision);
    }

    [HttpPost("{id:int}/approve")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Approve(int id)
    {
        var q = await _repo.GetByIdAsync(User.CompanyId(), id);
        if (q is null) return NotFound();
        if (q.ApprovalStatus != "PENDING") return BadRequest(new { message = "This quotation is not waiting for approval." });
        await _repo.ApproveAsync(User.CompanyId(), id, User.UserId());
        await _leads.LogActivityAsync(User.CompanyId(), q.LeadId, "QUOTE", $"{q.QuoteNo} discount approved ({q.MaxLineDiscount:0.##}%)", User.UserId());
        return Ok(await _repo.GetByIdAsync(User.CompanyId(), id));
    }

    [HttpGet("{id:int}/pdf")]
    public async Task<IActionResult> Pdf(int id)
    {
        var q = await GetAccessibleAsync(id);
        if (q is null) return NotFound();
        return File(await BuildPdfAsync(q), "application/pdf", $"{q.QuoteNo}.pdf");
    }

    [HttpPost("{id:int}/send")]
    public async Task<IActionResult> Send(int id, [FromBody] SendQuotationDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var q = await GetAccessibleAsync(id);
        if (q is null) return NotFound();
        if (q.Status is not ("DRAFT" or "SENT")) return BadRequest(new { message = "This quotation is closed. Create a revision to send a new version." });
        if (q.ApprovalStatus == "PENDING")
            return BadRequest(new { message = $"The {q.MaxLineDiscount:0.##}% discount is above your limit and needs an admin's approval before sending." });
        if (q.Lines.Count == 0 || q.GrandTotal <= 0) return BadRequest(new { message = "Add at least one priced line before sending." });

        var customer = (await _customers.GetByIdAsync(User.CompanyId(), q.CustomerId))!;
        var profile = await _profile.GetAsync(User.CompanyId());
        var pdf = await BuildPdfAsync(q);
        var fileName = $"{q.QuoteNo}.pdf";
        var name = customer.CustomerName ?? customer.WhatsappName;
        var message = string.IsNullOrWhiteSpace(dto.Message)
            ? $"Dear {name ?? "Sir / Madam"},\n\nPlease find attached our quotation {q.QuoteNo}{(q.Subject is null ? "" : $" for {q.Subject}")}, " +
              $"valid until {q.ValidUntil:dd-MMM-yyyy}. Total: AED {q.GrandTotal:N2} including VAT.\n\nWe look forward to working with you.\n\nKind regards,\n{User.Identity?.Name}\n{profile.LegalName}"
            : dto.Message.Trim();

        (bool ok, string? error) result;
        if (dto.Channel == "EMAIL")
        {
            if (string.IsNullOrEmpty(customer.Email)) return BadRequest(new { message = "This contact has no email ID." });
            var settings = await _emailSettings.GetAsync(User.CompanyId());
            if (settings is null || settings.IsVerified != "T")
                return BadRequest(new { message = "Email is not connected. Ask your admin to set up Email Settings." });
            result = await _mailbox.SendAsync(settings, customer, $"Quotation {q.QuoteNo}{(profile.LegalName is null ? "" : $" – {profile.LegalName}")}",
                message, User.UserId(), new MailAttachment(pdf, fileName, "application/pdf"));
        }
        else
        {
            if (string.IsNullOrEmpty(customer.MobileNo)) return BadRequest(new { message = "This contact has no mobile number." });
            if (customer.LastInboundAt is null || DateTime.UtcNow - customer.LastInboundAt > TimeSpan.FromHours(24))
                return BadRequest(new { message = "WhatsApp only allows sending within 24 hours of the customer's last message. Send by email, or ask the customer to message you first." });
            var settings = await _whatsAppSettings.GetAsync(User.CompanyId());
            if (settings is null || string.IsNullOrEmpty(settings.AccessToken) || string.IsNullOrEmpty(settings.PhoneNumberId))
                return BadRequest(new { message = "WhatsApp is not configured. Ask your admin to fill in WhatsApp Settings." });
            // WhatsApp captions are limited to 1024 characters.
            result = await _whatsApp.SendDocumentAsync(settings, customer, pdf, fileName, "application/pdf",
                message.Length > 1000 ? message[..1000] : message, User.UserId());
        }
        if (!result.ok) return BadRequest(new { message = $"Not sent: {result.error}" });

        await _repo.MarkSentAsync(User.CompanyId(), id);
        await _leads.LogActivityAsync(User.CompanyId(), q.LeadId, "QUOTE",
            $"{q.QuoteNo} sent by {(dto.Channel == "EMAIL" ? "email" : "WhatsApp")} · AED {q.GrandTotal:N2}", User.UserId());
        // Moves the pipeline forward: first quotation -> Quotation Sent, a revision -> Negotiation.
        var target = q.Revision > 0 ? "NEGOTIATION" : "QUOTATION_SENT";
        if (EarlyStages.Contains(q.LeadStatus) || (target == "NEGOTIATION" && q.LeadStatus == "QUOTATION_SENT"))
            await _leads.SetStatusAsync(User.CompanyId(), q.LeadId, new SetLeadStatusDto { Status = target, Note = q.QuoteNo }, User.UserId());
        return Ok(await _repo.GetByIdAsync(User.CompanyId(), id));
    }

    [HttpPost("{id:int}/close")]
    public async Task<IActionResult> Close(int id, [FromBody] CloseQuotationDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var q = await GetAccessibleAsync(id);
        if (q is null) return NotFound();
        if (q.Status != "SENT") return BadRequest(new { message = "Only a sent quotation can be marked accepted or rejected." });
        await _repo.CloseAsync(User.CompanyId(), id, dto.Accepted, string.IsNullOrWhiteSpace(dto.Reason) ? null : dto.Reason.Trim());
        await _leads.LogActivityAsync(User.CompanyId(), q.LeadId, "QUOTE",
            dto.Accepted ? $"{q.QuoteNo} accepted by the customer" : $"{q.QuoteNo} rejected{(string.IsNullOrWhiteSpace(dto.Reason) ? "" : $": {dto.Reason.Trim()}")}",
            User.UserId());
        await _tickets.QuotationClosedAsync(User.CompanyId(), q.LeadId, dto.Accepted, q.QuoteNo);
        // An accepted quotation wins the lead at the quotation's value before VAT.
        if (dto.Accepted && q.LeadStatus != "WON")
            await _leads.SetStatusAsync(User.CompanyId(), q.LeadId,
                new SetLeadStatusDto { Status = "WON", DealValue = q.NetTotal, Note = $"{q.QuoteNo} accepted" }, User.UserId());
        return Ok(await _repo.GetByIdAsync(User.CompanyId(), id));
    }

    private async Task<byte[]> BuildPdfAsync(QuotationRow q)
    {
        var profile = await _profile.GetAsync(User.CompanyId());
        var (logo, _) = await _profile.GetLogoAsync(User.CompanyId());
        return QuotePdf.Build(q, profile, logo);
    }

    private static string? Check(SaveQuotationDto dto)
    {
        if (dto.ValidUntil.Date < dto.QuoteDate.Date) return "Valid-until date is before the quotation date.";
        foreach (var l in dto.Lines) l.Description = l.Description.Trim();
        if (dto.Lines.Any(l => l.Description.Length == 0)) return "Every line needs a description.";
        dto.Subject = string.IsNullOrWhiteSpace(dto.Subject) ? null : dto.Subject.Trim();
        dto.PaymentTerms = string.IsNullOrWhiteSpace(dto.PaymentTerms) ? null : dto.PaymentTerms.Trim();
        dto.Terms = string.IsNullOrWhiteSpace(dto.Terms) ? null : dto.Terms.Trim();
        dto.Notes = string.IsNullOrWhiteSpace(dto.Notes) ? null : dto.Notes.Trim();
        return null;
    }
}
