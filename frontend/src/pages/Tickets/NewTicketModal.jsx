import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Loader2, Search } from "lucide-react";
import { TicketService } from "@/ServiceLayer/TicketService/TicketService";
import { CustomerService } from "@/ServiceLayer/WhatsAppService/WhatsAppService";
import { ProductService } from "@/ServiceLayer/CatalogService/CatalogService";
import { StaffService } from "@/ServiceLayer/AuthService/AuthService";
import { useAuth } from "@/context/AuthContext";
import { inputCls, labelCls } from "@/components/common/ui";
import { apiError } from "@/lib/apiClient";
import { displayName } from "@/lib/time";
import { TICKET_CATEGORIES, TICKET_CHANNELS, TICKET_PRIORITIES, TICKET_TYPES } from "@/lib/crm";

// customer / channel / type can be given when opened from a lead or a chat.
export default function NewTicketModal({ customer: initialCustomer, channel, type, onClose }) {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(initialCustomer ?? null);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({
    ticketType: type ?? "SUPPORT", subject: "", description: "", category: type === "CHANGE" ? "NEW_FEATURE" : "BUG",
    priority: "MEDIUM", channel: channel ?? "PHONE", productId: "", assignedTo: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    ProductService.getAll({ activeOnly: true }).then(setProducts).catch(() => {});
    if (isAdmin) StaffService.getAll().then((r) => setStaff(r.filter((s) => s.isActive === "T"))).catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (customer || search.trim().length < 2) { setMatches([]); return; }
    const timer = setTimeout(() => CustomerService.getAll({ search: search.trim() }).then((r) => setMatches(r.slice(0, 8))).catch(() => {}), 300);
    return () => clearTimeout(timer);
  }, [search, customer]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setType = (t) => setForm((f) => ({ ...f, ticketType: t, category: t === "CHANGE" ? "NEW_FEATURE" : "BUG" }));
  const categories = TICKET_CATEGORIES.filter((c) => !c.type || c.type === form.ticketType);

  const save = async (e) => {
    e.preventDefault();
    if (!customer) { setError("Choose the contact who raised the ticket."); return; }
    setBusy(true);
    setError("");
    try {
      const t = await TicketService.create({
        ...form, customerId: customer.customerId, productId: form.productId ? Number(form.productId) : null,
        assignedTo: form.assignedTo ? Number(form.assignedTo) : null, description: form.description || null,
      });
      navigate(`/tickets/${t.ticketId}`);
    } catch (err) { setError(apiError(err, "Failed to create the ticket.")); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">New Ticket</h3>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={save} className="space-y-3">
          {error && <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}

          <div className="flex gap-2">
            {TICKET_TYPES.map((t) => (
              <button key={t.value} type="button" onClick={() => setType(t.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium border ${form.ticketType === t.value ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 dark:border-slate-700 text-gray-700 dark:text-gray-200"}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div>
            <label className={labelCls}>Contact *</label>
            {customer ? (
              <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-2">
                <div className="text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">{displayName(customer)}</span>
                  <span className="text-gray-500 dark:text-gray-400">{customer.accountName ? ` · ${customer.accountName}` : ""}{customer.mobileNo ? ` · +${customer.mobileNo}` : ""}</span>
                </div>
                {!initialCustomer && <button type="button" onClick={() => setCustomer(null)} className="text-xs text-blue-600 hover:underline">Change</button>}
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, company, mobile, email..." className={`${inputCls} pl-9`} autoFocus />
                {matches.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
                    {matches.map((m) => (
                      <li key={m.customerId}>
                        <button type="button" onClick={() => setCustomer(m)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800">
                          <span className="font-medium text-gray-900 dark:text-white">{displayName(m)}</span>
                          <span className="text-gray-500 dark:text-gray-400">{m.accountName ? ` · ${m.accountName}` : ""}{m.mobileNo ? ` · +${m.mobileNo}` : ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Subject *</label>
            <input value={form.subject} onChange={set("subject")} required maxLength={200} className={inputCls}
              placeholder={form.ticketType === "CHANGE" ? "e.g. Add overtime column to the payslip" : "e.g. Cannot post the April payroll"} />
          </div>
          <div>
            <label className={labelCls}>Details</label>
            <textarea value={form.description} onChange={set("description")} rows={4} maxLength={8000} className={inputCls}
              placeholder="What the customer reported, steps, screens, error text..." />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Category</label>
              <select value={form.category} onChange={set("category")} className={inputCls}>
                {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select value={form.priority} onChange={set("priority")} className={inputCls}>
                {TICKET_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label} (resolve in {p.sla})</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Received by</label>
              <select value={form.channel} onChange={set("channel")} className={inputCls}>
                {TICKET_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Product</label>
              <select value={form.productId} onChange={set("productId")} className={inputCls}>
                <option value="">—</option>
                {products.map((p) => <option key={p.productId} value={p.productId}>{p.productCode} · {p.productName}</option>)}
              </select>
            </div>
            {isAdmin && (
              <div>
                <label className={labelCls}>Assign to</label>
                <select value={form.assignedTo} onChange={set("assignedTo")} className={inputCls}>
                  <option value="">Unassigned (queue)</option>
                  {staff.map((s) => <option key={s.userId} value={s.userId}>{s.fullName}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create Ticket
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
