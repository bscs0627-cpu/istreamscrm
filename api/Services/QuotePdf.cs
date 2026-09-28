using System.Globalization;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using IStreamsCrm.Api.DTOs;

namespace IStreamsCrm.Api.Services;

// The quotation as the customer sees it (A4 PDF). Internal notes and approval details never appear here.
public static class QuotePdf
{
    private static readonly CultureInfo En = CultureInfo.GetCultureInfo("en-US");
    private const string Accent = "#1d4ed8";
    private const string Muted = "#64748b";
    private const string Line = "#e2e8f0";

    private static readonly Dictionary<string, string> Units = new()
    {
        ["PER_LICENSE"] = "license", ["PER_USER"] = "user", ["PER_USER_MONTH"] = "user / month", ["PER_USER_YEAR"] = "user / year",
        ["PER_MONTH"] = "month", ["PER_YEAR"] = "year", ["PER_HOUR"] = "hour", ["PER_DAY"] = "day", ["FIXED"] = "lot"
    };

    private static string Money(decimal n) => n.ToString("N2", En);
    private static string Date(DateTime d) => d.ToString("dd-MMM-yy", En).ToUpperInvariant();
    private static string Qty(decimal n) => n % 1 == 0 ? n.ToString("N0", En) : n.ToString("N2", En);

    public static byte[] Build(QuotationRow q, CompanyProfile seller, byte[]? logo)
    {
        return Document.Create(doc => doc.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(36);
            page.DefaultTextStyle(t => t.FontSize(9).FontColor("#0f172a"));

            page.Header().Column(col =>
            {
                col.Item().Row(row =>
                {
                    row.RelativeItem().Column(c =>
                    {
                        if (logo is { Length: > 0 }) c.Item().Height(48).AlignLeft().Image(logo).FitHeight();
                        c.Item().PaddingTop(4).Text(seller.LegalName ?? "").Bold().FontSize(12);
                        if (!string.IsNullOrWhiteSpace(seller.Address)) c.Item().Text(seller.Address).FontColor(Muted);
                        var contact = string.Join("  |  ", new[] { seller.Phone, seller.Email, seller.Website }.Where(s => !string.IsNullOrWhiteSpace(s)));
                        if (contact.Length > 0) c.Item().Text(contact).FontColor(Muted);
                        if (!string.IsNullOrWhiteSpace(seller.Trn)) c.Item().Text($"TRN: {seller.Trn}").FontColor(Muted);
                    });
                    row.ConstantItem(190).AlignRight().Column(c =>
                    {
                        c.Item().AlignRight().Text("QUOTATION").Bold().FontSize(20).FontColor(Accent);
                        c.Item().AlignRight().Text(q.QuoteNo).Bold().FontSize(11);
                        c.Item().PaddingTop(6).AlignRight().Text(t => { t.Span("Date: ").FontColor(Muted); t.Span(Date(q.QuoteDate)); });
                        c.Item().AlignRight().Text(t => { t.Span("Valid until: ").FontColor(Muted); t.Span(Date(q.ValidUntil)); });
                    });
                });
                col.Item().PaddingVertical(10).LineHorizontal(1).LineColor(Line);
            });

            page.Content().Column(col =>
            {
                col.Spacing(12);

                col.Item().Row(row =>
                {
                    row.RelativeItem().Column(c =>
                    {
                        c.Item().Text("PREPARED FOR").FontSize(8).Bold().FontColor(Muted);
                        c.Item().Text(q.AccountName ?? q.CustomerName ?? q.WhatsappName ?? "").Bold().FontSize(11);
                        if (q.AccountName is not null && (q.CustomerName ?? q.WhatsappName) is { } person)
                            c.Item().Text(q.JobTitle is null ? $"Attn: {person}" : $"Attn: {person}, {q.JobTitle}");
                        var address = string.Join(", ", new[] { q.AccountAddress, q.AccountCity, q.AccountCountry }.Where(s => !string.IsNullOrWhiteSpace(s)));
                        if (address.Length > 0) c.Item().Text(address).FontColor(Muted);
                        var reach = string.Join("  |  ", new[] { q.MobileNo is null ? null : $"+{q.MobileNo}", q.Email }.Where(s => s is not null));
                        if (reach.Length > 0) c.Item().Text(reach).FontColor(Muted);
                        if (!string.IsNullOrWhiteSpace(q.AccountTrn)) c.Item().Text($"TRN: {q.AccountTrn}").FontColor(Muted);
                    });
                    if (!string.IsNullOrWhiteSpace(q.Subject))
                        row.RelativeItem().AlignRight().AlignBottom().Text(q.Subject).Bold().FontSize(11);
                });

                col.Item().Table(table =>
                {
                    table.ColumnsDefinition(c =>
                    {
                        c.ConstantColumn(22);
                        c.RelativeColumn(5);
                        c.RelativeColumn(1.3f);
                        c.RelativeColumn(1.6f);
                        c.RelativeColumn(1);
                        c.RelativeColumn(1);
                        c.RelativeColumn(1.8f);
                    });
                    table.Header(h =>
                    {
                        static IContainer Head(IContainer x) => x.Background("#f1f5f9").PaddingVertical(5).PaddingHorizontal(4);
                        h.Cell().Element(Head).Text("#").Bold();
                        h.Cell().Element(Head).Text("Description").Bold();
                        h.Cell().Element(Head).AlignRight().Text("Qty").Bold();
                        h.Cell().Element(Head).AlignRight().Text("Unit Price").Bold();
                        h.Cell().Element(Head).AlignRight().Text("Disc %").Bold();
                        h.Cell().Element(Head).AlignRight().Text("VAT %").Bold();
                        h.Cell().Element(Head).AlignRight().Text("Amount (AED)").Bold();
                    });
                    var i = 0;
                    foreach (var l in q.Lines)
                    {
                        i++;
                        IContainer Cell(IContainer x) => x.BorderBottom(1).BorderColor(Line).PaddingVertical(5).PaddingHorizontal(4);
                        table.Cell().Element(Cell).Text(i.ToString());
                        table.Cell().Element(Cell).Text(l.Description);
                        table.Cell().Element(Cell).AlignRight().Text(t =>
                        {
                            t.Span(Qty(l.Quantity));
                            if (l.Unit is not null && Units.TryGetValue(l.Unit, out var u)) t.Span($"\n{u}").FontSize(7).FontColor(Muted);
                        });
                        table.Cell().Element(Cell).AlignRight().Text(Money(l.UnitPrice));
                        table.Cell().Element(Cell).AlignRight().Text(l.DiscountPct == 0 ? "—" : $"{l.DiscountPct:0.##}");
                        table.Cell().Element(Cell).AlignRight().Text($"{l.VatPct:0.##}");
                        table.Cell().Element(Cell).AlignRight().Text(Money(l.NetAmount));
                    }
                });

                col.Item().AlignRight().Width(230).Column(t =>
                {
                    void Row(string label, string value, bool strong = false)
                    {
                        t.Item().PaddingVertical(2).Row(r =>
                        {
                            var l = r.RelativeItem().Text(label);
                            var v = r.RelativeItem().AlignRight().Text(value);
                            if (strong) { l.Bold().FontSize(11); v.Bold().FontSize(11).FontColor(Accent); }
                            else l.FontColor(Muted);
                        });
                    }
                    Row("Subtotal", Money(q.Subtotal));
                    if (q.DiscountTotal > 0) Row("Discount", "- " + Money(q.DiscountTotal));
                    if (q.DiscountTotal > 0) Row("Net before VAT", Money(q.NetTotal));
                    Row("VAT", Money(q.VatTotal));
                    t.Item().PaddingVertical(3).LineHorizontal(1).LineColor(Line);
                    Row("Total (AED)", Money(q.GrandTotal), strong: true);
                });

                if (!string.IsNullOrWhiteSpace(q.PaymentTerms))
                    col.Item().Column(c =>
                    {
                        c.Item().Text("PAYMENT TERMS").FontSize(8).Bold().FontColor(Muted);
                        c.Item().Text(q.PaymentTerms);
                    });

                var bank = new[]
                {
                    seller.BankName is null ? null : $"Bank: {seller.BankName}",
                    seller.BankAccountName is null ? null : $"Account name: {seller.BankAccountName}",
                    seller.BankAccountNo is null ? null : $"Account no: {seller.BankAccountNo}",
                    seller.Iban is null ? null : $"IBAN: {seller.Iban}",
                    seller.Swift is null ? null : $"SWIFT: {seller.Swift}"
                }.Where(s => s is not null).ToList();
                if (bank.Count > 0)
                    col.Item().Column(c =>
                    {
                        c.Item().Text("BANK DETAILS").FontSize(8).Bold().FontColor(Muted);
                        foreach (var b in bank) c.Item().Text(b!);
                    });

                if (!string.IsNullOrWhiteSpace(q.Terms))
                    col.Item().Column(c =>
                    {
                        c.Item().Text("TERMS & CONDITIONS").FontSize(8).Bold().FontColor(Muted);
                        c.Item().Text(q.Terms).FontSize(8);
                    });
            });

            page.Footer().Column(col =>
            {
                col.Item().LineHorizontal(1).LineColor(Line);
                col.Item().PaddingTop(4).Row(r =>
                {
                    r.RelativeItem().Text($"{q.QuoteNo} · {seller.LegalName}").FontSize(7).FontColor(Muted);
                    r.RelativeItem().AlignRight().Text(t =>
                    {
                        t.DefaultTextStyle(s => s.FontSize(7).FontColor(Muted));
                        t.Span("Page ");
                        t.CurrentPageNumber();
                        t.Span(" of ");
                        t.TotalPages();
                    });
                });
            });
        })).GeneratePdf();
    }
}
