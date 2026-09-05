const PRODUCTS_KEY = "auramart.products";
const PRODUCTS_STORAGE_VERSION = "empty-v1";
const ORDERS_KEY = "auramart.orders";
const BANNERS_KEY = "auramart.banners";
const SESSION_KEY = "auramart.admin.session";
const read = (key, fallback = []) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
  if (key === PRODUCTS_KEY) window.dispatchEvent(new Event("auramart.products.changed"));
};
if (localStorage.getItem(`${PRODUCTS_KEY}.version`) !== PRODUCTS_STORAGE_VERSION) {
  write(PRODUCTS_KEY, []);
  write(`${PRODUCTS_KEY}.version`, PRODUCTS_STORAGE_VERSION);
}
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const response = (data) => Promise.resolve({ data });
const failure = (detail, status = 400) => { const error = new Error(detail); error.response = { status, data: { detail } }; return Promise.reject(error); };
const currentUser = () => { const email = localStorage.getItem(SESSION_KEY); return email ? { id: "local-admin", email, name: "Store Owner", role: "admin" } : null; };
const publishedProducts = () => read(PRODUCTS_KEY).filter((product) => product.status === "published");
export const subscribeToProducts = (callback) => {
  const refresh = () => callback();
  window.addEventListener("auramart.products.changed", refresh);
  window.addEventListener("storage", refresh);
  return () => {
    window.removeEventListener("auramart.products.changed", refresh);
    window.removeEventListener("storage", refresh);
  };
};
const fileDataUrl = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });

const route = async (method, path, body) => {
  if (path === "/auth/me" && method === "GET") return currentUser() ? response(currentUser()) : failure("Not authenticated", 401);
  if (path === "/auth/login" && method === "POST") { if (!body?.email || !body?.password) return failure("Email and password are required", 422); localStorage.setItem(SESSION_KEY, body.email.trim().toLowerCase()); return response(currentUser()); }
  if (path === "/auth/logout" && method === "POST") { localStorage.removeItem(SESSION_KEY); return response({ message: "Logged out" }); }
  if (path === "/auth/forgot-password" && method === "POST") return response({ message: "If that email is registered, a reset link has been sent." });
  if (path === "/auth/reset-password" && method === "POST") return response({ message: "Password updated. You can now sign in." });
  if (path === "/store/products" && method === "GET") return response(publishedProducts());
  if (path === "/store/banner" && method === "GET") return response(read(BANNERS_KEY)[0] || {});
  if (path === "/admin/products" && method === "GET") return currentUser() ? response(read(PRODUCTS_KEY)) : failure("Not authenticated", 401);
  if (path === "/admin/products" && method === "POST") { if (!currentUser()) return failure("Not authenticated", 401); const product = { ...body, id: id(), created_at: new Date().toISOString() }; write(PRODUCTS_KEY, [product, ...read(PRODUCTS_KEY)]); return response(product); }
  const productMatch = path.match(/^\/admin\/products\/([^/]+)$/);
  if (productMatch && ["PUT", "DELETE"].includes(method)) { if (!currentUser()) return failure("Not authenticated", 401); const products = read(PRODUCTS_KEY); const productId = productMatch[1]; if (!products.some((product) => product.id === productId)) return failure("Product not found", 404); if (method === "DELETE") write(PRODUCTS_KEY, products.filter((product) => product.id !== productId)); else write(PRODUCTS_KEY, products.map((product) => product.id === productId ? { ...product, ...body } : product)); return response(method === "DELETE" ? { message: "deleted" } : read(PRODUCTS_KEY).find((product) => product.id === productId)); }
  if (path === "/admin/stats" && method === "GET") { if (!currentUser()) return failure("Not authenticated", 401); const orders = read(ORDERS_KEY); return response({ revenue: orders.reduce((total, order) => total + order.total, 0), orders_total: orders.length, products_live: publishedProducts().length, products_total: read(PRODUCTS_KEY).length, by_status: orders.reduce((counts, order) => ({ ...counts, [order.status]: (counts[order.status] || 0) + 1 }), {}), low_stock: read(PRODUCTS_KEY).filter((product) => product.stock != null && product.stock <= 5).length, recent_orders: orders.slice(0, 5) }); }
  if (path === "/admin/orders" && method === "GET") return currentUser() ? response(read(ORDERS_KEY)) : failure("Not authenticated", 401);
  const statusMatch = path.match(/^\/admin\/orders\/([^/]+)\/status$/); if (statusMatch && method === "PATCH") { const orders = read(ORDERS_KEY); const updated = orders.find((order) => order.id === statusMatch[1]); if (!updated) return failure("Order not found", 404); const result = { ...updated, status: body.status }; write(ORDERS_KEY, orders.map((order) => order.id === result.id ? result : order)); return response(result); }
  const fulfillMatch = path.match(/^\/admin\/orders\/([^/]+)\/fulfill$/); if (fulfillMatch && method === "POST") { const orders = read(ORDERS_KEY); const order = orders.find((item) => item.id === fulfillMatch[1]); if (!order) return failure("Order not found", 404); const result = { ...order, fulfillment: { provider: body.provider, awb: `LOCAL-${id()}`, status: "processing" } }; write(ORDERS_KEY, orders.map((item) => item.id === result.id ? result : item)); return response(result); }
  if (path === "/orders" && method === "POST") { const product = read(PRODUCTS_KEY).find((item) => item.id === body.items?.[0]?.product_id); if (!product) return failure("Product not found", 404); const item = body.items[0]; const order = { id: id(), order_no: `AML-${id().slice(-8).toUpperCase()}`, customer: body.customer, items: [{ product_id: product.id, title: product.title, price: product.price, qty: item.qty, image_url: product.image_url }], total: product.price * item.qty, status: "pending", fulfillment: null, created_at: new Date().toISOString() }; write(ORDERS_KEY, [order, ...read(ORDERS_KEY)]); return response(order); }
  if (path === "/admin/upload" && method === "POST") { const file = body?.get?.("file"); return file ? response({ url: await fileDataUrl(file) }) : failure("Image file is required", 422); }
  if (path === "/admin/media" && method === "GET") return response(read(BANNERS_KEY));
  if (path === "/admin/media/upload" && method === "POST") { const file = body?.get?.("file"); if (!file) return failure("Image file is required", 422); const banner = { id: id(), type: "image", prompt: file.name, image_url: await fileDataUrl(file), active: false, created_at: new Date().toISOString() }; write(BANNERS_KEY, [banner, ...read(BANNERS_KEY)]); return response(banner); }
  const activateMatch = path.match(/^\/admin\/media\/([^/]+)\/activate$/); if (activateMatch && method === "POST") { const banners = read(BANNERS_KEY).map((banner) => ({ ...banner, active: banner.id === activateMatch[1] })); write(BANNERS_KEY, banners); return response(banners.find((banner) => banner.id === activateMatch[1])); }
  const mediaMatch = path.match(/^\/admin\/media\/([^/]+)$/); if (mediaMatch && method === "DELETE") { write(BANNERS_KEY, read(BANNERS_KEY).filter((banner) => banner.id !== mediaMatch[1])); return response({ message: "deleted" }); }
  if (path.includes("/admin/ai/")) return response({ marketing_title: "New AuraMart Listing", description: "A refined addition to your collection.", category: "Curated Goods", suggested_price: 0, estimated_wholesale: 0, seo_tags: [], selling_points: [], margin_note: "Review the generated listing before publishing." });
  return failure("Route not found", 404);
};

export const api = { get: (path) => route("GET", path), post: (path, body) => route("POST", path, body), put: (path, body) => route("PUT", path, body), patch: (path, body) => route("PATCH", path, body), delete: (path) => route("DELETE", path) };
export const API = "/local-api";
export const imgUrl = (path) => path || "";

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
