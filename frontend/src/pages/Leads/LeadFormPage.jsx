import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Search, User } from "lucide-react";
import { LeadService } from "@/ServiceLayer/LeadService/LeadService";
import { CustomerService } from "@/ServiceLayer/WhatsAppService/WhatsAppService";
import { StaffService } from "@/ServiceLayer/AuthService/AuthService";
import { ProductService, AccountService } from "@/ServiceLayer/CatalogService/CatalogService";
import { useAuth } from "@/context/AuthContext";
import { Alerts, Breadcrumb, inputCls, labelCls } from "@/components/common/ui";
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

const card = "bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm";
const sectionCls = "text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 pb-1 border-b border-gray-100 dark:border-slate-800";

function Field({ label, span, required, children }) {
  return (
    <div className={span === 2 ? "md:col-span-2" : span === 3 ? "md:col-span-3" : ""}>
      <label className={labelCls}>{label}{required && <span className="text-red-500">*</span>}</label>
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

export default function LeadFormPage() {
  const { id } = useParams();
  const editId = id ? Number(id) : null;
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [lead, setLead] = useState(null);
  const [form, setForm] = useState(empty);
  const [staff, setStaff] = useState([]);
  const [products, setProducts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [contactMode, setContactMode] = useState(params.get("customer") ? "existing" : "new");
  const [picked, setPicked] = useState(null);
  const [contact, setContact] = useState({ customerName: "", mobileNo: "", email: "", accountName: "" });
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [error, setError] = useState(location.state?.error ?? "");

  useEffect(() => {
    ProductService.getAll({ activeOnly: true }).then(setProducts).catch(() => {});
    if (isAdmin) StaffService.getAll().then((r) => setStaff(r.filter((s) => s.isActive === "T"))).catch(() => {});
    if (editId) return;
    AccountService.getAll({}).then(setAccounts).catch(() => {});
    const customerId = params.get("customer");
    if (customerId) {
      CustomerService.getAll({}).then((list) => {
        const c = list.find((x) => String(x.customerId) === customerId);
        if (c) setPicked(c); else setContactMode("new");
      }).catch(() => setContactMode("new"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!editId) return;
    LeadService.get(editId)
      .then((l) => { setLead(l); setForm(fromLead(l)); })
      .catch((err) => setError(err?.response?.status === 404 ? "Lead not found, or it is assigned to someone else." : "Failed to load lead."))
      .finally(() => setLoading(false));
  }, [editId]);

  useEffect(() => {
    if (editId || contactMode !== "existing" || picked || query.trim().length < 2) { setMatches([]); return; }
    const t = setTimeout(() => CustomerService.getAll({ search: query.trim() }).then((r) => setMatches(r.slice(0, 8))).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [query, contactMode, picked, editId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setC = (k) => (e) => setContact((c) => ({ ...c, [k]: e.target.value }));
  const toggleProduct = (pid) => setForm((f) => ({
    ...f, productIds: f.productIds.includes(pid) ? f.productIds.filter((x) => x !== pid) : [...f.productIds, pid],
  }));

  const byCategory = products.reduce((acc, p) => ({ ...acc, [p.category]: [...(acc[p.category] ?? []), p] }), {});
  const missing = (lead?.productIds ?? []).filter((pid) => !products.some((p) => p.productId === pid));

  const mobileDigits = contact.mobileNo.replace(/[^\d]/g, "");
  const contactMissing = touched && !editId && (contactMode === "existing" ? !picked : !mobileDigits && !contact.email.trim());
  const contactCls = `${inputCls} ${contactMissing ? "border-red-400 dark:border-red-500" : ""}`;

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setTouched(true);
    const payload = { ...form };
    Object.keys(payload).forEach((k) => { if (typeof payload[k] === "string" && !payload[k].trim()) payload[k] = null; });
    NUMBER_FIELDS.forEach((k) => { payload[k] = form[k] === "" ? null : Number(form[k]); });
    payload.productIds = [...form.productIds, ...missing.filter((pid) => !form.productIds.includes(pid))];

    if (!editId) {
      if (contactMode === "existing") {
        if (!picked) { setError("Choose a contact."); return; }
        payload.customerId = picked.customerId;
      } else {
        const email = contact.email.trim();
        if (!mobileDigits && !email) { setError("Enter a mobile number or an email ID."); return; }
        Object.assign(payload, {
          mobileNo: mobileDigits || null, email: email || null,
          customerName: contact.customerName.trim() || null, accountName: contact.accountName.trim() || null,
        });
      }
    }

    setSaving(true); setError("");
    try {
      const saved = editId ? await LeadService.update(editId, payload) : await LeadService.create(payload);
      navigate(`/leads/${saved.leadId}`, { state: { success: editId ? "Lead updated." : "Lead created." } });
    } catch (err) {
      setError(apiError(err, "Failed to save lead."));
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading...</div>;

  return (
    <div className="p-6 space-y-4">
      <Breadcrumb items={[{ label: "Leads", to: "/leads" }, ...(lead ? [{ label: lead.leadNo, to: `/leads/${lead.leadId}` }] : []), { label: editId ? "Edit" : "New Lead" }]} />
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{editId ? `Edit Lead${lead ? ` ${lead.leadNo}` : ""}` : "Create Lead"}</h1>
      <Alerts error={error} onClearError={() => setError("")} />

      {editId && !lead ? null : (
        <form onSubmit={submit} noValidate className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
          <div className={`${card} p-5 xl:col-span-2 space-y-6`}>
            <div>
              <h3 className={sectionCls}>Interested In</h3>
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
              <h3 className={sectionCls}>Requirement</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <Field label="Decision Maker">
                  <input value={form.decisionMaker} onChange={set("decisionMaker")} maxLength={150} className={inputCls} placeholder="e.g. Mr. Ahmed – CFO" />
                </Field>
                <Field label="Requirements / Notes" span={3}>
                  <textarea value={form.requirements} onChange={set("requirements")} rows={3} maxLength={2000} className={inputCls}
                    placeholder="Modules needed, integrations, reports, pain points..." />
                </Field>
              </div>
            </div>

            <div>
              <h3 className={sectionCls}>Lead</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Source" required><Select value={form.source} onChange={set("source")} options={LEAD_SOURCES} /></Field>
                <Field label="Priority"><Select value={form.priority} onChange={set("priority")} options={PRIORITIES} /></Field>
                {isAdmin && !editId && (
                  <Field label="Assign To">
                    <select value={form.assignedTo} onChange={set("assignedTo")} className={inputCls}>
                      <option value="">Unassigned</option>
                      {staff.map((s) => <option key={s.userId} value={s.userId}>{s.fullName}</option>)}
                    </select>
                  </Field>
                )}
              </div>
            </div>

            <div className="flex justify-center gap-2 pt-2">
              <button type="button" onClick={() => navigate(editId ? `/leads/${editId}` : "/leads")} className="rounded-lg border border-gray-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-60">
                {saving ? "Saving..." : editId ? "Update Lead" : "Save Lead"}
              </button>
            </div>
          </div>

          <div className={`${card} p-5 min-h-[20rem]`}>
            <div className="flex items-center gap-2 mb-4">
              <User className="h-5 w-5 text-gray-400" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Contact</h2>
            </div>

            {editId ? (
              <div className="space-y-2 text-sm">
                <div className="font-medium text-gray-900 dark:text-white">{displayName(lead) || "—"}</div>
                {lead.accountName && <div className="text-gray-600 dark:text-gray-300">{lead.accountName}</div>}
                {lead.mobileNo && <div className="text-gray-500 dark:text-gray-400">+{lead.mobileNo}</div>}
                {lead.email && <div className="text-gray-500 dark:text-gray-400">{lead.email}</div>}
                <p className="pt-2 text-xs text-gray-400">
                  To change the contact details, edit the contact on the <Link to={`/customers`} className="text-blue-600 hover:underline">Contacts</Link> page.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  {["new", "existing"].map((m) => (
                    <label key={m} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input type="radio" checked={contactMode === m} onChange={() => setContactMode(m)} />
                      {m === "new" ? "New contact" : "Existing contact"}
                    </label>
                  ))}
                </div>

                {contactMode === "new" ? (
                  <div className="space-y-4">
                    <Field label="Name"><input value={contact.customerName} onChange={setC("customerName")} maxLength={150} className={inputCls} /></Field>
                    <Field label="Company">
                      <input value={contact.accountName} onChange={setC("accountName")} list="lead-accounts" maxLength={200} className={inputCls} placeholder="New or existing customer" />
                      <datalist id="lead-accounts">{accounts.map((a) => <option key={a.accountId} value={a.accountName} />)}</datalist>
                    </Field>
                    <Field label="Mobile No">
                      <input value={contact.mobileNo} onChange={setC("mobileNo")} className={contactCls} placeholder="e.g. 971501234567" />
                    </Field>
                    <Field label="Email ID"><input type="email" value={contact.email} onChange={setC("email")} maxLength={150} className={contactCls} /></Field>
                    {contactMissing && <p className="text-xs text-red-500">Enter a mobile number or an email ID</p>}
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      If this mobile or email already belongs to a contact, the lead is added to that contact. A customer with the same name is reused.
                    </p>
                  </div>
                ) : picked ? (
                  <div className="flex items-start justify-between gap-2 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 px-4 py-3">
                    <div className="text-sm min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white">{displayName(picked)}</div>
                      {picked.accountName && <div className="text-gray-700 dark:text-gray-300">{picked.accountName}</div>}
                      <div className="text-gray-500 dark:text-gray-400 truncate">{[picked.mobileNo && `+${picked.mobileNo}`, picked.email].filter(Boolean).join(" · ")}</div>
                    </div>
                    <button type="button" onClick={() => { setPicked(null); setQuery(""); }} className="text-xs font-medium text-blue-600 hover:underline">Change</button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, company, mobile or email..." className={`${contactCls} pl-9`} />
                    {contactMissing && <p className="mt-1 text-xs text-red-500">Choose a contact</p>}
                    {matches.length > 0 && (
                      <ul className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg max-h-64 overflow-y-auto">
                        {matches.map((c) => (
                          <li key={c.customerId}>
                            <button type="button" onClick={() => setPicked(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800">
                              <span className="font-medium text-gray-900 dark:text-white">{displayName(c)}</span>
                              {c.accountName && <span className="text-gray-700 dark:text-gray-300"> · {c.accountName}</span>}
                              <span className="block text-xs text-gray-500 dark:text-gray-400">{[c.mobileNo && `+${c.mobileNo}`, c.email].filter(Boolean).join(" · ")}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
