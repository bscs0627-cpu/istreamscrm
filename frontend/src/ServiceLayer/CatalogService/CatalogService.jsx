import client from "@/lib/apiClient";

export const AccountService = {
  getAll: (params) => client.get("/accounts", { params }).then((r) => r.data),
  get: (id) => client.get(`/accounts/${id}`).then((r) => r.data),
  create: (payload) => client.post("/accounts", payload).then((r) => r.data),
  update: (id, payload) => client.put(`/accounts/${id}`, payload).then((r) => r.data),
  remove: (id) => client.delete(`/accounts/${id}`).then((r) => r.data),
};

export const ProductService = {
  getAll: (params) => client.get("/products", { params }).then((r) => r.data),
  categories: () => client.get("/products/categories").then((r) => r.data),
  create: (payload) => client.post("/products", payload).then((r) => r.data),
  update: (id, payload) => client.put(`/products/${id}`, payload).then((r) => r.data),
  remove: (id) => client.delete(`/products/${id}`).then((r) => r.data),
};
