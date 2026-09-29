import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, Plus, RefreshCw, Search, Pencil, Trash2, Contact, Target } from "lucide-react";
import { AccountService } from "@/ServiceLayer/CatalogService/CatalogService";
import { useAuth } from "@/context/AuthContext";
import { Alerts, DeleteModal, inputCls, labelCls } from "@/components/common/ui";

export default function AccountsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
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
          <button onClick={() => navigate("/accounts/new")} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium">
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
                    <button onClick={() => navigate(`/accounts/${a.accountId}/edit`)} className="text-left font-medium text-gray-900 dark:text-white hover:text-blue-600">{a.accountName}</button>
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
                      <button onClick={() => navigate(`/accounts/${a.accountId}/edit`)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-blue-600" title="Edit"><Pencil className="h-4 w-4" /></button>
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
