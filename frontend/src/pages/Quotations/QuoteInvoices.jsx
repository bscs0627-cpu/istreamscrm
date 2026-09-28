import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Receipt, Loader2, Repeat } from "lucide-react";
import { InvoiceService, SubscriptionService } from "@/ServiceLayer/QuoteService/QuoteService";
import { inputCls, labelCls } from "@/components/common/ui";
import { apiError } from "@/lib/apiClient";
import { formatDate } from "@/lib/utils";
import { BILLING_CYCLES, formatAed, invoiceStateOf, labelOf, subscriptionStateOf } from "@/lib/crm";

// On an accepted quotation: its invoices so far, and a draft invoice for the full value, a share, or the balance.
export default function QuoteInvoices({ quote, onError }) {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [remaining, setRemaining] = useState(null);
  const [form, setForm] = useState({ percent: "", stage: "" });
  const [busy, setBusy] = useState(false);
  const [subs, setSubs] = useState([]);
  const [subBusy, setSubBusy] = useState(false);

  useEffect(() => {
    InvoiceService.getAll({ quotationId: quote.quotationId }).then(setInvoices).catch(() => {});
    SubscriptionService.getAll({ leadId: quote.leadId }).then((r) => setSubs(r.filter((s) => s.quotationId === quote.quotationId))).catch(() => {});
    InvoiceService.remaining(quote.quotationId).then((r) => {
      setRemaining(r.remainingPercent);
      setForm({ percent: String(r.remainingPercent), stage: r.invoicedPercent > 0 ? "Final" : "" });
    }).catch(() => {});
  }, [quote.quotationId]);

  const preset = (percent, stage) => setForm({ percent: String(percent), stage });

  const create = async (e) => {
    e.preventDefault();
    const percent = Number(form.percent);
    if (!(percent > 0) || percent > remaining) { onError(`Enter a percentage between 0 and ${remaining}.`); return; }
    setBusy(true);
    try {
      const inv = await InvoiceService.fromQuotation(quote.quotationId, { percent, stage: form.stage.trim() || null });
      navigate(`/invoices/${inv.invoiceId}`);
    } catch (err) { onError(apiError(err, "Failed to create the invoice.")); setBusy(false); }
  };

  const createSubs = async () => {
    setSubBusy(true);
    try { setSubs(await SubscriptionService.fromQuotation(quote.quotationId)); }
    catch (err) { onError(apiError(err, "Failed to create subscriptions.")); }
    finally { setSubBusy(false); }
  };

  const amount = remaining !== null && Number(form.percent) > 0 ? quote.grandTotal * Number(form.percent) / 100 : null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-green-200 dark:border-green-900 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Receipt className="h-5 w-5 text-green-600" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Invoices for {quote.quoteNo}</h3>
        {remaining !== null && <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">{remaining > 0 ? `${remaining}% still to invoice` : "Fully invoiced"}</span>}
      </div>

      {invoices.length > 0 && (
        <ul className="space-y-1.5">
          {invoices.map((i) => {
            const st = invoiceStateOf(i);
            return (
              <li key={i.invoiceId}>
                <Link to={`/invoices/${i.invoiceId}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                  <span className="font-mono text-sm font-medium text-blue-600">{i.invoiceNo}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{i.stage || "Full"} · {formatDate(i.invoiceDate)}</span>
                  <span className="ml-auto text-sm tabular-nums text-gray-900 dark:text-white">{formatAed(i.grandTotal)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 dark:border-slate-800 pt-3">
        <Repeat className="h-4 w-4 text-blue-600" />
        {subs.length > 0 ? (
          <>
            <span className="text-sm text-gray-700 dark:text-gray-300">Subscriptions:</span>
            {subs.map((s) => (
              <Link key={s.subscriptionId} to={`/leads/${quote.leadId}`} className={`rounded-full px-2 py-0.5 text-xs font-medium ${subscriptionStateOf(s).cls}`}>
                {s.description} · {labelOf(BILLING_CYCLES, s.billingCycle)} to {formatDate(s.endDate)}
              </Link>
            ))}
          </>
        ) : (
          <>
            <span className="text-sm text-gray-500 dark:text-gray-400">Cloud plans and AMC lines renew every period.</span>
            <button type="button" onClick={createSubs} disabled={subBusy}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-60">
              {subBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Repeat className="h-3.5 w-3.5" />} Create Subscriptions
            </button>
          </>
        )}
      </div>

      {remaining > 0 && (
        <form onSubmit={create} className="space-y-3 border-t border-gray-100 dark:border-slate-800 pt-3">
          <div className="flex flex-wrap gap-2">
            {remaining >= 100 && <button type="button" onClick={() => preset(100, "")} className="rounded-full border border-gray-300 dark:border-slate-700 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Full (100%)</button>}
            {remaining >= 50 && <button type="button" onClick={() => preset(50, "Advance 50%")} className="rounded-full border border-gray-300 dark:border-slate-700 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">50% advance</button>}
            {remaining < 100 && <button type="button" onClick={() => preset(remaining, "Final")} className="rounded-full border border-gray-300 dark:border-slate-700 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Balance ({remaining}%)</button>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_auto] items-end gap-3">
            <div>
              <label className={labelCls}>Percent *</label>
              <input type="number" min="0.01" max={remaining} step="0.01" value={form.percent} onChange={(e) => setForm((f) => ({ ...f, percent: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Stage</label>
              <input value={form.stage} onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))} maxLength={100} className={inputCls} placeholder="e.g. Advance 50%, Go-live 40%, Final" />
            </div>
            <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />} Create Invoice
            </button>
          </div>
          {amount !== null && <p className="text-xs text-gray-500 dark:text-gray-400">About {formatAed(Math.round(amount * 100) / 100)} including VAT. It starts as a draft you can check before issuing.</p>}
        </form>
      )}
    </div>
  );
}
