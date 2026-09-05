import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError, imgUrl, inr, subscribeToProducts } from "../lib/api";
import { toast } from "sonner";
import { Gem, Lock, X, Sparkles, MapPin, Phone, User, CheckCircle2 } from "lucide-react";

const EMPTY_FORM = { name: "", phone: "", address: "", city: "", state: "", pincode: "" };

export default function Storefront() {
  const [products, setProducts] = useState([]);
  const [banner, setBanner] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [placing, setPlacing] = useState(false);
  const [orderDone, setOrderDone] = useState(null);

  useEffect(() => {
    const refresh = () => {
      api.get("/store/products").then((r) => setProducts(r.data)).catch(() => {});
      api.get("/store/banner").then((r) => setBanner(r.data && r.data.id ? r.data : null)).catch(() => {});
    };
    refresh();
    const unsubscribe = subscribeToProducts(refresh);
    const refreshTimer = setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    return () => {
      unsubscribe();
      clearInterval(refreshTimer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const placeOrder = async (e) => {
    e.preventDefault();
    setPlacing(true);
    try {
      const { data } = await api.post("/orders", {
        customer: form,
        items: [{ product_id: checkout.id, qty: 1 }],
      });
      setOrderDone(data);
      setCheckout(null);
      setForm(EMPTY_FORM);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="min-h-screen" data-testid="storefront">
      <header className="fixed top-0 inset-x-0 z-40 backdrop-blur-xl bg-black/60 border-b border-gold/15">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Gem className="w-6 h-6 text-gold" />
            <span className="font-serif font-bold text-xl gold-text">AuraMart Luxe</span>
          </div>
          <Link to="/admin/login" data-testid="admin-login-link"
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-gold transition-colors font-mono uppercase tracking-widest">
            <Lock className="w-3.5 h-3.5" /> Owner Login
          </Link>
        </div>
      </header>

      <section className="relative h-[85vh] min-h-[540px] flex items-end overflow-hidden" data-testid="storefront-hero">
        {banner?.image_url && (
          <img src={imgUrl(banner.image_url)} alt="AuraMart Luxe hero"
            className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0E] via-[#0B0B0E]/55 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B0B0E]/85 via-[#0B0B0E]/30 to-transparent" />
        {banner?.type === "video" && (
          <div className="absolute top-24 right-6 px-4 py-2 rounded-full glass-card text-xs font-mono uppercase tracking-widest text-gold gold-shimmer">
            Cinematic Video Banner
          </div>
        )}
        <div className="relative max-w-7xl mx-auto px-6 pb-20 w-full fade-up">
          <div className="text-xs uppercase tracking-[0.35em] text-amber-400/80 font-mono mb-4">Curated Opulence, Delivered</div>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold text-amber-100 max-w-2xl leading-tight">
            Luxury, <span className="gold-text">Dropshipped</span> to Your Door
          </h1>
          <p className="text-slate-300 mt-5 max-w-xl text-sm sm:text-base leading-relaxed">
            Timepieces, parfumerie and leather goods sourced from the world's finest ateliers — at margins only we can offer.
          </p>
          <a href="#collection" data-testid="hero-shop-btn"
            className="btn-gold inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm mt-8">
            <Sparkles className="w-4 h-4" /> Explore the Collection
          </a>
        </div>
      </section>

      <section id="collection" className="max-w-7xl mx-auto px-6 py-20">
        <div className="mb-12">
          <div className="text-xs uppercase tracking-[0.35em] text-amber-400/80 font-mono mb-3">The Collection</div>
          <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-semibold text-amber-200">Pieces of the Moment</h2>
        </div>
        {products.length === 0 ? (
          <div className="glass-card rounded-xl p-12 text-center text-slate-500 text-sm" data-testid="storefront-empty">
            The collection is being curated. Return shortly.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((p, i) => (
              <div key={p.id} data-testid={`store-product-${p.id}`}
                className="glass-card glass-card-hover rounded-xl overflow-hidden flex flex-col fade-up"
                style={{ animationDelay: `${i * 80}ms` }}>
                {p.image_url && <img src={imgUrl(p.image_url)} alt={p.title} className="h-56 w-full object-cover" />}
                <div className="p-5 flex flex-col gap-2.5 flex-1">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-amber-400/70 font-mono">{p.category}</div>
                  <h3 className="font-semibold text-slate-100 leading-snug">{p.title}</h3>
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{p.description}</p>
                  <div className="mt-auto pt-3 flex items-center justify-between">
                    <span className="font-serif text-xl font-bold text-gold" data-testid={`store-price-${p.id}`}>{inr(p.price)}</span>
                    <div className="flex flex-col items-end gap-1">
                      {p.stock != null && p.stock > 0 && p.stock <= 5 && (
                        <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400" data-testid={`low-stock-${p.id}`}>Only {p.stock} left</span>
                      )}
                      <button onClick={() => setCheckout(p)} data-testid={`buy-now-${p.id}`} disabled={p.stock === 0}
                        className="btn-gold rounded-full px-5 py-2 text-xs">{p.stock === 0 ? "Sold Out" : "Acquire"}</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-gold/15 py-10 text-center">
        <Gem className="w-5 h-5 text-gold mx-auto mb-3" />
        <div className="font-serif gold-text font-bold">AuraMart Luxe</div>
        <div className="text-xs text-slate-600 mt-2 font-mono">© 2026 — Curated opulence, delivered worldwide.</div>
      </footer>

      {checkout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" data-testid="checkout-modal">
          <div className="glass-card rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-8 fade-up">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="font-serif text-2xl text-amber-200">Secure Your Piece</h2>
                <p className="text-xs text-slate-400 mt-1">{checkout.title} — <span className="text-gold">{inr(checkout.price)}</span></p>
              </div>
              <button onClick={() => setCheckout(null)} data-testid="checkout-close"
                className="p-2 rounded-lg text-slate-400 hover:text-gold transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={placeOrder} className="space-y-4" data-testid="checkout-form">
              {[
                { k: "name", label: "Full Name", icon: User, testid: "checkout-name" },
                { k: "phone", label: "Phone Number", icon: Phone, testid: "checkout-phone" },
              ].map((f) => (
                <div key={f.k}>
                  <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">{f.label}</label>
                  <div className="relative mt-1.5">
                    <f.icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input required data-testid={f.testid} value={form[f.k]}
                      onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                      className="input-luxe w-full rounded-lg pl-10 pr-4 py-3 text-sm" />
                  </div>
                </div>
              ))}
              <div>
                <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Delivery Address</label>
                <div className="relative mt-1.5">
                  <MapPin className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
                  <textarea required rows={2} data-testid="checkout-address" value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="input-luxe w-full rounded-lg pl-10 pr-4 py-3 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[{ k: "city", label: "City", testid: "checkout-city" },
                  { k: "state", label: "State", testid: "checkout-state" },
                  { k: "pincode", label: "PIN", testid: "checkout-pincode" }].map((f) => (
                  <div key={f.k}>
                    <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">{f.label}</label>
                    <input required data-testid={f.testid} value={form[f.k]}
                      onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                      className="input-luxe w-full rounded-lg px-3 py-3 text-sm mt-1.5" />
                  </div>
                ))}
              </div>
              <button type="submit" disabled={placing} data-testid="place-order-btn"
                className="btn-gold w-full rounded-lg py-3.5 text-sm">
                {placing ? "Placing order..." : `Place Order — ${inr(checkout.price)}`}
              </button>
            </form>
          </div>
        </div>
      )}

      {orderDone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" data-testid="order-success-modal">
          <div className="glass-card rounded-2xl w-full max-w-md p-10 text-center space-y-5 fade-up">
            <CheckCircle2 className="w-14 h-14 text-gold mx-auto" />
            <h2 className="font-serif text-3xl gold-text font-bold">Order Secured</h2>
            <p className="text-sm text-slate-300">
              Your order <span className="font-mono text-gold" data-testid="order-success-no">{orderDone.order_no}</span> is confirmed.
              Our concierge will reach you on {orderDone.customer.phone}.
            </p>
            <button onClick={() => setOrderDone(null)} data-testid="order-success-close"
              className="btn-gold rounded-full px-8 py-3 text-sm">Continue Browsing</button>
          </div>
        </div>
      )}
    </div>
  );
}
