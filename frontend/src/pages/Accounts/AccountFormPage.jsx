import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Users, Plus, Pencil, X, Mail, Phone } from "lucide-react";
import { AccountService } from "@/ServiceLayer/CatalogService/CatalogService";
import { CustomerService } from "@/ServiceLayer/WhatsAppService/WhatsAppService";
import { Alerts, Breadcrumb, inputCls, labelCls } from "@/components/common/ui";
import { apiError } from "@/lib/apiClient";
import { COMPANY_SIZES, COUNTRIES, INDUSTRIES } from "@/lib/crm";

const emptyForm = {
  accountName: "", email: "", industry: "", otherIndustry: "", trn: "", groupName: "", phone: "", website: "",
  country: "United Arab Emirates", state: "", city: "", address: "", invoiceAddress: "", deliveryAddress: "",
  companySize: "", notes: "",
};

const REQUIRED = {
  accountName: "Company name", email: "Email ID", industry: "Nature of business", trn: "VAT/GST/TAX No",
  groupName: "Group of company", phone: "Phone number", website: "Website URL", country: "Country", state: "State",
  city: "City", address: "Communication address", invoiceAddress: "Invoice address", deliveryAddress: "Delivery address",
};

const emptyContact = { customerName: "", mobileNo: "", email: "", jobTitle: "" };

export default function AccountFormPage() {
  const { id } = useParams();
  const editId = id ? Number(id) : null;
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState(emptyForm);
  const [touched, setTouched] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactForm, setContactForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [success, setSuccess] = useState(location.state?.success ?? "");
  const [error, setError] = useState(location.state?.error ?? "");

  useEffect(() => {
    if (!editId) return;
    AccountService.get(editId)
      .then(({ account, contacts: list }) => {
        setForm(Object.fromEntries(Object.keys(emptyForm).map((k) => [k, account[k] ?? ""])));
        setContacts(list.map((c) => ({ key: `c${c.customerId}`, customerId: c.customerId, ...pick(c) })));
      })
      .catch(() => setError("Failed to load customer."))
      .finally(() => setLoading(false));
  }, [editId]);

  const pick = (c) => ({
    customerName: c.customerName ?? "", mobileNo: c.mobileNo ?? "", email: c.email ?? "", jobTitle: c.jobTitle ?? "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setC = (k) => (e) => setContactForm((f) => ({ ...f, [k]: e.target.value }));
  const missing = (k) => touched && REQUIRED[k] && !form[k].trim();
  const fieldCls = (k) => `${inputCls} ${missing(k) ? "border-red-400 dark:border-red-500" : ""}`;
  const Req = ({ k, label, hint }) => (
    <label className={labelCls}>
      {label}{hint && <span className="font-normal text-gray-500 dark:text-gray-400"> {hint}</span>}
      {REQUIRED[k] && <span className="text-red-500">*</span>}
    </label>
  );
  const Err = ({ k }) => (missing(k) ? <p className="mt-1 text-xs text-red-500">{REQUIRED[k]} is required</p> : null);

  const validateForm = () => {
    setTouched(true);
    const first = Object.keys(REQUIRED).find((k) => !form[k].trim());
    if (first) { setError(`${REQUIRED[first]} is required.`); return false; }
    return true;
  };

  const saveAccount = async () => {
    const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]));
    try {
      if (editId) { await AccountService.update(editId, payload); return editId; }
      return (await AccountService.create(payload)).accountId;
    } catch (err) {
      setError(apiError(err, "Failed to save customer."));
      return null;
    }
  };

  const saveContact = async () => {
    if (saving) return;
    const mobileNo = contactForm.mobileNo.replace(/[^\d]/g, "");
    const email = contactForm.email.trim();
    if (!mobileNo && !email) { setError("Enter a mobile number or an email ID for the contact."); return; }
    if (mobileNo && (mobileNo.length < 8 || mobileNo.length > 15)) { setError("Contact mobile must be 8-15 digits with country code."); return; }
    if (!editId && !validateForm()) return;
    setSaving(true); setError("");
    const accountId = editId ?? (await saveAccount());
    if (!accountId) { setSaving(false); return; }
    const body = {
      mobileNo: mobileNo || null, customerName: contactForm.customerName.trim() || null,
      email: email || null, jobTitle: contactForm.jobTitle.trim() || null, accountId,
    };
    try {
      const row = contactForm.customerId
        ? await CustomerService.update(contactForm.customerId, body)
        : await CustomerService.create(body);
      if (!editId) {
        navigate(`/accounts/${accountId}/edit`, { replace: true, state: { success: "Customer and contact saved." } });
        return;
      }
      const item = { key: `c${row.customerId}`, customerId: row.customerId, ...pick(row) };
      setContacts((cs) => (contactForm.customerId ? cs.map((c) => (c.customerId === row.customerId ? item : c)) : [...cs, item]));
      setContactForm(null);
      setSuccess("Contact saved.");
    } catch (err) {
      const msg = apiError(err, "Failed to save contact.");
      if (!editId) navigate(`/accounts/${accountId}/edit`, { replace: true, state: { error: `Customer saved, but the contact failed - ${msg}` } });
      else setError(msg);
    } finally { setSaving(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving || !validateForm()) return;
    setSaving(true); setError("");
    const accountId = await saveAccount();
    setSaving(false);
    if (accountId) navigate("/accounts");
  };

  if (loading) return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading...</div>;

  const card = "bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm";

  return (
    <div className="p-6 space-y-4">
      <Breadcrumb items={[{ label: "Customers", to: "/accounts" }, { label: editId ? "Edit Customer" : "New Customer" }]} />
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{editId ? "Edit Customer" : "Create Customer"}</h1>
      <Alerts success={success} error={error} onClearSuccess={() => setSuccess("")} onClearError={() => setError("")} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <form onSubmit={submit} noValidate className={`${card} p-5 xl:col-span-2`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Req k="accountName" label="Company / Customer Name" />
              <input value={form.accountName} onChange={set("accountName")} maxLength={200} className={fieldCls("accountName")} placeholder="Company name / Your name (If you are individual)" />
              <Err k="accountName" />
            </div>
            <div>
              <Req k="email" label="Email ID" />
              <input type="email" value={form.email} onChange={set("email")} maxLength={150} className={fieldCls("email")} placeholder="Enter your email ID" />
              <Err k="email" />
            </div>
            <div>
              <Req k="industry" label="Select Nature Of Business" hint="(Primary)" />
              <select value={form.industry} onChange={set("industry")} className={fieldCls("industry")}>
                <option value="">Select nature of business</option>
                {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
              <Err k="industry" />
            </div>
            <div>
              <Req k="otherIndustry" label="Select Other Nature Of Business" />
              <select value={form.otherIndustry} onChange={set("otherIndustry")} className={inputCls}>
                <option value="">Select other nature of business</option>
                {INDUSTRIES.filter((i) => i !== form.industry).map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <Req k="trn" label="VAT/GST/TAX No" />
              <input value={form.trn} onChange={set("trn")} maxLength={20} className={fieldCls("trn")} placeholder="Enter VAT/GST/TAX No" />
              <Err k="trn" />
            </div>
            <div>
              <Req k="groupName" label="Group of Company" />
              <input value={form.groupName} onChange={set("groupName")} maxLength={200} className={fieldCls("groupName")} placeholder="Enter Group Name" />
              <Err k="groupName" />
            </div>
            <div>
              <Req k="phone" label="Phone Number" />
              <input value={form.phone} onChange={set("phone")} maxLength={30} className={fieldCls("phone")} placeholder="e.g. +971XXXXXXXXX" />
              <Err k="phone" />
            </div>
            <div>
              <Req k="website" label="Website URL" />
              <input value={form.website} onChange={set("website")} maxLength={200} className={fieldCls("website")} placeholder="Enter your website URL" />
              <Err k="website" />
            </div>
            <div>
              <label className={labelCls}>Company Size</label>
              <select value={form.companySize} onChange={set("companySize")} className={inputCls}>
                <option value="">Select company size</option>
                {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s} employees</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div>
              <Req k="country" label="Select Country" />
              <select value={form.country} onChange={set("country")} className={fieldCls("country")}>
                <option value="">Select country...</option>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <Err k="country" />
            </div>
            <div>
              <Req k="state" label="State" />
              <input value={form.state} onChange={set("state")} maxLength={100} className={fieldCls("state")} placeholder="Enter State Name" />
              <Err k="state" />
            </div>
            <div>
              <Req k="city" label="City" />
              <input value={form.city} onChange={set("city")} maxLength={100} className={fieldCls("city")} placeholder="Enter City Name" />
              <Err k="city" />
            </div>
            <div>
              <Req k="address" label="Communication Address" />
              <textarea value={form.address} onChange={set("address")} rows={2} maxLength={500} className={fieldCls("address")} placeholder="Communication Address" />
              <Err k="address" />
            </div>
            <div>
              <Req k="invoiceAddress" label="Invoice Address" />
              <textarea value={form.invoiceAddress} onChange={set("invoiceAddress")} rows={2} maxLength={500} className={fieldCls("invoiceAddress")} placeholder="Invoice Address" />
              <Err k="invoiceAddress" />
            </div>
            <div>
              <Req k="deliveryAddress" label="Delivery Address" />
              <textarea value={form.deliveryAddress} onChange={set("deliveryAddress")} rows={2} maxLength={500} className={fieldCls("deliveryAddress")} placeholder="Delivery Address" />
              <Err k="deliveryAddress" />
            </div>
            <div className="md:col-span-3">
              <label className={labelCls}>Notes</label>
              <textarea value={form.notes} onChange={set("notes")} rows={2} maxLength={2000} className={inputCls} />
            </div>
          </div>

          <div className="flex justify-center gap-2 mt-6">
            <button type="button" onClick={() => navigate("/accounts")} className="rounded-lg border border-gray-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-60">
              {saving ? "Saving..." : editId ? "Update Customer" : "Save Customer"}
            </button>
          </div>
        </form>

        <div className={`${card} p-5 flex flex-col min-h-[24rem]`}>
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-5 w-5 text-gray-400" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Contacts</h2>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto max-h-[28rem]">
            {contacts.length === 0 && !contactForm && (
              <p className="text-sm text-gray-400 py-6 text-center">No contacts yet.</p>
            )}
            {contacts.map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-2 rounded-lg border border-gray-200 dark:border-slate-700 p-3">
                <div className="min-w-0 text-sm">
                  <div className="font-medium text-gray-900 dark:text-white truncate">
                    {c.customerName || c.email || c.mobileNo}
                  </div>
                  {c.jobTitle && <div className="text-xs text-gray-500 dark:text-gray-400">{c.jobTitle}</div>}
                  {c.mobileNo && <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><Phone className="h-3 w-3" />{c.mobileNo}</div>}
                  {c.email && <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 truncate"><Mail className="h-3 w-3" />{c.email}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => setContactForm(c)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-blue-600" title="Edit"><Pencil className="h-4 w-4" /></button>
                </div>
              </div>
            ))}

            {contactForm && (
              <div className="rounded-lg border border-blue-300 dark:border-blue-800 p-3 space-y-3">
                <div>
                  <label className={labelCls}>Name</label>
                  <input value={contactForm.customerName} onChange={setC("customerName")} maxLength={150} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Job Title</label>
                  <input value={contactForm.jobTitle} onChange={setC("jobTitle")} maxLength={100} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Mobile (with country code)</label>
                  <input value={contactForm.mobileNo} onChange={setC("mobileNo")} maxLength={20} className={inputCls} placeholder="971501234567" />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input type="email" value={contactForm.email} onChange={setC("email")} maxLength={150} className={inputCls} />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setContactForm(null)} className="rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Cancel</button>
                  <button type="button" onClick={saveContact} disabled={saving} className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
                </div>
              </div>
            )}
          </div>

          {!contactForm && (
            <div className="flex justify-center pt-4">
              <button type="button" onClick={() => setContactForm({ ...emptyContact })} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium">
                <Plus className="h-4 w-4" /> Add Contact
              </button>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}
