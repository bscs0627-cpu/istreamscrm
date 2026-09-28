import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Receipt, Download, Save, Send, Plus, Trash2, BadgeCheck, Ban, Wallet, Mail, MessagesSquare, Loader2, X, BellRing } from "lucide-react";
import { InvoiceService, openInvoicePdf } from "@/ServiceLayer/QuoteService/QuoteService";
import { ProductService } from "@/ServiceLayer/CatalogService/CatalogService";
import { useAuth } from "@/context/AuthContext";
import { Alerts, Breadcrumb, DeleteModal, inputCls, labelCls } from "@/components/common/ui";
import { apiError } from "@/lib/apiClient";
import { formatDate, toInputDate } from "@/lib/utils";
import { dateTime, displayName } from "@/lib/time";
import { UNITS, PAYMENT_METHODS, labelOf, formatAed, formatNumber, quoteLine, quoteTotals, invoiceStateOf } from "@/lib/crm";

const card = "bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm";
const cellInput = "w-full rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-transparent disabled:border-transparent";
const btn = "inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50";

const pad = (n) => String(n).padStart(2, "0");
const todayInput = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const toForm = (i) => ({
  stage: i.stage ?? "",
  invoiceDate: toInputDate(i.invoiceDate),
  dueDate: toInputDate(i.dueDate),
  terms: i.terms ?? "",
  notes: i.notes ?? "",
  lines: i.lines.map((l) => ({
    productId: l.productId, description: l.description, unit: l.unit ?? "", quantity: String(l.quantity),
    unitPrice: String(l.unitPrice), discountPct: String(l.discountPct), vatPct: String(l.vatPct),
  })),
});

export default function InvoiceEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [inv, setInv] = useState(null);
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [products, setProducts] = useState([]);
  const [panel, setPanel] = useState(null);       // { kind: "send" | "pay" | "cancel", ... }
  const [busy, setBusy] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const apply = (row) => { setInv(row); setForm(toForm(row)); setDirty(false); };

  useEffect(() => {
    InvoiceService.get(id).then(apply).catch((err) =>
      setError(err?.response?.status === 404 ? "Invoice not found, or its lead belongs to someone else." : "Failed to load invoice."));
    ProductService.getAll({ activeOnly: true }).then(setProducts).catch(() => {});
  }, [id]);

  if (!inv || !form) {
    return (
      <div className="p-6 space-y-4">
        <Breadcrumb items={[{ label: "Invoices", to: "/invoices" }, { label: "Invoice" }]} />
        <Alerts error={error} onClearError={() => setError("")} />
        {!error && <p className="text-sm text-gray-400">Loading…</p>}
      </div>
    );
  }

  const draft = inv.status === "DRAFT";
  const issued = inv.status === "ISSUED";
  const st = invoiceStateOf(inv);
  const totals = draft ? quoteTotals(form.lines) : { subtotal: inv.subtotal, discount: inv.discountTotal, vat: inv.vatTotal, total: inv.grandTotal };

  const setField = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setDirty(true); };
  const setLine = (i, k, v) => { setForm((f) => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) })); setDirty(true); };
  const removeLine = (i) => { setForm((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) })); setDirty(true); };
  const addLine = (p) => {
    const line = p
      ? { productId: p.productId, description: p.productName, unit: p.unit, quantity: "1", unitPrice: String(p.price), discountPct: "0", vatPct: String(p.vatPct) }
      : { productId: null, description: "", unit: "FIXED", quantity: "1", unitPrice: "", discountPct: "0", vatPct: "5" };
    setForm((f) => ({ ...f, lines: [...f.lines, line] }));
    setDirty(true);
  };

  const run = async (key, fn, ok) => {
    setBusy(key); setError("");
    try { const r = await fn(); if (ok) setSuccess(ok); return r; }
    catch (err) { setError(apiError(err, "Something went wrong.")); return null; }
    finally { setBusy(""); }
  };

  const save = async () => {
    if (form.lines.some((l) => !l.description.trim())) { setError("Every line needs a description."); return; }
    const r = await run("save", () => InvoiceService.update(inv.invoiceId, {
      stage: form.stage.trim() || null, invoiceDate: form.invoiceDate, dueDate: form.dueDate,
      terms: form.terms.trim() || null, notes: form.notes.trim() || null,
      lines: form.lines.map((l) => ({
        productId: l.productId, description: l.description.trim(), unit: l.unit || null, quantity: Number(l.quantity) || 0,
        unitPrice: Number(l.unitPrice) || 0, discountPct: Number(l.discountPct) || 0, vatPct: Number(l.vatPct) || 0,
      })),
    }), "Draft saved.");
    if (r) apply(r);
  };

  const issue = async () => {
    const r = await run("issue", () => InvoiceService.issue(inv.invoiceId));
    if (r) { apply(r); setSuccess(`Issued as ${r.invoiceNo}. It can no longer be edited — send it to the customer.`); }
  };

  const submitPanel = async (e) => {
    e.preventDefault();
    let r = null;
    if (panel.kind === "send") {
      r = await run("panel", () => InvoiceService.send(inv.invoiceId, { channel: panel.channel, message: panel.message.trim() || null }),
        `${inv.invoiceNo} ${reminder ? "reminder" : ""} sent by ${panel.channel === "EMAIL" ? "email" : "WhatsApp"}.`.replace("  ", " "));
    } else if (panel.kind === "pay") {
      if (!(Number(panel.amount) > 0)) { setError("Enter the amount received."); return; }
      r = await run("panel", () => InvoiceService.addPayment(inv.invoiceId, {
        paymentDate: panel.paymentDate, amount: Number(panel.amount), method: panel.method,
        reference: panel.reference.trim() || null, notes: panel.notes.trim() || null,
      }), "Payment recorded.");
    } else if (panel.kind === "cancel") {
      if (!panel.reason.trim()) { setError("Give a reason for cancelling."); return; }
      r = await run("panel", () => InvoiceService.cancel(inv.invoiceId, panel.reason.trim()), `${inv.invoiceNo} cancelled.`);
    }
    if (r) { apply(r); setPanel(null); }
  };

  const deletePayment = async (p) => {
    const r = await run("pay-" + p.paymentId, () => InvoiceService.deletePayment(p.paymentId), "Payment removed.");
    if (r) apply(r);
  };

  const reminder = issued && !!inv.sentAt && inv.balance > 0;

  return (
    <div className="p-6 space-y-4">
      <Breadcrumb items={[{ label: "Invoices", to: "/invoices" }, { label: inv.invoiceNo }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-600/10 p-2"><Receipt className="h-6 w-6 text-blue-600" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-bold text-gray-900 dark:text-white">{inv.invoiceNo}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
              {inv.daysOverdue > 0 && <span className="text-xs font-medium text-red-600">{inv.daysOverdue} days overdue</span>}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {inv.billToName || inv.accountName || displayName(inv)} · <Link to={`/leads/${inv.leadId}`} className="text-blue-600 hover:underline">{inv.leadNo}</Link>
              {inv.quoteNo && <> · <Link to={`/quotations/${inv.quotationId}`} className="text-blue-600 hover:underline">{inv.quoteNo}</Link></>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => run("pdf", () => openInvoicePdf(inv.invoiceId))} disabled={!!busy} className={btn}>
            {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {dirty ? "PDF (last saved)" : "PDF"}
          </button>
          {draft && (
            <>
              <button onClick={save} disabled={!!busy || !dirty} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">
                {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
              </button>
              <button onClick={issue} disabled={!!busy || dirty} title={dirty ? "Save first" : ""}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">
                {busy === "issue" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} Issue
              </button>
              <button onClick={() => setConfirmDelete(true)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-red-600" title="Delete draft"><Trash2 className="h-4 w-4" /></button>
            </>
          )}
          {issued && (
            <button onClick={() => setPanel({ kind: "send", channel: inv.email ? "EMAIL" : "WHATSAPP", message: "" })} disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm font-medium">
              {reminder ? <BellRing className="h-4 w-4" /> : <Send className="h-4 w-4" />} {reminder ? "Send reminder" : inv.sentAt ? "Send again" : "Send"}
            </button>
          )}
          {isAdmin && issued && inv.balance > 0 && (
            <button onClick={() => setPanel({ kind: "pay", paymentDate: todayInput(), amount: String(inv.balance), method: "BANK_TRANSFER", reference: "", notes: "" })} className={btn}>
              <Wallet className="h-4 w-4 text-green-600" /> Record payment
            </button>
          )}
          {isAdmin && issued && inv.amountPaid === 0 && (
            <button onClick={() => setPanel({ kind: "cancel", reason: "" })} className={btn}><Ban className="h-4 w-4 text-red-600" /> Cancel</button>
          )}
        </div>
      </div>

      <Alerts success={success} error={error} onClearSuccess={() => setSuccess("")} onClearError={() => setError("")} />

      {draft && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-900 px-4 py-2.5 text-sm text-blue-800 dark:text-blue-300">
          Draft — no invoice number yet. <b>Issue</b> gives it the next INV number and locks it; after that, mistakes are fixed by cancelling and re-invoicing.
        </div>
      )}

      {panel && (
        <form onSubmit={submitPanel} className={`${card} p-4 space-y-3`}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {panel.kind === "send" ? `${reminder ? "Payment reminder for" : "Send"} ${inv.invoiceNo} with the PDF attached`
                : panel.kind === "pay" ? `Record a payment on ${inv.invoiceNo} (balance ${formatAed(inv.balance)})`
                : `Cancel ${inv.invoiceNo}`}
            </h3>
            <button type="button" onClick={() => setPanel(null)}><X className="h-4 w-4 text-gray-400" /></button>
          </div>

          {panel.kind === "send" && (
            <>
              <div className="flex gap-2">
                {[["EMAIL", "Email", Mail, inv.email], ["WHATSAPP", "WhatsApp", MessagesSquare, inv.mobileNo && `+${inv.mobileNo}`]].map(([v, label, Icon, to]) => (
                  <button type="button" key={v} disabled={!to} onClick={() => setPanel((p) => ({ ...p, channel: v }))}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-40 ${panel.channel === v
                      ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 dark:border-slate-700 text-gray-700 dark:text-gray-200"}`}>
                    <Icon className="h-4 w-4" /> {label}{to ? ` · ${to}` : " (none)"}
                  </button>
                ))}
              </div>
              <textarea value={panel.message} onChange={(e) => setPanel((p) => ({ ...p, message: e.target.value }))} rows={4} maxLength={2000} className={inputCls}
                placeholder={reminder ? "Leave empty for the standard reminder: amount due, days overdue, invoice attached." : "Leave empty for the standard message: invoice number, amount and due date."} />
            </>
          )}

          {panel.kind === "pay" && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div><label className={labelCls}>Date *</label><input type="date" value={panel.paymentDate} max={todayInput()} onChange={(e) => setPanel((p) => ({ ...p, paymentDate: e.target.value }))} className={inputCls} /></div>
              <div><label className={labelCls}>Amount (AED) *</label><input type="number" min="0.01" step="0.01" value={panel.amount} onChange={(e) => setPanel((p) => ({ ...p, amount: e.target.value }))} className={inputCls} /></div>
              <div>
                <label className={labelCls}>Method</label>
                <select value={panel.method} onChange={(e) => setPanel((p) => ({ ...p, method: e.target.value }))} className={inputCls}>
                  {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Reference</label><input value={panel.reference} onChange={(e) => setPanel((p) => ({ ...p, reference: e.target.value }))} maxLength={100} className={inputCls} placeholder={panel.method === "CHEQUE" ? "Cheque no" : "Transaction ref"} /></div>
              <div className="md:col-span-4"><input value={panel.notes} onChange={(e) => setPanel((p) => ({ ...p, notes: e.target.value }))} maxLength={500} className={inputCls} placeholder="Notes (optional)" /></div>
            </div>
          )}

          {panel.kind === "cancel" && (
            <input autoFocus value={panel.reason} onChange={(e) => setPanel((p) => ({ ...p, reason: e.target.value }))} maxLength={500} className={inputCls}
              placeholder="Why? (printed on the cancelled invoice). Then create a corrected invoice from the quotation." />
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPanel(null)} className={btn}>Close</button>
            <button type="submit" disabled={busy === "panel"}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${panel.kind === "cancel" ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}`}>
              {busy === "panel" && <Loader2 className="h-4 w-4 animate-spin" />}
              {panel.kind === "send" ? "Send" : panel.kind === "pay" ? "Save payment" : "Cancel invoice"}
            </button>
          </div>
        </form>
      )}

      <div className={`${card} p-5 space-y-5`}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className={labelCls}>Stage / Description</label>
            <input value={form.stage} onChange={setField("stage")} disabled={!draft} maxLength={100} className={inputCls} placeholder="e.g. Advance 50%, Milestone 2, Final" />
          </div>
          <div><label className={labelCls}>Invoice Date</label><input type="date" value={form.invoiceDate} onChange={setField("invoiceDate")} disabled={!draft} className={inputCls} /></div>
          <div><label className={labelCls}>Due Date</label><input type="date" value={form.dueDate} onChange={setField("dueDate")} disabled={!draft} className={inputCls} /></div>
        </div>

        <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 px-4 py-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Bill to {draft && "(taken from the company record when issued)"}</div>
          <div className="font-medium text-gray-900 dark:text-white">{(issued || inv.status === "CANCELLED" ? inv.billToName : null) || inv.accountName || displayName(inv)}</div>
          <div className="text-gray-600 dark:text-gray-300">
            {[draft ? [inv.accountAddress, inv.accountCity, inv.accountCountry].filter(Boolean).join(", ") : inv.billToAddress,
              (draft ? inv.accountTrn : inv.billToTrn) && `TRN ${draft ? inv.accountTrn : inv.billToTrn}`].filter(Boolean).join(" · ") || "No address / TRN on the company record"}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <tr className="text-left text-gray-600 dark:text-gray-300">
                <th className="px-2 py-2 font-medium w-8">#</th>
                <th className="px-2 py-2 font-medium min-w-72">Description</th>
                <th className="px-2 py-2 font-medium w-24 text-right">Qty</th>
                <th className="px-2 py-2 font-medium w-32 text-right">Unit Price</th>
                <th className="px-2 py-2 font-medium w-20 text-right">Disc %</th>
                <th className="px-2 py-2 font-medium w-20 text-right">VAT %</th>
                <th className="px-2 py-2 font-medium w-32 text-right">Amount</th>
                {draft && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {form.lines.map((l, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-slate-800 align-top">
                  <td className="px-2 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <textarea value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} disabled={!draft}
                      rows={Math.min(4, Math.max(1, l.description.split("\n").length))} className={`${cellInput} resize-y`} />
                    <div className="mt-0.5 text-xs text-gray-400">{l.unit ? labelOf(UNITS, l.unit) : ""}</div>
                  </td>
                  <td className="px-2 py-1.5"><input type="number" min="0" step="any" value={l.quantity} onChange={(e) => setLine(i, "quantity", e.target.value)} disabled={!draft} className={`${cellInput} text-right`} /></td>
                  <td className="px-2 py-1.5"><input type="number" min="0" step="0.01" value={l.unitPrice} onChange={(e) => setLine(i, "unitPrice", e.target.value)} disabled={!draft} className={`${cellInput} text-right`} /></td>
                  <td className="px-2 py-1.5"><input type="number" min="0" max="100" step="0.5" value={l.discountPct} onChange={(e) => setLine(i, "discountPct", e.target.value)} disabled={!draft} className={`${cellInput} text-right`} /></td>
                  <td className="px-2 py-1.5"><input type="number" min="0" max="100" step="0.5" value={l.vatPct} onChange={(e) => setLine(i, "vatPct", e.target.value)} disabled={!draft} className={`${cellInput} text-right`} /></td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-white">{formatNumber(quoteLine(l).net)}</td>
                  {draft && <td className="px-1 py-2"><button onClick={() => removeLine(i)} className="rounded p-1 text-gray-400 hover:text-red-600" title="Remove line"><X className="h-4 w-4" /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {draft && (
          <div className="flex flex-wrap items-center gap-2">
            <select value="" onChange={(e) => { const p = products.find((x) => String(x.productId) === e.target.value); if (p) addLine(p); }}
              className={`${inputCls.replace("w-full ", "")} w-72`}>
              <option value="">+ Add product from price list…</option>
              {products.map((p) => <option key={p.productId} value={p.productId}>{p.productCode} · {p.productName} ({formatAed(p.price)})</option>)}
            </select>
            <button onClick={() => addLine(null)} className={btn}><Plus className="h-4 w-4" /> Free-text line</button>
          </div>
        )}

        <div className="flex justify-end">
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600 dark:text-gray-300"><span>Subtotal</span><span className="tabular-nums">{formatNumber(totals.subtotal)}</span></div>
            {totals.discount > 0 && <div className="flex justify-between text-gray-600 dark:text-gray-300"><span>Discount</span><span className="tabular-nums">- {formatNumber(totals.discount)}</span></div>}
            <div className="flex justify-between text-gray-600 dark:text-gray-300"><span>VAT</span><span className="tabular-nums">{formatNumber(totals.vat)}</span></div>
            <div className="flex justify-between border-t border-gray-200 dark:border-slate-700 pt-1.5 text-base font-bold text-gray-900 dark:text-white">
              <span>Total (AED)</span><span className="tabular-nums">{formatNumber(totals.total)}</span>
            </div>
            {!draft && (
              <>
                <div className="flex justify-between text-green-700 dark:text-green-400"><span>Paid</span><span className="tabular-nums">- {formatNumber(inv.amountPaid)}</span></div>
                <div className="flex justify-between text-base font-bold text-blue-700 dark:text-blue-400"><span>Balance</span><span className="tabular-nums">{formatNumber(inv.balance)}</span></div>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Terms & Conditions (printed)</label>
            <textarea value={form.terms} onChange={setField("terms")} disabled={!draft} rows={4} className={`${inputCls} text-[13px]`} />
          </div>
          <div>
            <label className={labelCls}>Internal Notes (not printed)</label>
            <textarea value={form.notes} onChange={setField("notes")} disabled={!draft} rows={4} maxLength={2000} className={inputCls} />
          </div>
        </div>
      </div>

      {!draft && (
        <div className={`${card} overflow-hidden`}>
          <h3 className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-900 dark:text-white">Payments</h3>
          {inv.payments.length === 0 ? <p className="px-4 pb-4 text-sm text-gray-400">No payments yet.</p> : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800 border-y border-gray-200 dark:border-slate-700">
                <tr className="text-left text-gray-600 dark:text-gray-300">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Method</th>
                  <th className="px-4 py-2 font-medium">Reference</th>
                  <th className="px-4 py-2 font-medium">Recorded by</th>
                  <th className="px-4 py-2 font-medium text-right">Amount</th>
                  {isAdmin && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {inv.payments.map((p) => (
                  <tr key={p.paymentId} className="border-b border-gray-100 dark:border-slate-800">
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-200">{formatDate(p.paymentDate)}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{labelOf(PAYMENT_METHODS, p.method)}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{p.reference || "—"}{p.notes ? <div className="text-xs text-gray-400">{p.notes}</div> : null}</td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{p.createdByName} · {dateTime(p.createdAt)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-white">{formatAed(p.amount)}</td>
                    {isAdmin && (
                      <td className="px-2 py-2">
                        <button onClick={() => deletePayment(p)} disabled={!!busy} className="rounded p-1 text-gray-400 hover:text-red-600" title="Remove payment"><X className="h-4 w-4" /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {inv.status === "CANCELLED" && <p className="px-4 pb-4 text-sm text-red-600">Cancelled {dateTime(inv.cancelledAt)}: {inv.cancelReason}</p>}
        </div>
      )}

      <DeleteModal open={confirmDelete} name={`${inv.invoiceNo} (draft)`} onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try { await InvoiceService.remove(inv.invoiceId); navigate(inv.quotationId ? `/quotations/${inv.quotationId}` : "/invoices"); }
          catch (err) { setError(apiError(err, "Failed to delete.")); setConfirmDelete(false); }
        }} />
    </div>
  );
}
