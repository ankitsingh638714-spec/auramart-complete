import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, inr } from "../../lib/api";
import { IndianRupee, ShoppingBag, Package, Clock, ArrowRight } from "lucide-react";

const STATUS_COLORS = {
  pending: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  confirmed: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  dispatched: "text-violet-400 bg-violet-400/10 border-violet-400/30",
  delivered: "text-green-400 bg-green-400/10 border-green-400/30",
  cancelled: "text-red-400 bg-red-400/10 border-red-400/30",
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/admin/stats").then((r) => setStats(r.data)).catch(() => {});
  }, []);

  if (!stats) {
    return <div data-testid="dashboard-loading" className="text-slate-500 text-sm animate-pulse">Summoning the ledger...</div>;
  }

  const cards = [
    { label: "Total Revenue", value: inr(stats.revenue), icon: IndianRupee, testid: "stat-revenue" },
    { label: "Total Orders", value: stats.orders_total, icon: ShoppingBag, testid: "stat-orders" },
    { label: "Products Live", value: `${stats.products_live} / ${stats.products_total}`, icon: Package, testid: "stat-products" },
    { label: "Pending Orders", value: stats.by_status.pending || 0, icon: Clock, testid: "stat-pending" },
  ];

  return (
    <div className="space-y-8 fade-up" data-testid="admin-dashboard">
      <div>
        <h1 className="font-serif text-3xl font-bold gold-text">The Ledger</h1>
        <p className="text-sm text-slate-400 mt-1">Live pulse of your empire.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((c) => (
          <div key={c.label} data-testid={c.testid} className="glass-card glass-card-hover rounded-xl p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">{c.label}</span>
              <c.icon className="w-4 h-4 text-gold/70" />
            </div>
            <div className="mt-4 font-serif text-3xl font-bold text-slate-100">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        {Object.entries(stats.by_status).map(([s, n]) => (
          <div key={s} data-testid={`status-chip-${s}`}
            className={`px-4 py-1.5 rounded-full border text-xs font-mono uppercase tracking-wider ${STATUS_COLORS[s]}`}>
            {s}: {n}
          </div>
        ))}
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-serif text-xl text-amber-200">Recent Orders</h2>
          <Link to="/admin/orders" data-testid="view-all-orders-link"
            className="text-xs text-gold hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {stats.recent_orders.length === 0 ? (
          <div className="px-6 py-10 text-center text-slate-500 text-sm">No orders yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-slate-500 font-mono border-b border-border">
                <th className="px-6 py-3">Order</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Total</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent_orders.map((o) => (
                <tr key={o.id} data-testid={`recent-order-${o.order_no}`} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-3.5 font-mono text-gold/90">{o.order_no}</td>
                  <td className="px-6 py-3.5 text-slate-300">{o.customer.name}</td>
                  <td className="px-6 py-3.5 text-slate-200">{inr(o.total)}</td>
                  <td className="px-6 py-3.5">
                    <span className={`px-3 py-1 rounded-full border text-[11px] font-mono uppercase ${STATUS_COLORS[o.status]}`}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
