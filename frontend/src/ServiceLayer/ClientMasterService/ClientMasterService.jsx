import axios from "axios";

// Separate client: the CRM login token must never be sent to the ERP host.
const erp = axios.create({
  baseURL: import.meta.env.VITE_ERP_API_URI || "https://apps.istreams-erp.com:7710",
  headers: { "Content-Type": "application/json" },
});

export const ERP = { domain: "demo.com", companyCode: 1, branchCode: 1, userName: "GOPI", isInternal: "T" };

const getHeaders = () => ({
  "X-Domain": ERP.domain,
  "X-Company-Code": ERP.companyCode,
  "X-Branch-Code": ERP.branchCode,
  "X-User-Name": ERP.userName,
});

export const CLIENT_FIELDS = [
  "clientId", "clientName", "communicationAddress", "invoiceAddress", "deliveryAddress", "telephoneNo", "faxNo", "emailAddress",
  "webAddress", "country", "cityName", "natureOfBusiness", "groupName", "creditDays", "accountCode", "trnVatNo", "stateName",
  "natureOfBusiness2", "refCode",
];

// The response key style is not documented, so CLIENT_NAME, clientName and ClientName are all accepted.
const squash = (k) => k.replace(/_/g, "").toLowerCase();
export const normalizeClient = (row) => {
  const byKey = Object.fromEntries(Object.entries(row ?? {}).map(([k, v]) => [squash(k), v]));
  return Object.fromEntries(CLIENT_FIELDS.map((f) => [f, byKey[squash(f)] ?? null]));
};

const firstRow = (data) => (Array.isArray(data) ? data[0] : data?.data ? firstRow(data.data) : data?.result ? firstRow(data.result) : data);

export const extractClientId = (data) => {
  if (typeof data === "number") return data;
  if (typeof data === "string" && /^\d+(\.\d+)?$/.test(data.trim())) return Number(data);
  const row = firstRow(data);
  if (row && typeof row === "object") {
    const id = normalizeClient(row).clientId;
    if (id !== null && id !== "") return Number(id);
  }
  return null;
};

export const clientError = (err, fallback) => {
  const d = err?.response?.data;
  if (typeof d === "string" && d.trim() && d.length < 300) return d;
  return d?.message || d?.detail || d?.title || (d?.errors && Object.values(d.errors).flat()[0]) || (err?.response ? fallback : "Cannot reach the ERP server.");
};

const body = (form, clientId) => ({
  domain: ERP.domain,
  userId: ERP.userName,
  userName: ERP.userName,
  companyCode: ERP.companyCode,
  branchCode: ERP.branchCode,
  isInternal: ERP.isInternal,
  clientId,
  ...form,
});

export const ClientMasterService = {
  insert: (form) => erp.post("/api/client-master/insert", body(form, 0), { headers: getHeaders() }).then((r) => r.data),
  update: (clientId, form) => erp.put("/api/client-master/update", body(form, clientId), { headers: getHeaders(), params: { clientId } }).then((r) => r.data),
  search: (clientId) => erp.get("/api/client-master/search", { headers: getHeaders(), params: { clientId } })
    .then((r) => { const row = firstRow(r.data); return row && typeof row === "object" && Object.keys(row).length ? normalizeClient(row) : null; }),
};
