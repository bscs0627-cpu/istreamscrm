using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using IStreamsCrm.Api.DTOs;
using IStreamsCrm.Api.Repositories;
using IStreamsCrm.Api.Services;

namespace IStreamsCrm.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class LeadsController : ControllerBase
{
    private readonly ILeadRepository _repo;
    private readonly ICustomerRepository _customers;
    private readonly IUserRepository _users;
    private readonly IFollowUpRepository _followUps;
    private readonly IAccountRepository _accounts;
    private readonly IProductRepository _products;
    private readonly IInvoiceRepository _invoices;

    public LeadsController(ILeadRepository repo, ICustomerRepository customers, IUserRepository users,
        IFollowUpRepository followUps, IAccountRepository accounts, IProductRepository products, IInvoiceRepository invoices)
    {
        _invoices = invoices;
        _repo = repo;
        _customers = customers;
        _users = users;
        _followUps = followUps;
        _accounts = accounts;
        _products = products;
    }

    // Staff only ever see leads assigned to them.
    private int? Scope => User.IsAdmin() ? null : User.UserId();

    private async Task<LeadRow?> GetAccessibleAsync(int id)
    {
        var l = await _repo.GetByIdAsync(User.CompanyId(), id);
        return l is not null && (User.IsAdmin() || l.AssignedTo == User.UserId()) ? l : null;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] LeadFilter filter)
        => Ok(await _repo.GetAllAsync(User.CompanyId(), Scope, filter));

    [HttpGet("counts")]
    public async Task<IActionResult> Counts()
        => Ok(await _repo.StatusCountsAsync(User.CompanyId(), Scope));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var lead = await GetAccessibleAsync(id);
        return lead is null ? NotFound() : Ok(lead);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SaveLeadDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        Clean(dto);

        var assignTo = User.IsAdmin() ? dto.AssignedTo : User.UserId();
        if (assignTo is not null && !await _users.IsActiveMemberAsync(User.CompanyId(), assignTo.Value))
            return BadRequest(new { message = "Choose an active staff member." });

        var (customer, error) = await ResolveCustomerAsync(dto);
        if (customer is null) return BadRequest(new { message = error });
        if (customer.AccountId is null && dto.AccountName is not null)
            await _customers.SetAccountAsync(customer.CustomerId, await _accounts.FindOrCreateAsync(User.CompanyId(), dto.AccountName));

        var lead = await _repo.CreateAsync(User.CompanyId(), customer.CustomerId, dto, User.UserId());
        if (assignTo is not null) await AssignBothAsync(lead!, assignTo);
        return Ok(await _repo.GetByIdAsync(User.CompanyId(), lead!.LeadId));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] SaveLeadDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        Clean(dto);
        if (await GetAccessibleAsync(id) is null) return NotFound();
        return Ok(await _repo.UpdateAsync(User.CompanyId(), id, dto));
    }

    [HttpPut("{id:int}/assign")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Assign(int id, [FromBody] AssignDto dto)
    {
        var lead = await _repo.GetByIdAsync(User.CompanyId(), id);
        if (lead is null) return NotFound();
        if (dto.UserId is not null && !await _users.IsActiveMemberAsync(User.CompanyId(), dto.UserId.Value))
            return BadRequest(new { message = "Choose an active staff member." });
        await AssignBothAsync(lead, dto.UserId);
        return Ok(await _repo.GetByIdAsync(User.CompanyId(), id));
    }

    [HttpPut("{id:int}/status")]
    public async Task<IActionResult> SetStatus(int id, [FromBody] SetLeadStatusDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        if (await GetAccessibleAsync(id) is null) return NotFound();
        if (dto.Status is "LOST" or "NOT_INTERESTED" && dto.LostReason is null)
            return BadRequest(new { message = "Choose a reason." });
        await _repo.SetStatusAsync(User.CompanyId(), id, dto, User.UserId());
        return Ok(await _repo.GetByIdAsync(User.CompanyId(), id));
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(int id)
    {
        // Issued tax invoices must be kept, so their lead stays too.
        if (await _invoices.IssuedCountForLeadsAsync(User.CompanyId(), "l.lead_id = @id", new { id }) > 0)
            return Conflict(new { message = "This lead has issued invoices, which must be kept. Mark the lead Lost instead." });
        return await _repo.DeleteAsync(User.CompanyId(), id) ? NoContent() : NotFound();
    }

    [HttpGet("{id:int}/timeline")]
    public async Task<IActionResult> Timeline(int id)
    {
        var lead = await GetAccessibleAsync(id);
        if (lead is null) return NotFound();
        return Ok(await _repo.TimelineAsync(User.CompanyId(), id, lead.CustomerId));
    }

    [HttpPost("{id:int}/activities")]
    public async Task<IActionResult> AddActivity(int id, [FromBody] AddActivityDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        if (await GetAccessibleAsync(id) is null) return NotFound();
        if (dto.ActivityType is "NOTE" && string.IsNullOrWhiteSpace(dto.Body))
            return BadRequest(new { message = "Write the note." });
        await _repo.AddActivityAsync(User.CompanyId(), id, dto, User.UserId());
        return NoContent();
    }

    [HttpGet("{id:int}/follow-ups")]
    public async Task<IActionResult> FollowUps(int id)
    {
        if (await GetAccessibleAsync(id) is null) return NotFound();
        return Ok(await _followUps.GetForLeadAsync(User.CompanyId(), id));
    }

    [HttpPost("{id:int}/follow-ups")]
    public async Task<IActionResult> AddFollowUp(int id, [FromBody] SaveFollowUpDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var lead = await GetAccessibleAsync(id);
        if (lead is null) return NotFound();
        return Ok(await _followUps.CreateAsync(User.CompanyId(), id, lead.AssignedTo ?? User.UserId(), dto, User.UserId()));
    }

    [HttpPut("bulk-assign")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> BulkAssign([FromBody] BulkAssignDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        if (await InactiveStaffAsync(dto.UserIds)) return BadRequest(new { message = "Choose active staff members." });

        var done = 0;
        foreach (var leadId in dto.LeadIds.Distinct())
        {
            var lead = await _repo.GetByIdAsync(User.CompanyId(), leadId);
            if (lead is null) continue;
            await AssignBothAsync(lead, dto.UserIds.Count == 0 ? null : dto.UserIds[done % dto.UserIds.Count]);
            done++;
        }
        return Ok(new { assigned = done });
    }

    // Excel / CSV import. DryRun=true only reports what would happen, so the admin can check before importing.
    [HttpPost("import")]
    [Authorize(Roles = Roles.Admin)]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public async Task<IActionResult> Import([FromBody] ImportLeadsDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        if (await InactiveStaffAsync(dto.AssignUserIds)) return BadRequest(new { message = "Choose active staff members." });

        var companyId = User.CompanyId();
        var catalog = (await _products.GetAllAsync(companyId, null, null, null, activeOnly: false)).ToList();
        var result = new ImportResult { DryRun = dto.DryRun };
        // Mobile / email already seen earlier in this file -> that row's contact (null during a dry run).
        var seen = new Dictionary<string, int?>();
        var turn = 0;

        for (var i = 0; i < dto.Rows.Count; i++)
        {
            var row = dto.Rows[i];
            var mobile = LeadImportParser.Mobile(row.MobileNo);
            var email = LeadImportParser.Email(row.Email);
            var r = new ImportRowResult
            {
                Row = i + 1, MobileNo = mobile, Email = email,
                CustomerName = LeadImportParser.Text(row.CustomerName, 150),
                AccountName = LeadImportParser.Text(row.AccountName, 200)
            };
            result.Rows.Add(r);

            if (mobile is null && email is null)
            {
                r.Outcome = "ERROR";
                r.Message = !string.IsNullOrWhiteSpace(row.MobileNo) ? $"Mobile \"{row.MobileNo.Trim()}\" is not valid."
                    : !string.IsNullOrWhiteSpace(row.Email) ? $"Email \"{row.Email.Trim()}\" is not valid."
                    : "No mobile number or email.";
                result.Errors++;
                continue;
            }

            var (lead, products) = ToLead(row, dto, catalog);
            r.Lead = lead;
            r.ProductNames = products.Count == 0 ? null : string.Join(", ", products.Select(p => p.ProductName));

            var existing = mobile is not null ? await _customers.GetByMobileAsync(companyId, mobile) : null;
            if (existing is null && email is not null) existing = await _customers.GetByEmailAsync(companyId, email);
            var inFile = (mobile is not null && seen.ContainsKey("m" + mobile)) || (email is not null && seen.ContainsKey("e" + email));
            int? customerId = existing?.CustomerId
                ?? (inFile ? (mobile is not null && seen.TryGetValue("m" + mobile, out var a) ? a : seen.GetValueOrDefault("e" + email)) : null);

            if (dto.SkipOpenDuplicates && (inFile || (existing is not null && await _repo.HasOpenLeadAsync(companyId, existing.CustomerId))))
            {
                r.Outcome = "DUPLICATE";
                r.Message = inFile ? "Repeated in this file." : "Contact already has an open lead.";
                result.Duplicates++;
                continue;
            }

            r.Outcome = existing is not null || inFile ? "EXISTING" : "NEW";
            if (r.Outcome == "NEW") result.NewCustomers++; else result.ExistingCustomers++;
            r.AssignTo = dto.AssignUserIds.Count == 0 ? null : dto.AssignUserIds[turn++ % dto.AssignUserIds.Count];

            if (!dto.DryRun)
            {
                int? accountId = r.AccountName is null ? null : await _accounts.FindOrCreateAsync(companyId, r.AccountName);
                if (customerId is null)
                {
                    var (created, error) = await _customers.CreateAsync(companyId,
                        new SaveCustomerDto { MobileNo = mobile, CustomerName = r.CustomerName, Email = email, AccountId = accountId });
                    if (created is null)
                    {
                        r.Outcome = "ERROR"; r.Message = error; result.Errors++;
                        continue;
                    }
                    customerId = created.CustomerId;
                }
                else if (accountId is not null && existing is not null && existing.AccountId is null)
                    await _customers.SetAccountAsync(customerId.Value, accountId.Value);

                var saved = await _repo.CreateAsync(companyId, customerId.Value, lead, User.UserId());
                if (r.AssignTo is not null) await AssignBothAsync(saved!, r.AssignTo);
                r.LeadId = saved!.LeadId;
                result.LeadsCreated++;
            }

            if (mobile is not null) seen["m" + mobile] = customerId;
            if (email is not null) seen["e" + email] = customerId;
        }
        return Ok(result);
    }

    // "ERP, HRMS" / "ERP-LIC; CRM Cloud" -> products whose code or name matches each part.
    private static (SaveLeadDto Lead, List<ProductRow> Products) ToLead(ImportRowDto row, ImportLeadsDto dto, List<ProductRow> catalog)
    {
        var products = new List<ProductRow>();
        foreach (var part in (row.Products ?? "").Split(new[] { ',', ';', '/', '|', '+' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var match = catalog.FirstOrDefault(p => p.ProductCode.Equals(part, StringComparison.OrdinalIgnoreCase))
                ?? catalog.FirstOrDefault(p => p.ProductName.Equals(part, StringComparison.OrdinalIgnoreCase))
                ?? catalog.FirstOrDefault(p => p.ProductName.Contains(part, StringComparison.OrdinalIgnoreCase) || part.Contains(p.ProductName, StringComparison.OrdinalIgnoreCase))
                ?? catalog.FirstOrDefault(p => p.Category.Equals(part, StringComparison.OrdinalIgnoreCase));
            if (match is not null && !products.Contains(match)) products.Add(match);
        }
        var unmatched = products.Count == 0 && !string.IsNullOrWhiteSpace(row.Products) ? $"Interested in: {row.Products.Trim()}" : null;
        var notes = string.Join("\n", new[] { unmatched, LeadImportParser.Text(row.Requirements, 1800) }.Where(s => s is not null));

        return (new SaveLeadDto
        {
            Source = LeadImportParser.Source(row.Source) ?? dto.DefaultSource,
            ProductIds = products.Select(p => p.ProductId).ToList(),
            UsersCount = LeadImportParser.Count(row.UsersCount),
            Budget = LeadImportParser.Amount(row.Budget),
            CurrentSystem = LeadImportParser.Text(row.CurrentSystem, 150),
            Priority = LeadImportParser.Priority(row.Priority) ?? "WARM",
            Requirements = notes.Length == 0 ? null : notes
        }, products);
    }

    private async Task<bool> InactiveStaffAsync(IEnumerable<int> userIds)
    {
        foreach (var id in userIds.Distinct())
            if (!await _users.IsActiveMemberAsync(User.CompanyId(), id)) return true;
        return false;
    }

    private static void Clean(SaveLeadDto dto)
    {
        static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
        dto.CustomerName = Blank(dto.CustomerName);
        dto.MobileNo = Blank(dto.MobileNo);
        dto.Email = Blank(dto.Email);
        dto.AccountName = Blank(dto.AccountName);
        dto.Title = Blank(dto.Title);
        dto.CurrentSystem = Blank(dto.CurrentSystem);
        dto.DecisionMaker = Blank(dto.DecisionMaker);
        dto.Requirements = Blank(dto.Requirements);
    }

    // An existing contact, or the one already holding this mobile / email, or a new contact.
    private async Task<(CustomerRow?, string?)> ResolveCustomerAsync(SaveLeadDto dto)
    {
        var companyId = User.CompanyId();
        CustomerRow? customer = null;
        if (dto.CustomerId is not null)
        {
            customer = await _customers.GetByIdAsync(companyId, dto.CustomerId.Value);
            if (customer is null) return (null, "Contact not found.");
        }
        else
        {
            if (dto.MobileNo is null && dto.Email is null) return (null, "Choose a contact or enter a mobile number / email ID.");
            if (dto.MobileNo is not null) customer = await _customers.GetByMobileAsync(companyId, dto.MobileNo);
            if (customer is null && dto.Email is not null) customer = await _customers.GetByEmailAsync(companyId, dto.Email);
            if (customer is null)
            {
                int? accountId = dto.AccountName is null ? null : await _accounts.FindOrCreateAsync(companyId, dto.AccountName);
                var (row, error) = await _customers.CreateAsync(companyId,
                    new SaveCustomerDto { MobileNo = dto.MobileNo, CustomerName = dto.CustomerName, Email = dto.Email, AccountId = accountId });
                return (row, error);
            }
        }

        if (!User.IsAdmin() && customer.AssignedTo is not null && customer.AssignedTo != User.UserId())
            return (null, "This contact belongs to another staff member. Ask an admin to create the lead.");
        return (customer, null);
    }

    // The lead's agent also gets the contact, so they can chat and email. The latest lead assignment wins.
    private async Task AssignBothAsync(LeadRow lead, int? toUserId)
    {
        await _repo.AssignAsync(User.CompanyId(), lead.LeadId, toUserId, User.UserId());
        if (toUserId is not null) await _customers.AssignAsync(User.CompanyId(), lead.CustomerId, toUserId, User.UserId());
    }
}
