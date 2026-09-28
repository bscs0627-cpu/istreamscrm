import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FileText, Download, Save, Send, Plus, Trash2, CheckCircle2, XCircle, Copy, ShieldCheck, Mail, MessagesSquare, Loader2, X,
} from "lucide-react";
import { QuotationService, CompanyProfileService, openQuotationPdf } from "@/ServiceLayer/QuoteService/QuoteService";
import { ProductService } from "@/ServiceLayer/CatalogService/CatalogService";
import { useAuth } from "@/context/AuthContext";
import { Alerts, Breadcrumb, DeleteModal, inputCls, labelCls } from "@/components/common/ui";
import { apiError } from "@/lib/apiClient";
import { formatDate, toInputDate } from "@/lib/utils";
import { dateTime, displayName } from "@/lib/time";
import { UNITS, labelOf, formatAed, formatNumber, quoteLine, quoteTotals, quoteStatusOf } from "@/lib/crm";

const card = "bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm";
const cellInput = "w-full rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-transparent disabled:border-transparent";
const btn = "inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50";

const toForm = (q) => ({
  subject: q.subject ?? "",
  quoteDate: toInputDate(q.quoteDate),
  validUntil: toInputDate(q.validUntil),
  paymentTerms: q.paymentTerms ?? "",
  terms: q.terms ?? "",
  notes: q.notes ?? "",
  lines: q.lines.map((l) => ({
    productId: l.productId, description: l.description, unit: l.unit ?? "", quantity: String(l.quantity),
    unitPrice: String(l.unitPrice), discountPct: String(l.discountPct), vatPct: String(l.vatPct),
  })),
});

const emptyLine = { productId: null, description: "", unit: "FIXED", quantity: "1", unitPrice: "", discountPct: "0", vatPct: "5" };

export default function QuotationEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [q, setQ] = useState(null);
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [products, setProducts] = useState([]);
  const [limit, setLimit] = useState(null);
  const [history, setHistory] = useState([]);
  const [sendPanel, setSendPanel] = useState(null);
  const [closePanel, setClosePanel] = useState(null);
  const [busy, setBusy] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const apply = (row) => { setQ(row); setForm(toForm(row)); setDirty(false); };

  const load = async () => {
    try {
      const row = await QuotationService.get(id);
      apply(row);
      const all = await QuotationService.getAll({ leadId: row.leadId });
      setHistory(all.filter((x) => x.quoteYear === row.quoteYear && x.quoteSeq === row.quoteSeq));
    } catch (err) {
      setError(err?.response?.status === 404 ? "Quotation not found, or its lead belongs to someone else." : "Failed to load quotation.");
    }
  };

  useEffect(() => {
    load();
    ProductService.getAll({ activeOnly: true }).then(setProducts).catch(() => {});
    CompanyProfileService.get().then((p) => setLimit(p.maxDiscountPct)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!q || !form) {
    return (
      <div className="p-6 space-y-4">
        <Breadcrumb items={[{ label: "Quotations", to: "/quotations" }, { label: "Quotation" }]} />
        <Alerts error={error} onClearError={() => setError("")} />
        {!error && <p className="text-sm text-gray-400">Loading…</p>}
      </div>
    );
  }

  const editable = q.status === "DRAFT";
  const st = quoteStatusOf(q.status);
  const totals = quoteTotals(form.lines);
  const maxDisc = Math.max(0, ...form.lines.map((l) => Number(l.discountPct) || 0));
  const overLimit = limit !== null && maxDisc > limit;

  const setField = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setDirty(true); };
  const setLine = (i, k, v) => { setForm((f) => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) })); setDirty(true); };
  const removeLine = (i) => { setForm((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) })); setDirty(true); };
  const addLine = (p) => {
    const line = p
      ? { productId: p.productId, description: p.description ? `${p.productName}\n${p.description}` : p.productName, unit: p.unit,
          quantity: "1", unitPrice: String(p.price), discountPct: "0", vatPct: String(p.vatPct) }
      : emptyLine;
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
    if (form.lines.length === 0) { setError("Add at least one line."); return; }
    if (form.lines.some((l) => !l.description.trim())) { setError("Every line needs a description."); return; }
    const payload = {
      leadId: q.leadId,
      subject: form.subject.trim() || null,
      quoteDate: form.quoteDate, validUntil: form.validUntil,
      paymentTerms: form.paymentTerms.trim() || null, terms: form.terms.trim() || null, notes: form.notes.trim() || null,
      lines: form.lines.map((l) => ({
        productId: l.productId, description: l.description.trim(), unit: l.unit || null,
        quantity: Number(l.quantity) || 0, unitPrice: Number(l.unitPrice) || 0, discountPct: Number(l.discountPct) || 0, vatPct: Number(l.vatPct) || 0,
      })),
    };
    const r = await run("save", () => QuotationService.update(q.quotationId, payload), "Quotation saved.");
    if (r) apply(r);
  };

  const send = async (e) => {
    e.preventDefault();
    const r = await run("send", () => QuotationService.send(q.quotationId, { channel: sendPanel.channel, message: sendPanel.message.trim() || null }),
      `${q.quoteNo} sent by ${sendPanel.channel === "EMAIL" ? "email" : "WhatsApp"}.`);
    if (r) { apply(r); setSendPanel(null); }
  };

  const close = async (e) => {
    e.preventDefault();
    const r = await run("close", () => QuotationService.close(q.quotationId, { accepted: closePanel.accepted, reason: closePanel.reason.trim() || null }),
      closePanel.accepted ? `${q.quoteNo} accepted — the lead is marked Won.` : `${q.quoteNo} marked rejected.`);
    if (r) { apply(r); setClosePanel(null); }
  };

  const revise = async () => {
    const r = await run("revise", () => QuotationService.revise(q.quotationId));
    if (r) { setSuccess(`${r.quoteNo} created — edit and send it.`); navigate(`/quotations/${r.quotationId}`); }
  };

  const approve = async () => {
    const r = await run("approve", () => QuotationService.approve(q.quotationId), "Discount approved. The quotation can now be sent.");
    if (r) apply(r);
  };

  const pdf = () => run("pdf", () => openQuotationPdf(q.quotationId));

  return (
    <div className="p-6 space-y-4">
      <Breadcrumb items={[{ label: "Quotations", to: "/quotations" }, { label: q.quoteNo }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-600/10 p-2"><FileText className="h-6 w-6 text-blue-600" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-bold text-gray-900 dark:text-white">{q.quoteNo}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
              {q.approvalStatus === "PENDING" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Needs approval</span>}
              {q.approvalStatus === "APPROVED" && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Discount approved{q.approvedByName ? ` by ${q.approvedByName}` : ""}</span>}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {q.accountName || displayName(q)}{q.accountName ? ` · ${displayName(q)}` : ""} ·{" "}
              <Link to={`/leads/${q.leadId}`} className="text-blue-600 hover:underline">{q.leadNo}</Link>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={pdf} disabled={!!busy} className={btn}>
            {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {dirty ? "PDF (last saved)" : "PDF"}
          </button>
          {editable && (
            <button onClick={save} disabled={!!busy || !dirty} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </button>
          )}
          {isAdmin && q.approvalStatus === "PENDING" && !dirty && (
            <button onClick={approve} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4" /> Approve {q.maxLineDiscount}% discount
            </button>
          )}
          {(q.status === "DRAFT" || q.status === "SENT") && (
            <button onClick={() => setSendPanel({ channel: "EMAIL", message: "" })} disabled={!!busy || dirty || q.approvalStatus === "PENDING"}
              title={dirty ? "Save first" : q.approvalStatus === "PENDING" ? "Needs admin approval" : ""}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">
              <Send className="h-4 w-4" /> {q.status === "SENT" ? "Send again" : "Send"}
            </button>
          )}
          {q.status === "SENT" && (
            <>
              <button onClick={() => setClosePanel({ accepted: true, reason: "" })} className={btn}><CheckCircle2 className="h-4 w-4 text-green-600" /> Accepted</button>
              <button onClick={() => setClosePanel({ accepted: false, reason: "" })} className={btn}><XCircle className="h-4 w-4 text-red-600" /> Rejected</button>
            </>
          )}
          {(q.status === "SENT" || q.status === "REJECTED") && (
            <button onClick={revise} disabled={!!busy} className={btn}><Copy className="h-4 w-4" /> Revise</button>
          )}
          {editable && (
            <button onClick={() => setConfirmDelete(true)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-red-600" title="Delete draft"><Trash2 className="h-4 w-4" /></button>
          )}
        </div>
      </div>

      <Alerts success={success} error={error} onClearSuccess={() => setSuccess("")} onClearError={() => setError("")} />

      {editable && overLimit && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">
          A discount of {maxDisc}% is above your {limit}% limit. {isAdmin ? "As an admin, saving approves it." : "After saving, an admin must approve it before you can send."}
        </div>
      )}

      {sendPanel && (
        <form onSubmit={send} className={`${card} p-4 space-y-3`}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Send {q.quoteNo} with the PDF attached</h3>
            <button type="button" onClick={() => setSendPanel(null)}><X className="h-4 w-4 text-gray-400" /></button>
          </div>
          <div className="flex gap-2">
            {[["EMAIL", "Email", Mail, q.email], ["WHATSAPP", "WhatsApp", MessagesSquare, q.mobileNo && `+${q.mobileNo}`]].map(([v, label, Icon, to]) => (
              <button type="button" key={v} disabled={!to} onClick={() => setSendPanel((s) => ({ ...s, channel: v }))}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-40 ${sendPanel.channel === v
                  ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 dark:border-slate-700 text-gray-700 dark:text-gray-200"}`}>
                <Icon className="h-4 w-4" /> {label}{to ? ` · ${to}` : " (none)"}
              </button>
            ))}
          </div>
          <textarea value={sendPanel.message} onChange={(e) => setSendPanel((s) => ({ ...s, message: e.target.value }))} rows={4} maxLength={2000} className={inputCls}
            placeholder={`Leave empty for the standard message: "Dear ${displayName(q) || "Sir / Madam"}, please find attached our quotation ${q.quoteNo}… Total AED …"`} />
          {sendPanel.channel === "WHATSAPP" && <p className="text-xs text-gray-500 dark:text-gray-400">WhatsApp only works within 24 hours of the customer's last message.</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setSendPanel(null)} className={btn}>Cancel</button>
            <button type="submit" disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">
              {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
            </button>
          </div>
        </form>
      )}

      {closePanel && (
        <form onSubmit={close} className={`${card} p-4 space-y-3`}>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {closePanel.accepted ? `Customer accepted ${q.quoteNo}` : `Customer rejected ${q.quoteNo}`}
          </h3>
          {closePanel.accepted ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">The lead will be marked <b>Won</b> with a deal value of <b>{formatAed(q.netTotal)}</b> (before VAT).</p>
          ) : (
            <input autoFocus value={closePanel.reason} onChange={(e) => setClosePanel((c) => ({ ...c, reason: e.target.value }))} maxLength={500} className={inputCls}
              placeholder="Why? (e.g. price too high, chose a competitor) — you can still revise and resend" />
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setClosePanel(null)} className={btn}>Cancel</button>
            <button type="submit" disabled={!!busy} className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${closePanel.accepted ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>Confirm</button>
          </div>
        </form>
      )}

      <div className={`${card} p-5 space-y-5`}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className={labelCls}>Subject</label>
            <input value={form.subject} onChange={setField("subject")} disabled={!editable} maxLength={200} className={inputCls} placeholder="e.g. iStreams ERP – 25 users" />
          </div>
          <div>
            <label className={labelCls}>Quotation Date</label>
            <input type="date" value={form.quoteDate} onChange={setField("quoteDate")} disabled={!editable} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Valid Until</label>
            <input type="date" value={form.validUntil} onChange={setField("validUntil")} disabled={!editable} className={inputCls} />
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
                {editable && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {form.lines.map((l, i) => {
                const m = quoteLine(l);
                return (
                  <tr key={i} className="border-b border-gray-100 dark:border-slate-800 align-top">
                    <td className="px-2 py-2 text-gray-500">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <textarea value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} disabled={!editable}
                        rows={Math.min(4, Math.max(1, l.description.split("\n").length))} className={`${cellInput} resize-y`} />
                      <div className="mt-0.5 text-xs text-gray-400">{l.unit ? labelOf(UNITS, l.unit) : ""}</div>
                    </td>
                    <td className="px-2 py-1.5"><input type="number" min="0" step="any" value={l.quantity} onChange={(e) => setLine(i, "quantity", e.target.value)} disabled={!editable} className={`${cellInput} text-right`} /></td>
                    <td className="px-2 py-1.5"><input type="number" min="0" step="0.01" value={l.unitPrice} onChange={(e) => setLine(i, "unitPrice", e.target.value)} disabled={!editable} className={`${cellInput} text-right`} /></td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0" max="100" step="0.5" value={l.discountPct} onChange={(e) => setLine(i, "discountPct", e.target.value)} disabled={!editable}
                        className={`${cellInput} text-right ${limit !== null && Number(l.discountPct) > limit ? "text-amber-600 font-semibold" : ""}`} />
                    </td>
                    <td className="px-2 py-1.5"><input type="number" min="0" max="100" step="0.5" value={l.vatPct} onChange={(e) => setLine(i, "vatPct", e.target.value)} disabled={!editable} className={`${cellInput} text-right`} /></td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-white">{formatNumber(m.net)}</td>
                    {editable && (
                      <td className="px-1 py-2"><button onClick={() => removeLine(i)} className="rounded p-1 text-gray-400 hover:text-red-600" title="Remove line"><X className="h-4 w-4" /></button></td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {editable && (
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
              <span>Total (AED)</span><span className="tabular-nums text-blue-700 dark:text-blue-400">{formatNumber(totals.total)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Payment Terms</label>
            <textarea value={form.paymentTerms} onChange={setField("paymentTerms")} disabled={!editable} rows={3} maxLength={1000} className={inputCls}
              placeholder="e.g. 50% advance with PO, 40% on go-live, 10% after 30 days" />
          </div>
          <div>
            <label className={labelCls}>Internal Notes (not printed)</label>
            <textarea value={form.notes} onChange={setField("notes")} disabled={!editable} rows={3} maxLength={2000} className={inputCls} />
          </div>
          <div className="lg:col-span-2">
            <label className={labelCls}>Terms & Conditions</label>
            <textarea value={form.terms} onChange={setField("terms")} disabled={!editable} rows={5} className={`${inputCls} text-[13px]`} />
          </div>
        </div>
      </div>

      <div className={`${card} p-4`}>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Versions of {`QT-${q.quoteYear}-${String(q.quoteSeq).padStart(4, "0")}`}</h3>
        <ul className="divide-y divide-gray-100 dark:divide-slate-800 text-sm">
          {history.map((h) => {
            const hs = quoteStatusOf(h.status);
            return (
              <li key={h.quotationId} className={`flex flex-wrap items-center gap-3 py-2 ${h.quotationId === q.quotationId ? "font-semibold" : ""}`}>
                <Link to={`/quotations/${h.quotationId}`} className="font-mono text-blue-600 hover:underline">{h.quoteNo}</Link>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${hs.cls}`}>{hs.label}</span>
                <span className="text-gray-600 dark:text-gray-300 tabular-nums">{formatAed(h.grandTotal)}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDate(h.quoteDate)}{h.sentAt ? ` · sent ${dateTime(h.sentAt)}` : ""}{h.rejectReason ? ` · ${h.rejectReason}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <DeleteModal open={confirmDelete} name={`${q.quoteNo} (draft)`} onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try { await QuotationService.remove(q.quotationId); navigate(`/leads/${q.leadId}`); }
          catch (err) { setError(apiError(err, "Failed to delete.")); setConfirmDelete(false); }
        }} />
    </div>
  );
}
