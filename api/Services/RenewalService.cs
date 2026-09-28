using IStreamsCrm.Api.DTOs;
using IStreamsCrm.Api.Repositories;

namespace IStreamsCrm.Api.Services;

// Drafts the invoice for a subscription's next period. Used by the Renew button and by RenewalWorker.
public class RenewalService
{
    private readonly IInvoiceRepository _invoices;
    private readonly ICompanyProfileRepository _profile;
    private readonly ILeadRepository _leads;
    private readonly IFollowUpRepository _followUps;

    public RenewalService(IInvoiceRepository invoices, ICompanyProfileRepository profile, ILeadRepository leads, IFollowUpRepository followUps)
    {
        _invoices = invoices;
        _profile = profile;
        _leads = leads;
        _followUps = followUps;
    }

    private static string D(DateTime d) => d.ToString("dd-MMM-yy", DocumentPdf.En).ToUpperInvariant();

    // userId null = created automatically; then a follow-up is also scheduled for the lead's agent.
    public async Task<InvoiceRow> DraftRenewalAsync(int companyId, SubscriptionRow s, int? userId, DateTime today)
    {
        var (start, end) = Cycles.NextPeriod(s.EndDate, s.BillingCycle);
        var profile = await _profile.GetAsync(companyId);
        // Due by the start of the new period (or now, if that has already passed).
        var due = start > today ? start : today.AddDays(Math.Max(profile.InvoiceDueDays, 0));

        var inv = await _invoices.CreateAsync(companyId, s.LeadId, null, new SaveInvoiceDto
        {
            Stage = $"Renewal {D(start)} – {D(end)}",
            InvoiceDate = today,
            DueDate = due,
            Terms = profile.InvoiceTerms,
            Lines = new()
            {
                new SaveQuotationLineDto
                {
                    ProductId = s.ProductId,
                    Description = $"{s.Description}\nPeriod: {D(start)} to {D(end)}",
                    Unit = s.Unit,
                    Quantity = s.Quantity,
                    UnitPrice = s.UnitPrice,
                    DiscountPct = s.DiscountPct,
                    VatPct = s.VatPct
                }
            }
        }, userId, today, s.SubscriptionId, start, end);

        await _leads.LogActivityAsync(companyId, s.LeadId, "INVOICE",
            $"Renewal invoice drafted{(userId is null ? " automatically" : "")}: {s.Description} {D(start)} – {D(end)} · AED {inv!.GrandTotal:N2}", userId);

        if (userId is null)
        {
            // A call a week before expiry (or within the hour when it is closer than that).
            var callOn = s.EndDate.Date.AddDays(-7) > today ? s.EndDate.Date.AddDays(-7).AddHours(6) : DateTime.UtcNow.AddHours(1);
            await _followUps.CreateAsync(companyId, s.LeadId, s.LeadAssignedTo, new SaveFollowUpDto
            {
                FollowUpType = "CALL",
                DueAt = DateTime.SpecifyKind(callOn, DateTimeKind.Utc),
                Notes = $"Renewal: {s.Description} ends {D(s.EndDate)}. Draft invoice ready — review, issue and send it."
            }, null);
        }
        return inv;
    }
}

// Every few hours: for active auto-renew subscriptions inside their renewal window, draft the renewal invoice and
// schedule a follow-up. Nothing is sent to the customer automatically.
public class RenewalWorker : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<RenewalWorker> _logger;

    public RenewalWorker(IServiceScopeFactory scopes, ILogger<RenewalWorker> logger)
    {
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await RunOnceAsync(); }
            catch (Exception ex) { _logger.LogError(ex, "Renewal check failed"); }
            await Task.Delay(Interval, stoppingToken);
        }
    }

    public async Task<int> RunOnceAsync()
    {
        using var scope = _scopes.CreateScope();
        var subs = scope.ServiceProvider.GetRequiredService<ISubscriptionRepository>();
        var renewals = scope.ServiceProvider.GetRequiredService<RenewalService>();
        // UAE time (UTC+4) decides "today" for a background job with no user.
        var today = DateTime.UtcNow.AddHours(4).Date;
        var count = 0;
        foreach (var s in await subs.DueForAutoRenewalAsync(today))
        {
            await renewals.DraftRenewalAsync(s.CompanyId, s, null, today);
            count++;
        }
        if (count > 0) _logger.LogInformation("Drafted {Count} renewal invoices", count);
        return count;
    }
}
