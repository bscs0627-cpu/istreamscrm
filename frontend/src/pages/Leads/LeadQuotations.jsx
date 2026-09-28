import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileText, Plus, Loader2 } from "lucide-react";
import { QuotationService, InvoiceService } from "@/ServiceLayer/QuoteService/QuoteService";
import { apiError } from "@/lib/apiClient";
import { formatDate } from "@/lib/utils";
import { formatAed, quoteStatusOf, invoiceStateOf } from "@/lib/crm";

// The lead's quotations (latest version of each number first) and a button that drafts one from the lead's products.
export default function LeadQuotations({ lead, onError }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    QuotationService.getAll({ leadId: lead.leadId }).then(setRows).catch(() => onError("Failed to load quotations."));
    InvoiceService.getAll({ leadId: lead.leadId }).then(setInvoices).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.leadId, lead.updatedAt]);

  const create = async () => {
    setCreating(true);
    try { const q = await QuotationService.fromLead(lead.leadId); navigate(`/quotations/${q.quotationId}`); }
    catch (err) { onError(apiError(err, "Failed to create quotation.")); setCreating(false); }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Quotations</h3>
        <button onClick={create} disabled={creating}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-60">
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} New Quotation
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">
          No quotation yet. <b>New Quotation</b> drafts one from this lead's products{lead.usersCount ? ` for ${lead.usersCount} users` : ""}.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((q) => {
            const st = quoteStatusOf(q.status);
            return (
              <li key={q.quotationId}>
                <Link to={`/quotations/${q.quotationId}`}
                  className={`flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800/50 ${q.status === "REVISED" ? "opacity-60" : ""}`}>
                  <FileText className="h-4 w-4 text-gray-400" />
                  <span className="font-mono text-sm font-medium text-blue-600">{q.quoteNo}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                  {q.approvalStatus === "PENDING" && q.status === "DRAFT" && <span className="text-xs font-medium text-amber-600">needs approval</span>}
                  <span className="ml-auto text-sm font-medium tabular-nums text-gray-900 dark:text-white">{formatAed(q.grandTotal)}</span>
                  <span className="w-full text-xs text-gray-500 dark:text-gray-400">{q.subject || "—"} · {formatDate(q.quoteDate)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {invoices.length > 0 && (
        <div className="mt-3 border-t border-gray-100 dark:border-slate-800 pt-3">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Invoices</div>
          <ul className="space-y-1.5">
            {invoices.map((i) => {
              const st = invoiceStateOf(i);
              return (
                <li key={i.invoiceId}>
                  <Link to={`/invoices/${i.invoiceId}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                    <span className="font-mono text-sm font-medium text-blue-600">{i.invoiceNo}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                    <span className="ml-auto text-sm tabular-nums text-gray-900 dark:text-white">{formatAed(i.grandTotal)}</span>
                    {i.status === "ISSUED" && i.balance > 0 && <span className="w-full text-xs text-gray-500 dark:text-gray-400">Balance {formatAed(i.balance)} · due {formatDate(i.dueDate)}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
