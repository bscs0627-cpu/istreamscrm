import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Search, User } from "lucide-react";
import { TicketService } from "@/ServiceLayer/TicketService/TicketService";
import { CustomerService } from "@/ServiceLayer/WhatsAppService/WhatsAppService";
import { ProductService } from "@/ServiceLayer/CatalogService/CatalogService";
import { StaffService } from "@/ServiceLayer/AuthService/AuthService";
import { useAuth } from "@/context/AuthContext";
import { Alerts, Breadcrumb, inputCls, labelCls } from "@/components/common/ui";
import { apiError } from "@/lib/apiClient";
import { displayName } from "@/lib/time";
import { TICKET_CATEGORIES, TICKET_CHANNELS, TICKET_PRIORITIES, TICKET_TYPES } from "@/lib/crm";

const card = "bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm";

// New ticket: customer / channel / type can arrive in the router state (from a lead or a chat). Edit: /tickets/:id/edit.
export default function TicketFormPage() {
  const { id } = useParams();
  const editId = id ? Number(id) : null;
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [ticket, setTicket] = useState(null);
  const [customer, setCustomer] = useState(state?.customer ?? null);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({
    ticketType: state?.type ?? "SUPPORT", subject: "", description: "", category: state?.type === "CHANGE" ? "NEW_FEATURE" : "BUG",
    priority: "MEDIUM", channel: state?.channel ?? "PHONE", productId: "", assignedTo: "",
  });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [error, setError] = useState("");

  useEffect(() => {
    ProductService.getAll({ activeOnly: true }).then(setProducts).catch(() => {});
    if (isAdmin && !editId) StaffService.getAll().then((r) => setStaff(r.filter((s) => s.isActive === "T"))).catch(() => {});
  }, [isAdmin, editId]);

  useEffect(() => {
    if (!editId) return;
    TicketService.get(editId)
      .then((t) => {
        setTicket(t);
        setForm({
          ticketType: t.ticketType, subject: t.subject, description: t.description ?? "", category: t.category, priority: t.priority,
          channel: t.channel, productId: t.productId ? String(t.productId) : "", assignedTo: "",
        });
      })
      .catch((err) => setError(err?.response?.status === 404 ? "Ticket not found, or it is assigned to someone else." : "Failed to load the ticket."))
      .finally(() => setLoading(false));
  }, [editId]);

  useEffect(() => {
    if (editId || customer || search.trim().length < 2) { setMatches([]); return; }
    const timer = setTimeout(() => CustomerService.getAll({ search: search.trim() }).then((r) => setMatches(r.slice(0, 8))).catch(() => {}), 300);
    return () => clearTimeout(timer);
  }, [search, customer, editId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setType = (t) => setForm((f) => ({ ...f, ticketType: t, category: t === "CHANGE" ? "NEW_FEATURE" : "BUG" }));
  const categories = TICKET_CATEGORIES.filter((c) => !c.type || c.type === form.ticketType);
  const subjectMissing = touched && !form.subject.trim();
  const contactMissing = touched && !editId && !customer;

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setTouched(true);
    if (!editId && !customer) { setError("Choose the contact who raised the ticket."); return; }
    if (!form.subject.trim()) { setError("Subject is required."); return; }
    setSaving(true); setError("");
    const payload = {
      ...form, subject: form.subject.trim(), description: form.description.trim() || null,
      productId: form.productId ? Number(form.productId) : null, assignedTo: form.assignedTo ? Number(form.assignedTo) : null,
      customerId: editId ? ticket.customerId : customer.customerId,
    };
    try {
      const saved = editId ? await TicketService.update(editId, payload) : await TicketService.create(payload);
      navigate(`/tickets/${saved.ticketId}`, { state: { success: editId ? "Ticket saved." : "Ticket created." } });
    } catch (err) {
      setError(apiError(err, "Failed to save the ticket."));
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading...</div>;

  const contact = editId ? ticket : customer;

  return (
    <div className="p-6 space-y-4">
      <Breadcrumb items={[{ label: "Tickets", to: "/tickets" }, ...(ticket ? [{ label: ticket.ticketNo, to: `/tickets/${ticket.ticketId}` }] : []), { label: editId ? "Edit" : "New Ticket" }]} />
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{editId ? `Edit Ticket${ticket ? ` ${ticket.ticketNo}` : ""}` : "Create Ticket"}</h1>
      <Alerts error={error} onClearError={() => setError("")} />

      {editId && !ticket ? null : (
        <form onSubmit={submit} noValidate className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
          <div className={`${card} p-5 xl:col-span-2 space-y-4`}>
            <div>
              <label className={labelCls}>Type</label>
              <div className="flex gap-2">
                {TICKET_TYPES.map((t) => (
                  <button key={t.value} type="button" disabled={!!editId} onClick={() => setType(t.value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border disabled:opacity-60 ${form.ticketType === t.value ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 dark:border-slate-700 text-gray-700 dark:text-gray-200"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelCls}>Subject<span className="text-red-500">*</span></label>
              <input value={form.subject} onChange={set("subject")} maxLength={200} className={`${inputCls} ${subjectMissing ? "border-red-400 dark:border-red-500" : ""}`}
                placeholder={form.ticketType === "CHANGE" ? "e.g. Add overtime column to the payslip" : "e.g. Cannot post the April payroll"} />
              {subjectMissing && <p className="mt-1 text-xs text-red-500">Subject is required</p>}
            </div>
            <div>
              <label className={labelCls}>Details</label>
              <textarea value={form.description} onChange={set("description")} rows={5} maxLength={8000} className={inputCls}
                placeholder="What the customer reported, steps, screens, error text..." />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              {isAdmin && !editId && (
                <div>
                  <label className={labelCls}>Assign to</label>
                  <select value={form.assignedTo} onChange={set("assignedTo")} className={inputCls}>
                    <option value="">Unassigned (queue)</option>
                    {staff.map((s) => <option key={s.userId} value={s.userId}>{s.fullName}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-center gap-2 pt-2">
              <button type="button" onClick={() => navigate(editId ? `/tickets/${editId}` : "/tickets")} className="rounded-lg border border-gray-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-60">
                {saving ? "Saving..." : editId ? "Update Ticket" : "Create Ticket"}
              </button>
            </div>
          </div>

          <div className={`${card} p-5 min-h-[16rem]`}>
            <div className="flex items-center gap-2 mb-4">
              <User className="h-5 w-5 text-gray-400" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Contact<span className="text-red-500">*</span></h2>
            </div>

            {contact ? (
              <div className="flex items-start justify-between gap-2 rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-3">
                <div className="min-w-0 text-sm">
                  <div className="font-medium text-gray-900 dark:text-white">{displayName(contact) || "—"}</div>
                  {contact.accountName && <div className="text-gray-700 dark:text-gray-300">{contact.accountName}</div>}
                  {contact.mobileNo && <div className="text-gray-500 dark:text-gray-400">+{contact.mobileNo}</div>}
                  {contact.email && <div className="text-gray-500 dark:text-gray-400 break-all">{contact.email}</div>}
                </div>
                {!editId && !state?.customer && <button type="button" onClick={() => setCustomer(null)} className="text-xs font-medium text-blue-600 hover:underline">Change</button>}
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, company, mobile, email..."
                  className={`${inputCls} pl-9 ${contactMissing ? "border-red-400 dark:border-red-500" : ""}`} autoFocus />
                {contactMissing && <p className="mt-1 text-xs text-red-500">Choose the contact who raised the ticket</p>}
                {matches.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
                    {matches.map((m) => (
                      <li key={m.customerId}>
                        <button type="button" onClick={() => setCustomer(m)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800">
                          <span className="font-medium text-gray-900 dark:text-white">{displayName(m)}</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">{[m.accountName, m.mobileNo && `+${m.mobileNo}`, m.email].filter(Boolean).join(" · ")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {editId && <p className="mt-3 text-xs text-gray-400">The contact cannot be changed. Edit it on the <Link to="/customers" className="text-blue-600 hover:underline">Contacts</Link> page.</p>}
          </div>
        </form>
      )}
    </div>
  );
}
