import { useEffect, useState } from "react";
import { X, Loader2, Send } from "lucide-react";
import { SubscriptionService } from "@/ServiceLayer/QuoteService/QuoteService";
import { ProductService } from "@/ServiceLayer/CatalogService/CatalogService";
import { inputCls, labelCls } from "@/components/common/ui";
import { apiError } from "@/lib/apiClient";
import { formatDate, toInputDate } from "@/lib/utils";
import { BILLING_CYCLES, UNITS, formatAed, quoteLine } from "@/lib/crm";

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

// Add (with leadId) or edit (with sub) a subscription.
export function SubscriptionFormModal({ sub, leadId, onClose, onSaved }) {
  const today = ymd(new Date());
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(() => sub ? {
    productId: sub.productId ? String(sub.productId) : "", description: sub.description, unit: sub.unit ?? "",
    quantity: String(sub.quantity), unitPrice: String(sub.unitPrice), discountPct: String(sub.discountPct), vatPct: String(sub.vatPct),
    billingCycle: sub.billingCycle, startDate: toInputDate(sub.startDate), endDate: toInputDate(sub.endDate), autoRenew: sub.autoRenew, notes: sub.notes ?? "",
  } : {
    productId: "", description: "", unit: "PER_YEAR", quantity: "1", unitPrice: "", discountPct: "0", vatPct: "5",
    billingCycle: "YEARLY", startDate: today, endDate: periodEnd(today, "YEARLY"), autoRenew: "T", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { ProductService.getAll({ activeOnly: true }).then(setProducts).catch(() => {}); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setCycle = (e) => {
    const billingCycle = e.target.value;
    setForm((f) => ({ ...f, billingCycle, endDate: f.startDate ? periodEnd(f.startDate, billingCycle) : f.endDate }));
  };
  const setStart = (e) => {
    const startDate = e.target.value;
    setForm((f) => ({ ...f, startDate, endDate: sub || !startDate ? f.endDate : periodEnd(startDate, f.billingCycle) }));
  };
  const pickProduct = (e) => {
    const p = products.find((x) => String(x.productId) === e.target.value);
    setForm((f) => p ? {
      ...f, productId: String(p.productId), description: p.productName, unit: p.unit ?? f.unit, unitPrice: String(p.price), vatPct: String(p.vatPct),
      billingCycle: ["PER_USER_MONTH", "PER_MONTH"].includes(p.unit) ? "MONTHLY" : f.billingCycle,
    } : { ...f, productId: "" });
  };

  const amount = quoteLine({ quantity: form.quantity, unitPrice: form.unitPrice, discountPct: form.discountPct, vatPct: form.vatPct });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      leadId: sub?.leadId ?? leadId, productId: form.productId ? Number(form.productId) : null, description: form.description,
      unit: form.unit || null, quantity: Number(form.quantity), unitPrice: Number(form.unitPrice || 0), discountPct: Number(form.discountPct || 0),
      vatPct: Number(form.vatPct || 0), billingCycle: form.billingCycle, startDate: form.startDate, endDate: form.endDate,
      autoRenew: form.autoRenew, notes: form.notes || null,
    };
    try { onSaved(sub ? await SubscriptionService.update(sub.subscriptionId, payload) : await SubscriptionService.create(payload)); }
    catch (err) { setError(apiError(err, "Failed to save the subscription.")); setBusy(false); }
  };

  return (
    <Modal title={sub ? "Edit Subscription" : "Add Subscription"} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-3">
        {error && <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className={labelCls}>Product</label>
            <select value={form.productId} onChange={pickProduct} className={inputCls}>
              <option value="">— Not from the price list —</option>
              {products.map((p) => <option key={p.productId} value={p.productId}>{p.productCode} · {p.productName} ({formatAed(p.price)})</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Description *</label>
            <input value={form.description} onChange={set("description")} maxLength={500} required className={inputCls} placeholder="e.g. iStreams HRMS Cloud – 25 users" />
          </div>
          <div>
            <label className={labelCls}>Billing Cycle *</label>
            <select value={form.billingCycle} onChange={setCycle} className={inputCls}>
              {BILLING_CYCLES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Unit</label>
            <select value={form.unit} onChange={set("unit")} className={inputCls}>
              <option value="">—</option>
              {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Quantity *</label><input type="number" min="0.01" step="0.01" value={form.quantity} onChange={set("quantity")} required className={inputCls} /></div>
            <div><label className={labelCls}>Price per cycle *</label><input type="number" min="0" step="0.01" value={form.unitPrice} onChange={set("unitPrice")} required className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Discount %</label><input type="number" min="0" max="100" step="0.01" value={form.discountPct} onChange={set("discountPct")} className={inputCls} /></div>
            <div><label className={labelCls}>VAT %</label><input type="number" min="0" max="100" step="0.01" value={form.vatPct} onChange={set("vatPct")} className={inputCls} /></div>
          </div>
          <div><label className={labelCls}>Start Date *</label><input type="date" value={form.startDate} onChange={setStart} required className={inputCls} /></div>
          <div><label className={labelCls}>Paid Up To *</label><input type="date" value={form.endDate} min={form.startDate} onChange={set("endDate")} required className={inputCls} /></div>
          <label className="md:col-span-2 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={form.autoRenew === "T"} onChange={(e) => setForm((f) => ({ ...f, autoRenew: e.target.checked ? "T" : "F" }))} />
            Auto-renew — draft the renewal invoice before it ends (7 / 15 / 30 days ahead) and remind the agent
          </label>
          <div className="md:col-span-2">
            <label className={labelCls}>Notes</label>
            <textarea value={form.notes} onChange={set("notes")} rows={2} maxLength={1000} className={inputCls} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Per cycle: <b className="text-gray-900 dark:text-white">{formatAed(amount.net)}</b> + VAT</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

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
