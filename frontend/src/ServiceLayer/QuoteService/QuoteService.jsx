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

// Opens the PDF in a new tab (the API needs the sign-in token, so a plain link would not work).
export async function openQuotationPdf(id) {
  const blob = await QuotationService.pdf(id);
  const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
