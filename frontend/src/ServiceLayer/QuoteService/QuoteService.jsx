import client from "@/lib/apiClient";

export const QuotationService = {
  getAll: (params) => client.get("/quotations", { params }).then((r) => r.data),
  get: (id) => client.get(`/quotations/${id}`).then((r) => r.data),
  fromLead: (leadId) => client.post(`/quotations/from-lead/${leadId}`, null, { params: { tzOffset: new Date().getTimezoneOffset() } }).then((r) => r.data),
  update: (id, payload) => client.put(`/quotations/${id}`, payload).then((r) => r.data),
  remove: (id) => client.delete(`/quotations/${id}`).then((r) => r.data),
  revise: (id) => client.post(`/quotations/${id}/revise`).then((r) => r.data),
  approve: (id) => client.post(`/quotations/${id}/approve`).then((r) => r.data),
  send: (id, payload) => client.post(`/quotations/${id}/send`, payload).then((r) => r.data),
  close: (id, payload) => client.post(`/quotations/${id}/close`, payload).then((r) => r.data),
  pdf: (id) => client.get(`/quotations/${id}/pdf`, { responseType: "blob" }).then((r) => r.data),
};

export const CompanyProfileService = {
  get: () => client.get("/company-profile").then((r) => r.data),
  save: (payload) => client.put("/company-profile", payload).then((r) => r.data),
  logo: () => client.get("/company-profile/logo", { responseType: "blob" }).then((r) => r.data),
  uploadLogo: (file) => {
    const form = new FormData();
    form.append("file", file);
    return client.post("/company-profile/logo", form, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data);
  },
  deleteLogo: () => client.delete("/company-profile/logo").then((r) => r.data),
};

const tz = () => ({ tzOffset: new Date().getTimezoneOffset() });

export const InvoiceService = {
  getAll: (params) => client.get("/invoices", { params: { ...params, ...tz() } }).then((r) => r.data),
  get: (id) => client.get(`/invoices/${id}`, { params: tz() }).then((r) => r.data),
  aging: () => client.get("/invoices/aging", { params: tz() }).then((r) => r.data),
  remaining: (quotationId) => client.get(`/invoices/remaining/${quotationId}`).then((r) => r.data),
  fromQuotation: (quotationId, payload) => client.post(`/invoices/from-quotation/${quotationId}`, payload, { params: tz() }).then((r) => r.data),
  update: (id, payload) => client.put(`/invoices/${id}`, payload, { params: tz() }).then((r) => r.data),
  remove: (id) => client.delete(`/invoices/${id}`, { params: tz() }).then((r) => r.data),
  issue: (id) => client.post(`/invoices/${id}/issue`, null, { params: tz() }).then((r) => r.data),
  cancel: (id, reason) => client.post(`/invoices/${id}/cancel`, { reason }, { params: tz() }).then((r) => r.data),
  send: (id, payload) => client.post(`/invoices/${id}/send`, payload, { params: tz() }).then((r) => r.data),
  addPayment: (id, payload) => client.post(`/invoices/${id}/payments`, payload, { params: tz() }).then((r) => r.data),
  deletePayment: (paymentId) => client.delete(`/invoices/payments/${paymentId}`, { params: tz() }).then((r) => r.data),
  pdf: (id) => client.get(`/invoices/${id}/pdf`, { params: tz(), responseType: "blob" }).then((r) => r.data),
};

// Opens a PDF in a new tab (the API needs the sign-in token, so a plain link would not work).
async function openPdf(load) {
  const blob = await load();
  const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export const openQuotationPdf = (id) => openPdf(() => QuotationService.pdf(id));
export const openInvoicePdf = (id) => openPdf(() => InvoiceService.pdf(id));

export const SubscriptionService = {
  getAll: (params) => client.get("/subscriptions", { params: { ...params, ...tz() } }).then((r) => r.data),
  summary: () => client.get("/subscriptions/summary", { params: tz() }).then((r) => r.data),
  create: (payload) => client.post("/subscriptions", payload, { params: tz() }).then((r) => r.data),
  fromQuotation: (quotationId) => client.post(`/subscriptions/from-quotation/${quotationId}`, null, { params: tz() }).then((r) => r.data),
  update: (id, payload) => client.put(`/subscriptions/${id}`, payload, { params: tz() }).then((r) => r.data),
  cancel: (id, reason) => client.post(`/subscriptions/${id}/cancel`, { reason }, { params: tz() }).then((r) => r.data),
  renew: (id) => client.post(`/subscriptions/${id}/renew`, null, { params: tz() }).then((r) => r.data),
  remind: (id, payload) => client.post(`/subscriptions/${id}/remind`, payload, { params: tz() }).then((r) => r.data),
  runRenewals: () => client.post("/subscriptions/run-renewals").then((r) => r.data),
};
