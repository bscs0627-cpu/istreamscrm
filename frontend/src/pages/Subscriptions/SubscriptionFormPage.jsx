import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Search, User } from "lucide-react";
import { SubscriptionService } from "@/ServiceLayer/QuoteService/QuoteService";
import { LeadService } from "@/ServiceLayer/LeadService/LeadService";
import { ProductService } from "@/ServiceLayer/CatalogService/CatalogService";
import { Alerts, Breadcrumb, inputCls, labelCls } from "@/components/common/ui";
import { apiError } from "@/lib/apiClient";
import { displayName } from "@/lib/time";
import { toInputDate } from "@/lib/utils";
import { BILLING_CYCLES, UNITS, formatAed, quoteLine } from "@/lib/crm";
import { periodEnd } from "./SubscriptionDialogs";

const card = "bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm";
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const fromSub = (sub) => ({
  productId: sub.productId ? String(sub.productId) : "", description: sub.description, unit: sub.unit ?? "",
  quantity: String(sub.quantity), unitPrice: String(sub.unitPrice), discountPct: String(sub.discountPct), vatPct: String(sub.vatPct),
  billingCycle: sub.billingCycle, startDate: toInputDate(sub.startDate), endDate: toInputDate(sub.endDate), autoRenew: sub.autoRenew, notes: sub.notes ?? "",
});

const blank = () => {
  const today = ymd(new Date());
  return {
    productId: "", description: "", unit: "PER_YEAR", quantity: "1", unitPrice: "", discountPct: "0", vatPct: "5",
    billingCycle: "YEARLY", startDate: today, endDate: periodEnd(today, "YEARLY"), autoRenew: "T", notes: "",
  };
};

const REQUIRED = { description: "Description", quantity: "Quantity", unitPrice: "Price per cycle", startDate: "Start date", endDate: "Paid up to" };

export default function SubscriptionFormPage() {
  const { id } = useParams();
  const editId = id ? Number(id) : null;
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const leadParam = params.get("lead");
  const [sub, setSub] = useState(null);
  const [lead, setLead] = useState(null);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(blank);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId || !!leadParam);
  const [error, setError] = useState("");
  const back = location.state?.from ?? (leadParam ? `/leads/${leadParam}` : "/subscriptions");

  useEffect(() => { ProductService.getAll({ activeOnly: true }).then(setProducts).catch(() => {}); }, []);

  useEffect(() => {
    if (editId) {
      SubscriptionService.getAll({})
        .then((rows) => {
          const s = rows.find((x) => x.subscriptionId === editId);
          if (!s) { setError("Subscription not found, or it belongs to someone else."); return; }
          setSub(s); setForm(fromSub(s));
        })
        .catch(() => setError("Failed to load the subscription."))
        .finally(() => setLoading(false));
    } else if (leadParam) {
      LeadService.get(leadParam).then(setLead).catch(() => setError("Lead not found.")).finally(() => setLoading(false));
    }
  }, [editId, leadParam]);

  useEffect(() => {
    if (editId || lead || search.trim().length < 2) { setMatches([]); return; }
    const t = setTimeout(() => LeadService.getAll({ view: "open", search: search.trim() }).then((r) => setMatches(r.slice(0, 8))).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [search, lead, editId]);

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

  const missing = (k) => touched && !String(form[k]).trim();
  const fieldCls = (k) => `${inputCls} ${missing(k) ? "border-red-400 dark:border-red-500" : ""}`;
  const Req = ({ k, label }) => <label className={labelCls}>{label}{REQUIRED[k] && <span className="text-red-500">*</span>}</label>;
  const Err = ({ k }) => (missing(k) ? <p className="mt-1 text-xs text-red-500">{REQUIRED[k]} is required</p> : null);
  const leadMissing = touched && !editId && !lead;
  const amount = quoteLine({ quantity: form.quantity, unitPrice: form.unitPrice, discountPct: form.discountPct, vatPct: form.vatPct });

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setTouched(true);
    if (!editId && !lead) { setError("Choose the lead this subscription is for."); return; }
    const first = Object.keys(REQUIRED).find((k) => !String(form[k]).trim());
    if (first) { setError(`${REQUIRED[first]} is required.`); return; }
    setSaving(true); setError("");
    const payload = {
      leadId: sub?.leadId ?? lead.leadId, productId: form.productId ? Number(form.productId) : null, description: form.description.trim(),
      unit: form.unit || null, quantity: Number(form.quantity), unitPrice: Number(form.unitPrice || 0), discountPct: Number(form.discountPct || 0),
      vatPct: Number(form.vatPct || 0), billingCycle: form.billingCycle, startDate: form.startDate, endDate: form.endDate,
      autoRenew: form.autoRenew, notes: form.notes.trim() || null,
    };
    try {
      if (editId) await SubscriptionService.update(editId, payload); else await SubscriptionService.create(payload);
      navigate(back, { state: { success: editId ? "Subscription saved." : "Subscription added." } });
    } catch (err) {
      setError(apiError(err, "Failed to save the subscription."));
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading...</div>;

  const contact = editId ? sub : lead;

  return (
    <div className="p-6 space-y-4">
      <Breadcrumb items={[{ label: "Subscriptions", to: "/subscriptions" }, { label: editId ? "Edit Subscription" : "New Subscription" }]} />
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{editId ? "Edit Subscription" : "Create Subscription"}</h1>
      <Alerts error={error} onClearError={() => setError("")} />

      {editId && !sub ? null : (
        <form onSubmit={submit} noValidate className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
          <div className={`${card} p-5 xl:col-span-2 space-y-4`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelCls}>Product</label>
                <select value={form.productId} onChange={pickProduct} className={inputCls}>
                  <option value="">— Not from the price list —</option>
                  {products.map((p) => <option key={p.productId} value={p.productId}>{p.productCode} · {p.productName} ({formatAed(p.price)})</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <Req k="description" label="Description" />
                <input value={form.description} onChange={set("description")} maxLength={500} className={fieldCls("description")} placeholder="e.g. iStreams HRMS Cloud – 25 users" />
                <Err k="description" />
              </div>
              <div>
                <label className={labelCls}>Billing Cycle<span className="text-red-500">*</span></label>
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
              <div>
                <Req k="quantity" label="Quantity" />
                <input type="number" min="0.01" step="0.01" value={form.quantity} onChange={set("quantity")} className={fieldCls("quantity")} />
                <Err k="quantity" />
              </div>
              <div>
                <Req k="unitPrice" label="Price per cycle" />
                <input type="number" min="0" step="0.01" value={form.unitPrice} onChange={set("unitPrice")} className={fieldCls("unitPrice")} />
                <Err k="unitPrice" />
              </div>
              <div>
                <label className={labelCls}>Discount %</label>
                <input type="number" min="0" max="100" step="0.01" value={form.discountPct} onChange={set("discountPct")} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>VAT %</label>
                <input type="number" min="0" max="100" step="0.01" value={form.vatPct} onChange={set("vatPct")} className={inputCls} />
              </div>
              <div>
                <Req k="startDate" label="Start Date" />
                <input type="date" value={form.startDate} onChange={setStart} className={fieldCls("startDate")} />
                <Err k="startDate" />
              </div>
              <div>
                <Req k="endDate" label="Paid Up To" />
                <input type="date" value={form.endDate} min={form.startDate} onChange={set("endDate")} className={fieldCls("endDate")} />
                <Err k="endDate" />
              </div>
              <label className="md:col-span-2 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={form.autoRenew === "T"} onChange={(e) => setForm((f) => ({ ...f, autoRenew: e.target.checked ? "T" : "F" }))} />
                Auto-renew — draft the renewal invoice before it ends (7 / 15 / 30 days ahead) and remind the agent
              </label>
              <div className="md:col-span-2">
                <label className={labelCls}>Notes</label>
                <textarea value={form.notes} onChange={set("notes")} rows={3} maxLength={1000} className={inputCls} />
              </div>
            </div>

            <div className="text-sm text-gray-500 dark:text-gray-400">Per cycle: <b className="text-gray-900 dark:text-white">{formatAed(amount.net)}</b> + VAT</div>

            <div className="flex justify-center gap-2 pt-2">
              <button type="button" onClick={() => navigate(back)} className="rounded-lg border border-gray-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-60">
                {saving ? "Saving..." : editId ? "Update Subscription" : "Save Subscription"}
              </button>
            </div>
          </div>

          <div className={`${card} p-5 min-h-[16rem]`}>
            <div className="flex items-center gap-2 mb-4">
              <User className="h-5 w-5 text-gray-400" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Customer<span className="text-red-500">*</span></h2>
            </div>

            {contact ? (
              <div className="flex items-start justify-between gap-2 rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-3">
                <div className="min-w-0 text-sm">
                  <div className="font-medium text-gray-900 dark:text-white">{contact.accountName || displayName(contact) || "—"}</div>
                  {contact.accountName && displayName(contact) && <div className="text-gray-700 dark:text-gray-300">{displayName(contact)}</div>}
                  {contact.mobileNo && <div className="text-gray-500 dark:text-gray-400">+{contact.mobileNo}</div>}
                  {contact.email && <div className="text-gray-500 dark:text-gray-400 break-all">{contact.email}</div>}
                  <div className="pt-1"><Link to={`/leads/${contact.leadId}`} className="text-blue-600 hover:underline">{contact.leadNo}</Link></div>
                </div>
                {!editId && !leadParam && <button type="button" onClick={() => setLead(null)} className="text-xs font-medium text-blue-600 hover:underline">Change</button>}
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a lead: no, name, company, mobile..."
                  className={`${inputCls} pl-9 ${leadMissing ? "border-red-400 dark:border-red-500" : ""}`} />
                {leadMissing && <p className="mt-1 text-xs text-red-500">Choose the lead this subscription is for</p>}
                {matches.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
                    {matches.map((l) => (
                      <li key={l.leadId}>
                        <button type="button" onClick={() => setLead(l)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800">
                          <span className="font-medium text-gray-900 dark:text-white">{l.accountName || displayName(l) || "—"}</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">{[l.leadNo, l.accountName && displayName(l)].filter(Boolean).join(" · ")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
