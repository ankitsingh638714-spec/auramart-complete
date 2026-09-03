import { useEffect, useState } from "react";
import { api, formatApiError, inr } from "../../lib/api";
import { toast } from "sonner";
import { ShoppingBag, X, MapPin, Phone, User, Truck, Loader2 } from "lucide-react";

const STATUSES = ["pending", "confirmed", "dispatched", "delivered", "cancelled"];

const STATUS_COLORS = {
  pending: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
  confirmed: "text-blue-400 border-blue-400/40 bg-blue-400/10",
  dispatched: "text-violet-400 border-violet-400/40 bg-violet-400/10",
  delivered: "text-green-400 border-green-400/40 bg-green-400/10",
  cancelled: "text-red-400 border-red-400/40 bg-red-400/10",
};

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [provider, setProvider] = useState("shiprocket");
  const [fulfilling, setFulfilling] = useState(false);

  const load = () =>
    api.get("/admin/orders").then((r) => setOrders(r.data)).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const setStatus = async (order, status) => {
    try {
      const { data } = await api.patch(`/admin/orders/${order.id}/status`, { status });
      setOrders((os) => os.map((o) => (o.id === order.id ? data : o)));
      if (selected?.id === order.id) setSelected(data);
      toast.success(`${data.order_no} → ${status}`);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const fulfill = async () => {
    setFulfilling(true);
    try {
      const { data } = await api.post(`/admin/orders/${selected.id}/fulfill`, { provider });
      toast.success(`Manifested with ${data.fulfillment.provider.toUpperCase()} — AWB ${data.fulfillment.awb}`);
      setSelected(null);
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setFulfilling(false);
    }
  };

  return (
    <div className="space-y-8 fade-up" data-testid="admin-orders-page">
      <div>
        <h1 className="font-serif text-3xl font-bold gold-text">Orders & Clients</h1>
        <p className="text-sm text-slate-400 mt-1">Every purchase, every patron — managed in one ledger.</p>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-slate-500 text-sm animate-pulse">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500 text-sm" data-testid="orders-empty">
            <ShoppingBag className="w-8 h-8 mx-auto mb-3 text-slate-600" /> No orders yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="orders-table">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-slate-500 font-mono border-b border-border">
                  <th className="px-6 py-3.5">Order</th>
                  <th className="px-6 py-3.5">Customer</th>
                  <th className="px-6 py-3.5">Phone</th>
                  <th className="px-6 py-3.5">City</th>
                  <th className="px-6 py-3.5">Items</th>
                  <th className="px-6 py-3.5">Total</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} data-testid={`order-row-${o.order_no}`} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-mono text-gold/90 whitespace-nowrap">{o.order_no}</td>
                    <td className="px-6 py-4 text-slate-200">{o.customer.name}</td>
                    <td className="px-6 py-4 text-slate-400 whitespace-nowrap">{o.customer.phone}</td>
                    <td className="px-6 py-4 text-slate-400">{o.customer.city}</td>
                    <td className="px-6 py-4 text-slate-400">{o.items.reduce((a, i) => a + i.qty, 0)}</td>
                    <td className="px-6 py-4 text-slate-100 font-semibold whitespace-nowrap">{inr(o.total)}</td>
                    <td className="px-6 py-4">
                      <select
                        data-testid={`order-status-select-${o.order_no}`}
                        value={o.status}
                        onChange={(e) => setStatus(o, e.target.value)}
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-mono uppercase bg-transparent cursor-pointer ${STATUS_COLORS[o.status]}`}
                      >
                        {STATUSES.map((s) => <option key={s} value={s} className="bg-[#121217] text-slate-200">{s}</option>)}
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <button onClick={() => { setSelected(o); setProvider("shiprocket"); }}
                        data-testid={`order-view-${o.order_no}`}
                        className="btn-ghost-gold rounded-lg px-4 py-1.5 text-xs">Details</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" data-testid="order-detail-modal">
          <div className="glass-card rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 space-y-6 fade-up">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-serif text-2xl text-amber-200" data-testid="order-detail-no">{selected.order_no}</h2>
                <div className="text-xs text-slate-500 font-mono mt-1">{new Date(selected.created_at).toLocaleString("en-IN")}</div>
              </div>
              <button onClick={() => setSelected(null)} data-testid="order-detail-close"
                className="p-2 rounded-lg text-slate-400 hover:text-gold transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h3 className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Customer</h3>
                <div className="text-sm space-y-2 text-slate-300">
                  <div className="flex items-center gap-2"><User className="w-4 h-4 text-gold/70" /> {selected.customer.name}</div>
                  <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gold/70" /> {selected.customer.phone}</div>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gold/70 mt-0.5" />
                    <span>{selected.customer.address}, {selected.customer.city}, {selected.customer.state} — {selected.customer.pincode}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Items</h3>
                <div className="space-y-2">
                  {selected.items.map((i, idx) => (
                    <div key={idx} className="flex justify-between text-sm text-slate-300">
                      <span>{i.title} × {i.qty}</span>
                      <span className="text-slate-100">{inr(i.price * i.qty)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t border-border font-semibold text-gold">
                    <span>Total</span><span data-testid="order-detail-total">{inr(selected.total)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Status</h3>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button key={s} onClick={() => setStatus(selected, s)}
                    data-testid={`order-detail-status-${s}`}
                    className={`px-4 py-1.5 rounded-full border text-[11px] font-mono uppercase transition-all duration-200 ${
                      selected.status === s ? STATUS_COLORS[s] + " ring-1 ring-current" : "text-slate-500 border-slate-700 hover:border-slate-500"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 border-t border-border pt-5">
              <h3 className="text-xs uppercase tracking-widest text-amber-400/80 font-mono flex items-center gap-2">
                <Truck className="w-4 h-4" /> Fulfillment
              </h3>
              {selected.fulfillment ? (
                <div className="text-sm text-slate-300 space-y-1.5" data-testid="fulfillment-info">
                  <div>Provider: <span className="text-gold uppercase font-mono text-xs">{selected.fulfillment.provider}</span></div>
                  <div>AWB: <span className="font-mono">{selected.fulfillment.awb}</span></div>
                  <div>Status: <span className="capitalize">{selected.fulfillment.status}</span></div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <select value={provider} onChange={(e) => setProvider(e.target.value)} data-testid="fulfill-provider-select"
                    className="input-luxe rounded-lg px-4 py-2.5 text-sm">
                    <option value="shiprocket">Shiprocket</option>
                    <option value="delhivery">Delhivery</option>
                    <option value="local">Local Delivery Partner</option>
                  </select>
                  <button onClick={fulfill} disabled={fulfilling} data-testid="fulfill-order-btn"
                    className="btn-gold rounded-lg px-5 py-2.5 text-sm flex items-center gap-2">
                    {fulfilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                    {fulfilling ? "Manifesting..." : "Dispatch Shipment"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
