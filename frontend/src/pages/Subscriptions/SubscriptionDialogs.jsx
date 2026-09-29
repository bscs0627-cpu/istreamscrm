import { useState } from "react";
import { X, Loader2, Send } from "lucide-react";
import { SubscriptionService } from "@/ServiceLayer/QuoteService/QuoteService";
import { inputCls, labelCls } from "@/components/common/ui";
import { apiError } from "@/lib/apiClient";
import { formatDate } from "@/lib/utils";
import { BILLING_CYCLES } from "@/lib/crm";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The last day of a period of `months` starting on `start` (yyyy-mm-dd).
export function periodEnd(start, cycle) {
  const months = BILLING_CYCLES.find((c) => c.value === cycle)?.months ?? 12;
  const [y, m, d] = start.split("-").map(Number);
  const end = new Date(y, m - 1 + months, d);
  end.setDate(end.getDate() - 1);
  return ymd(end);
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-lg p-5`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const btnSecondary = "rounded-lg border border-gray-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800";

export function RemindModal({ sub, onClose, onSent }) {
  const [channel, setChannel] = useState(sub.email ? "EMAIL" : "WHATSAPP");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try { await SubscriptionService.remind(sub.subscriptionId, { channel, message: message.trim() || null }); onSent(); }
    catch (err) { setError(apiError(err, "Failed to send the reminder.")); setBusy(false); }
  };

  return (
    <Modal title="Send Renewal Reminder" onClose={onClose}>
      <form onSubmit={send} className="space-y-3">
        {error && <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
        <p className="text-sm text-gray-600 dark:text-gray-300">{sub.description} · ends {formatDate(sub.endDate)}</p>
        <div className="flex gap-2">
          {[["EMAIL", `Email${sub.email ? ` (${sub.email})` : ""}`], ["WHATSAPP", "WhatsApp"]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setChannel(v)}
              className={`rounded-full px-3 py-1 text-xs font-medium border ${channel === v ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 dark:border-slate-700 text-gray-700 dark:text-gray-200"}`}>{l}</button>
          ))}
        </div>
        <div>
          <label className={labelCls}>Message</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={2000} className={inputCls}
            placeholder="Leave empty to send the standard reminder with the renewal amount." />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CancelSubscriptionModal({ sub, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirm = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { onDone(await SubscriptionService.cancel(sub.subscriptionId, reason.trim())); }
    catch (err) { setError(apiError(err, "Failed to cancel.")); setBusy(false); }
  };

  return (
    <Modal title="Cancel Subscription" onClose={onClose}>
      <form onSubmit={confirm} className="space-y-3">
        {error && <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
        <p className="text-sm text-gray-600 dark:text-gray-300">
          <b className="text-gray-900 dark:text-white">{sub.description}</b> stops renewing and no longer counts in recurring revenue. Invoices already made are not changed.
        </p>
        <div>
          <label className={labelCls}>Reason *</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={500} className={inputCls} placeholder="e.g. Customer moved to another system" />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>Back</button>
          <button type="submit" disabled={busy || !reason.trim()} className="rounded-lg bg-red-600 hover:bg-red-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-60">Cancel Subscription</button>
        </div>
      </form>
    </Modal>
  );
}
