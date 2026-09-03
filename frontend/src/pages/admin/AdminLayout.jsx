import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { LayoutDashboard, Package, ShoppingBag, Image, LogOut, Gem, Store } from "lucide-react";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
  { to: "/admin/products", label: "Products & AI", icon: Package, testid: "nav-products" },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag, testid: "nav-orders" },
  { to: "/admin/media", label: "Hero Media", icon: Image, testid: "nav-media" },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const doLogout = async () => {
    await logout();
    navigate("/admin/login");
  };

  return (
    <div className="min-h-screen flex" data-testid="admin-panel">
      <aside className="w-60 shrink-0 border-r border-border bg-[#0e0e13] flex flex-col fixed inset-y-0 z-20">
        <div className="px-6 py-7 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Gem className="w-6 h-6 text-gold" />
            <div>
              <div className="font-serif font-bold gold-text text-lg leading-tight">AuraMart Luxe</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-mono">Admin Atelier</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-5 space-y-1.5">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} data-testid={n.testid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors duration-200 ${
                  isActive
                    ? "bg-gold/10 text-gold border border-gold/30"
                    : "text-slate-400 hover:text-slate-100 hover:bg-white/5 border border-transparent"
                }`
              }>
              <n.icon className="w-4 h-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-5 border-t border-border space-y-1.5">
          <Link to="/" data-testid="nav-storefront"
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors duration-200">
            <Store className="w-4 h-4" /> View Storefront
          </Link>
          <button onClick={doLogout} data-testid="admin-logout-btn"
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors duration-200">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1 ml-60 min-h-screen">
        <header className="sticky top-0 z-10 backdrop-blur-xl bg-background/80 border-b border-border px-8 py-4 flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.25em] text-amber-400/70 font-mono">Luxury Dropshipping Command</div>
          <div className="text-sm text-slate-400" data-testid="admin-user-email">{user?.email}</div>
        </header>
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
