import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { TicketService } from "@/ServiceLayer/TicketService/TicketService";
import { shortTime } from "@/lib/time";
import { TICKET_DONE, ticketStatusOf } from "@/lib/crm";
import NewTicketModal from "@/pages/Tickets/NewTicketModal";

// The contact's support tickets and change requests (open ones first).
export default function LeadTickets({ lead }) {
  const [rows, setRows] = useState([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    TicketService.getAll({ customerId: lead.customerId }).then(setRows).catch(() => {});
  }, [lead.customerId]);

  const open = rows.filter((t) => !TICKET_DONE.includes(t.status)).length;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tickets{open > 0 && <span className="ml-1 text-xs font-normal text-gray-500">({open} open)</span>}</h3>
        <button onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">
          <Plus className="h-3.5 w-3.5" /> New Ticket
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">No support tickets or change requests from this contact.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.slice(0, 8).map((t) => {
            const st = ticketStatusOf(t.status, t.ticketType);
            return (
              <li key={t.ticketId}>
                <Link to={`/tickets/${t.ticketId}`} className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                  <span className="font-mono text-xs text-blue-600">{t.ticketNo}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-white" title={t.subject}>{t.ticketType === "CHANGE" ? "Change: " : ""}{t.subject}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                  <span className="shrink-0 text-xs text-gray-400">{shortTime(t.updatedAt)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {adding && (
        <NewTicketModal onClose={() => setAdding(false)}
          customer={{ customerId: lead.customerId, customerName: lead.customerName, whatsappName: lead.whatsappName, mobileNo: lead.mobileNo, email: lead.email, accountName: lead.accountName }} />
      )}
    </div>
  );
}
