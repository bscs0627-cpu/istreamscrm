import { useEffect, useState } from "react";
import { X, Search } from "lucide-react";
import { LeadService } from "@/ServiceLayer/LeadService/LeadService";
import { CustomerService } from "@/ServiceLayer/WhatsAppService/WhatsAppService";
import { ProductService, AccountService } from "@/ServiceLayer/CatalogService/CatalogService";
import { inputCls, labelCls } from "@/components/common/ui";
import { apiError } from "@/lib/apiClient";
import { displayName } from "@/lib/time";
import { toInputDate } from "@/lib/utils";
import { LEAD_SOURCES, PRIORITIES, DEPLOYMENTS } from "@/lib/crm";

const empty = {
  title: "", source: "WHATSAPP", productIds: [], usersCount: "", deployment: "", currentSystem: "", budget: "",
  expectedValue: "", decisionDate: "", decisionMaker: "", requirements: "", priority: "WARM", assignedTo: "",
};

const NUMBER_FIELDS = ["usersCount", "budget", "expectedValue", "assignedTo"];

const fromLead = (l) => {
  const f = { ...empty };
  Object.keys(empty).forEach((k) => { if (l[k] !== null && l[k] !== undefined) f[k] = typeof l[k] === "number" ? String(l[k]) : l[k]; });
  f.productIds = l.productIds ?? [];
  f.decisionDate = toInputDate(l.decisionDate);
  return f;
};

function Field({ label, span, children }) {
  return (
    <div className={span === 2 ? "md:col-span-2" : span === 4 ? "md:col-span-2 lg:col-span-4" : ""}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function Select({ value, onChange, options, blank }) {
  return (
    <select value={value} onChange={onChange} className={inputCls}>
      {blank !== undefined && <option value="">{blank}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// lead: edit an existing lead. customer: pre-selected contact for a new lead (from the Contacts page).
export default function LeadForm({ lead, customer, staff, isAdmin, onSaved, onCancel, onError }) {
  const [form, setForm] = useState(() => (lead ? fromLead(lead) : empty));
  const [products, setProducts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [contactMode, setContactMode] = useState(customer ? "existing" : "new");
  const [picked, setPicked] = useState(customer ?? null);
  const [contact, setContact] = useState({ customerName: "", mobileNo: "", email: "", accountName: "" });
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ProductService.getAll({ activeOnly: true }).then(setProducts).catch(() => {});
    if (!lead) AccountService.getAll({}).then(setAccounts).catch(() => {});
  }, [lead]);

  useEffect(() => {
    if (lead || contactMode !== "existing" || picked || query.trim().length < 2) { setMatches([]); return; }
    const t = setTimeout(() => CustomerService.getAll({ search: query.trim() }).then((r) => setMatches(r.slice(0, 8))).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [query, contactMode, picked, lead]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setC = (k) => (e) => setContact((c) => ({ ...c, [k]: e.target.value }));
  const toggleProduct = (id) => setForm((f) => ({
    ...f, productIds: f.productIds.includes(id) ? f.productIds.filter((x) => x !== id) : [...f.productIds, id],
  }));

  // Grouped by category so a long price list stays readable.
  const byCategory = products.reduce((acc, p) => ({ ...acc, [p.category]: [...(acc[p.category] ?? []), p] }), {});
  // Inactive products already on this lead still show, so they are not silently dropped on save.
  const missing = (lead?.productIds ?? []).filter((id) => !products.some((p) => p.productId === id));

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const payload = { ...form };
    Object.keys(payload).forEach((k) => { if (typeof payload[k] === "string" && !payload[k].trim()) payload[k] = null; });
    NUMBER_FIELDS.forEach((k) => { payload[k] = form[k] === "" ? null : Number(form[k]); });
    payload.productIds = [...form.productIds, ...missing.filter((id) => !form.productIds.includes(id))];

    if (!lead) {
      if (contactMode === "existing") {
        if (!picked) { onError("Choose a contact."); return; }
        payload.customerId = picked.customerId;
      } else {
        const mobileNo = contact.mobileNo.replace(/[^\d]/g, "");
        const email = contact.email.trim();
        if (!mobileNo && !email) { onError("Enter a mobile number or an email ID."); return; }
        Object.assign(payload, {
          mobileNo: mobileNo || null, email: email || null,
          customerName: contact.customerName.trim() || null, accountName: contact.accountName.trim() || null,
        });
      }
    }

    setSaving(true);
    try {
      const saved = lead ? await LeadService.update(lead.leadId, payload) : await LeadService.create(payload);
      onSaved(saved);
    } catch (err) {
      onError(apiError(err, "Failed to save lead."));
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{lead ? `Edit ${lead.leadNo}` : "New Lead"}</h2>
        <button type="button" onClick={onCancel}><X className="h-5 w-5 text-gray-400 hover:text-gray-600" /></button>
      </div>

      {!lead && (
        <div>
          <div className="flex items-center gap-4 mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Contact</h3>
            {["new", "existing"].map((m) => (
              <label key={m} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="radio" checked={contactMode === m} onChange={() => setContactMode(m)} />
                {m === "new" ? "New contact" : "Existing contact"}
              </label>
            ))}
          </div>
          {contactMode === "new" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Name"><input value={contact.customerName} onChange={setC("customerName")} maxLength={150} className={inputCls} /></Field>
              <Field label="Company">
                <input value={contact.accountName} onChange={setC("accountName")} list="lead-accounts" maxLength={200} className={inputCls} placeholder="New or existing company" />
                <datalist id="lead-accounts">{accounts.map((a) => <option key={a.accountId} value={a.accountName} />)}</datalist>
              </Field>
              <Field label="Mobile No">
                <input value={contact.mobileNo} onChange={setC("mobileNo")} className={inputCls} placeholder="e.g. 971501234567" />
              </Field>
              <Field label="Email ID"><input type="email" value={contact.email} onChange={setC("email")} maxLength={150} className={inputCls} /></Field>
              <p className="md:col-span-2 lg:col-span-4 text-xs text-gray-500 dark:text-gray-400">
                If this mobile or email already belongs to a contact, the lead is added to that contact. A company with the same name is reused.
              </p>
            </div>
          ) : picked ? (
            <div className="flex items-center justify-between rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5">
              <div className="text-sm">
                <span className="font-medium text-gray-900 dark:text-white">{displayName(picked)}</span>
                {picked.accountName && <span className="text-gray-700 dark:text-gray-300"> · {picked.accountName}</span>}
                <span className="text-gray-500 dark:text-gray-400"> {[picked.mobileNo && `+${picked.mobileNo}`, picked.email].filter(Boolean).join(" · ")}</span>
              </div>
              <button type="button" onClick={() => { setPicked(null); setQuery(""); }} className="text-xs font-medium text-blue-600 hover:underline">Change</button>
            </div>
          ) : (
            <div className="relative max-w-lg">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, company, mobile or email (2+ characters)..." className={`${inputCls} pl-9`} />
              {matches.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg max-h-64 overflow-y-auto">
                  {matches.map((c) => (
                    <li key={c.customerId}>
                      <button type="button" onClick={() => setPicked(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800">
                        <span className="font-medium text-gray-900 dark:text-white">{displayName(c)}</span>
                        {c.accountName && <span className="text-gray-700 dark:text-gray-300"> · {c.accountName}</span>}
                        <span className="text-gray-500 dark:text-gray-400"> {[c.mobileNo && `+${c.mobileNo}`, c.email].filter(Boolean).join(" · ")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 pb-1 border-b border-gray-100 dark:border-slate-800">Interested In</h3>
        {products.length === 0 && missing.length === 0 ? (
          <p className="text-sm text-gray-400">No products yet. Add them on the Products page, or describe the need below.</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(byCategory).map(([cat, items]) => (
              <div key={cat} className="flex flex-wrap items-center gap-2">
                <span className="w-24 shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">{cat}</span>
                {items.map((p) => {
                  const on = form.productIds.includes(p.productId);
                  return (
                    <button type="button" key={p.productId} onClick={() => toggleProduct(p.productId)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${on
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-gray-300 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"}`}>
                      {p.productName}
                    </button>
                  );
                })}
              </div>
            ))}
            {missing.length > 0 && <p className="text-xs text-gray-400">Also on this lead: {lead.productNames} (some are now inactive).</p>}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 pb-1 border-b border-gray-100 dark:border-slate-800">Requirement</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Lead Title" span={2}>
            <input value={form.title} onChange={set("title")} maxLength={200} className={inputCls} placeholder="e.g. ERP + HRMS for 25 users" />
          </Field>
          <Field label="No. of Users">
            <input type="number" min="1" value={form.usersCount} onChange={set("usersCount")} className={inputCls} />
          </Field>
          <Field label="Deployment"><Select value={form.deployment} onChange={set("deployment")} options={DEPLOYMENTS} blank="—" /></Field>
          <Field label="Current System">
            <input value={form.currentSystem} onChange={set("currentSystem")} maxLength={150} className={inputCls} placeholder="e.g. Tally, Excel, SAP B1" />
          </Field>
          <Field label="Customer's Budget (AED)">
            <input type="number" min="0" value={form.budget} onChange={set("budget")} className={inputCls} />
          </Field>
          <Field label="Expected Deal Value (AED)">
            <input type="number" min="0" value={form.expectedValue} onChange={set("expectedValue")} className={inputCls} />
          </Field>
          <Field label="Decision Date">
            <input type="date" value={form.decisionDate} onChange={set("decisionDate")} className={inputCls} />
          </Field>
          <Field label="Decision Maker" span={2}>
            <input value={form.decisionMaker} onChange={set("decisionMaker")} maxLength={150} className={inputCls} placeholder="e.g. Mr. Ahmed – CFO" />
          </Field>
          <Field label="Requirements / Notes" span={4}>
            <textarea value={form.requirements} onChange={set("requirements")} rows={3} maxLength={2000} className={inputCls}
              placeholder="Modules needed, integrations, reports, pain points..." />
          </Field>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 pb-1 border-b border-gray-100 dark:border-slate-800">Lead</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Source *"><Select value={form.source} onChange={set("source")} options={LEAD_SOURCES} /></Field>
          <Field label="Priority"><Select value={form.priority} onChange={set("priority")} options={PRIORITIES} /></Field>
          {isAdmin && !lead && (
            <Field label="Assign To">
              <select value={form.assignedTo} onChange={set("assignedTo")} className={inputCls}>
                <option value="">Unassigned</option>
                {staff.map((s) => <option key={s.userId} value={s.userId}>{s.fullName}</option>)}
              </select>
            </Field>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Cancel</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-60">
          {saving ? "Saving..." : lead ? "Update" : "Create Lead"}
        </button>
      </div>
    </form>
  );
}
