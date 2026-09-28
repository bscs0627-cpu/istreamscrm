import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LifeBuoy, RefreshCw, Search, Plus, MessageSquare } from "lucide-react";
import { TicketService } from "@/ServiceLayer/TicketService/TicketService";
import { Alerts, inputCls } from "@/components/common/ui";
import { dateTime, displayName, shortTime } from "@/lib/time";
import { TICKET_PRIORITIES, TICKET_TYPES, TICKET_DONE, ticketStatusOf } from "@/lib/crm";
import NewTicketModal from "./NewTicketModal";

const VIEWS = [
  { value: "OPEN", label: "All open" },
  { value: "MINE", label: "Assigned to me" },
  { value: "UNASSIGNED", label: "Unassigned" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "WAITING", label: "Waiting on customer" },
  { value: "DONE", label: "Resolved / closed" },
  { value: "", label: "Everything" },
];

function Tile({ label, value, tone, onClick, active }) {
  return (
    <button onClick={onClick} className={`text-left bg-white dark:bg-slate-900 rounded-xl border shadow-sm p-4 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/50 ${active ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-200 dark:border-slate-800"}`}>
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tone ?? "text-gray-900 dark:text-white"}`}>{value}</div>
    </button>
  );
}

export const Badge = ({ item }) => <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${item.cls}`}>{item.label}</span>;

// "in 5h" / "3h late" for the resolve-by time.
export function dueText(t) {
  if (TICKET_DONE.includes(t.status)) return null;
  const ms = new Date(/Z$/.test(t.dueAt) ? t.dueAt : `${t.dueAt}Z`) - new Date();
  const h = Math.round(Math.abs(ms) / 3600000);
  const span = h >= 48 ? `${Math.round(h / 24)}d` : `${Math.max(h, 1)}h`;
  return ms < 0 ? `${span} late` : `in ${span}`;
}

export default function TicketsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState({ search: "", view: "OPEN", type: "", priority: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newTicket, setNewTicket] = useState(location.state?.newTicket ?? null);

  useEffect(() => {
    if (location.state?.newTicket) navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (f = filters) => {
    setLoading(true);
    try {
      const [list, sum] = await Promise.all([
        TicketService.getAll(Object.fromEntries(Object.entries(f).filter(([, v]) => v))),
        TicketService.summary(),
      ]);
      setRows(list);
      setSummary(sum);
    } catch { setError("Failed to load tickets."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFilter = (k, v) => {
    const next = { ...filters, [k]: v };
    setFilters(next);
    if (k !== "search") load(next);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-600/10 p-2"><LifeBuoy className="h-6 w-6 text-blue-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tickets</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Customer support issues and change requests for your software</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load()} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={() => setNewTicket({})} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium">
            <Plus className="h-4 w-4" /> New Ticket
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <Tile label="Open" value={summary.open} onClick={() => setFilter("view", "OPEN")} active={filters.view === "OPEN"} />
          <Tile label="Assigned to me" value={summary.mine} onClick={() => setFilter("view", "MINE")} active={filters.view === "MINE"} />
          <Tile label="Unassigned" value={summary.unassigned} tone={summary.unassigned > 0 ? "text-amber-600" : undefined} onClick={() => setFilter("view", "UNASSIGNED")} active={filters.view === "UNASSIGNED"} />
          <Tile label="Overdue" value={summary.overdue} tone={summary.overdue > 0 ? "text-red-600" : undefined} onClick={() => setFilter("view", "OVERDUE")} active={filters.view === "OVERDUE"} />
          <Tile label="Waiting on customer" value={summary.waiting} onClick={() => setFilter("view", "WAITING")} active={filters.view === "WAITING"} />
          <Tile label="Open change requests" value={summary.openChanges} onClick={() => { const n = { ...filters, view: "OPEN", type: "CHANGE" }; setFilters(n); load(n); }}
            active={filters.view === "OPEN" && filters.type === "CHANGE"} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={filters.search} onChange={(e) => setFilter("search", e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Ticket no, subject, company, contact..." className={`${inputCls} pl-9`} />
        </div>
        <select value={filters.view} onChange={(e) => setFilter("view", e.target.value)} className={`${inputCls.replace("w-full ", "")} w-48`}>
          {VIEWS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
        </select>
        <select value={filters.type} onChange={(e) => setFilter("type", e.target.value)} className={`${inputCls.replace("w-full ", "")} w-40`}>
          <option value="">Any type</option>
          {TICKET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filters.priority} onChange={(e) => setFilter("priority", e.target.value)} className={`${inputCls.replace("w-full ", "")} w-36`}>
          <option value="">Any priority</option>
          {TICKET_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <button onClick={() => load()} className="rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Apply</button>
      </div>

      <Alerts error={error} onClearError={() => setError("")} />

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <tr className="text-left text-gray-600 dark:text-gray-300">
                <th className="px-4 py-3 font-medium">Ticket</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Assigned</th>
                <th className="px-4 py-3 font-medium">Resolve by</th>
                <th className="px-4 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No tickets here.</td></tr>
              )}
              {rows.map((t) => {
                const due = dueText(t);
                return (
                  <tr key={t.ticketId} className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 max-w-80">
                      <Link to={`/tickets/${t.ticketId}`} className="font-mono text-xs font-medium text-blue-600 hover:underline">{t.ticketNo}</Link>
                      <div className="truncate text-gray-900 dark:text-white" title={t.subject}>{t.subject}</div>
                      {t.commentCount > 0 && <div className="inline-flex items-center gap-1 text-xs text-gray-400"><MessageSquare className="h-3 w-3" />{t.commentCount}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{t.accountName || displayName(t)}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{t.accountName ? displayName(t) : ""}{t.productCode ? `${t.accountName ? " · " : ""}${t.productCode}` : ""}</div>
                    </td>
                    <td className="px-4 py-3"><Badge item={TICKET_TYPES.find((x) => x.value === t.ticketType)} /></td>
                    <td className="px-4 py-3"><Badge item={TICKET_PRIORITIES.find((x) => x.value === t.priority)} /></td>
                    <td className="px-4 py-3"><Badge item={ticketStatusOf(t.status, t.ticketType)} /></td>
                    <td className={`px-4 py-3 ${t.assignedToName ? "text-gray-600 dark:text-gray-300" : "text-amber-600"}`}>{t.assignedToName || "Unassigned"}</td>
                    <td className={`px-4 py-3 ${t.isOverdue ? "text-red-600 font-medium" : "text-gray-600 dark:text-gray-300"}`} title={dateTime(t.dueAt)}>
                      {due ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{shortTime(t.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {newTicket && <NewTicketModal {...newTicket} onClose={() => setNewTicket(null)} />}
    </div>
  );
}
