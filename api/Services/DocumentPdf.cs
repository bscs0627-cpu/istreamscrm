using System.Globalization;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using IStreamsCrm.Api.DTOs;

namespace IStreamsCrm.Api.Services;

// What a customer document shows. Quotations and tax invoices fill this in and share one A4 layout.
public class PdfDoc
{
    public string Title { get; set; } = string.Empty;           // QUOTATION / TAX INVOICE
    public string Number { get; set; } = string.Empty;
    public List<(string Label, string Value)> Meta { get; set; } = new();
    public string PartyLabel { get; set; } = "PREPARED FOR";
    public string PartyName { get; set; } = string.Empty;
    public List<string> PartyLines { get; set; } = new();
    public string? PartyTrn { get; set; }
    public string? Subject { get; set; }
    public List<QuotationLineRow> Lines { get; set; } = new();
    public bool ShowVatAmount { get; set; }
    public decimal Subtotal { get; set; }
    public decimal Discount { get; set; }
    public decimal Vat { get; set; }
    public decimal Total { get; set; }
    public List<(string Label, string Value, bool Strong)> AfterTotal { get; set; } = new();
    public List<(string Title, string Text)> Sections { get; set; } = new();   // printed before the bank details
    public bool ShowBank { get; set; } = true;
    public string? Terms { get; set; }
    public string? Watermark { get; set; }                     // DRAFT / CANCELLED
}

public static class DocumentPdf
{
    public static readonly CultureInfo En = CultureInfo.GetCultureInfo("en-US");
    private const string Accent = "#1d4ed8";
    private const string Muted = "#64748b";
    private const string Rule = "#e2e8f0";

    private static readonly Dictionary<string, string> Units = new()
    {
        ["PER_LICENSE"] = "license", ["PER_USER"] = "user", ["PER_USER_MONTH"] = "user / month", ["PER_USER_YEAR"] = "user / year",
        ["PER_MONTH"] = "month", ["PER_YEAR"] = "year", ["PER_HOUR"] = "hour", ["PER_DAY"] = "day", ["FIXED"] = "lot"
    };

    public static string Money(decimal n) => n.ToString("N2", En);
    public static string Date(DateTime d) => d.ToString("dd-MMM-yy", En).ToUpperInvariant();
    private static string Qty(decimal n) => n % 1 == 0 ? n.ToString("N0", En) : n.ToString("N2", En);

    public static byte[] Build(PdfDoc d, CompanyProfile seller, byte[]? logo)
    {
        return Document.Create(doc => doc.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(36);
            page.DefaultTextStyle(t => t.FontSize(9).FontColor("#0f172a"));

            if (d.Watermark is not null)
                page.Foreground().AlignCenter().AlignMiddle().Rotate(-30)
                    .Text(d.Watermark).FontSize(90).Bold().FontColor("#26e11d48");

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
                    row.ConstantItem(200).AlignRight().Column(c =>
                    {
                        c.Item().AlignRight().Text(d.Title).Bold().FontSize(20).FontColor(Accent);
                        c.Item().AlignRight().Text(d.Number).Bold().FontSize(11);
                        foreach (var (label, value) in d.Meta)
                            c.Item().AlignRight().Text(t => { t.Span($"{label}: ").FontColor(Muted); t.Span(value); });
                    });
                });
                col.Item().PaddingVertical(10).LineHorizontal(1).LineColor(Rule);
            });

            page.Content().Column(col =>
            {
                col.Spacing(12);

                col.Item().Row(row =>
                {
                    row.RelativeItem().Column(c =>
                    {
                        c.Item().Text(d.PartyLabel).FontSize(8).Bold().FontColor(Muted);
                        c.Item().Text(d.PartyName).Bold().FontSize(11);
                        foreach (var l in d.PartyLines) c.Item().Text(l).FontColor(Muted);
                        if (!string.IsNullOrWhiteSpace(d.PartyTrn)) c.Item().Text($"TRN: {d.PartyTrn}").FontColor(Muted);
                    });
                    if (!string.IsNullOrWhiteSpace(d.Subject))
                        row.RelativeItem().AlignRight().AlignBottom().Text(d.Subject).Bold().FontSize(11);
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
                        if (d.ShowVatAmount) c.RelativeColumn(1.5f);
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
                        if (d.ShowVatAmount) h.Cell().Element(Head).AlignRight().Text("VAT (AED)").Bold();
                        h.Cell().Element(Head).AlignRight().Text(d.ShowVatAmount ? "Taxable (AED)" : "Amount (AED)").Bold();
                    });
                    var i = 0;
                    foreach (var l in d.Lines)
                    {
                        i++;
                        static IContainer Cell(IContainer x) => x.BorderBottom(1).BorderColor(Rule).PaddingVertical(5).PaddingHorizontal(4);
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
                        if (d.ShowVatAmount) table.Cell().Element(Cell).AlignRight().Text(Money(l.VatAmount));
                        table.Cell().Element(Cell).AlignRight().Text(Money(l.NetAmount));
                    }
                });

                col.Item().AlignRight().Width(240).Column(t =>
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
                    Row("Subtotal", Money(d.Subtotal));
                    if (d.Discount > 0) Row("Discount", "- " + Money(d.Discount));
                    if (d.Discount > 0) Row("Net before VAT", Money(d.Subtotal - d.Discount));
                    Row("VAT", Money(d.Vat));
                    t.Item().PaddingVertical(3).LineHorizontal(1).LineColor(Rule);
                    Row("Total (AED)", Money(d.Total), strong: true);
                    foreach (var (label, value, strong) in d.AfterTotal) Row(label, value, strong);
                });

                foreach (var (title, text) in d.Sections)
                    col.Item().Column(c =>
                    {
                        c.Item().Text(title).FontSize(8).Bold().FontColor(Muted);
                        c.Item().Text(text);
                    });

                var bank = new[]
                {
                    seller.BankName is null ? null : $"Bank: {seller.BankName}",
                    seller.BankAccountName is null ? null : $"Account name: {seller.BankAccountName}",
                    seller.BankAccountNo is null ? null : $"Account no: {seller.BankAccountNo}",
                    seller.Iban is null ? null : $"IBAN: {seller.Iban}",
                    seller.Swift is null ? null : $"SWIFT: {seller.Swift}"
                }.Where(s => s is not null).ToList();
                if (d.ShowBank && bank.Count > 0)
                    col.Item().Column(c =>
                    {
                        c.Item().Text("BANK DETAILS").FontSize(8).Bold().FontColor(Muted);
                        foreach (var b in bank) c.Item().Text(b!);
                    });

                if (!string.IsNullOrWhiteSpace(d.Terms))
                    col.Item().Column(c =>
                    {
                        c.Item().Text("TERMS & CONDITIONS").FontSize(8).Bold().FontColor(Muted);
                        c.Item().Text(d.Terms).FontSize(8);
                    });
            });

            page.Footer().Column(col =>
            {
                col.Item().LineHorizontal(1).LineColor(Rule);
                col.Item().PaddingTop(4).Row(r =>
                {
                    r.RelativeItem().Text($"{d.Number} · {seller.LegalName}").FontSize(7).FontColor(Muted);
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
