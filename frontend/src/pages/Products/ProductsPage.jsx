import { useEffect, useState } from "react";
import { Package, Plus, RefreshCw, Search, X, Pencil, Trash2 } from "lucide-react";
import { ProductService } from "@/ServiceLayer/CatalogService/CatalogService";
import { useAuth } from "@/context/AuthContext";
import { Alerts, DeleteModal, inputCls, labelCls } from "@/components/common/ui";
import { apiError } from "@/lib/apiClient";
import { ITEM_TYPES, UNITS, PRODUCT_CATEGORIES, labelOf, formatAed } from "@/lib/crm";

const emptyForm = {
  productCode: "", productName: "", category: "ERP", itemType: "LICENSE", unit: "PER_USER", price: "", vatPct: "5",
  description: "", isActive: "T",
};

// Sensible default unit when the type changes (the user can still pick another).
const DEFAULT_UNIT = {
  LICENSE: "PER_USER", SUBSCRIPTION: "PER_USER_MONTH", IMPLEMENTATION: "FIXED", CUSTOMIZATION: "PER_HOUR",
  AMC: "PER_YEAR", TRAINING: "PER_DAY", HARDWARE: "FIXED", OTHER: "FIXED",
};

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
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ search: "", category: "", itemType: "" });
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
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

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setType = (e) => setForm((f) => ({ ...f, itemType: e.target.value, unit: DEFAULT_UNIT[e.target.value] ?? f.unit }));
  const openAdd = () => { setEditId(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (p) => {
    setEditId(p.productId);
    setForm({
      productCode: p.productCode, productName: p.productName, category: p.category, itemType: p.itemType, unit: p.unit,
      price: String(p.price), vatPct: String(p.vatPct), description: p.description ?? "", isActive: p.isActive,
    });
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.productCode.trim() || !form.productName.trim() || !form.category.trim()) { setError("Code, name and category are required."); return; }
    if (form.price === "" || Number(form.price) < 0) { setError("Enter the price in AED (0 is allowed)."); return; }
    setSaving(true); setError("");
    const payload = { ...form, price: Number(form.price), vatPct: Number(form.vatPct || 0), description: form.description.trim() || null };
    try {
      if (editId) { await ProductService.update(editId, payload); setSuccess("Product updated."); }
      else { await ProductService.create(payload); setSuccess("Product added."); }
      setShowForm(false); setEditId(null); setForm(emptyForm); load();
    } catch (err) {
      setError(apiError(err, "Failed to save product."));
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    try { await ProductService.remove(deleteTarget.productId); setSuccess("Product deleted."); }
    catch (err) { setError(apiError(err, "Failed to delete product.")); }
    finally { setDeleteTarget(null); load(); }
  };

  const allCategories = [...new Set([...PRODUCT_CATEGORIES, ...categories])];
  const withVat = form.price !== "" ? Number(form.price) * (1 + Number(form.vatPct || 0) / 100) : null;

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
            <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium">
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

      {showForm && (
        <form onSubmit={submit} className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{editId ? "Edit Product" : "New Product"}</h2>
            <button type="button" onClick={() => setShowForm(false)}><X className="h-5 w-5 text-gray-400 hover:text-gray-600" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className={labelCls}>Code *</label>
              <input value={form.productCode} onChange={set("productCode")} maxLength={30} className={`${inputCls} uppercase`} placeholder="e.g. ERP-LIC" />
            </div>
            <div className="lg:col-span-2">
              <label className={labelCls}>Name *</label>
              <input value={form.productName} onChange={set("productName")} maxLength={200} className={inputCls} placeholder="e.g. iStreams ERP – User License" />
            </div>
            <div>
              <label className={labelCls}>Category *</label>
              <input value={form.category} onChange={set("category")} list="product-categories" maxLength={50} className={inputCls} />
              <datalist id="product-categories">{allCategories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label className={labelCls}>Type *</label>
              <select value={form.itemType} onChange={setType} className={inputCls}>
                {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priced *</label>
              <select value={form.unit} onChange={set("unit")} className={inputCls}>
                {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Price (AED, before VAT) *</label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={set("price")} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>VAT %</label>
              <input type="number" min="0" max="100" step="0.01" value={form.vatPct} onChange={set("vatPct")} className={inputCls} />
              {withVat !== null && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">With VAT: {formatAed(withVat)}</p>}
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className={labelCls}>Description (shown on quotations)</label>
              <textarea value={form.description} onChange={set("description")} rows={2} maxLength={2000} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.isActive} onChange={set("isActive")} className={inputCls}>
                <option value="T">Active</option>
                <option value="F">Inactive</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-60">{saving ? "Saving..." : editId ? "Update" : "Save"}</button>
          </div>
        </form>
      )}

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
                        <button onClick={() => openEdit(p)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-blue-600" title="Edit"><Pencil className="h-4 w-4" /></button>
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
