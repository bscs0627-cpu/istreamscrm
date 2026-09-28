using System.Net.Http.Headers;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using IStreamsCrm.Api.DTOs;
using IStreamsCrm.Api.Repositories;

namespace IStreamsCrm.Api.Services;

public interface IWhatsAppService
{
    Task<(bool Ok, string? VerifiedName, string? Error)> VerifyAsync(WhatsAppSettings settings);
    bool IsValidSignature(WhatsAppSettings settings, string body, string? signatureHeader);
    Task HandleWebhookAsync(WhatsAppSettings settings, string body);
    Task<(bool Ok, string? Error)> SendFromStaffAsync(WhatsAppSettings settings, CustomerRow customer, string text, int staffId);
}

public class WhatsAppService : IWhatsAppService
{
    private static readonly string[] Greetings = { "hi", "hii", "hello", "hey", "hai" };

    private readonly HttpClient _http;
    private readonly ICustomerRepository _customers;
    private readonly IInboxRepository _inbox;
    private readonly ILeadRepository _leads;
    private readonly IAccountRepository _accounts;
    private readonly IProductRepository _products;
    private readonly ILogger<WhatsAppService> _logger;
    private readonly string _graphBase;

    public WhatsAppService(HttpClient http, ICustomerRepository customers, IInboxRepository inbox, ILeadRepository leads,
        IAccountRepository accounts, IProductRepository products, IConfiguration config, ILogger<WhatsAppService> logger)
    {
        _http = http;
        _customers = customers;
        _inbox = inbox;
        _leads = leads;
        _accounts = accounts;
        _products = products;
        _logger = logger;
        _graphBase = $"https://graph.facebook.com/{config["WhatsApp:GraphVersion"] ?? "v23.0"}";
    }

    public async Task<(bool, string?, string?)> VerifyAsync(WhatsAppSettings s)
    {
        if (string.IsNullOrWhiteSpace(s.PhoneNumberId) || string.IsNullOrWhiteSpace(s.AccessToken))
            return (false, null, "Phone Number ID and Access Token are required.");

        using var req = new HttpRequestMessage(HttpMethod.Get,
            $"{_graphBase}/{Uri.EscapeDataString(s.PhoneNumberId)}?fields=display_phone_number,verified_name");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", s.AccessToken);

        using var res = await _http.SendAsync(req);
        var root = Parse(await res.Content.ReadAsStringAsync());
        if (!res.IsSuccessStatusCode) return (false, null, ErrorMessage(root) ?? res.ReasonPhrase);

        var name = root.TryGetProperty("verified_name", out var vn) ? vn.GetString() : null;
        var number = root.TryGetProperty("display_phone_number", out var dn) ? dn.GetString() : null;
        return (true, string.Join(" · ", new[] { name, number }.Where(x => !string.IsNullOrEmpty(x))), null);
    }

    public bool IsValidSignature(WhatsAppSettings s, string body, string? signatureHeader)
    {
        if (string.IsNullOrEmpty(s.AppSecret)) return true;
        if (string.IsNullOrEmpty(signatureHeader) || !signatureHeader.StartsWith("sha256=")) return false;

        var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(s.AppSecret), Encoding.UTF8.GetBytes(body));
        byte[] given;
        try { given = Convert.FromHexString(signatureHeader["sha256=".Length..]); }
        catch (FormatException) { return false; }
        return CryptographicOperations.FixedTimeEquals(expected, given);
    }

    public async Task HandleWebhookAsync(WhatsAppSettings settings, string body)
    {
        using var doc = JsonDocument.Parse(body);
        if (!doc.RootElement.TryGetProperty("entry", out var entries)) return;

        foreach (var entry in entries.EnumerateArray())
        foreach (var change in entry.GetProperty("changes").EnumerateArray())
        {
            var value = change.GetProperty("value");

            // Only handle events for this company's number.
            if (value.TryGetProperty("metadata", out var meta)
                && meta.TryGetProperty("phone_number_id", out var pid)
                && pid.GetString() != settings.PhoneNumberId) continue;

            if (value.TryGetProperty("statuses", out var statuses))
                foreach (var st in statuses.EnumerateArray())
                    await HandleStatusAsync(settings.CompanyId, st);

            if (!value.TryGetProperty("messages", out var messages)) continue;

            string? profileName = null;
            if (value.TryGetProperty("contacts", out var contacts) && contacts.GetArrayLength() > 0
                && contacts[0].TryGetProperty("profile", out var profile)
                && profile.TryGetProperty("name", out var pn))
                profileName = pn.GetString();

            foreach (var msg in messages.EnumerateArray())
            {
                var from = msg.GetProperty("from").GetString()!;
                var id = msg.GetProperty("id").GetString()!;
                var type = msg.GetProperty("type").GetString() ?? "unknown";
                var text = type == "text"
                    ? msg.GetProperty("text").GetProperty("body").GetString()?.Trim() ?? ""
                    : "";
                await HandleMessageAsync(settings, from, profileName, id, type, text);
            }
        }
    }

    private async Task HandleStatusAsync(int companyId, JsonElement st)
    {
        var id = st.GetProperty("id").GetString();
        var status = st.GetProperty("status").GetString();
        if (id is null || status is null) return;

        string? error = null;
        if (st.TryGetProperty("errors", out var errors) && errors.GetArrayLength() > 0)
        {
            var e = errors[0];
            error = e.TryGetProperty("message", out var m) ? m.GetString()
                  : e.TryGetProperty("title", out var t) ? t.GetString() : null;
        }
        await _inbox.UpdateStatusAsync(companyId, id, status, error);
    }

    private async Task HandleMessageAsync(WhatsAppSettings s, string from, string? profileName, string messageId, string type, string text)
    {
        var customer = await _customers.GetByMobileAsync(s.CompanyId, from);
        var isNew = customer is null;
        customer ??= await _customers.StartChatAsync(s.CompanyId, from, profileName);

        // Meta retries webhooks, so a message already stored is ignored.
        if (!await _inbox.AddInboundAsync(s.CompanyId, customer.CustomerId, messageId, type, type == "text" ? text : null)) return;

        if (isNew)
        {
            await BotReplyAsync(s, customer, "Welcome! 👋 Please share your *name*.");
            return;
        }

        switch (customer.ChatState)
        {
            case "ASK_NAME":
                if (text.Length == 0)
                {
                    await BotReplyAsync(s, customer, "Please type your *name*.");
                    return;
                }
                var name = text.Length > 150 ? text[..150] : text;
                await _customers.UpdateChatAsync(customer.CustomerId, "ASK_EMAIL", name, customer.Email);
                await BotReplyAsync(s, customer, $"Thanks {name}! Please share your *email ID*.");
                return;

            case "ASK_EMAIL":
                var valid = IsEmail(text);
                await _customers.UpdateChatAsync(customer.CustomerId, valid ? "ASK_COMPANY" : "ASK_EMAIL",
                    customer.CustomerName, valid ? text : customer.Email);
                await BotReplyAsync(s, customer, valid
                    ? $"Thank you {customer.CustomerName}! Which *company* are you from? (or reply *skip*)"
                    : "That doesn't look like a valid email ID. Please try again (e.g. name@example.com).");
                return;

            // The next questions build a lead (unassigned) for the admin to hand to an agent.
            case "ASK_COMPANY":
                if (text.Length == 0)
                {
                    await BotReplyAsync(s, customer, "Please type your *company name* (or *skip*).");
                    return;
                }
                if (text.Trim().ToLowerInvariant() is not ("skip" or "no" or "none" or "individual"))
                    await _customers.SetAccountAsync(customer.CustomerId, await _accounts.FindOrCreateAsync(s.CompanyId, text));
                await AskSolutionAsync(s, customer, null);
                return;

            case "ASK_PRODUCT":
                var solutions = await SolutionsAsync(s.CompanyId);
                var pick = int.TryParse(text.Trim(), out var n) && n >= 1 && n <= solutions.Count ? solutions[n - 1]
                    : solutions.FirstOrDefault(c => c.Category.Equals(text.Trim(), StringComparison.OrdinalIgnoreCase)
                        || c.Category.Contains(text.Trim(), StringComparison.OrdinalIgnoreCase) && text.Trim().Length >= 2);
                // Any other text (or "Something else") still becomes a lead, with their words kept as the requirement.
                if (pick is null && text.Length == 0)
                {
                    await BotReplyAsync(s, customer, "Please reply with the *number* of the solution you want.");
                    return;
                }
                var lead = await _leads.CreateAsync(s.CompanyId, customer.CustomerId, new SaveLeadDto
                {
                    Source = "WHATSAPP",
                    Priority = "WARM",
                    Title = pick is null ? "WhatsApp enquiry" : $"{pick.Category} enquiry",
                    ProductIds = pick is null ? new() : new() { pick.ProductId },
                    Requirements = pick is null && !int.TryParse(text.Trim(), out _) ? $"Interested in (WhatsApp): {LeadImportParser.Text(text, 200)}" : null
                }, null);
                await _customers.SetBotLeadAsync(customer.CustomerId, "ASK_USERS", lead!.LeadId);
                await BotReplyAsync(s, customer, "How many *users* will use the system? (e.g. 10)");
                return;

            case "ASK_USERS":
                if (customer.BotLeadId is not null)
                {
                    var users = LeadImportParser.Count(text);
                    await _leads.UpdateFromBotAsync(customer.BotLeadId.Value, null, users,
                        users is null && text.Length > 0 ? $"Users (WhatsApp): {LeadImportParser.Text(text, 200)}" : null);
                }
                await _customers.SetBotLeadAsync(customer.CustomerId, "DONE", null);
                await BotReplyAsync(s, customer,
                    $"Thank you {customer.CustomerName}! ✅ Our consultant will contact you shortly to understand your needs and arrange a demo.");
                return;

            default:
                // Once a staff member owns the chat, the bot stays quiet.
                if (customer.AssignedTo is not null || !Greetings.Contains(text.ToLowerInvariant().TrimEnd('!', '.', ' '))) return;
                if (await _leads.HasOpenLeadAsync(s.CompanyId, customer.CustomerId))
                {
                    await BotReplyAsync(s, customer, $"Hi {customer.CustomerName}! 👋 We already have your details. Our team will get back to you soon.");
                    return;
                }
                await AskSolutionAsync(s, customer, $"Hi {customer.CustomerName}! 👋 ");
                return;
        }
    }

    // One entry per product category (ERP, HRMS...), pointing at its main product: licenses / subscriptions first.
    private async Task<List<ProductRow>> SolutionsAsync(int companyId)
    {
        var order = new[] { "LICENSE", "SUBSCRIPTION" };
        return (await _products.GetAllAsync(companyId, null, null, null, activeOnly: true))
            .GroupBy(p => p.Category)
            .Select(g => g.OrderBy(p => Array.IndexOf(order, p.ItemType) is var i && i < 0 ? 9 : i).ThenBy(p => p.ProductId).First())
            .OrderBy(p => p.Category)
            .Take(9)
            .ToList();
    }

    // Without any products set up the bot skips the question and just asks for the number of users.
    private async Task AskSolutionAsync(WhatsAppSettings s, CustomerRow customer, string? greeting)
    {
        var solutions = await SolutionsAsync(s.CompanyId);
        if (solutions.Count == 0)
        {
            var lead = await _leads.CreateAsync(s.CompanyId, customer.CustomerId,
                new SaveLeadDto { Source = "WHATSAPP", Priority = "WARM", Title = "WhatsApp enquiry" }, null);
            await _customers.SetBotLeadAsync(customer.CustomerId, "ASK_USERS", lead!.LeadId);
            await BotReplyAsync(s, customer, $"{greeting}How many *users* will use the system? (e.g. 10)");
            return;
        }
        var list = string.Join("\n", solutions.Select((p, i) => $"*{i + 1}.* {p.Category}")) + $"\n*{solutions.Count + 1}.* Something else";
        await _customers.SetBotLeadAsync(customer.CustomerId, "ASK_PRODUCT", null);
        await BotReplyAsync(s, customer, $"{greeting}Which solution are you interested in? Reply with the number:\n{list}");
    }

    public async Task<(bool, string?)> SendFromStaffAsync(WhatsAppSettings s, CustomerRow customer, string text, int staffId)
    {
        var (ok, waId, error) = await SendTextAsync(s, customer.MobileNo!, text);
        await _inbox.AddOutboundAsync(s.CompanyId, customer.CustomerId, waId, text, ok, error, staffId, isBot: false);
        return (ok, error);
    }

    private async Task BotReplyAsync(WhatsAppSettings s, CustomerRow customer, string text)
    {
        var (ok, waId, error) = await SendTextAsync(s, customer.MobileNo!, text);
        await _inbox.AddOutboundAsync(s.CompanyId, customer.CustomerId, waId, text, ok, error, null, isBot: true);
    }

    private static bool IsEmail(string text)
    {
        if (text.Length > 150 || text.Contains(' ')) return false;
        try { return new MailAddress(text).Address == text && text.Contains('.'); }
        catch (FormatException) { return false; }
    }

    private static JsonElement Parse(string json)
    {
        try { return JsonDocument.Parse(json).RootElement; }
        catch (JsonException) { return default; }
    }

    private static string? ErrorMessage(JsonElement root) =>
        root.ValueKind == JsonValueKind.Object && root.TryGetProperty("error", out var err)
        && err.TryGetProperty("message", out var m) ? m.GetString() : null;

    private Task<(bool Ok, string? WaMessageId, string? Error)> SendTextAsync(WhatsAppSettings s, string to, string body)
        => SendAsync(s, to, new { type = "text", text = new { body } });

    private async Task<(bool Ok, string? WaMessageId, string? Error)> SendAsync(WhatsAppSettings s, string to, object message)
    {
        var payload = JsonSerializer.SerializeToNode(message)!.AsObject();
        payload["messaging_product"] = "whatsapp";
        payload["to"] = to;
        using var req = new HttpRequestMessage(HttpMethod.Post, $"{_graphBase}/{Uri.EscapeDataString(s.PhoneNumberId!)}/messages")
        {
            Content = JsonContent.Create(payload)
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", s.AccessToken);

        using var res = await _http.SendAsync(req);
        var json = await res.Content.ReadAsStringAsync();
        var root = Parse(json);

        if (!res.IsSuccessStatusCode)
        {
            _logger.LogError("WhatsApp send to {To} failed: {Status} {Body}", to, (int)res.StatusCode, json);
            return (false, null, ErrorMessage(root) ?? res.ReasonPhrase);
        }

        var waId = root.ValueKind == JsonValueKind.Object && root.TryGetProperty("messages", out var msgs) && msgs.GetArrayLength() > 0
            ? msgs[0].GetProperty("id").GetString() : null;
        return (true, waId, null);
    }
}
