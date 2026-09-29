import axios from "axios";

export const TOKEN_KEY = "wsm_token";
export const USER_KEY = "wsm_user";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URI,
  headers: { "Content-Type": "application/json" },
});

// An identical write (same method, URL and body) sent while the first is still running is a double click:
// both callers share the one request, so a record is never created or changed twice.
const sendAdapter = axios.getAdapter(apiClient.defaults.adapter);
const inFlight = new Map();
apiClient.defaults.adapter = (config) => {
  if ((config.method ?? "get").toLowerCase() === "get") return sendAdapter(config);
  const key = [config.method, config.baseURL, config.url, JSON.stringify(config.params ?? null), config.data instanceof FormData ? Math.random() : config.data].join("|");
  if (!inFlight.has(key)) inFlight.set(key, sendAdapter(config).finally(() => inFlight.delete(key)));
  return inFlight.get(key);
};

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// An expired/invalid token (or a suspended company) drops the user back to the login screen.
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401 && !location.pathname.startsWith("/login")) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const apiError = (err, fallback) => {
  const d = err?.response?.data;
  return d?.message || d?.detail || (d?.errors && Object.values(d.errors).flat()[0]) || fallback;
};

export default apiClient;
