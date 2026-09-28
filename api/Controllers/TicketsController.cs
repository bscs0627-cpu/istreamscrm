using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using IStreamsCrm.Api.DTOs;
using IStreamsCrm.Api.Repositories;
using IStreamsCrm.Api.Services;

namespace IStreamsCrm.Api.Controllers;

// Support tickets and change requests. Staff work on tickets assigned to them and can pick up unassigned ones;
// admins see and assign everything.
[ApiController]
[Route("api/[controller]")]
public class TicketsController : ControllerBase
{
    private readonly ITicketRepository _repo;
    private readonly ICustomerRepository _customers;
    private readonly IUserRepository _users;
    private readonly IProductRepository _products;
    private readonly ILeadRepository _leads;
    private readonly IQuotationRepository _quotes;
    private readonly ICompanyProfileRepository _profile;
    private readonly IEmailSettingsRepository _emailSettings;
    private readonly ISettingsRepository _whatsAppSettings;
    private readonly IMailboxService _mailbox;
    private readonly IWhatsAppService _whatsApp;

    public TicketsController(ITicketRepository repo, ICustomerRepository customers, IUserRepository users, IProductRepository products,
        ILeadRepository leads, IQuotationRepository quotes, ICompanyProfileRepository profile, IEmailSettingsRepository emailSettings,
        ISettingsRepository whatsAppSettings, IMailboxService mailbox, IWhatsAppService whatsApp)
    {
        _repo = repo;
        _customers = customers;
        _users = users;
        _products = products;
        _leads = leads;
        _quotes = quotes;
        _profile = profile;
        _emailSettings = emailSettings;
        _whatsAppSettings = whatsAppSettings;
        _mailbox = mailbox;
        _whatsApp = whatsApp;
    }

    private int? Scope => User.IsAdmin() ? null : User.UserId();

    private async Task<TicketRow?> GetAccessibleAsync(int id)
    {
        var t = await _repo.GetByIdAsync(User.CompanyId(), id);
        return t is not null && (User.IsAdmin() || t.AssignedTo is null || t.AssignedTo == User.UserId()) ? t : null;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] TicketFilter filter)
        => Ok(await _repo.GetAllAsync(User.CompanyId(), Scope, User.UserId(), filter));

    [HttpGet("summary")]
    public async Task<IActionResult> Summary() => Ok(await _repo.SummaryAsync(User.CompanyId(), Scope, User.UserId()));

    // Default hourly rate for change requests: the first active customization product priced per hour.
    [HttpGet("rate")]
    public async Task<IActionResult> Rate()
    {
        var p = (await _products.GetAllAsync(User.CompanyId(), null, null, "CUSTOMIZATION", true)).FirstOrDefault(p => p.Unit == "PER_HOUR");
        return Ok(new { productId = p?.ProductId, productName = p?.ProductName, rate = p?.Price });
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var t = await GetAccessibleAsync(id);
        return t is null ? NotFound() : Ok(t);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SaveTicketDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        if (await _customers.GetByIdAsync(User.CompanyId(), dto.CustomerId) is null) return BadRequest(new { message = "Choose the contact who raised the ticket." });
        if (!User.IsAdmin())
        {
            if (dto.AssignedTo is not null && dto.AssignedTo != User.UserId()) return BadRequest(new { message = "Only an admin can assign a ticket to someone else." });
            dto.AssignedTo = User.UserId();
        }
        if (await CheckAsync(dto) is { } invalid) return BadRequest(new { message = invalid });
        return Ok(await _repo.CreateAsync(User.CompanyId(), dto, User.UserId()));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] SaveTicketDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var t = await GetAccessibleAsync(id);
        if (t is null) return NotFound();
        dto.AssignedTo = t.AssignedTo;
        if (await CheckAsync(dto) is { } invalid) return BadRequest(new { message = invalid });
        return Ok(await _repo.UpdateAsync(User.CompanyId(), id, dto));
    }

    [HttpPost("{id:int}/status")]
    public async Task<IActionResult> SetStatus(int id, [FromBody] TicketStatusDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var t = await GetAccessibleAsync(id);
        if (t is null) return NotFound();
        var allowed = t.TicketType == "CHANGE" ? TicketCodes.ChangeStatuses : TicketCodes.SupportStatuses;
        if (!allowed.Contains(dto.Status)) return BadRequest(new { message = "That status is not used for this kind of ticket." });
        if (dto.Status == t.Status) return Ok(t);
        await _repo.SetStatusAsync(id, t.Status, dto.Status, dto.Note, User.UserId());
        return Ok(await _repo.GetByIdAsync(User.CompanyId(), id));
    }

    // Admins assign anyone; staff can take an unassigned ticket or hand back their own.
    [HttpPost("{id:int}/assign")]
    public async Task<IActionResult> Assign(int id, [FromBody] TicketAssignDto dto)
    {
        var t = await GetAccessibleAsync(id);
        if (t is null) return NotFound();
        if (!User.IsAdmin() && dto.UserId is not null && dto.UserId != User.UserId()) return Forbid();
        if (dto.UserId == t.AssignedTo) return Ok(t);
        string text;
        if (dto.UserId is null) text = "Unassigned";
        else
        {
            var user = await _users.GetByIdAsync(User.CompanyId(), dto.UserId.Value);
            if (user is null || user.IsActive != "T") return BadRequest(new { message = "That staff member is not active." });
            text = $"Assigned to {user.FullName}";
        }
        await _repo.AssignAsync(id, dto.UserId, text, User.UserId());
        return Ok(await _repo.GetByIdAsync(User.CompanyId(), id));
    }

    // A reply is sent to the customer by email or WhatsApp and kept on the ticket; notes stay internal.
    [HttpPost("{id:int}/comments")]
    public async Task<IActionResult> AddComment(int id, [FromBody] TicketCommentDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var t = await GetAccessibleAsync(id);
        if (t is null) return NotFound();
        var body = dto.Body.Trim();
        if (body.Length == 0) return BadRequest(new { message = "Write something first." });

        if (dto.Kind == "REPLY")
        {
            if (dto.Channel is null) return BadRequest(new { message = "Choose email or WhatsApp for the reply." });
            var customer = (await _customers.GetByIdAsync(User.CompanyId(), t.CustomerId))!;
            (bool ok, string? error) result;
            if (dto.Channel == "EMAIL")
            {
                if (string.IsNullOrEmpty(customer.Email)) return BadRequest(new { message = "This contact has no email ID." });
                var settings = await _emailSettings.GetAsync(User.CompanyId());
                if (settings is null || settings.IsVerified != "T") return BadRequest(new { message = "Email is not connected. Ask your admin to set up Email Settings." });
                result = await _mailbox.SendAsync(settings, customer, $"[{t.TicketNo}] {t.Subject}", body, User.UserId());
            }
            else
            {
                if (string.IsNullOrEmpty(customer.MobileNo)) return BadRequest(new { message = "This contact has no mobile number." });
                if (customer.LastInboundAt is null || DateTime.UtcNow - customer.LastInboundAt > TimeSpan.FromHours(24))
                    return BadRequest(new { message = "WhatsApp only allows sending within 24 hours of the customer's last message. Reply by email instead." });
                var settings = await _whatsAppSettings.GetAsync(User.CompanyId());
                if (settings is null || string.IsNullOrEmpty(settings.AccessToken) || string.IsNullOrEmpty(settings.PhoneNumberId))
                    return BadRequest(new { message = "WhatsApp is not configured. Ask your admin to fill in WhatsApp Settings." });
                result = await _whatsApp.SendFromStaffAsync(settings, customer, $"{t.TicketNo}: {body}", User.UserId());
            }
            if (!result.ok) return BadRequest(new { message = $"Not sent: {result.error}" });
        }
        await _repo.AddCommentAsync(id, dto.Kind, dto.Kind == "REPLY" ? dto.Channel : null, body, User.UserId());
        return Ok(await _repo.GetByIdAsync(User.CompanyId(), id));
    }

    [HttpPut("{id:int}/estimate")]
    public async Task<IActionResult> Estimate(int id, [FromBody] TicketEstimateDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var t = await GetAccessibleAsync(id);
        if (t is null) return NotFound();
        if (t.TicketType != "CHANGE") return BadRequest(new { message = "Only change requests are estimated." });
        if (TicketCodes.Done.Contains(t.Status)) return BadRequest(new { message = "This change request is already finished." });
        await _repo.SetEstimateAsync(id, dto.EstimatedHours, dto.HourlyRate, User.UserId());
        return Ok(await _repo.GetByIdAsync(User.CompanyId(), id));
    }

    // Quotes the estimate: a new lead (existing customer) for the contact, assigned to whoever creates it, with a
    // draft quotation for the hours. Accepting that quotation approves the change request.
    [HttpPost("{id:int}/quotation")]
    public async Task<IActionResult> CreateQuotation(int id, [FromQuery] int tzOffset = 0)
    {
        var t = await GetAccessibleAsync(id);
        if (t is null) return NotFound();
        if (t.TicketType != "CHANGE") return BadRequest(new { message = "Quotations are made for change requests." });
        if (t.EstimatedHours is null || t.HourlyRate is null) return BadRequest(new { message = "Estimate the hours first." });
        if (t.QuotationId is not null && t.QuoteNo is not null) return Conflict(new { message = $"{t.QuoteNo} was already made for this change request.", quotationId = t.QuoteLatestId });

        var companyId = User.CompanyId();
        var title = Cut($"Change request {t.TicketNo}: {t.Subject}", 200);
        var lead = await _leads.CreateAsync(companyId, t.CustomerId, new SaveLeadDto
        {
            Title = title,
            Source = "EXISTING_CUSTOMER",
            ProductIds = t.ProductId is null ? new() : new() { t.ProductId.Value },
            Requirements = t.Description is null ? null : Cut(t.Description, 2000),
            ExpectedValue = t.EstimateAmount,
            Priority = t.Priority is "URGENT" or "HIGH" ? "HOT" : "WARM"
        }, User.UserId());
        await _leads.AssignAsync(companyId, lead!.LeadId, User.UserId(), User.UserId());
        var customer = await _customers.GetByIdAsync(companyId, t.CustomerId);
        if (customer!.AssignedTo is null) await _customers.AssignAsync(companyId, t.CustomerId, User.UserId(), User.UserId());

        var profile = await _profile.GetAsync(companyId);
        var rateProduct = (await _products.GetAllAsync(companyId, null, null, "CUSTOMIZATION", true)).FirstOrDefault(p => p.Unit == "PER_HOUR");
        var today = DateTime.UtcNow.AddMinutes(-Math.Clamp(tzOffset, -840, 840)).Date;
        var q = await _quotes.CreateAsync(companyId, new SaveQuotationDto
        {
            LeadId = lead.LeadId,
            Subject = title,
            QuoteDate = today,
            ValidUntil = today.AddDays(profile.QuoteValidityDays),
            PaymentTerms = profile.QuotePaymentTerms,
            Terms = profile.QuoteTerms,
            Lines = new()
            {
                new SaveQuotationLineDto
                {
                    ProductId = rateProduct?.ProductId,
                    Description = $"{t.Subject}\nChange request {t.TicketNo}" + (t.ProductName is null ? "" : $" – {t.ProductName}"),
                    Unit = "PER_HOUR",
                    Quantity = t.EstimatedHours.Value,
                    UnitPrice = t.HourlyRate.Value,
                    VatPct = rateProduct?.VatPct ?? 5
                }
            }
        }, "NONE", User.UserId());
        await _repo.LinkQuotationAsync(id, lead.LeadId, q!.QuotationId);
        await _repo.AddCommentAsync(id, "STATUS", null, $"{q.QuoteNo} drafted for the estimate", User.UserId());
        await _leads.LogActivityAsync(companyId, lead.LeadId, "QUOTE", $"{q.QuoteNo} drafted from change request {t.TicketNo}", User.UserId());
        return Ok(await _repo.GetByIdAsync(companyId, id));
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(int id)
        => await _repo.DeleteAsync(User.CompanyId(), id) ? NoContent() : NotFound();

    private static string Cut(string s, int max) => s.Length > max ? s[..max] : s;

    private async Task<string?> CheckAsync(SaveTicketDto dto)
    {
        dto.Subject = dto.Subject.Trim();
        dto.Description = string.IsNullOrWhiteSpace(dto.Description) ? null : dto.Description.Trim();
        if (dto.Subject.Length == 0) return "Enter a subject.";
        if (dto.ProductId is not null && await _products.GetByIdAsync(User.CompanyId(), dto.ProductId.Value) is null) return "Product not found.";
        if (dto.AssignedTo is not null && !await _users.IsActiveMemberAsync(User.CompanyId(), dto.AssignedTo.Value)) return "That staff member is not active.";
        return null;
    }
}
