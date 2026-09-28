using IStreamsCrm.Api.DTOs;

namespace IStreamsCrm.Api.Services;

// Quotations and tax invoices as the customer sees them. Internal notes and approvals never appear here.
public static class QuotePdf
{
    private static string? Join(string sep, params string?[] parts)
    {
        var s = string.Join(sep, parts.Where(p => !string.IsNullOrWhiteSpace(p)));
        return s.Length == 0 ? null : s;
    }

    public static byte[] Build(QuotationRow q, CompanyProfile seller, byte[]? logo)
    {
        var person = q.CustomerName ?? q.WhatsappName;
        var doc = new PdfDoc
        {
            Title = "QUOTATION",
            Number = q.QuoteNo,
            Meta = { ("Date", DocumentPdf.Date(q.QuoteDate)), ("Valid until", DocumentPdf.Date(q.ValidUntil)) },
            PartyLabel = "PREPARED FOR",
            PartyName = q.AccountName ?? person ?? "",
            PartyTrn = q.AccountTrn,
            Subject = q.Subject,
            Lines = q.Lines,
            Subtotal = q.Subtotal, Discount = q.DiscountTotal, Vat = q.VatTotal, Total = q.GrandTotal,
            Terms = q.Terms
        };
        if (q.AccountName is not null && person is not null) doc.PartyLines.Add(q.JobTitle is null ? $"Attn: {person}" : $"Attn: {person}, {q.JobTitle}");
        if (Join(", ", q.AccountAddress, q.AccountCity, q.AccountCountry) is { } address) doc.PartyLines.Add(address);
        if (Join("  |  ", q.MobileNo is null ? null : $"+{q.MobileNo}", q.Email) is { } reach) doc.PartyLines.Add(reach);
        if (!string.IsNullOrWhiteSpace(q.PaymentTerms)) doc.Sections.Add(("PAYMENT TERMS", q.PaymentTerms));
        return DocumentPdf.Build(doc, seller, logo);
    }

    // A draft shows the live customer details; an issued invoice shows the ones frozen at issue.
    public static byte[] BuildInvoice(InvoiceRow i, CompanyProfile seller, byte[]? logo)
    {
        var issued = i.Status != "DRAFT";
        var person = i.CustomerName ?? i.WhatsappName;
        var doc = new PdfDoc
        {
            Title = "TAX INVOICE",
            Number = issued ? i.InvoiceNo : "DRAFT",
            Meta = { ("Invoice date", DocumentPdf.Date(i.InvoiceDate)), ("Due date", DocumentPdf.Date(i.DueDate)) },
            PartyLabel = "BILL TO",
            PartyName = (issued ? i.BillToName : null) ?? i.AccountName ?? person ?? "",
            PartyTrn = issued ? i.BillToTrn : i.AccountTrn,
            Subject = i.Stage,
            Lines = i.Lines,
            ShowVatAmount = true,
            Subtotal = i.Subtotal, Discount = i.DiscountTotal, Vat = i.VatTotal, Total = i.GrandTotal,
            Terms = i.Terms,
            Watermark = i.Status switch { "DRAFT" => "DRAFT", "CANCELLED" => "CANCELLED", _ => null }
        };
        if (i.QuoteNo is not null) doc.Meta.Add(("Quotation", i.QuoteNo));
        var address = issued ? i.BillToAddress : Join(", ", i.AccountAddress, i.AccountCity, i.AccountCountry);
        if (!string.IsNullOrWhiteSpace(address)) doc.PartyLines.Add(address);
        if (i.AccountName is not null && person is not null) doc.PartyLines.Add($"Attn: {person}");
        if (i.AmountPaid > 0)
        {
            doc.AfterTotal.Add(("Paid", "- " + DocumentPdf.Money(i.AmountPaid), false));
            doc.AfterTotal.Add(("Balance due (AED)", DocumentPdf.Money(i.Balance), true));
        }
        if (i.Status == "ISSUED" && i.Balance > 0)
            doc.Sections.Add(("PAYMENT", $"Please pay AED {DocumentPdf.Money(i.Balance)} by {DocumentPdf.Date(i.DueDate)} to the account below, quoting {i.InvoiceNo}."));
        if (i.Status == "CANCELLED" && i.CancelReason is not null) doc.Sections.Add(("CANCELLED", i.CancelReason));
        return DocumentPdf.Build(doc, seller, logo);
    }
}
