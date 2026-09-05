const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
const API_ROOT = `${BACKEND_URL}/api`;

const request = async (method, path, body, options = {}) => {
  const isFormData = body instanceof FormData;
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    credentials: "include",
    headers: isFormData ? options.headers : { "Content-Type": "application/json", ...(options.headers || {}) },
    body: body == null ? undefined : isFormData ? body : JSON.stringify(body),
    ...options,
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { detail: text }; }
  if (!response.ok) {
    const error = new Error(data.detail || response.statusText || "Request failed");
    error.response = { status: response.status, data };
    throw error;
  }
  if (method !== "GET" && path.startsWith("/admin/products")) {
    window.dispatchEvent(new Event("auramart.products.changed"));
  }
  return { data, status: response.status };
};

export const subscribeToProducts = (callback) => {
  const refresh = () => callback();
  window.addEventListener("auramart.products.changed", refresh);
  window.addEventListener("storage", refresh);
  return () => {
    window.removeEventListener("auramart.products.changed", refresh);
    window.removeEventListener("storage", refresh);
  };
};
export const api = {
  get: (path, options) => request("GET", path, undefined, options),
  post: (path, body, options) => request("POST", path, body, options),
  put: (path, body, options) => request("PUT", path, body, options),
  patch: (path, body, options) => request("PATCH", path, body, options),
  delete: (path, options) => request("DELETE", path, undefined, options),
};
export const API = API_ROOT;
export const imgUrl = (path) => {
  if (!path) return "";
  return path.startsWith("/api/") && BACKEND_URL ? `${BACKEND_URL}${path}` : path;
};

export function formatApiError(err) {
  const detail = err?.response?.data?.detail;
  if (detail == null) return err?.message || "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export const inr = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
