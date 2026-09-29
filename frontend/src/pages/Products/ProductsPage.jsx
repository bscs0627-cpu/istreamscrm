import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Plus, RefreshCw, Search, Pencil, Trash2 } from "lucide-react";
import { ProductService } from "@/ServiceLayer/CatalogService/CatalogService";
import { useAuth } from "@/context/AuthContext";
import { Alerts, DeleteModal, inputCls } from "@/components/common/ui";
import { apiError } from "@/lib/apiClient";
import { ITEM_TYPES, UNITS, labelOf, formatAed } from "@/lib/crm";

const TYPE_CLS = {
  LICENSE: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  SUBSCRIPTION: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  IMPLEMENTATION: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  CUSTOMIZATION: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  AMC: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  TRAINING: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
};

export default function ProductsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ search: "", category: "", itemType: "" });
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const load = async (f = filters) => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
      const [list, cats] = await Promise.all([ProductService.getAll(params), ProductService.categories()]);
      setRows(list); setCategories(cats);
    } catch { setError("Failed to load products."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFilter = (k) => (e) => {
    const next = { ...filters, [k]: e.target.value };
    setFilters(next);
    if (k !== "search") load(next);
  };

  const confirmDelete = async () => {
    try { await ProductService.remove(deleteTarget.productId); setSuccess("Product deleted."); }
    catch (err) { setError(apiError(err, "Failed to delete product.")); }
    finally { setDeleteTarget(null); load(); }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-600/10 p-2"><Package className="h-6 w-6 text-blue-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Products</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Price list: licenses, subscriptions, implementation, customization and support</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load()} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          {isAdmin && (
            <button onClick={() => navigate("/products/new")} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium">
              <Plus className="h-4 w-4" /> Add Product
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={filters.search} onChange={setFilter("search")} onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Code, name or description..." className={`${inputCls} pl-9`} />
        </div>
        <select value={filters.category} onChange={setFilter("category")} className={`${inputCls.replace("w-full ", "")} w-44`}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filters.itemType} onChange={setFilter("itemType")} className={`${inputCls.replace("w-full ", "")} w-44`}>
          <option value="">All types</option>
          {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button onClick={() => load()} className="rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Apply</button>
      </div>

      <Alerts success={success} error={error} onClearSuccess={() => setSuccess("")} onClearError={() => setError("")} />

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <tr className="text-left text-gray-600 dark:text-gray-300">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium text-right">Price</th>
                <th className="px-4 py-3 font-medium text-right">VAT</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {isAdmin && <th className="px-4 py-3 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={isAdmin ? 8 : 7} className="px-4 py-10 text-center text-gray-400">
                  No products yet.{isAdmin ? " Add your software, subscriptions and services to build the price list." : ""}
                </td></tr>
              )}
              {rows.map((p) => (
                <tr key={p.productId} className={`border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors ${p.isActive === "T" ? "" : "opacity-60"}`}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">{p.productCode}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white">{p.productName}</div>
                    {p.description && <div className="max-w-md truncate text-xs text-gray-500 dark:text-gray-400">{p.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{p.category}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_CLS[p.itemType] ?? "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-gray-300"}`}>
                      {labelOf(ITEM_TYPES, p.itemType)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="font-medium text-gray-900 dark:text-white tabular-nums">{formatAed(p.price)}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{labelOf(UNITS, p.unit)}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300 tabular-nums">{Number(p.vatPct)}%</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${p.isActive === "T"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-gray-200 text-gray-600 dark:bg-slate-700 dark:text-gray-300"}`}>
                      {p.isActive === "T" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => navigate(`/products/${p.productId}/edit`)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-blue-600" title="Edit"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => setDeleteTarget(p)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DeleteModal open={!!deleteTarget} name={deleteTarget ? `${deleteTarget.productCode} – ${deleteTarget.productName}` : ""}
        onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
    </div>
  );
}
