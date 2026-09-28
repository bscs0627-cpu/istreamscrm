import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Plus, RefreshCw, Search, X, Pencil, Trash2, Contact, Target } from "lucide-react";
import { AccountService } from "@/ServiceLayer/CatalogService/CatalogService";
import { useAuth } from "@/context/AuthContext";
import { Alerts, DeleteModal, inputCls, labelCls } from "@/components/common/ui";
import { apiError } from "@/lib/apiClient";
import { COMPANY_SIZES, INDUSTRIES } from "@/lib/crm";

const emptyForm = {
  accountName: "", trn: "", industry: "", companySize: "", website: "", phone: "", email: "",
  address: "", city: "", country: "United Arab Emirates", notes: "",
};

export default function AccountsPage() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try { setRows(await AccountService.getAll({ search: search || undefined })); }
    catch { setError("Failed to load companies."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const openAdd = () => { setEditId(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (a) => {
    setEditId(a.accountId);
    setForm(Object.fromEntries(Object.keys(emptyForm).map((k) => [k, a[k] ?? ""])));
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.accountName.trim()) { setError("Company name is required."); return; }
    const trn = form.trn.replace(/\s/g, "");
    if (trn && !/^\d{15}$/.test(trn)) { setError("TRN must be 15 digits."); return; }
    setSaving(true); setError("");
    const payload = Object.fromEntries(Object.entries({ ...form, trn }).map(([k, v]) => [k, v.trim() || null]));
    try {
      if (editId) { await AccountService.update(editId, payload); setSuccess("Company updated."); }
      else { await AccountService.create(payload); setSuccess("Company added."); }
      setShowForm(false); setEditId(null); setForm(emptyForm); load();
    } catch (err) {
      setError(apiError(err, "Failed to save company."));
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    try { await AccountService.remove(deleteTarget.accountId); setSuccess("Company deleted. Its contacts are kept."); }
    catch { setError("Failed to delete company."); }
    finally { setDeleteTarget(null); load(); }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-600/10 p-2"><Building2 className="h-6 w-6 text-blue-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Companies</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Customer and prospect businesses, with their TRN and contacts</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium">
            <Plus className="h-4 w-4" /> Add Company
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Name, TRN, email, phone, industry..." className={`${inputCls} pl-9`} />
        </div>
        <button onClick={load} className="rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Apply</button>
      </div>

      <Alerts success={success} error={error} onClearSuccess={() => setSuccess("")} onClearError={() => setError("")} />

      {showForm && (
        <form onSubmit={submit} className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{editId ? "Edit Company" : "New Company"}</h2>
            <button type="button" onClick={() => setShowForm(false)}><X className="h-5 w-5 text-gray-400 hover:text-gray-600" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className={labelCls}>Company Name *</label>
              <input value={form.accountName} onChange={set("accountName")} maxLength={200} className={inputCls} placeholder="Legal name, as on the trade licence" />
            </div>
            <div>
              <label className={labelCls}>TRN (VAT number)</label>
              <input value={form.trn} onChange={set("trn")} maxLength={20} className={inputCls} placeholder="15 digits" />
            </div>
            <div>
              <label className={labelCls}>Industry</label>
              <input value={form.industry} onChange={set("industry")} list="industries" maxLength={100} className={inputCls} />
              <datalist id="industries">{INDUSTRIES.map((i) => <option key={i} value={i} />)}</datalist>
            </div>
            <div>
              <label className={labelCls}>Company Size</label>
              <select value={form.companySize} onChange={set("companySize")} className={inputCls}>
                <option value="">—</option>
                {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s} employees</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input value={form.phone} onChange={set("phone")} maxLength={30} className={inputCls} placeholder="+971 4 123 4567" />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email} onChange={set("email")} maxLength={150} className={inputCls} placeholder="accounts@company.ae" />
            </div>
            <div>
              <label className={labelCls}>Website</label>
              <input value={form.website} onChange={set("website")} maxLength={200} className={inputCls} placeholder="www.company.ae" />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Address</label>
              <input value={form.address} onChange={set("address")} maxLength={500} className={inputCls} placeholder="Office, building, street, area" />
            </div>
            <div>
              <label className={labelCls}>City</label>
              <input value={form.city} onChange={set("city")} maxLength={100} className={inputCls} placeholder="Dubai" />
            </div>
            <div>
              <label className={labelCls}>Country</label>
              <input value={form.country} onChange={set("country")} maxLength={100} className={inputCls} />
            </div>
            <div className="md:col-span-2 lg:col-span-4">
              <label className={labelCls}>Notes</label>
              <textarea value={form.notes} onChange={set("notes")} rows={2} maxLength={2000} className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-60">{saving ? "Saving..." : editId ? "Update" : "Save"}</button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <tr className="text-left text-gray-600 dark:text-gray-300">
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">TRN</th>
                <th className="px-4 py-3 font-medium">Industry</th>
                <th className="px-4 py-3 font-medium">Phone / Email</th>
                <th className="px-4 py-3 font-medium">City</th>
                <th className="px-4 py-3 font-medium text-right">Contacts</th>
                <th className="px-4 py-3 font-medium text-right">Open Leads</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No companies yet.</td></tr>
              )}
              {rows.map((a) => (
                <tr key={a.accountId} className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(a)} className="text-left font-medium text-gray-900 dark:text-white hover:text-blue-600">{a.accountName}</button>
                    {a.companySize && <div className="text-xs text-gray-500 dark:text-gray-400">{a.companySize} employees</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">{a.trn || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.industry || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    <div>{a.phone || "—"}</div>
                    {a.email && <div className="text-xs text-gray-500 dark:text-gray-400">{a.email}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.city || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <Link to={`/customers?account=${a.accountId}`} className="text-blue-600 hover:underline">{a.contacts}</Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <Link to={`/leads?account=${a.accountId}&view=`} className="text-blue-600 hover:underline">{a.openLeads}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link to={`/customers?account=${a.accountId}`} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-blue-600" title="Contacts"><Contact className="h-4 w-4" /></Link>
                      <Link to={`/leads?account=${a.accountId}&view=`} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-blue-600" title="Leads"><Target className="h-4 w-4" /></Link>
                      <button onClick={() => openEdit(a)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-blue-600" title="Edit"><Pencil className="h-4 w-4" /></button>
                      {isAdmin && (
                        <button onClick={() => setDeleteTarget(a)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DeleteModal open={!!deleteTarget} name={deleteTarget?.accountName} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
    </div>
  );
}
