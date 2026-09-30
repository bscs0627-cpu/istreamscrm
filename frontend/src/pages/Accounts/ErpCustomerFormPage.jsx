import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Database, Search } from "lucide-react";
import { ClientMasterService, ERP, clientError, extractClientId } from "@/ServiceLayer/ClientMasterService/ClientMasterService";
import { Alerts, Breadcrumb, inputCls, labelCls } from "@/components/common/ui";
import { COUNTRIES, INDUSTRIES } from "@/lib/crm";

const emptyForm = {
  clientName: "", emailAddress: "", natureOfBusiness: "", natureOfBusiness2: "", trnVatNo: "", groupName: "", telephoneNo: "",
  webAddress: "", country: "United Arab Emirates", stateName: "", cityName: "", communicationAddress: "", invoiceAddress: "",
  deliveryAddress: "", faxNo: "", creditDays: "", accountCode: "", refCode: "",
};

const REQUIRED = {
  clientName: "Company name", emailAddress: "Email ID", natureOfBusiness: "Nature of business", trnVatNo: "VAT/GST/TAX No",
  groupName: "Group of company", telephoneNo: "Phone number", webAddress: "Website URL", country: "Country", stateName: "State",
  cityName: "City", communicationAddress: "Communication address", invoiceAddress: "Invoice address", deliveryAddress: "Delivery address",
};

const card = "bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm";

export default function ErpCustomerFormPage() {
  const { clientId } = useParams();
  const editId = clientId ? Number(clientId) : null;
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState(emptyForm);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [lookup, setLookup] = useState("");
  const [fetching, setFetching] = useState(false);
  const [success, setSuccess] = useState(location.state?.success ?? "");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editId) return;
    ClientMasterService.search(editId)
      .then((c) => {
        if (!c) { setError(`Customer ${editId} was not found.`); return; }
        setForm(Object.fromEntries(Object.keys(emptyForm).map((k) => [k, c[k] === null || c[k] === undefined ? "" : String(c[k])])));
      })
      .catch((err) => setError(clientError(err, "Failed to load the customer.")))
      .finally(() => setLoading(false));
  }, [editId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const missing = (k) => touched && REQUIRED[k] && !form[k].trim();
  const fieldCls = (k) => `${inputCls} ${missing(k) ? "border-red-400 dark:border-red-500" : ""}`;
  const Req = ({ k, label, hint }) => (
    <label className={labelCls}>
      {label}{hint && <span className="font-normal text-gray-500 dark:text-gray-400"> {hint}</span>}
      {REQUIRED[k] && <span className="text-red-500">*</span>}
    </label>
  );
  const Err = ({ k }) => (missing(k) ? <p className="mt-1 text-xs text-red-500">{REQUIRED[k]} is required</p> : null);

  const fetchById = async (e) => {
    e.preventDefault();
    const id = Number(lookup);
    if (!id || fetching) return;
    setFetching(true); setError("");
    try {
      const c = await ClientMasterService.search(id);
      if (!c) { setError(`Customer ${id} was not found.`); return; }
      navigate(`/erp-customers/${id}/edit`);
    } catch (err) { setError(clientError(err, "Failed to fetch the customer.")); }
    finally { setFetching(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setTouched(true);
    const first = Object.keys(REQUIRED).find((k) => !form[k].trim());
    if (first) { setError(`${REQUIRED[first]} is required.`); return; }
    setSaving(true); setError("");
    const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]));
    payload.creditDays = form.creditDays.trim() === "" ? 0 : Number(form.creditDays);
    try {
      if (editId) {
        await ClientMasterService.update(editId, payload);
        setSuccess("Customer updated.");
        setSaving(false);
        return;
      }
      const id = extractClientId(await ClientMasterService.insert(payload));
      if (id) navigate(`/erp-customers/${id}/edit`, { replace: true, state: { success: `Customer saved with client ID ${id}.` } });
      else { setSuccess("Customer saved."); setForm(emptyForm); setTouched(false); setSaving(false); }
    } catch (err) {
      setError(clientError(err, "Failed to save the customer."));
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading...</div>;

  return (
    <div className="p-6 space-y-4">
      <Breadcrumb items={[{ label: "ERP Customers" }, { label: editId ? `Client ${editId}` : "New Customer" }]} />
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{editId ? "Edit Customer" : "Create Customer"}</h1>
      <Alerts success={success} error={error} onClearSuccess={() => setSuccess("")} onClearError={() => setError("")} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <form onSubmit={submit} noValidate className={`${card} p-5 xl:col-span-2`}>
          <datalist id="erp-industries">{INDUSTRIES.map((i) => <option key={i} value={i} />)}</datalist>
          <datalist id="erp-countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Req k="clientName" label="Company / Customer Name" />
              <input value={form.clientName} onChange={set("clientName")} className={fieldCls("clientName")} placeholder="Company name / Your name (If you are individual)" />
              <Err k="clientName" />
            </div>
            <div>
              <Req k="emailAddress" label="Email ID" />
              <input type="email" value={form.emailAddress} onChange={set("emailAddress")} className={fieldCls("emailAddress")} placeholder="Enter your email ID" />
              <Err k="emailAddress" />
            </div>
            <div>
              <Req k="natureOfBusiness" label="Nature Of Business" hint="(Primary)" />
              <input value={form.natureOfBusiness} onChange={set("natureOfBusiness")} list="erp-industries" className={fieldCls("natureOfBusiness")} placeholder="Select nature of business" />
              <Err k="natureOfBusiness" />
            </div>
            <div>
              <label className={labelCls}>Other Nature Of Business</label>
              <input value={form.natureOfBusiness2} onChange={set("natureOfBusiness2")} list="erp-industries" className={inputCls} placeholder="Select other nature of business" />
            </div>
            <div>
              <Req k="trnVatNo" label="VAT/GST/TAX No" />
              <input value={form.trnVatNo} onChange={set("trnVatNo")} className={fieldCls("trnVatNo")} placeholder="Enter VAT/GST/TAX No" />
              <Err k="trnVatNo" />
            </div>
            <div>
              <Req k="groupName" label="Group of Company" />
              <input value={form.groupName} onChange={set("groupName")} className={fieldCls("groupName")} placeholder="Enter Group Name" />
              <Err k="groupName" />
            </div>
            <div>
              <Req k="telephoneNo" label="Phone Number" />
              <input value={form.telephoneNo} onChange={set("telephoneNo")} className={fieldCls("telephoneNo")} placeholder="e.g. +971XXXXXXXXX" />
              <Err k="telephoneNo" />
            </div>
            <div>
              <Req k="webAddress" label="Website URL" />
              <input value={form.webAddress} onChange={set("webAddress")} className={fieldCls("webAddress")} placeholder="Enter your website URL" />
              <Err k="webAddress" />
            </div>
            <div>
              <label className={labelCls}>Fax No</label>
              <input value={form.faxNo} onChange={set("faxNo")} className={inputCls} placeholder="Enter fax no" />
            </div>
            <div>
              <label className={labelCls}>Credit Days</label>
              <input type="number" min="0" step="1" value={form.creditDays} onChange={set("creditDays")} className={inputCls} placeholder="0" />
            </div>
            <div>
              <label className={labelCls}>Account Code</label>
              <input value={form.accountCode} onChange={set("accountCode")} className={inputCls} placeholder="Enter account code" />
            </div>
            <div>
              <label className={labelCls}>Reference Code</label>
              <input value={form.refCode} onChange={set("refCode")} className={inputCls} placeholder="Enter reference code" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div>
              <Req k="country" label="Select Country" />
              <input value={form.country} onChange={set("country")} list="erp-countries" className={fieldCls("country")} placeholder="Select country..." />
              <Err k="country" />
            </div>
            <div>
              <Req k="stateName" label="State" />
              <input value={form.stateName} onChange={set("stateName")} className={fieldCls("stateName")} placeholder="Enter State Name" />
              <Err k="stateName" />
            </div>
            <div>
              <Req k="cityName" label="City" />
              <input value={form.cityName} onChange={set("cityName")} className={fieldCls("cityName")} placeholder="Enter City Name" />
              <Err k="cityName" />
            </div>
            <div>
              <Req k="communicationAddress" label="Communication Address" />
              <textarea value={form.communicationAddress} onChange={set("communicationAddress")} rows={2} className={fieldCls("communicationAddress")} placeholder="Communication Address" />
              <Err k="communicationAddress" />
            </div>
            <div>
              <Req k="invoiceAddress" label="Invoice Address" />
              <textarea value={form.invoiceAddress} onChange={set("invoiceAddress")} rows={2} className={fieldCls("invoiceAddress")} placeholder="Invoice Address" />
              <Err k="invoiceAddress" />
            </div>
            <div>
              <Req k="deliveryAddress" label="Delivery Address" />
              <textarea value={form.deliveryAddress} onChange={set("deliveryAddress")} rows={2} className={fieldCls("deliveryAddress")} placeholder="Delivery Address" />
              <Err k="deliveryAddress" />
            </div>
          </div>

          <div className="flex justify-center gap-2 mt-6">
            {editId && <button type="button" onClick={() => navigate("/erp-customers/new")} className="rounded-lg border border-gray-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">New Customer</button>}
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-60">
              {saving ? "Saving..." : editId ? "Update Customer" : "Save Customer"}
            </button>
          </div>
        </form>

        <div className="space-y-4">
          <form onSubmit={fetchById} className={`${card} p-5`}>
            <div className="flex items-center gap-2 mb-3">
              <Search className="h-5 w-5 text-gray-400" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Fetch Customer</h2>
            </div>
            <label className={labelCls}>Client ID</label>
            <div className="flex gap-2">
              <input type="number" min="1" value={lookup} onChange={(e) => setLookup(e.target.value)} className={inputCls} placeholder="Enter client ID" />
              <button type="submit" disabled={fetching || !lookup} className="rounded-lg bg-slate-900 dark:bg-blue-600 hover:opacity-90 text-white px-4 py-2 text-sm font-medium disabled:opacity-60">
                {fetching ? "..." : "Fetch"}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-400">Loads the customer for editing.</p>
          </form>

          <div className={`${card} p-5`}>
            <div className="flex items-center gap-2 mb-3">
              <Database className="h-5 w-5 text-gray-400" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">ERP Connection</h2>
            </div>
            <dl className="space-y-2 text-sm">
              {[["Domain", ERP.domain], ["Company code", ERP.companyCode], ["Branch code", ERP.branchCode], ["User", ERP.userName], ["Internal", ERP.isInternal], ...(editId ? [["Client ID", editId]] : [])].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-gray-500 dark:text-gray-400">{k}</dt><dd className="text-gray-900 dark:text-white">{v}</dd></div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
