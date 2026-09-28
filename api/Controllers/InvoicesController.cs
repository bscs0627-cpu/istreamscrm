using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using IStreamsCrm.Api.DTOs;
using IStreamsCrm.Api.Repositories;
using IStreamsCrm.Api.Services;

namespace IStreamsCrm.Api.Controllers;

// Tax invoices from accepted quotations. The lead's agent drafts, issues and sends them;
// recording payments and cancelling an issued invoice are admin tasks.
[ApiController]
[Route("api/[controller]")]
public class InvoicesController : ControllerBase
{
    private readonly IInvoiceRepository _repo;
    private readonly IQuotationRepository _quotes;
    private readonly ILeadRepository _leads;
    private readonly ICompanyProfileRepository _profile;
    private readonly ICustomerRepository _customers;
    private readonly IEmailSettingsRepository _emailSettings;
    private readonly ISettingsRepository _whatsAppSettings;
    private readonly IMailboxService _mailbox;
    private readonly IWhatsAppService _whatsApp;
    private readonly ISubscriptionRepository _subs;

    public InvoicesController(IInvoiceRepository repo, IQuotationRepository quotes, ILeadRepository leads, ICompanyProfileRepository profile,
        ICustomerRepository customers, IEmailSettingsRepository emailSettings, ISettingsRepository whatsAppSettings,
        IMailboxService mailbox, IWhatsAppService whatsApp, ISubscriptionRepository subs)
    {
        _repo = repo;
        _quotes = quotes;
        _leads = leads;
        _profile = profile;
        _customers = customers;
        _emailSettings = emailSettings;
        _whatsAppSettings = whatsAppSettings;
        _mailbox = mailbox;
        _whatsApp = whatsApp;
        _subs = subs;
    }

    private int? Scope => User.IsAdmin() ? null : User.UserId();

    // The user's local date (overdue, invoice date). tzOffset = the browser's getTimezoneOffset().
    private static DateTime Today(int tzOffset) => DateTime.UtcNow.AddMinutes(-Math.Clamp(tzOffset, -840, 840)).Date;

    private async Task<InvoiceRow?> GetAccessibleAsync(int id, int tzOffset)
    {
        var i = await _repo.GetByIdAsync(User.CompanyId(), id, Today(tzOffset));
        return i is not null && (User.IsAdmin() || i.LeadAssignedTo == User.UserId()) ? i : null;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] InvoiceFilter filter, [FromQuery] int tzOffset)
        => Ok(await _repo.GetAllAsync(User.CompanyId(), Scope, filter, Today(tzOffset)));

    [HttpGet("aging")]
    public async Task<IActionResult> Aging([FromQuery] int tzOffset)
        => Ok(await _repo.AgingAsync(User.CompanyId(), Scope, Today(tzOffset)));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, [FromQuery] int tzOffset)
    {
        var i = await GetAccessibleAsync(id, tzOffset);
        return i is null ? NotFound() : Ok(i);
    }

    // How much of an accepted quotation is still to be invoiced (percent of its value before VAT).
    [HttpGet("remaining/{quotationId:int}")]
    public async Task<IActionResult> Remaining(int quotationId)
    {
        var q = await _quotes.GetByIdAsync(User.CompanyId(), quotationId);
        if (q is null || (!User.IsAdmin() && q.LeadAssignedTo != User.UserId())) return NotFound();
        var invoiced = await _repo.InvoicedPercentAsync(User.CompanyId(), quotationId, q.NetTotal);
        return Ok(new { invoicedPercent = invoiced, remainingPercent = Math.Max(0, 100 - invoiced) });
    }

    // Full (100% with the quotation's own lines) or a share: one line per VAT rate, e.g. "Advance 50% of QT-2026-0001".
    [HttpPost("from-quotation/{quotationId:int}")]
    public async Task<IActionResult> FromQuotation(int quotationId, [FromBody] InvoiceFromQuoteDto dto, [FromQuery] int tzOffset)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var q = await _quotes.GetByIdAsync(User.CompanyId(), quotationId);
        if (q is null || (!User.IsAdmin() && q.LeadAssignedTo != User.UserId())) return NotFound();
        if (q.Status != "ACCEPTED") return BadRequest(new { message = "Invoices are made from an accepted quotation." });

        var invoiced = await _repo.InvoicedPercentAsync(User.CompanyId(), quotationId, q.NetTotal);
        var remaining = Math.Max(0, 100 - invoiced);
        if (dto.Percent > remaining + 0.001m)
            return BadRequest(new { message = remaining <= 0 ? "This quotation is fully invoiced." : $"Only {remaining:0.##}% of this quotation is left to invoice." });

        var profile = await _profile.GetAsync(User.CompanyId());
        var today = Today(tzOffset);
        var stage = string.IsNullOrWhiteSpace(dto.Stage) ? (dto.Percent >= 100 ? null : $"{dto.Percent:0.##}% of {q.QuoteNo}") : dto.Stage.Trim();

        List<SaveQuotationLineDto> lines;
        if (dto.Percent >= 100 && invoiced == 0)
            lines = q.Lines.Select(l => new SaveQuotationLineDto
            {
                ProductId = l.ProductId, Description = l.Description, Unit = l.Unit, Quantity = l.Quantity,
                UnitPrice = l.UnitPrice, DiscountPct = l.DiscountPct, VatPct = l.VatPct
            }).ToList();
        else
            lines = q.Lines.GroupBy(l => l.VatPct).Select(g => new SaveQuotationLineDto
            {
                Description = $"{stage ?? "Invoice"} – {dto.Percent:0.##}% of quotation {q.QuoteNo}{(q.Subject is null ? "" : $" ({q.Subject})")}"
                              + (q.Lines.Select(l => l.VatPct).Distinct().Count() > 1 ? $" – items at {g.Key:0.##}% VAT" : ""),
                Unit = "FIXED",
                Quantity = 1,
                UnitPrice = Math.Round(g.Sum(l => l.NetAmount) * dto.Percent / 100m, 2, MidpointRounding.AwayFromZero),
                VatPct = g.Key
            }).ToList();

        var inv = await _repo.CreateAsync(User.CompanyId(), q.LeadId, quotationId, new SaveInvoiceDto
        {
            Stage = stage,
            InvoiceDate = today,
            DueDate = today.AddDays(profile.InvoiceDueDays),
            Terms = profile.InvoiceTerms,
            Lines = lines
        }, User.UserId(), today);
        await _leads.LogActivityAsync(User.CompanyId(), q.LeadId, "INVOICE",
            $"Draft invoice for {dto.Percent:0.##}% of {q.QuoteNo} · AED {inv!.GrandTotal:N2}", User.UserId());
        return Ok(inv);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] SaveInvoiceDto dto, [FromQuery] int tzOffset)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var existing = await GetAccessibleAsync(id, tzOffset);
        if (existing is null) return NotFound();
        if (existing.Status != "DRAFT") return BadRequest(new { message = "An issued invoice cannot be edited. Cancel it and create a new one." });
        if (dto.DueDate.Date < dto.InvoiceDate.Date) return BadRequest(new { message = "The due date is before the invoice date." });
        foreach (var l in dto.Lines) l.Description = l.Description.Trim();
        if (dto.Lines.Any(l => l.Description.Length == 0)) return BadRequest(new { message = "Every line needs a description." });
        dto.Stage = string.IsNullOrWhiteSpace(dto.Stage) ? null : dto.Stage.Trim();
        dto.Terms = string.IsNullOrWhiteSpace(dto.Terms) ? null : dto.Terms.Trim();
        dto.Notes = string.IsNullOrWhiteSpace(dto.Notes) ? null : dto.Notes.Trim();
        return Ok(await _repo.UpdateDraftAsync(User.CompanyId(), id, dto, Today(tzOffset)));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, [FromQuery] int tzOffset)
    {
        var i = await GetAccessibleAsync(id, tzOffset);
        if (i is null) return NotFound();
        if (!await _repo.DeleteDraftAsync(User.CompanyId(), id)) return BadRequest(new { message = "Only a draft can be deleted. Cancel an issued invoice instead." });
        await _leads.LogActivityAsync(User.CompanyId(), i.LeadId, "INVOICE", "Draft invoice deleted", User.UserId());
        return NoContent();
    }

    // Issuing numbers the invoice and freezes the buyer's name, TRN and address on it.
    [HttpPost("{id:int}/issue")]
    public async Task<IActionResult> Issue(int id, [FromQuery] int tzOffset)
    {
        var i = await GetAccessibleAsync(id, tzOffset);
        if (i is null) return NotFound();
        if (i.Status != "DRAFT") return BadRequest(new { message = "This invoice is already issued." });
        if (i.GrandTotal <= 0) return BadRequest(new { message = "An invoice needs a total above zero." });
        var profile = await _profile.GetAsync(User.CompanyId());
        if (string.IsNullOrWhiteSpace(profile.LegalName) || string.IsNullOrWhiteSpace(profile.Trn))
            return BadRequest(new { message = "Fill in your legal name and TRN in Company Profile first — a UAE tax invoice must show them." });

        var address = string.Join(", ", new[] { i.AccountAddress, i.AccountCity, i.AccountCountry }.Where(s => !string.IsNullOrWhiteSpace(s)));
        await _repo.IssueAsync(User.CompanyId(), id, i.AccountName ?? i.CustomerName ?? i.WhatsappName, i.AccountTrn,
            address.Length == 0 ? null : address);
        var issued = await _repo.GetByIdAsync(User.CompanyId(), id, Today(tzOffset));
        // An issued renewal invoice moves the subscription's paid-up date to the end of its period.
        if (issued!.SubscriptionId is int subId && issued.PeriodEnd is DateTime periodEnd) await _subs.ExtendAsync(subId, periodEnd);
        await _leads.LogActivityAsync(User.CompanyId(), i.LeadId, "INVOICE", $"{issued!.InvoiceNo} issued · AED {issued.GrandTotal:N2}", User.UserId());
        return Ok(issued);
    }

    [HttpPost("{id:int}/cancel")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Cancel(int id, [FromBody] CancelInvoiceDto dto, [FromQuery] int tzOffset)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var i = await GetAccessibleAsync(id, tzOffset);
        if (i is null) return NotFound();
        if (i.Status != "ISSUED") return BadRequest(new { message = "Only an issued invoice can be cancelled (delete a draft instead)." });
        if (i.AmountPaid > 0) return BadRequest(new { message = "This invoice has payments. Remove them before cancelling." });
        await _repo.CancelAsync(User.CompanyId(), id, dto.Reason.Trim());
        if (i.SubscriptionId is int subId && i.PeriodStart is DateTime ps && i.PeriodEnd is DateTime pe) await _subs.RevertAsync(subId, ps, pe);
        await _leads.LogActivityAsync(User.CompanyId(), i.LeadId, "INVOICE", $"{i.InvoiceNo} cancelled: {dto.Reason.Trim()}", User.UserId());
        return Ok(await _repo.GetByIdAsync(User.CompanyId(), id, Today(tzOffset)));
    }

    [HttpGet("{id:int}/pdf")]
    public async Task<IActionResult> Pdf(int id, [FromQuery] int tzOffset)
    {
        var i = await GetAccessibleAsync(id, tzOffset);
        if (i is null) return NotFound();
        return File(await BuildPdfAsync(i), "application/pdf", $"{(i.InvSeq is null ? $"Draft-Invoice-{i.InvoiceId}" : i.InvoiceNo)}.pdf");
    }

    // Sends the invoice, or (when it is overdue / partly paid) a payment reminder with the invoice attached.
    [HttpPost("{id:int}/send")]
    public async Task<IActionResult> Send(int id, [FromBody] SendQuotationDto dto, [FromQuery] int tzOffset)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var i = await GetAccessibleAsync(id, tzOffset);
        if (i is null) return NotFound();
        if (i.Status != "ISSUED") return BadRequest(new { message = "Issue the invoice before sending it." });

        var customer = (await _customers.GetByIdAsync(User.CompanyId(), i.CustomerId))!;
        var profile = await _profile.GetAsync(User.CompanyId());
        var pdf = await BuildPdfAsync(i);
        var fileName = $"{i.InvoiceNo}.pdf";
        var name = customer.CustomerName ?? customer.WhatsappName ?? "Sir / Madam";
        var reminder = i.SentAt is not null && i.Balance > 0;
        var message = !string.IsNullOrWhiteSpace(dto.Message) ? dto.Message.Trim()
            : reminder
                ? $"Dear {name},\n\nThis is a friendly reminder that AED {i.Balance:N2} is {(i.DaysOverdue > 0 ? $"overdue by {i.DaysOverdue} days" : $"due on {i.DueDate:dd-MMM-yyyy}")} " +
                  $"on invoice {i.InvoiceNo}. The invoice is attached; bank details are on it.\n\nIf you have already paid, please share the payment reference.\n\nKind regards,\n{User.Identity?.Name}\n{profile.LegalName}"
                : $"Dear {name},\n\nPlease find attached our tax invoice {i.InvoiceNo} for AED {i.GrandTotal:N2} (including VAT), due on {i.DueDate:dd-MMM-yyyy}.\n\n" +
                  $"Kind regards,\n{User.Identity?.Name}\n{profile.LegalName}";

        (bool ok, string? error) result;
        if (dto.Channel == "EMAIL")
        {
            if (string.IsNullOrEmpty(customer.Email)) return BadRequest(new { message = "This contact has no email ID." });
            var settings = await _emailSettings.GetAsync(User.CompanyId());
            if (settings is null || settings.IsVerified != "T")
                return BadRequest(new { message = "Email is not connected. Ask your admin to set up Email Settings." });
            result = await _mailbox.SendAsync(settings, customer,
                $"{(reminder ? "Payment reminder – " : "")}Tax Invoice {i.InvoiceNo}{(profile.LegalName is null ? "" : $" – {profile.LegalName}")}",
                message, User.UserId(), new MailAttachment(pdf, fileName, "application/pdf"));
        }
        else
        {
            if (string.IsNullOrEmpty(customer.MobileNo)) return BadRequest(new { message = "This contact has no mobile number." });
            if (customer.LastInboundAt is null || DateTime.UtcNow - customer.LastInboundAt > TimeSpan.FromHours(24))
                return BadRequest(new { message = "WhatsApp only allows sending within 24 hours of the customer's last message. Send by email instead." });
            var settings = await _whatsAppSettings.GetAsync(User.CompanyId());
            if (settings is null || string.IsNullOrEmpty(settings.AccessToken) || string.IsNullOrEmpty(settings.PhoneNumberId))
                return BadRequest(new { message = "WhatsApp is not configured. Ask your admin to fill in WhatsApp Settings." });
            result = await _whatsApp.SendDocumentAsync(settings, customer, pdf, fileName, "application/pdf",
                message.Length > 1000 ? message[..1000] : message, User.UserId());
        }
        if (!result.ok) return BadRequest(new { message = $"Not sent: {result.error}" });

        await _repo.MarkSentAsync(User.CompanyId(), id);
        await _leads.LogActivityAsync(User.CompanyId(), i.LeadId, "INVOICE",
            $"{i.InvoiceNo} {(reminder ? "payment reminder" : "sent")} by {(dto.Channel == "EMAIL" ? "email" : "WhatsApp")}", User.UserId());
        return Ok(await _repo.GetByIdAsync(User.CompanyId(), id, Today(tzOffset)));
    }

    [HttpPost("{id:int}/payments")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> AddPayment(int id, [FromBody] SavePaymentDto dto, [FromQuery] int tzOffset)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var i = await GetAccessibleAsync(id, tzOffset);
        if (i is null) return NotFound();
        if (i.Status != "ISSUED") return BadRequest(new { message = "Payments are recorded on issued invoices." });
        if (Math.Round(dto.Amount, 2) > i.Balance) return BadRequest(new { message = $"The balance is AED {i.Balance:N2}; the payment cannot be more." });
        if (dto.PaymentDate.Date > Today(tzOffset)) return BadRequest(new { message = "The payment date is in the future." });
        dto.Reference = string.IsNullOrWhiteSpace(dto.Reference) ? null : dto.Reference.Trim();
        dto.Notes = string.IsNullOrWhiteSpace(dto.Notes) ? null : dto.Notes.Trim();
        await _repo.AddPaymentAsync(User.CompanyId(), id, dto, User.UserId());
        var updated = await _repo.GetByIdAsync(User.CompanyId(), id, Today(tzOffset));
        await _leads.LogActivityAsync(User.CompanyId(), i.LeadId, "INVOICE",
            $"Payment AED {dto.Amount:N2} received on {i.InvoiceNo}{(updated!.Balance <= 0 ? " — fully paid" : $" · balance AED {updated.Balance:N2}")}", User.UserId());
        return Ok(updated);
    }

    [HttpDelete("payments/{paymentId:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> DeletePayment(int paymentId, [FromQuery] int tzOffset)
    {
        var invoiceId = await _repo.DeletePaymentAsync(User.CompanyId(), paymentId);
        if (invoiceId is null) return NotFound();
        var i = await _repo.GetByIdAsync(User.CompanyId(), invoiceId.Value, Today(tzOffset));
        await _leads.LogActivityAsync(User.CompanyId(), i!.LeadId, "INVOICE", $"A payment on {i.InvoiceNo} was removed", User.UserId());
        return Ok(i);
    }

    private async Task<byte[]> BuildPdfAsync(InvoiceRow i)
    {
        var profile = await _profile.GetAsync(User.CompanyId());
        var (logo, _) = await _profile.GetLogoAsync(User.CompanyId());
        return QuotePdf.BuildInvoice(i, profile, logo);
    }
}
