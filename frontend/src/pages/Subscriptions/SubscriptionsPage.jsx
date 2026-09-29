import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Repeat, Plus, RefreshCw, Search, Pencil, BellRing, Ban, FilePlus2, PlayCircle, Loader2 } from "lucide-react";
import { SubscriptionService } from "@/ServiceLayer/QuoteService/QuoteService";
import { Alerts, inputCls } from "@/components/common/ui";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/lib/apiClient";
import { formatDate } from "@/lib/utils";
import { displayName } from "@/lib/time";
import { BILLING_CYCLES, SUBSCRIPTION_STATES, UNITS, formatAed, formatNumber, labelOf, subscriptionStateOf } from "@/lib/crm";
import { RemindModal, CancelSubscriptionModal } from "./SubscriptionDialogs";

function Tile({ label, value, sub, tone, onClick, active }) {
  return (
    <button onClick={onClick} className={`text-left bg-white dark:bg-slate-900 rounded-xl border shadow-sm p-4 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/50 ${active ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-200 dark:border-slate-800"}`}>
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${tone ?? "text-gray-900 dark:text-white"}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
    </button>
  );
}

export function RenewalCell({ s, onRenew, busy }) {
  if (s.renewalInvoiceId)
    return <Link to={`/invoices/${s.renewalInvoiceId}`} className="text-xs font-medium text-blue-600 hover:underline">{s.renewalInvoiceStatus === "DRAFT" ? "Draft invoice" : "Invoice issued"}</Link>;
  if (s.status !== "ACTIVE") return <span className="text-xs text-gray-400">—</span>;
  return (
    <button onClick={() => onRenew(s)} disabled={busy}
      className="inline-flex items-center gap-1 rounded-md border border-gray-300 dark:border-slate-700 px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-60">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />} Renew
    </button>
  );
}

export default function SubscriptionsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState({ search: "", view: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(location.state?.success ?? "");
  const [dialog, setDialog] = useState(null);
  const [renewing, setRenewing] = useState(null);
  const [running, setRunning] = useState(false);

  const load = async (f = filters) => {
    setLoading(true);
    try {
      const [list, sum] = await Promise.all([
        SubscriptionService.getAll(Object.fromEntries(Object.entries(f).filter(([, v]) => v))),
        SubscriptionService.summary(),
      ]);
      setRows(list);
      setSummary(sum);
    } catch { setError("Failed to load subscriptions."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setView = (view) => {
    const next = { ...filters, view: filters.view === view ? "" : view };
    setFilters(next);
    load(next);
  };

  const renew = async (s) => {
    setRenewing(s.subscriptionId);
    try { const inv = await SubscriptionService.renew(s.subscriptionId); navigate(`/invoices/${inv.invoiceId}`); }
    catch (err) { setError(apiError(err, "Failed to draft the renewal invoice.")); setRenewing(null); }
  };

  const runCheck = async () => {
    setRunning(true);
    try {
      const r = await SubscriptionService.runRenewals();
      setSuccess(r.drafted ? `${r.drafted} renewal invoice(s) drafted, with a follow-up for each agent.` : "Nothing new is due for renewal.");
      load();
    } catch (err) { setError(apiError(err, "Renewal check failed.")); }
    finally { setRunning(false); }
  };

  const closeAndReload = (msg) => { setDialog(null); if (msg) setSuccess(msg); load(); };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-600/10 p-2"><Repeat className="h-6 w-6 text-blue-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Subscriptions</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Cloud plans and AMC contracts, their renewal dates and recurring revenue</p>
          </div>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={runCheck} disabled={running} title="Draft renewal invoices for auto-renew subscriptions due for renewal (7 days ahead for monthly, 15 quarterly, 30 yearly)"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-60">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />} Run Renewal Check
            </button>
          )}
          <button onClick={() => load()} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={() => navigate("/subscriptions/new")} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium">
            <Plus className="h-4 w-4" /> Add Subscription
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Tile label="Monthly recurring (MRR)" value={formatAed(summary.mrr)} sub="before VAT" onClick={() => setView("")} active={!filters.view} />
          <Tile label="Annual recurring (ARR)" value={formatAed(summary.arr)} sub="MRR × 12" onClick={() => setView("")} />
          <Tile label="Active" value={summary.active} sub="not cancelled" onClick={() => setView("ACTIVE")} active={filters.view === "ACTIVE"} />
          <Tile label="Due for renewal" value={summary.dueSoon} sub={summary.dueValue > 0 ? `${formatAed(summary.dueValue)} due + expired` : null}
            tone="text-amber-600" onClick={() => setView("DUE")} active={filters.view === "DUE"} />
          <Tile label="Expired" value={summary.expired} sub="not renewed yet" tone={summary.expired > 0 ? "text-red-600" : undefined}
            onClick={() => setView("EXPIRED")} active={filters.view === "EXPIRED"} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Item, company, contact, product code..." className={`${inputCls} pl-9`} />
        </div>
        <select value={filters.view} onChange={(e) => setView(e.target.value)} className={`${inputCls.replace("w-full ", "")} w-44`}>
          <option value="">All subscriptions</option>
          {SUBSCRIPTION_STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button onClick={() => load()} className="rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Apply</button>
      </div>

      <Alerts success={success} error={error} onClearSuccess={() => setSuccess("")} onClearError={() => setError("")} />

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <tr className="text-left text-gray-600 dark:text-gray-300">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Cycle</th>
                <th className="px-4 py-3 font-medium text-right">Per cycle</th>
                <th className="px-4 py-3 font-medium">Paid up to</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Renewal</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No subscriptions. Create them from an accepted quotation, or add one on a lead.</td></tr>
              )}
              {rows.map((s) => {
                const st = subscriptionStateOf(s);
                return (
                  <tr key={s.subscriptionId} className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{s.accountName || displayName(s)}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        <Link to={`/leads/${s.leadId}`} className="hover:text-blue-600">{s.leadNo}</Link>{s.assignedToName ? ` · ${s.assignedToName}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-72">
                      <div className="truncate text-gray-900 dark:text-white" title={s.description}>{s.description}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {formatNumber(s.quantity)} × {formatAed(s.unitPrice)} {labelOf(UNITS, s.unit)}{s.discountPct > 0 ? ` · ${formatNumber(s.discountPct)}% off` : ""}
                        {s.autoRenew === "T" && s.status === "ACTIVE" ? " · auto-renew" : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{labelOf(BILLING_CYCLES, s.billingCycle)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-white">{formatAed(s.cycleAmount)}</td>
                    <td className={`px-4 py-3 ${s.state === "EXPIRED" ? "text-red-600 font-medium" : s.state === "DUE" ? "text-amber-600 font-medium" : "text-gray-600 dark:text-gray-300"}`}>
                      {formatDate(s.endDate)}
                      {s.status === "ACTIVE" && <span className="text-xs"> · {s.daysLeft < 0 ? `${-s.daysLeft}d ago` : `${s.daysLeft}d left`}</span>}
                    </td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span></td>
                    <td className="px-4 py-3"><RenewalCell s={s} onRenew={renew} busy={renewing === s.subscriptionId} /></td>
                    <td className="px-4 py-3 text-right">
                      {s.status === "ACTIVE" && (
                        <div className="inline-flex gap-1">
                          <button onClick={() => setDialog({ type: "remind", sub: s })} title="Send renewal reminder" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-blue-600"><BellRing className="h-4 w-4" /></button>
                          <button onClick={() => navigate(`/subscriptions/${s.subscriptionId}/edit`)} title="Edit" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                          {isAdmin && <button onClick={() => setDialog({ type: "cancel", sub: s })} title="Cancel subscription" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-red-600"><Ban className="h-4 w-4" /></button>}
                        </div>
                      )}
                      {s.status === "CANCELLED" && <span className="text-xs text-gray-400" title={s.cancelReason}>{s.cancelReason}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {dialog?.type === "remind" && <RemindModal sub={dialog.sub} onClose={() => setDialog(null)} onSent={() => closeAndReload("Reminder sent.")} />}
      {dialog?.type === "cancel" && <CancelSubscriptionModal sub={dialog.sub} onClose={() => setDialog(null)} onDone={() => closeAndReload("Subscription cancelled.")} />}
    </div>
  );
}
