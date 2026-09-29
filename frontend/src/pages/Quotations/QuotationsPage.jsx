import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileText, Plus, RefreshCw, Search, Download, ShieldAlert } from "lucide-react";
import { QuotationService, openQuotationPdf } from "@/ServiceLayer/QuoteService/QuoteService";
import { useAuth } from "@/context/AuthContext";
import { Alerts, inputCls } from "@/components/common/ui";
import { formatDate } from "@/lib/utils";
import { displayName } from "@/lib/time";
import { QUOTE_STATUSES, quoteStatusOf, formatAed } from "@/lib/crm";

export default function QuotationsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ search: "", status: "", approval: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (f = filters) => {
    setLoading(true);
    try { setRows(await QuotationService.getAll(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))); }
    catch { setError("Failed to load quotations."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFilter = (k, v) => {
    const next = { ...filters, [k]: v };
    setFilters(next);
    if (k !== "search") load(next);
  };

  const pending = rows.filter((q) => q.approvalStatus === "PENDING" && q.status === "DRAFT").length;
  const openValue = rows.filter((q) => q.status === "SENT").reduce((a, q) => a + q.grandTotal, 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-600/10 p-2"><FileText className="h-6 w-6 text-blue-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Quotations</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Draft a quotation for a lead, then send, revise and close it here</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load()} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={() => navigate("/quotations/new")} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium">
            <Plus className="h-4 w-4" /> Add Quotation
          </button>
        </div>
      </div>

      {isAdmin && pending > 0 && filters.approval !== "PENDING" && (
        <button onClick={() => setFilter("approval", "PENDING")}
          className="flex w-full items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-2.5 text-left text-sm text-amber-800 dark:text-amber-300">
          <ShieldAlert className="h-4 w-4" /> {pending} {pending === 1 ? "quotation needs" : "quotations need"} your discount approval — show them
        </button>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={filters.search} onChange={(e) => setFilter("search", e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Quotation no, subject, company, contact..." className={`${inputCls} pl-9`} />
        </div>
        <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={`${inputCls.replace("w-full ", "")} w-40`}>
          <option value="">All statuses</option>
          {QUOTE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filters.approval} onChange={(e) => setFilter("approval", e.target.value)} className={`${inputCls.replace("w-full ", "")} w-48`}>
          <option value="">Any approval</option>
          <option value="PENDING">Waiting for approval</option>
          <option value="APPROVED">Discount approved</option>
        </select>
        <button onClick={() => load()} className="rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Apply</button>
        {openValue > 0 && <span className="ml-auto text-sm text-gray-500 dark:text-gray-400">Open (sent): <b className="text-gray-900 dark:text-white">{formatAed(openValue)}</b></span>}
      </div>

      <Alerts error={error} onClearError={() => setError("")} />

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <tr className="text-left text-gray-600 dark:text-gray-300">
                <th className="px-4 py-3 font-medium">Quotation</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Valid Until</th>
                <th className="px-4 py-3 font-medium text-right">Total (incl. VAT)</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">PDF</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No quotations yet. Click <b>Add Quotation</b> and choose a lead.</td></tr>
              )}
              {rows.map((q) => {
                const st = quoteStatusOf(q.status);
                const expired = q.status === "SENT" && new Date(`${q.validUntil.slice(0, 10)}T23:59:59`) < new Date();
                return (
                  <tr key={q.quotationId} className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/quotations/${q.quotationId}`} className="font-mono text-sm font-medium text-blue-600 hover:underline">{q.quoteNo}</Link>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        <Link to={`/leads/${q.leadId}`} className="hover:text-blue-600">{q.leadNo}</Link>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{q.accountName || displayName(q)}</div>
                      {q.accountName && <div className="text-xs text-gray-500 dark:text-gray-400">{displayName(q)}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-xs truncate">{q.subject || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDate(q.quoteDate)}</td>
                    <td className={`px-4 py-3 whitespace-nowrap ${expired ? "text-red-600 font-medium" : "text-gray-600 dark:text-gray-300"}`}>
                      {formatDate(q.validUntil)}{expired && " · expired"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-gray-900 dark:text-white whitespace-nowrap">{formatAed(q.grandTotal)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                      {q.approvalStatus === "PENDING" && q.status === "DRAFT" && (
                        <div className="mt-0.5 text-xs font-medium text-amber-600">Needs approval ({q.maxLineDiscount}% disc.)</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openQuotationPdf(q.quotationId).catch(() => setError("Could not open the PDF."))}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-blue-600" title="Open PDF"><Download className="h-4 w-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
