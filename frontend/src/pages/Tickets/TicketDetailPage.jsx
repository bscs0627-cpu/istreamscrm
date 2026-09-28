import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  LifeBuoy, ArrowLeft, Pencil, Trash2, Loader2, Send, StickyNote, UserRound, Mail, MessagesSquare, ShieldCheck, ShieldAlert,
  FileText, Calculator, ArrowRightLeft,
} from "lucide-react";
import { TicketService } from "@/ServiceLayer/TicketService/TicketService";
import { ProductService } from "@/ServiceLayer/CatalogService/CatalogService";
import { StaffService } from "@/ServiceLayer/AuthService/AuthService";
import { useAuth } from "@/context/AuthContext";
import { Alerts, DeleteModal, inputCls, labelCls } from "@/components/common/ui";
import { apiError } from "@/lib/apiClient";
import { formatDate } from "@/lib/utils";
import { dateTime, displayName } from "@/lib/time";
import {
  CHANGE_FLOW, SUPPORT_FLOW, TICKET_CATEGORIES, TICKET_CHANNELS, TICKET_PRIORITIES, TICKET_TYPES, formatAed, labelOf,
  quoteStatusOf, ticketStatusOf, TICKET_DONE,
} from "@/lib/crm";
import { Badge, dueText } from "./TicketsPage";

const card = "bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm";
const btnOutline = "inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-60";
const btnPrimary = "inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-60";

function Comment({ c, type }) {
  if (c.kind === "STATUS") {
    const [first, ...rest] = c.body.split("\n");
    const m = first.match(/^(\w+) → (\w+)(.*)$/);
    const text = m ? `${ticketStatusOf(m[1], type).label} → ${ticketStatusOf(m[2], type).label}${m[3]}` : first;
    return (
      <li className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
        <ArrowRightLeft className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          <span className="font-medium text-gray-700 dark:text-gray-300">{text}</span>
          {rest.length > 0 && <span> — {rest.join(" ")}</span>}
          <span> · {c.createdByName ?? "System"} · {dateTime(c.createdAt)}</span>
        </div>
      </li>
    );
  }
  const style = {
    NOTE: { cls: "bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-900/40", icon: StickyNote, title: "Internal note" },
    REPLY: { cls: "bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-900/40", icon: c.channel === "EMAIL" ? Mail : MessagesSquare, title: `Reply sent by ${c.channel === "EMAIL" ? "email" : "WhatsApp"}` },
    CUSTOMER: { cls: "bg-gray-50 border-gray-200 dark:bg-slate-800/50 dark:border-slate-700", icon: UserRound, title: "Customer said" },
  }[c.kind];
  const Icon = style.icon;
  return (
    <li className={`rounded-lg border px-3 py-2 ${style.cls}`}>
      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <Icon className="h-3.5 w-3.5" /> <span className="font-medium text-gray-700 dark:text-gray-300">{style.title}</span>
        <span>· {c.createdByName ?? "System"} · {dateTime(c.createdAt)}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-900 dark:text-white">{c.body}</p>
    </li>
  );
}

function Info({ label, children }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-right text-gray-900 dark:text-white">{children}</span>
    </div>
  );
}

export default function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const [t, setT] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [staff, setStaff] = useState([]);
  const [products, setProducts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [composer, setComposer] = useState({ kind: "REPLY", channel: "EMAIL", body: "" });
  const [statusForm, setStatusForm] = useState({ status: "", note: "" });
  const [estimate, setEstimate] = useState({ hours: "", rate: "" });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const apply = (row) => {
    setT(row);
    setStatusForm({ status: row.status, note: "" });
    setEstimate((e) => ({ hours: row.estimatedHours ?? e.hours, rate: row.hourlyRate ?? e.rate }));
    setComposer((c) => ({ ...c, channel: row.email ? c.channel : "WHATSAPP" }));
  };

  useEffect(() => {
    TicketService.get(id).then((row) => {
      apply(row);
      if (row.ticketType === "CHANGE" && row.hourlyRate == null)
        TicketService.rate().then((r) => r.rate != null && setEstimate((e) => ({ ...e, rate: e.rate || String(r.rate) }))).catch(() => {});
    }).catch((err) => setError(err?.response?.status === 404 ? "Ticket not found, or it is assigned to someone else." : "Failed to load the ticket."));
    ProductService.getAll({ activeOnly: true }).then(setProducts).catch(() => {});
    if (isAdmin) StaffService.getAll().then((r) => setStaff(r.filter((s) => s.isActive === "T"))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const run = async (fn, ok) => {
    setBusy(true);
    setError("");
    try { const row = await fn(); if (row) apply(row); if (ok) setSuccess(ok); return true; }
    catch (err) { setError(apiError(err, "Something went wrong.")); return false; }
    finally { setBusy(false); }
  };

  if (!t) {
    return (
      <div className="p-6">
        <Alerts error={error} onClearError={() => setError("")} />
        {!error && <Loader2 className="h-6 w-6 animate-spin text-gray-400" />}
      </div>
    );
  }

  const isChange = t.ticketType === "CHANGE";
  const flow = isChange ? CHANGE_FLOW : SUPPORT_FLOW;
  const mine = t.assignedTo === user?.userId;
  const due = dueText(t);
  const estimateAmount = Number(estimate.hours) > 0 && Number(estimate.rate) >= 0 ? Math.round(Number(estimate.hours) * Number(estimate.rate) * 100) / 100 : null;

  const startEdit = () => setEditing({
    subject: t.subject, description: t.description ?? "", category: t.category, priority: t.priority, channel: t.channel,
    productId: t.productId ? String(t.productId) : "",
  });
  const saveEdit = async (e) => {
    e.preventDefault();
    const done = await run(() => TicketService.update(t.ticketId, {
      ...editing, ticketType: t.ticketType, customerId: t.customerId, productId: editing.productId ? Number(editing.productId) : null,
      description: editing.description || null,
    }), "Ticket saved.");
    if (done) setEditing(null);
  };

  const send = async (e) => {
    e.preventDefault();
    const done = await run(() => TicketService.comment(t.ticketId, {
      kind: composer.kind, channel: composer.kind === "REPLY" ? composer.channel : null, body: composer.body,
    }), composer.kind === "REPLY" ? "Reply sent." : null);
    if (done) setComposer((c) => ({ ...c, body: "" }));
  };

  const categories = TICKET_CATEGORIES.filter((c) => !c.type || c.type === t.ticketType);

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <button onClick={() => navigate("/tickets")} className="mt-1 rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"><ArrowLeft className="h-5 w-5" /></button>
          <div className="rounded-xl bg-blue-600/10 p-2"><LifeBuoy className="h-6 w-6 text-blue-600" /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-medium text-gray-500 dark:text-gray-400">{t.ticketNo}</span>
              <Badge item={TICKET_TYPES.find((x) => x.value === t.ticketType)} />
              <Badge item={ticketStatusOf(t.status, t.ticketType)} />
              <Badge item={TICKET_PRIORITIES.find((x) => x.value === t.priority)} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white break-words">{t.subject}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t.accountName ? `${t.accountName} · ` : ""}{displayName(t)} · {labelOf(TICKET_CATEGORIES, t.category)}{t.productName ? ` · ${t.productName}` : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {!editing && <button onClick={startEdit} className={btnOutline}><Pencil className="h-4 w-4" /> Edit</button>}
          {isAdmin && <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 text-sm font-medium"><Trash2 className="h-4 w-4" /> Delete</button>}
        </div>
      </div>

      <Alerts success={success} error={error} onClearSuccess={() => setSuccess("")} onClearError={() => setError("")} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4 min-w-0">
          {editing ? (
            <form onSubmit={saveEdit} className={`${card} p-4 space-y-3`}>
              <div><label className={labelCls}>Subject *</label><input value={editing.subject} onChange={(e) => setEditing((f) => ({ ...f, subject: e.target.value }))} required maxLength={200} className={inputCls} /></div>
              <div><label className={labelCls}>Details</label><textarea value={editing.description} onChange={(e) => setEditing((f) => ({ ...f, description: e.target.value }))} rows={5} maxLength={8000} className={inputCls} /></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><label className={labelCls}>Category</label><select value={editing.category} onChange={(e) => setEditing((f) => ({ ...f, category: e.target.value }))} className={inputCls}>{categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                <div><label className={labelCls}>Priority</label><select value={editing.priority} onChange={(e) => setEditing((f) => ({ ...f, priority: e.target.value }))} className={inputCls}>{TICKET_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label} (resolve in {p.sla})</option>)}</select></div>
                <div><label className={labelCls}>Received by</label><select value={editing.channel} onChange={(e) => setEditing((f) => ({ ...f, channel: e.target.value }))} className={inputCls}>{TICKET_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                <div><label className={labelCls}>Product</label><select value={editing.productId} onChange={(e) => setEditing((f) => ({ ...f, productId: e.target.value }))} className={inputCls}><option value="">—</option>{products.map((p) => <option key={p.productId} value={p.productId}>{p.productCode} · {p.productName}</option>)}</select></div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(null)} className={btnOutline}>Cancel</button>
                <button type="submit" disabled={busy} className={btnPrimary}>Save</button>
              </div>
            </form>
          ) : (
            <div className={`${card} p-4`}>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Details</h3>
              <p className="whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-300">{t.description || <span className="text-gray-400">No details written.</span>}</p>
            </div>
          )}

          <div className={`${card} p-4 space-y-3`}>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Conversation</h3>
            {t.comments.length === 0 ? <p className="text-sm text-gray-400">Nothing yet.</p> : (
              <ul className="space-y-2">{t.comments.map((c) => <Comment key={c.commentId} c={c} type={t.ticketType} />)}</ul>
            )}
            <form onSubmit={send} className="space-y-2 border-t border-gray-100 dark:border-slate-800 pt-3">
              <div className="flex flex-wrap gap-2">
                {[["REPLY", "Reply to customer"], ["NOTE", "Internal note"], ["CUSTOMER", "Log customer message"]].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setComposer((c) => ({ ...c, kind: v }))}
                    className={`rounded-full px-3 py-1 text-xs font-medium border ${composer.kind === v ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 dark:border-slate-700 text-gray-700 dark:text-gray-200"}`}>{l}</button>
                ))}
                {composer.kind === "REPLY" && (
                  <select value={composer.channel} onChange={(e) => setComposer((c) => ({ ...c, channel: e.target.value }))} className={`${inputCls.replace("w-full ", "")} w-56 ml-auto py-1`}>
                    <option value="EMAIL" disabled={!t.email}>Email{t.email ? ` (${t.email})` : " (no email ID)"}</option>
                    <option value="WHATSAPP" disabled={!t.mobileNo}>WhatsApp{t.mobileNo ? ` (+${t.mobileNo})` : ""}</option>
                  </select>
                )}
              </div>
              <textarea value={composer.body} onChange={(e) => setComposer((c) => ({ ...c, body: e.target.value }))} rows={4} maxLength={4000} className={inputCls}
                placeholder={composer.kind === "REPLY" ? "Write to the customer. The email subject will be the ticket number and subject." : composer.kind === "NOTE" ? "Only staff see this." : "What the customer said on the phone or in person."} />
              <div className="flex justify-end">
                <button type="submit" disabled={busy || !composer.body.trim()} className={btnPrimary}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : composer.kind === "REPLY" ? <Send className="h-4 w-4" /> : <StickyNote className="h-4 w-4" />}
                  {composer.kind === "REPLY" ? "Send Reply" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-4 min-w-0">
          <div className={`${card} p-4 space-y-3`}>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Status</h3>
            <div className="flex flex-wrap gap-1.5">
              {flow.map((s) => {
                const st = ticketStatusOf(s, t.ticketType);
                return (
                  <button key={s} type="button" onClick={() => setStatusForm((f) => ({ ...f, status: s }))}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium border ${statusForm.status === s ? "border-blue-600 ring-1 ring-blue-600" : "border-transparent"} ${st.cls}`}>{st.label}</button>
                );
              })}
            </div>
            {statusForm.status !== t.status && (
              <div className="space-y-2">
                <input value={statusForm.note} onChange={(e) => setStatusForm((f) => ({ ...f, note: e.target.value }))} maxLength={2000} className={inputCls}
                  placeholder={statusForm.status === "RESOLVED" ? "What was done to fix it" : "Note (optional)"} />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setStatusForm({ status: t.status, note: "" })} className={btnOutline}>Cancel</button>
                  <button type="button" disabled={busy} onClick={() => run(() => TicketService.setStatus(t.ticketId, statusForm.status, statusForm.note || null), "Status updated.")} className={btnPrimary}>
                    Set {ticketStatusOf(statusForm.status, t.ticketType).label}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={`${card} p-4 space-y-2`}>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Assigned to</h3>
            {isAdmin ? (
              <select value={t.assignedTo ?? ""} disabled={busy} onChange={(e) => run(() => TicketService.assign(t.ticketId, e.target.value ? Number(e.target.value) : null), "Assignment updated.")}
                className={`${inputCls} ${t.assignedTo ? "" : "border-amber-400"}`}>
                <option value="">Unassigned (queue)</option>
                {staff.map((s) => <option key={s.userId} value={s.userId}>{s.fullName}</option>)}
              </select>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm ${t.assignedTo ? "text-gray-900 dark:text-white" : "text-amber-600"}`}>{t.assignedToName ?? "Unassigned"}</span>
                {!t.assignedTo && <button disabled={busy} onClick={() => run(() => TicketService.assign(t.ticketId, user.userId), "The ticket is yours.")} className={btnPrimary}>Take It</button>}
                {mine && <button disabled={busy} onClick={() => run(() => TicketService.assign(t.ticketId, null)).then((ok) => ok && navigate("/tickets"))} className={btnOutline}>Release</button>}
              </div>
            )}
          </div>

          <div className={`${card} p-4 space-y-2`}>
            {t.coverageName ? (
              <div className="flex items-start gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2 text-sm text-green-800 dark:text-green-300">
                <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Covered by <b>{t.coverageName}</b> until {formatDate(t.coverageUntil)}</span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                <span>No active subscription or AMC — support may be chargeable.</span>
              </div>
            )}
            <Info label="Contact">{displayName(t)}</Info>
            {t.accountName && <Info label="Company">{t.accountName}</Info>}
            {t.mobileNo && <Info label="Mobile">+{t.mobileNo}</Info>}
            {t.email && <Info label="Email"><span className="break-all">{t.email}</span></Info>}
            <Info label="Received by">{labelOf(TICKET_CHANNELS, t.channel)}</Info>
            <Info label="Opened">{dateTime(t.createdAt)}{t.createdByName ? ` · ${t.createdByName}` : ""}</Info>
            <Info label="Resolve by"><span className={t.isOverdue ? "text-red-600 font-medium" : ""}>{dateTime(t.dueAt)}{due ? ` (${due})` : ""}</span></Info>
            <Info label="First reply">{t.firstResponseAt ? dateTime(t.firstResponseAt) : "—"}</Info>
            {t.resolvedAt && <Info label={isChange ? "Delivered" : "Resolved"}>{dateTime(t.resolvedAt)}</Info>}
          </div>

          {isChange && (
            <div className={`${card} p-4 space-y-3`}>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white"><Calculator className="h-4 w-4 text-violet-600" /> Estimate</h3>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={labelCls}>Hours</label><input type="number" min="0.25" step="0.25" value={estimate.hours} onChange={(e) => setEstimate((f) => ({ ...f, hours: e.target.value }))} className={inputCls} /></div>
                <div><label className={labelCls}>Rate / hour (AED)</label><input type="number" min="0" step="0.01" value={estimate.rate} onChange={(e) => setEstimate((f) => ({ ...f, rate: e.target.value }))} className={inputCls} /></div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">{estimateAmount !== null ? <>= <b className="text-gray-900 dark:text-white">{formatAed(estimateAmount)}</b> + VAT</> : ""}</span>
                {!TICKET_DONE.includes(t.status) && <button type="button" disabled={busy || !(Number(estimate.hours) > 0)} className={btnOutline}
                  onClick={() => run(() => TicketService.estimate(t.ticketId, { estimatedHours: Number(estimate.hours), hourlyRate: Number(estimate.rate || 0) }), "Estimate saved.")}>
                  Save Estimate
                </button>}
              </div>
              {t.quoteNo ? (
                <Link to={`/quotations/${t.quoteLatestId}`} className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span className="font-mono text-sm font-medium text-blue-600">{t.quoteNo}</span>
                  <Badge item={quoteStatusOf(t.quoteStatus)} />
                  {t.leadNo && <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">{t.leadNo}</span>}
                </Link>
              ) : t.estimatedHours ? (
                <button type="button" disabled={busy} onClick={() => run(() => TicketService.quotation(t.ticketId), "Quotation drafted. Open it to review and send.")} className={`${btnPrimary} w-full justify-center`}>
                  <FileText className="h-4 w-4" /> Create Quotation
                </button>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">Save an estimate, then make a quotation from it. When the customer accepts the quotation this request becomes Approved.</p>
              )}
            </div>
          )}
        </div>
      </div>

      <DeleteModal open={confirmDelete} name={`${t.ticketNo} – ${t.subject}`} onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => { setConfirmDelete(false); if (await run(() => TicketService.remove(t.ticketId))) navigate("/tickets"); }} />
    </div>
  );
}
