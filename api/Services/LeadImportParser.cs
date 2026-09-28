using System.Globalization;
using System.Net.Mail;
using System.Text.RegularExpressions;

namespace IStreamsCrm.Api.Services;

// Turns free-text spreadsheet cells ("05x...", "2 BR", "1.5M", "Property Finder") into CRM codes.
public static class LeadImportParser
{
    // UAE numbers: 050 123 4567 / 0501234567 / 501234567 / +971 50... / 00971 50... all become 971501234567.
    public static string? Mobile(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var d = Regex.Replace(raw, @"\D", "");
        if (d.StartsWith("00")) d = d[2..];
        if (d.Length == 10 && d.StartsWith("05")) d = "971" + d[1..];
        else if (d.Length == 9 && d.StartsWith("5")) d = "971" + d;
        else if (d.StartsWith("9710")) d = "971" + d[4..];
        return d.Length is >= 8 and <= 15 ? d : null;
    }

    public static string? Email(string? raw)
    {
        var s = raw?.Trim();
        if (string.IsNullOrEmpty(s) || s.Length > 150 || s.Contains(' ')) return null;
        try { return new MailAddress(s).Address == s ? s.ToLowerInvariant() : null; }
        catch (FormatException) { return null; }
    }

    private static string Key(string? s) => Regex.Replace((s ?? "").ToLowerInvariant(), @"[^a-z0-9]", "");

    private static string? Match(string? raw, (string Code, string[] Words)[] table)
    {
        var k = Key(raw);
        if (k.Length == 0) return null;
        // Short abbreviations ("wa", "pf", "rak") must match the whole cell, or "walkin" would read as WhatsApp.
        foreach (var (code, words) in table)
            if (words.Any(w => w.Length <= 3 ? k == w : k.Contains(w))) return code;
        return null;
    }

    public static string? Source(string? raw) => Match(raw, new[]
    {
        ("WHATSAPP", new[] { "whatsapp", "wa" }),
        ("EMAIL", new[] { "email", "mail" }),
        ("WEBSITE", new[] { "website", "web", "site", "webform" }),
        ("REFERRAL", new[] { "referral", "refer", "reference" }),
        ("LINKEDIN", new[] { "linkedin", "li" }),
        ("GOOGLE", new[] { "google", "adwords" }),
        ("FACEBOOK", new[] { "facebook", "fb", "meta" }),
        ("INSTAGRAM", new[] { "instagram", "insta", "ig" }),
        ("EXHIBITION", new[] { "exhibition", "gitex", "expo", "event", "trade" }),
        ("COLD_CALL", new[] { "coldcall", "cold", "telecall", "call" }),
        ("PARTNER", new[] { "partner", "reseller", "dealer" }),
        ("EXISTING_CUSTOMER", new[] { "existing", "customer", "upsell", "renewal" }),
    });

    public static string? Priority(string? raw) => Match(raw, new[]
    {
        ("HOT", new[] { "hot", "high", "urgent" }),
        ("COLD", new[] { "cold", "low" }),
        ("WARM", new[] { "warm", "medium", "normal" }),
    });

    // "25", "25 users", "~30" -> 25 / 30
    public static int? Count(string? raw)
    {
        var m = Regex.Match(raw ?? "", @"\d+");
        return m.Success && int.TryParse(m.Value, out var n) && n is > 0 and <= 100000 ? n : null;
    }

    // "1,500,000", "AED 1.5M", "900k", "1.2 million" -> number
    public static decimal? Amount(string? raw)
    {
        var s = raw?.Trim().ToLowerInvariant().Replace("aed", "").Replace(",", "").Replace(" ", "");
        if (string.IsNullOrEmpty(s)) return null;
        var m = Regex.Match(s, @"^(\d+(?:\.\d+)?)(m|mn|million|k|thousand)?$");
        if (!m.Success || !decimal.TryParse(m.Groups[1].Value, NumberStyles.Number, CultureInfo.InvariantCulture, out var n)) return null;
        return m.Groups[2].Value switch
        {
            "m" or "mn" or "million" => n * 1_000_000m,
            "k" or "thousand" => n * 1_000m,
            _ => n
        };
    }

    public static string? Text(string? raw, int max)
    {
        var s = raw?.Trim();
        return string.IsNullOrEmpty(s) ? null : s.Length > max ? s[..max] : s;
    }
}
