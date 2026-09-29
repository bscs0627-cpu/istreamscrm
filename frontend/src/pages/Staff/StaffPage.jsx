import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Users, Plus, RefreshCw, Search, Pencil, KeyRound } from "lucide-react";
import { StaffService } from "@/ServiceLayer/AuthService/AuthService";
import { useAuth } from "@/context/AuthContext";
import { Alerts, inputCls } from "@/components/common/ui";
import { dateTime } from "@/lib/time";

export default function StaffPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(location.state?.success ?? "");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try { setRows(await StaffService.getAll(search || undefined)); }
    catch { setError("Failed to load staff."); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-600/10 p-2"><Users className="h-6 w-6 text-blue-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Staff</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Admins and staff who can sign in for {user?.companyName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={() => navigate("/staff/new")} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium">
            <Plus className="h-4 w-4" /> Add Staff
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search name, email or mobile..." className={`${inputCls} pl-9`} />
        </div>
        <button onClick={load} className="rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Apply</button>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 px-4 py-2.5 text-sm text-blue-800 dark:text-blue-200">
        <b>How staff sign in:</b> on the <b>Staff</b> tab of the login page with admin email <b>{user?.email}</b>, their own mobile number and password.
        Admins sign in on the <b>Admin</b> tab with their email.
      </div>

      <Alerts success={success} error={error} onClearSuccess={() => setSuccess("")} onClearError={() => setError("")} />

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <tr className="text-left text-gray-600 dark:text-gray-300">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Mobile</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium text-right">Customers</th>
                <th className="px-4 py-3 font-medium">Last Sign In</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No staff found.</td></tr>
              )}
              {rows.map((s) => (
                <tr key={s.userId} className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                    {s.fullName}{s.userId === user?.userId && <span className="ml-1 text-xs text-gray-400">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{s.email || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{s.mobileNo ? `+${s.mobileNo}` : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.role === "ADMIN" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-gray-300"}`}>
                      {s.role === "ADMIN" ? "Admin" : "Staff"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.assignedCustomers}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {s.hasPassword === "T" ? (dateTime(s.lastLoginAt) || "Never") : <span className="inline-flex items-center gap-1 text-amber-600"><KeyRound className="h-3 w-3" /> No password</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.isActive === "T" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                         : "bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-gray-400"}`}>
                      {s.isActive === "T" ? "Active" : "Inactive"}
                    </span>
                    {s.isActive !== "T" && s.assignedCustomers > 0 && (
                      <div className="text-[11px] text-amber-600 mt-0.5">Reassign their customers</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => navigate(`/staff/${s.userId}/edit`)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-blue-600" title="Edit"><Pencil className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
