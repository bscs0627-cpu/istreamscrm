import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { ProductService } from "@/ServiceLayer/CatalogService/CatalogService";
import { Alerts, Breadcrumb, DeleteModal, inputCls, labelCls } from "@/components/common/ui";
import { apiError } from "@/lib/apiClient";
import { ITEM_TYPES, UNITS, PRODUCT_CATEGORIES, SUB_DETAIL_TYPES, formatAed } from "@/lib/crm";

const emptyForm = {
  productCode: "", productName: "", supplierRef: "", price: "", unit: "PER_USER", marginPct: "", category: "ERP",
  subCategory: "", itemType: "LICENSE", vatPct: "5", description: "", isActive: "T", image: "",
  hasSubProducts: "F", subDetailType: "", subUom: "", conversionRate: "1",
};

const REQUIRED = {
  productName: "Item name", supplierRef: "Supplier ref", price: "Sales price", unit: "UoM", marginPct: "Margin %", category: "Category",
};

const emptySub = { subName: "", detail: "", price: "", image: "", isActive: "T" };

const DEFAULT_UNIT = {
  LICENSE: "PER_USER", SUBSCRIPTION: "PER_USER_MONTH", IMPLEMENTATION: "FIXED", CUSTOMIZATION: "PER_HOUR",
  AMC: "PER_YEAR", TRAINING: "PER_DAY", HARDWARE: "FIXED", OTHER: "FIXED",
};

const card = "bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm";

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, 480 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function ImageBox({ value, onChange, className }) {
  const ref = useRef(null);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onChange(await readImage(file).catch(() => ""));
  };
  return (
    <div className={`relative ${className}`}>
      <button type="button" onClick={() => ref.current.click()}
        className="h-full w-full rounded-xl border-2 border-gray-300 dark:border-slate-700 bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400 overflow-hidden">
        {value ? <img src={value} alt="" className="h-full w-full object-contain" /> : "Click to Upload"}
      </button>
      {value && (
        <button type="button" onClick={() => onChange("")} className="absolute top-1.5 right-1.5 rounded-full bg-white/90 dark:bg-slate-900/90 p-1 text-gray-500 hover:text-red-600" title="Remove image">
          <X className="h-4 w-4" />
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={pick} />
    </div>
  );
}

export default function ProductFormPage() {
  const { id } = useParams();
  const editId = id ? Number(id) : null;
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState("details");
  const [form, setForm] = useState(emptyForm);
  const [specs, setSpecs] = useState([]);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [subs, setSubs] = useState([]);
  const [subForm, setSubForm] = useState(null);
  const [subDelete, setSubDelete] = useState(null);
  const [categories, setCategories] = useState([]);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [success, setSuccess] = useState(location.state?.success ?? "");
  const [error, setError] = useState(location.state?.error ?? "");

  useEffect(() => {
    ProductService.categories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (!editId) return;
    ProductService.get(editId)
      .then(({ product: p, subProducts }) => {
        setForm({
          productCode: p.productCode, productName: p.productName, supplierRef: p.supplierRef ?? "", price: String(p.price),
          unit: p.unit, marginPct: p.marginPct == null ? "" : String(p.marginPct), category: p.category, subCategory: p.subCategory ?? "",
          itemType: p.itemType, vatPct: String(p.vatPct), description: p.description ?? "", isActive: p.isActive,
          image: p.image ?? "", hasSubProducts: p.hasSubProducts, subDetailType: p.subDetailType ?? "", subUom: p.subUom ?? "",
          conversionRate: String(p.conversionRate ?? 1),
        });
        try { setSpecs(p.specifications ? JSON.parse(p.specifications) : []); } catch { setSpecs([]); }
        setSubs(subProducts);
      })
      .catch(() => setError("Failed to load product."))
      .finally(() => setLoading(false));
  }, [editId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setSub = (k) => (e) => setSubForm((f) => ({ ...f, [k]: e.target.value }));
  const missing = (k) => touched && REQUIRED[k] && !String(form[k]).trim();
  const fieldCls = (k) => `${inputCls} ${missing(k) ? "border-red-400 dark:border-red-500" : ""}`;
  const Req = ({ k, label }) => <label className={labelCls}>{label}{REQUIRED[k] && <span className="text-red-500">*</span>}</label>;
  const Err = ({ k }) => (missing(k) ? <p className="mt-1 text-xs text-red-500">{REQUIRED[k]} is required</p> : null);
  const withVat = form.price !== "" ? Number(form.price) * (1 + Number(form.vatPct || 0) / 100) : null;

  const validate = () => {
    setTouched(true);
    const first = Object.keys(REQUIRED).find((k) => !String(form[k]).trim());
    if (first) { setTab("details"); setError(`${REQUIRED[first]} is required.`); return false; }
    if (Number(form.price) < 0) { setTab("details"); setError("Sales price cannot be negative."); return false; }
    if (form.hasSubProducts === "T" && !form.subDetailType) { setTab("config"); setError("Select the sub product details."); return false; }
    return true;
  };

  const saveProduct = async () => {
    const payload = {
      productCode: form.productCode.trim(), productName: form.productName.trim(), supplierRef: form.supplierRef.trim() || null,
      price: Number(form.price), unit: form.unit, marginPct: Number(form.marginPct), category: form.category.trim(),
      subCategory: form.subCategory.trim() || null, itemType: form.itemType, vatPct: Number(form.vatPct || 0),
      description: form.description.trim() || null, isActive: form.isActive, image: form.image || null,
      specifications: specs.some((s) => s.name.trim()) ? JSON.stringify(specs.filter((s) => s.name.trim())) : null,
      hasSubProducts: form.hasSubProducts, subDetailType: form.subDetailType || null, subUom: form.subUom || null,
      conversionRate: Number(form.conversionRate || 1),
    };
    try {
      return editId ? (await ProductService.update(editId, payload), editId) : (await ProductService.create(payload)).productId;
    } catch (err) {
      setError(apiError(err, "Failed to save product."));
      return null;
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving || !validate()) return;
    setSaving(true); setError("");
    const productId = await saveProduct();
    setSaving(false);
    if (productId) navigate("/products");
  };

  const openSub = (s) => {
    if (!editId && !validate()) return;
    setSubForm(s ? { ...s, price: String(s.price), detail: s.detail ?? "", image: s.image ?? "" } : { ...emptySub });
  };

  const saveSub = async () => {
    if (saving) return;
    if (!subForm.subName.trim()) { setError("Sub product name is required."); return; }
    if (subForm.price === "" || Number(subForm.price) < 0) { setError("Enter the sub product price (0 is allowed)."); return; }
    setSaving(true); setError("");
    let productId = editId;
    if (!productId) productId = await saveProduct();
    if (!productId) { setSaving(false); return; }
    const body = {
      subName: subForm.subName.trim(), detail: subForm.detail.trim() || null, price: Number(subForm.price),
      image: subForm.image || null, isActive: subForm.isActive,
    };
    try {
      const row = subForm.subId
        ? await ProductService.updateSub(productId, subForm.subId, body)
        : await ProductService.createSub(productId, body);
      if (!editId) {
        navigate(`/products/${productId}/edit`, { replace: true, state: { success: "Product and sub product saved." } });
        return;
      }
      setSubs((ss) => (subForm.subId ? ss.map((x) => (x.subId === row.subId ? row : x)) : [...ss, row]));
      setSubForm(null);
      setSuccess("Sub product saved.");
    } catch (err) {
      const msg = apiError(err, "Failed to save sub product.");
      if (!editId) navigate(`/products/${productId}/edit`, { replace: true, state: { error: `Product saved, but the sub product failed - ${msg}` } });
      else setError(msg);
    } finally { setSaving(false); }
  };

  const removeSub = async () => {
    try {
      await ProductService.removeSub(editId, subDelete.subId);
      setSubs((ss) => ss.filter((x) => x.subId !== subDelete.subId));
      setSuccess("Sub product deleted.");
    } catch (err) { setError(apiError(err, "Failed to delete sub product.")); }
    finally { setSubDelete(null); }
  };

  if (loading) return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading...</div>;

  const allCategories = [...new Set([...PRODUCT_CATEGORIES, ...categories])];
  const hasSubs = form.hasSubProducts === "T";
  const tabCls = (t) => `flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${tab === t
    ? "bg-white dark:bg-slate-900 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400"}`;

  return (
    <div className="p-6 space-y-4">
      <Breadcrumb items={[{ label: "Products", to: "/products" }, { label: editId ? "Edit Product" : "New Product" }]} />
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{editId ? "Edit Product" : "Create Product"}</h1>
      <Alerts success={success} error={error} onClearSuccess={() => setSuccess("")} onClearError={() => setError("")} />

      <div className="flex gap-1 rounded-xl bg-gray-100 dark:bg-slate-800 p-1">
        <button type="button" onClick={() => setTab("details")} className={tabCls("details")}>Product Details</button>
        <button type="button" onClick={() => setTab("config")} className={tabCls("config")}>Product Configuration</button>
      </div>

      <form onSubmit={submit} noValidate className={tab === "details" ? "grid grid-cols-1 xl:grid-cols-2 gap-4 items-start" : ""}>
        {tab === "details" && (
          <>
            <div className={`${card} p-5`}>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Product Details</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Provide essential information to define and manage your product.</p>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-4">
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>Item Code</label>
                    <input value={form.productCode} onChange={set("productCode")} maxLength={30} className={`${inputCls} uppercase`} placeholder="New" />
                  </div>
                  <div>
                    <Req k="productName" label="Item Name" />
                    <input value={form.productName} onChange={set("productName")} maxLength={200} className={fieldCls("productName")} placeholder="Type item name" />
                    <Err k="productName" />
                  </div>
                  <div>
                    <Req k="supplierRef" label="Supplier Ref" />
                    <input value={form.supplierRef} onChange={set("supplierRef")} maxLength={100} className={fieldCls("supplierRef")} placeholder="Type supplier ref" />
                    <Err k="supplierRef" />
                  </div>
                </div>
                <ImageBox value={form.image} onChange={(v) => setForm((f) => ({ ...f, image: v }))} className="h-56 md:h-auto min-h-[12rem]" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <Req k="price" label="Sales Price" />
                  <input type="number" min="0" step="0.01" value={form.price} onChange={set("price")} className={fieldCls("price")} placeholder="Type sales price (AED, before VAT)" />
                  <Err k="price" />
                </div>
                <div>
                  <Req k="unit" label="UoM" />
                  <select value={form.unit} onChange={set("unit")} className={fieldCls("unit")}>
                    <option value="">Select...</option>
                    {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                  <Err k="unit" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div>
                  <Req k="marginPct" label="Margin %" />
                  <input type="number" min="0" step="0.01" value={form.marginPct} onChange={set("marginPct")} className={fieldCls("marginPct")} placeholder="Type margin" />
                  <Err k="marginPct" />
                </div>
                <div>
                  <Req k="category" label="Category" />
                  <input value={form.category} onChange={set("category")} list="product-categories" maxLength={50} className={fieldCls("category")} placeholder="Select category..." />
                  <datalist id="product-categories">{allCategories.map((c) => <option key={c} value={c} />)}</datalist>
                  <Err k="category" />
                </div>
                <div>
                  <label className={labelCls}>Sub Category</label>
                  <input value={form.subCategory} onChange={set("subCategory")} maxLength={50} className={inputCls} placeholder="Select sub category..." />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div>
                  <label className={labelCls}>Type</label>
                  <select value={form.itemType} onChange={(e) => setForm((f) => ({ ...f, itemType: e.target.value, unit: DEFAULT_UNIT[e.target.value] ?? f.unit }))} className={inputCls}>
                    {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>VAT %</label>
                  <input type="number" min="0" max="100" step="0.01" value={form.vatPct} onChange={set("vatPct")} className={inputCls} />
                  {withVat !== null && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">With VAT: {formatAed(withVat)}</p>}
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select value={form.isActive} onChange={set("isActive")} className={inputCls}>
                    <option value="T">Active</option>
                    <option value="F">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className={labelCls}>Remarks</label>
                <textarea value={form.description} onChange={set("description")} rows={3} maxLength={2000} className={inputCls} placeholder="Enter item features (shown on quotations)" />
              </div>

              <div className="mt-4 border-t border-gray-200 dark:border-slate-800 pt-3">
                <button type="button" onClick={() => setSpecsOpen((o) => !o)} className="w-full flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-white">
                  Specifications <ChevronDown className={`h-5 w-5 text-gray-500 transition-transform ${specsOpen ? "rotate-180" : ""}`} />
                </button>
                {specsOpen && (
                  <div className="mt-3 space-y-2">
                    {specs.map((s, i) => (
                      <div key={i} className="flex gap-2">
                        <input value={s.name} onChange={(e) => setSpecs((r) => r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={inputCls} placeholder="Name (e.g. Users)" />
                        <input value={s.value} onChange={(e) => setSpecs((r) => r.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className={inputCls} placeholder="Value" />
                        <button type="button" onClick={() => setSpecs((r) => r.filter((_, j) => j !== i))} className="rounded-md p-2 text-gray-500 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setSpecs((r) => [...r, { name: "", value: "" }])} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
                      <Plus className="h-4 w-4" /> Add specification
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className={`${card} p-5 flex flex-col min-h-[24rem]`}>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Create Sub Products</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Add and configure sub-products under your main product.</p>

              {!hasSubs && (
                <p className="text-sm text-gray-400 py-10 text-center">
                  Turn on "This Product has sub products?" in the Product Configuration tab to add sub products.
                </p>
              )}

              {hasSubs && (
                <>
                  <div className="flex-1 space-y-2 overflow-y-auto max-h-[32rem]">
                    {subs.length === 0 && !subForm && <p className="text-sm text-gray-400 py-10 text-center">No sub products yet.</p>}
                    {subs.map((s) => (
                      <div key={s.subId} className={`flex items-center gap-3 rounded-xl border border-gray-200 dark:border-slate-700 p-3 ${s.isActive === "T" ? "" : "opacity-60"}`}>
                        <div className="h-12 w-12 shrink-0 rounded-md bg-gray-100 dark:bg-slate-800 overflow-hidden">
                          {s.image && <img src={s.image} alt="" className="h-full w-full object-contain" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-gray-900 dark:text-white truncate">{s.subName}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {[s.detail, formatAed(s.price)].filter(Boolean).join(" | ")}
                          </div>
                        </div>
                        <button type="button" onClick={() => openSub(s)} className="rounded-md p-1.5 text-gray-500 hover:text-blue-600" title="Edit"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setSubDelete(s)} className="rounded-md p-1.5 text-red-500 hover:text-red-700" title="Delete"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}

                    {subForm && (
                      <div className="rounded-xl border border-blue-300 dark:border-blue-800 p-3 space-y-3">
                        <div className="grid grid-cols-[6rem_1fr] gap-3">
                          <ImageBox value={subForm.image} onChange={(v) => setSubForm((f) => ({ ...f, image: v }))} className="h-24" />
                          <div className="space-y-3">
                            <div>
                              <label className={labelCls}>Sub Product Name<span className="text-red-500">*</span></label>
                              <input value={subForm.subName} onChange={setSub("subName")} maxLength={200} className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>{form.subDetailType || "Details"}</label>
                              <input value={subForm.detail} onChange={setSub("detail")} maxLength={200} className={inputCls} placeholder="e.g. Enterprise | 50 users" />
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={labelCls}>Price (AED)<span className="text-red-500">*</span></label>
                            <input type="number" min="0" step="0.01" value={subForm.price} onChange={setSub("price")} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls}>Status</label>
                            <select value={subForm.isActive} onChange={setSub("isActive")} className={inputCls}>
                              <option value="T">Active</option>
                              <option value="F">Inactive</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setSubForm(null)} className="rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Cancel</button>
                          <button type="button" onClick={saveSub} disabled={saving} className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
                        </div>
                      </div>
                    )}
                  </div>
                  {!subForm && (
                    <div className="flex justify-center pt-4">
                      <button type="button" onClick={() => openSub(null)} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800">
                        Add Sub Product <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {tab === "config" && (
          <div className={`${card} p-5`}>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Product Configuration</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Customize product settings</p>

            <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              <input type="checkbox" checked={hasSubs} className="h-4 w-4 accent-blue-600"
                onChange={(e) => setForm((f) => ({ ...f, hasSubProducts: e.target.checked ? "T" : "F" }))} />
              This Product has sub products?
            </label>

            {hasSubs && (
              <div className="mt-5 space-y-4">
                <div>
                  <label className={labelCls}>Select sub product details<span className="text-red-500">*</span></label>
                  <select value={form.subDetailType} onChange={set("subDetailType")} className={`${inputCls} ${touched && !form.subDetailType ? "border-red-400 dark:border-red-500" : ""}`}>
                    <option value="">Select sub material details</option>
                    {SUB_DETAIL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>UOM for SubMaterial</label>
                  <select value={form.subUom} onChange={set("subUom")} className={inputCls}>
                    <option value="">Not Selected</option>
                    {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Conversion Rate</label>
                  <input type="number" min="0" step="0.0001" value={form.conversionRate} onChange={set("conversionRate")} className={inputCls} />
                </div>
              </div>
            )}
          </div>
        )}

        <div className={`flex justify-center gap-2 mt-2 ${tab === "details" ? "xl:col-span-2" : ""}`}>
          <button type="button" onClick={() => navigate("/products")} className="rounded-lg border border-gray-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-slate-900 dark:bg-blue-600 hover:opacity-90 text-white px-6 py-2 text-sm font-medium disabled:opacity-60">
            {saving ? "Saving..." : editId ? "Update Product" : "Save Product"}
          </button>
        </div>
      </form>

      <DeleteModal open={!!subDelete} name={subDelete?.subName} onCancel={() => setSubDelete(null)} onConfirm={removeSub} />
    </div>
  );
}
