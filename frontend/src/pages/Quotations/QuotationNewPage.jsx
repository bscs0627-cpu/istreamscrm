import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Target, Loader2 } from "lucide-react";
import { LeadService } from "@/ServiceLayer/LeadService/LeadService";
import { QuotationService } from "@/ServiceLayer/QuoteService/QuoteService";
import { Alerts, Breadcrumb, inputCls } from "@/components/common/ui";
import { apiError } from "@/lib/apiClient";
import { displayName } from "@/lib/time";
import { formatAed, requirementSummary } from "@/lib/crm";
import { statusOf } from "@/pages/Leads/LeadsPage";

const card = "bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm";

export default function QuotationNewPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState([]);
  const [picked, setPicked] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      LeadService.getAll({ view: "open", search: search.trim() || undefined })
        .then((r) => setLeads(r.slice(0, 30)))
        .catch(() => setError("Failed to load leads."))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const create = async () => {
    if (creating || !picked) return;
    setCreating(true); setError("");
    try {
      const q = await QuotationService.fromLead(picked.leadId);
      navigate(`/quotations/${q.quotationId}`);
    } catch (err) {
      setError(apiError(err, "Failed to create quotation."));
      setCreating(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <Breadcrumb items={[{ label: "Quotations", to: "/quotations" }, { label: "New Quotation" }]} />
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create Quotation</h1>
      <Alerts error={error} onClearError={() => setError("")} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className={`${card} p-5 xl:col-span-2`}>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Select Lead</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Choose the open lead this quotation is for. It starts as a draft with the lead's products.</p>
          <div className="relative max-w-md mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Lead no, name, company, mobile, email..." className={`${inputCls} pl-9`} />
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-slate-800 max-h-[32rem] overflow-y-auto rounded-lg border border-gray-200 dark:border-slate-700">
            {leads.length === 0 && <li className="px-4 py-10 text-center text-sm text-gray-400">{loading ? "Loading..." : "No open leads found."}</li>}
            {leads.map((l) => {
              const st = statusOf(l.status);
              return (
                <li key={l.leadId}>
                  <button type="button" onClick={() => setPicked(l)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800/50 ${picked?.leadId === l.leadId ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{l.leadNo}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{l.accountName || displayName(l) || "—"}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{[l.accountName && displayName(l), requirementSummary(l)].filter(Boolean).join(" · ") || "—"}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={`${card} p-5 flex flex-col min-h-[16rem]`}>
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-5 w-5 text-gray-400" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Lead</h2>
          </div>
          {picked ? (
            <div className="space-y-1 text-sm flex-1">
              <div className="font-medium text-gray-900 dark:text-white">{picked.accountName || displayName(picked) || "—"}</div>
              {picked.accountName && displayName(picked) && <div className="text-gray-600 dark:text-gray-300">{displayName(picked)}</div>}
              {picked.mobileNo && <div className="text-gray-500 dark:text-gray-400">+{picked.mobileNo}</div>}
              {picked.email && <div className="text-gray-500 dark:text-gray-400">{picked.email}</div>}
              <div className="pt-2 text-gray-600 dark:text-gray-300">{picked.leadNo}{picked.title ? ` · ${picked.title}` : ""}</div>
              {picked.productNames && <div className="text-xs text-gray-500 dark:text-gray-400">{picked.productNames}</div>}
              {picked.expectedValue > 0 && <div className="text-xs text-gray-500 dark:text-gray-400">Expected value {formatAed(picked.expectedValue)}</div>}
            </div>
          ) : (
            <p className="flex-1 text-sm text-gray-400 py-6 text-center">Pick a lead from the list.</p>
          )}
          <div className="flex justify-center gap-2 pt-4">
            <button type="button" onClick={() => navigate("/quotations")} className="rounded-lg border border-gray-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Cancel</button>
            <button type="button" onClick={create} disabled={!picked || creating}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-60">
              {creating && <Loader2 className="h-4 w-4 animate-spin" />} {creating ? "Creating..." : "Create Quotation"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
