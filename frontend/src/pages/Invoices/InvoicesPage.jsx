import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Receipt, RefreshCw, Search, Download } from "lucide-react";
import { InvoiceService, openInvoicePdf } from "@/ServiceLayer/QuoteService/QuoteService";
import { Alerts, inputCls } from "@/components/common/ui";
import { formatDate } from "@/lib/utils";
import { displayName } from "@/lib/time";
import { formatAed, invoiceStateOf } from "@/lib/crm";

const PAYMENT_FILTERS = [
  { value: "", label: "All invoices" },
  { value: "OUTSTANDING", label: "Outstanding" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "UNPAID", label: "Unpaid (not due)" },
  { value: "PARTIAL", label: "Partly paid" },
  { value: "PAID", label: "Paid" },
];

export default function InvoicesPage() {
  const [params] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ search: "", status: "", payment: params.get("payment") ?? "", accountId: params.get("account") ?? "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (f = filters) => {
    setLoading(true);
    try { setRows(await InvoiceService.getAll(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))); }
    catch { setError("Failed to load invoices."); }
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

  const issued = rows.filter((i) => i.status === "ISSUED");
  const outstanding = issued.reduce((a, i) => a + i.balance, 0);
  const overdue = issued.filter((i) => i.paymentStatus === "OVERDUE").reduce((a, i) => a + i.balance, 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-600/10 p-2"><Receipt className="h-6 w-6 text-blue-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Invoices</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Tax invoices from accepted quotations, and the payments against them</p>
          </div>
        </div>
        <button onClick={() => load()} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={filters.search} onChange={(e) => setFilter("search", e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Invoice no, company, contact, stage..." className={`${inputCls} pl-9`} />
        </div>
        <select value={filters.payment} onChange={(e) => setFilter("payment", e.target.value)} className={`${inputCls.replace("w-full ", "")} w-44`}>
          {PAYMENT_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={`${inputCls.replace("w-full ", "")} w-36`}>
          <option value="">Any status</option>
          <option value="DRAFT">Draft</option>
          <option value="ISSUED">Issued</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <button onClick={() => load()} className="rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Apply</button>
        <div className="ml-auto flex gap-4 text-sm">
          <span className="text-gray-500 dark:text-gray-400">Outstanding: <b className="text-gray-900 dark:text-white">{formatAed(outstanding)}</b></span>
          {overdue > 0 && <span className="text-red-600">Overdue: <b>{formatAed(overdue)}</b></span>}
        </div>
      </div>

      <Alerts error={error} onClearError={() => setError("")} />

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <tr className="text-left text-gray-600 dark:text-gray-300">
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium text-right">Balance</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">PDF</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">No invoices. Open an accepted quotation and click <b>Create Invoice</b>.</td></tr>
              )}
              {rows.map((i) => {
                const st = invoiceStateOf(i);
                return (
                  <tr key={i.invoiceId} className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/invoices/${i.invoiceId}`} className="font-mono text-sm font-medium text-blue-600 hover:underline">{i.invoiceNo}</Link>
                      {i.quoteNo && <div className="text-xs text-gray-500 dark:text-gray-400">{i.quoteNo}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{i.billToName || i.accountName || displayName(i)}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400"><Link to={`/leads/${i.leadId}`} className="hover:text-blue-600">{i.leadNo}</Link></div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-56 truncate">{i.stage || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatDate(i.invoiceDate)}</td>
                    <td className={`px-4 py-3 ${i.paymentStatus === "OVERDUE" ? "text-red-600 font-medium" : "text-gray-600 dark:text-gray-300"}`}>
                      {formatDate(i.dueDate)}{i.daysOverdue > 0 && <span className="text-xs"> · {i.daysOverdue}d late</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-white">{formatAed(i.grandTotal)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-white">{i.status === "ISSUED" ? formatAed(i.balance) : "—"}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span></td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openInvoicePdf(i.invoiceId).catch(() => setError("Could not open the PDF."))}
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
