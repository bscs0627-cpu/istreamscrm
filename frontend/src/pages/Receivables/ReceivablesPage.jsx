import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, RefreshCw, Building2 } from "lucide-react";
import { InvoiceService } from "@/ServiceLayer/QuoteService/QuoteService";
import { Alerts } from "@/components/common/ui";
import { formatDate } from "@/lib/utils";
import { formatAed, invoiceStateOf } from "@/lib/crm";

const BUCKETS = [
  { key: "notDue", label: "Not yet due" },
  { key: "days1To30", label: "1–30 days" },
  { key: "days31To60", label: "31–60 days" },
  { key: "days61To90", label: "61–90 days" },
  { key: "over90", label: "90+ days" },
];

const money = (n) => (n ? formatAed(n) : "—");

export default function ReceivablesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [invLoading, setInvLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await InvoiceService.aging()); }
    catch { setError("Failed to load receivables."); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selected) { setInvoices([]); return; }
    setInvLoading(true);
    const params = selected.accountId ? { payment: "OUTSTANDING", accountId: selected.accountId } : { payment: "OUTSTANDING", search: selected.customer };
    InvoiceService.getAll(params).then(setInvoices).catch(() => setError("Failed to load the customer's invoices.")).finally(() => setInvLoading(false));
  }, [selected]);

  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const total = sum("total");
  const overdue = total - sum("notDue");

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-600/10 p-2"><Wallet className="h-6 w-6 text-blue-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Receivables</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Money owed on issued invoices, by customer and by how late it is</p>
          </div>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <Alerts error={error} onClearError={() => setError("")} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
      <div className="xl:col-span-2 space-y-4 min-w-0">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Link to="/invoices?payment=OUTSTANDING" className="rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm hover:border-gray-300">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Total outstanding</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-gray-900 dark:text-white">{formatAed(total)}</div>
        </Link>
        {BUCKETS.map((b, i) => (
          <div key={b.key} className="rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{i === 0 ? b.label : `Overdue ${b.label}`}</div>
            <div className={`mt-1 text-xl font-bold tabular-nums ${i >= 3 && sum(b.key) > 0 ? "text-red-600" : "text-gray-900 dark:text-white"}`}>{formatAed(sum(b.key))}</div>
          </div>
        ))}
      </div>

      {overdue > 0 && (
        <Link to="/invoices?payment=OVERDUE" className="block rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900 px-4 py-2.5 text-sm text-red-700 dark:text-red-300">
          {formatAed(overdue)} is overdue. Open the overdue invoices to send payment reminders →
        </Link>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <tr className="text-left text-gray-600 dark:text-gray-300">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium text-right">Invoices</th>
                {BUCKETS.map((b) => <th key={b.key} className="px-4 py-3 font-medium text-right">{b.label}</th>)}
                <th className="px-4 py-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.length === 0 && !loading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">Nothing outstanding. Every issued invoice is paid.</td></tr>
              )}
              {rows.map((r, i) => (
                <tr key={`${r.accountId ?? "c"}-${i}`} className={`border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors ${selected === r ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                    <button type="button" onClick={() => setSelected(r)} className="text-left hover:text-blue-600">{r.customer}</button>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{r.invoices}</td>
                  {BUCKETS.map((b, j) => (
                    <td key={b.key} className={`px-4 py-3 text-right ${j >= 3 && r[b.key] > 0 ? "text-red-600 font-semibold" : "text-gray-700 dark:text-gray-200"}`}>{money(r[b.key])}</td>
                  ))}
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{formatAed(r.total)}</td>
                </tr>
              ))}
              {rows.length > 1 && (
                <tr className="bg-gray-50 dark:bg-slate-800 font-semibold text-gray-900 dark:text-white">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right">{sum("invoices")}</td>
                  {BUCKETS.map((b) => <td key={b.key} className="px-4 py-3 text-right">{money(sum(b.key))}</td>)}
                  <td className="px-4 py-3 text-right">{formatAed(total)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm p-5 min-h-[16rem]">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="h-5 w-5 text-gray-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Customer</h2>
        </div>
        {!selected ? (
          <p className="text-sm text-gray-400 py-10 text-center">Click a customer to see the invoices they owe.</p>
        ) : (
          <>
            <div className="font-medium text-gray-900 dark:text-white">{selected.customer}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{selected.invoices} outstanding · <b className="text-gray-900 dark:text-white">{formatAed(selected.total)}</b></div>
            <ul className="mt-3 divide-y divide-gray-100 dark:divide-slate-800">
              {invoices.length === 0 && <li className="py-6 text-center text-sm text-gray-400">{invLoading ? "Loading..." : "No outstanding invoices."}</li>}
              {invoices.map((i) => {
                const st = invoiceStateOf(i);
                return (
                  <li key={i.invoiceId} className="py-2">
                    <Link to={`/invoices/${i.invoiceId}`} className="flex flex-wrap items-center gap-2 hover:bg-gray-50 dark:hover:bg-slate-800/50 rounded-md">
                      <span className="font-mono text-sm font-medium text-blue-600">{i.invoiceNo}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                      <span className="ml-auto text-sm font-medium tabular-nums text-gray-900 dark:text-white">{formatAed(i.balance)}</span>
                      <span className="w-full text-xs text-gray-500 dark:text-gray-400">
                        {i.stage ? `${i.stage} · ` : ""}due {formatDate(i.dueDate)}{i.daysOverdue > 0 ? ` · ${i.daysOverdue} days overdue` : ""}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="flex justify-center gap-2 pt-4">
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-gray-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Clear</button>
              <Link to={selected.accountId ? `/invoices?payment=OUTSTANDING&account=${selected.accountId}` : "/invoices?payment=OUTSTANDING"}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium">Open in Invoices</Link>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
