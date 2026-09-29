import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { StaffService } from "@/ServiceLayer/AuthService/AuthService";
import { useAuth } from "@/context/AuthContext";
import { Alerts, Breadcrumb, inputCls, labelCls } from "@/components/common/ui";
import { apiError } from "@/lib/apiClient";
import { dateTime } from "@/lib/time";

const emptyForm = { fullName: "", email: "", mobileNo: "", role: "STAFF", isActive: "T", password: "" };
const card = "bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm";

export default function StaffFormPage() {
  const { id } = useParams();
  const editId = id ? Number(id) : null;
  const { user } = useAuth();
  const navigate = useNavigate();
  const [member, setMember] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editId) return;
    StaffService.getAll()
      .then((rows) => {
        const s = rows.find((x) => x.userId === editId);
        if (!s) { setError("Staff member not found."); return; }
        setMember(s);
        setForm({ fullName: s.fullName, email: s.email ?? "", mobileNo: s.mobileNo ?? "", role: s.role, isActive: s.isActive, password: "" });
      })
      .catch(() => setError("Failed to load the staff member."))
      .finally(() => setLoading(false));
  }, [editId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const isSelf = editId === user?.userId;
  const mobile = form.mobileNo.replace(/[^\d]/g, "");

  const nameMissing = touched && !form.fullName.trim();
  const mobileMissing = touched && form.role === "STAFF" && !mobile;
  const emailMissing = touched && form.role === "ADMIN" && !form.email.trim();
  const passwordMissing = touched && !editId && form.password.length < 6;
  const bad = (on) => (on ? "border-red-400 dark:border-red-500" : "");

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setTouched(true);
    if (!form.fullName.trim()) { setError("Name is required."); return; }
    if (form.role === "ADMIN" && !form.email.trim()) { setError("Email is required for an admin — admins sign in with email."); return; }
    if (form.role === "STAFF" && !mobile) { setError("Mobile number is required for staff — they sign in with it."); return; }
    if (!editId && form.password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setSaving(true); setError("");
    const payload = {
      fullName: form.fullName.trim(), email: form.email.trim() || null, mobileNo: mobile || null,
      role: form.role, isActive: form.isActive, password: form.password || null,
    };
    try {
      if (editId) await StaffService.update(editId, payload); else await StaffService.create(payload);
      const success = editId ? "Staff member updated."
        : form.role === "STAFF"
          ? `Staff member added. They sign in on the Staff tab with admin email ${user?.email}, mobile ${mobile} and the password you set.`
          : "Admin added. They sign in on the Admin tab with their email and password.";
      navigate("/staff", { state: { success } });
    } catch (err) {
      setError(apiError(err, "Failed to save staff member."));
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading...</div>;

  return (
    <div className="p-6 space-y-4">
      <Breadcrumb items={[{ label: "Staff", to: "/staff" }, { label: editId ? "Edit Staff" : "New Staff" }]} />
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{editId ? "Edit Staff" : "Create Staff"}</h1>
      <Alerts error={error} onClearError={() => setError("")} />

      {editId && !member ? null : (
        <form onSubmit={submit} noValidate className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
          <div className={`${card} p-5 xl:col-span-2`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Full Name<span className="text-red-500">*</span></label>
                <input value={form.fullName} onChange={set("fullName")} maxLength={150} className={`${inputCls} ${bad(nameMissing)}`} placeholder="Full name" />
                {nameMissing && <p className="mt-1 text-xs text-red-500">Full name is required</p>}
              </div>
              <div>
                <label className={labelCls}>Mobile{form.role === "STAFF" && <span className="text-red-500">*</span>}</label>
                <input value={form.mobileNo} onChange={set("mobileNo")} maxLength={20} className={`${inputCls} ${bad(mobileMissing)}`} placeholder="With country code, e.g. 919876543210" />
                {mobileMissing && <p className="mt-1 text-xs text-red-500">Mobile is required for staff</p>}
              </div>
              <div>
                <label className={labelCls}>Email{form.role === "ADMIN" ? <span className="text-red-500">*</span> : " (optional)"}</label>
                <input type="email" value={form.email} onChange={set("email")} maxLength={150} className={`${inputCls} ${bad(emailMissing)}`} placeholder="Email ID" />
                {emailMissing && <p className="mt-1 text-xs text-red-500">Email is required for an admin</p>}
              </div>
              <div>
                <label className={labelCls}>{editId ? "Reset Password" : <>Password<span className="text-red-500">*</span></>}</label>
                <input type="password" value={form.password} onChange={set("password")} autoComplete="new-password" className={`${inputCls} ${bad(passwordMissing)}`}
                  placeholder={editId ? "Leave blank to keep current" : "Min 6 characters"} />
                {passwordMissing && <p className="mt-1 text-xs text-red-500">Password must be at least 6 characters</p>}
              </div>
              <div>
                <label className={labelCls}>Role</label>
                <select value={form.role} onChange={set("role")} disabled={isSelf} className={inputCls}>
                  <option value="STAFF">Staff — sees only assigned customers</option>
                  <option value="ADMIN">Admin — sees everything, assigns customers</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select value={form.isActive} onChange={set("isActive")} disabled={isSelf} className={inputCls}>
                  <option value="T">Active</option>
                  <option value="F">Inactive — cannot sign in</option>
                </select>
              </div>
            </div>

            <div className="flex justify-center gap-2 mt-6">
              <button type="button" onClick={() => navigate("/staff")} className="rounded-lg border border-gray-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-60">
                {saving ? "Saving..." : editId ? "Update Staff" : "Save Staff"}
              </button>
            </div>
          </div>

          <div className={`${card} p-5 space-y-4`}>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-gray-400" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Sign In</h2>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
              {form.role === "STAFF" ? (
                <>Signs in on the <b>Staff</b> tab of the login page with admin email <b>{user?.email}</b>, their own mobile number and password.</>
              ) : (
                <>Signs in on the <b>Admin</b> tab of the login page with their email and password.</>
              )}
            </div>
            {member && (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-gray-500 dark:text-gray-400">Assigned customers</dt><dd className="tabular-nums text-gray-900 dark:text-white">{member.assignedCustomers}</dd></div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500 dark:text-gray-400">Last sign in</dt>
                  <dd className="text-gray-900 dark:text-white">{member.hasPassword === "T" ? (dateTime(member.lastLoginAt) || "Never") : <span className="text-amber-600">No password set</span>}</dd>
                </div>
                {member.isActive !== "T" && member.assignedCustomers > 0 && <p className="text-xs text-amber-600">Inactive — reassign their customers.</p>}
              </dl>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
