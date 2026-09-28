import { useEffect, useRef, useState } from "react";
import { Landmark, Upload, Trash2, Loader2 } from "lucide-react";
import { CompanyProfileService } from "@/ServiceLayer/QuoteService/QuoteService";
import { Alerts, inputCls, labelCls } from "@/components/common/ui";
import { apiError } from "@/lib/apiClient";

const FIELDS = [
  "legalName", "trn", "address", "phone", "email", "website", "bankName", "bankAccountName", "bankAccountNo", "iban", "swift",
  "quoteValidityDays", "maxDiscountPct", "quotePaymentTerms", "quoteTerms",
];

const SAMPLE_TERMS = `1. Prices are in UAE Dirhams (AED) and exclude VAT unless stated; VAT is charged at 5%.
2. Licences are perpetual for the named number of users; annual support (AMC) is renewed yearly.
3. Implementation starts after the advance payment and sign-off of the scope document.
4. Customization beyond the agreed scope is billed separately at the hourly rate.
5. This quotation is valid until the date shown.`;

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 pb-1 border-b border-gray-100 dark:border-slate-800">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">{children}</div>
    </div>
  );
}

function Field({ label, span, children }) {
  return (
    <div className={span === 2 ? "md:col-span-2" : span === 4 ? "md:col-span-2 lg:col-span-4" : ""}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

export default function CompanyProfilePage() {
  const [form, setForm] = useState(null);
  const [logoUrl, setLogoUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const loadLogo = async (has) => {
    if (has !== "T") { setLogoUrl(null); return; }
    try { setLogoUrl(URL.createObjectURL(await CompanyProfileService.logo())); } catch { setLogoUrl(null); }
  };

  const apply = (p) => {
    setForm(Object.fromEntries(FIELDS.map((k) => [k, p[k] === null || p[k] === undefined ? "" : String(p[k])])));
    loadLogo(p.hasLogo);
  };

  useEffect(() => {
    CompanyProfileService.get().then(apply).catch(() => setError("Failed to load company profile."));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const trn = form.trn.replace(/\s/g, "");
    if (trn && !/^\d{15}$/.test(trn)) { setError("TRN must be 15 digits."); return; }
    setSaving(true); setError("");
    const payload = Object.fromEntries(FIELDS.map((k) => [k, form[k].trim() || null]));
    payload.trn = trn || null;
    payload.quoteValidityDays = Number(form.quoteValidityDays || 30);
    payload.maxDiscountPct = Number(form.maxDiscountPct || 0);
    try { apply(await CompanyProfileService.save(payload)); setSuccess("Company profile saved."); }
    catch (err) { setError(apiError(err, "Failed to save.")); }
    finally { setSaving(false); }
  };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true); setError("");
    try { const p = await CompanyProfileService.uploadLogo(file); loadLogo(p.hasLogo); setSuccess("Logo uploaded."); }
    catch (err) { setError(apiError(err, "Logo upload failed.")); }
    finally { setUploading(false); }
  };

  const removeLogo = async () => {
    try { await CompanyProfileService.deleteLogo(); setLogoUrl(null); setSuccess("Logo removed."); }
    catch { setError("Failed to remove logo."); }
  };

  if (!form) return <div className="p-6"><Alerts error={error} onClearError={() => setError("")} /></div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-blue-600/10 p-2"><Landmark className="h-6 w-6 text-blue-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Company Profile</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Your details, bank and default terms printed on quotations and invoices</p>
        </div>
      </div>

      <Alerts success={success} error={error} onClearSuccess={() => setSuccess("")} onClearError={() => setError("")} />

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">Logo</h3>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-48 items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="max-h-16 max-w-44 object-contain" /> : <span className="text-xs text-gray-400">No logo</span>}
          </div>
          <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg" className="hidden" onChange={upload} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-60">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {logoUrl ? "Replace" : "Upload"} logo
          </button>
          {logoUrl && (
            <button type="button" onClick={removeLogo} className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"><Trash2 className="h-4 w-4" /> Remove</button>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">PNG or JPG, under 1 MB. A wide logo on a white background prints best.</span>
        </div>
      </div>

      <form onSubmit={submit} className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm p-5 space-y-6">
        <Section title="Company">
          <Field label="Legal Name (as on trade licence)" span={2}>
            <input value={form.legalName} onChange={set("legalName")} maxLength={200} className={inputCls} />
          </Field>
          <Field label="TRN (VAT number)"><input value={form.trn} onChange={set("trn")} maxLength={20} className={inputCls} placeholder="15 digits" /></Field>
          <Field label="Phone"><input value={form.phone} onChange={set("phone")} maxLength={50} className={inputCls} /></Field>
          <Field label="Address" span={2}><input value={form.address} onChange={set("address")} maxLength={500} className={inputCls} placeholder="Office, building, area, city, UAE" /></Field>
          <Field label="Email"><input type="email" value={form.email} onChange={set("email")} maxLength={150} className={inputCls} /></Field>
          <Field label="Website"><input value={form.website} onChange={set("website")} maxLength={200} className={inputCls} /></Field>
        </Section>

        <Section title="Bank (printed for payment)">
          <Field label="Bank Name"><input value={form.bankName} onChange={set("bankName")} maxLength={150} className={inputCls} placeholder="e.g. Emirates NBD" /></Field>
          <Field label="Account Name"><input value={form.bankAccountName} onChange={set("bankAccountName")} maxLength={200} className={inputCls} /></Field>
          <Field label="Account No"><input value={form.bankAccountNo} onChange={set("bankAccountNo")} maxLength={50} className={inputCls} /></Field>
          <Field label="SWIFT"><input value={form.swift} onChange={set("swift")} maxLength={20} className={inputCls} /></Field>
          <Field label="IBAN" span={2}><input value={form.iban} onChange={set("iban")} maxLength={50} className={inputCls} placeholder="AE07 0331 2345 6789 0123 456" /></Field>
        </Section>

        <Section title="Quotation Defaults">
          <Field label="Valid For (days)"><input type="number" min="1" max="365" value={form.quoteValidityDays} onChange={set("quoteValidityDays")} className={inputCls} /></Field>
          <Field label="Max Discount Without Approval (%)">
            <input type="number" min="0" max="100" step="0.5" value={form.maxDiscountPct} onChange={set("maxDiscountPct")} className={inputCls} />
          </Field>
          <Field label="Default Payment Terms" span={2}>
            <input value={form.quotePaymentTerms} onChange={set("quotePaymentTerms")} maxLength={1000} className={inputCls}
              placeholder="e.g. 50% advance with PO, 40% on go-live, 10% after 30 days" />
          </Field>
          <Field label="Default Terms & Conditions" span={4}>
            <textarea value={form.quoteTerms} onChange={set("quoteTerms")} rows={7} className={`${inputCls} text-[13px]`} placeholder={SAMPLE_TERMS} />
            {!form.quoteTerms && (
              <button type="button" onClick={() => setForm((f) => ({ ...f, quoteTerms: SAMPLE_TERMS }))} className="mt-1 text-xs font-medium text-blue-600 hover:underline">Use sample terms</button>
            )}
          </Field>
        </Section>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
