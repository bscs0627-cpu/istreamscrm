import client from "@/lib/apiClient";

export const TicketService = {
  getAll: (params) => client.get("/tickets", { params }).then((r) => r.data),
  summary: () => client.get("/tickets/summary").then((r) => r.data),
  rate: () => client.get("/tickets/rate").then((r) => r.data),
  get: (id) => client.get(`/tickets/${id}`).then((r) => r.data),
  create: (payload) => client.post("/tickets", payload).then((r) => r.data),
  update: (id, payload) => client.put(`/tickets/${id}`, payload).then((r) => r.data),
  setStatus: (id, status, note) => client.post(`/tickets/${id}/status`, { status, note }).then((r) => r.data),
  assign: (id, userId) => client.post(`/tickets/${id}/assign`, { userId }).then((r) => r.data),
  comment: (id, payload) => client.post(`/tickets/${id}/comments`, payload).then((r) => r.data),
  estimate: (id, payload) => client.put(`/tickets/${id}/estimate`, payload).then((r) => r.data),
  quotation: (id) => client.post(`/tickets/${id}/quotation`, null, { params: { tzOffset: new Date().getTimezoneOffset() } }).then((r) => r.data),
  remove: (id) => client.delete(`/tickets/${id}`).then((r) => r.data),
};
