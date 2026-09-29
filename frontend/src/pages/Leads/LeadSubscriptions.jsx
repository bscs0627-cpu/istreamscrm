import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, BellRing } from "lucide-react";
import { SubscriptionService } from "@/ServiceLayer/QuoteService/QuoteService";
import { apiError } from "@/lib/apiClient";
import { formatDate } from "@/lib/utils";
import { BILLING_CYCLES, formatAed, labelOf, subscriptionStateOf } from "@/lib/crm";
import { RemindModal } from "@/pages/Subscriptions/SubscriptionDialogs";
import { RenewalCell } from "@/pages/Subscriptions/SubscriptionsPage";

export default function LeadSubscriptions({ lead, onError, onChanged }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [renewing, setRenewing] = useState(null);

  const load = () => SubscriptionService.getAll({ leadId: lead.leadId }).then(setRows).catch(() => onError("Failed to load subscriptions."));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.leadId, lead.updatedAt]);

  const renew = async (s) => {
    setRenewing(s.subscriptionId);
    try { const inv = await SubscriptionService.renew(s.subscriptionId); navigate(`/invoices/${inv.invoiceId}`); }
    catch (err) { onError(apiError(err, "Failed to draft the renewal invoice.")); setRenewing(null); }
  };

  const done = () => { setDialog(null); load(); onChanged?.(); };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Subscriptions</h3>
        <button onClick={() => navigate(`/subscriptions/new?lead=${lead.leadId}`)}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">None. Cloud plans and AMC on an accepted quotation become subscriptions from the quotation page.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => {
            const st = subscriptionStateOf(s);
            return (
              <li key={s.subscriptionId} className="rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900 dark:text-white" title={s.description}>{s.description}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {formatAed(s.cycleAmount)} {labelOf(BILLING_CYCLES, s.billingCycle).toLowerCase()} · paid up to {formatDate(s.endDate)}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                </div>
                {s.status === "ACTIVE" && (
                  <div className="mt-2 flex items-center gap-2">
                    <RenewalCell s={s} onRenew={renew} busy={renewing === s.subscriptionId} />
                    <button onClick={() => setDialog({ type: "remind", sub: s })} title="Send renewal reminder" className="ml-auto rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-blue-600"><BellRing className="h-4 w-4" /></button>
                    <button onClick={() => navigate(`/subscriptions/${s.subscriptionId}/edit`, { state: { from: `/leads/${lead.leadId}` } })} title="Edit" className="rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {dialog?.type === "remind" && <RemindModal sub={dialog.sub} onClose={() => setDialog(null)} onSent={done} />}
    </div>
  );
}
