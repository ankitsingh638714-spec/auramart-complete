import { useEffect, useState } from "react";
import { api, formatApiError, imgUrl, inr } from "../../lib/api";
import { toast } from "sonner";
import { Sparkles, Package, Trash2, Loader2, Globe, FileEdit, Upload } from "lucide-react";

const EMPTY = {
  title: "", description: "", category: "", price: "", wholesale_price: "",
  seo_tags: "", selling_points: "", image_url: "", source_link: "", status: "draft",
};

export default function Products() {
  const [products, setProducts] = useState([]);
  const [aiInput, setAiInput] = useState("");
  const [aiWholesale, setAiWholesale] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/admin/products").then((r) => setProducts(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const uploadImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/upload", fd);
      set("image_url", data.url);
      toast.success("Image uploaded to media storage");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploading(false);
    }
  };

  const generate = async () => {
    if (!aiInput.trim()) {
      toast.error("Paste a product title or wholesale link first");
      return;
    }
    setGenerating(true);
    try {
      const { data } = await api.post("/admin/ai/generate-product", {
        input_text: aiInput,
        wholesale_price: aiWholesale ? parseFloat(aiWholesale) : null,
      });
      setForm({
        title: data.marketing_title || "",
        description: data.description || "",
        category: data.category || "",
        price: data.suggested_price ?? "",
        wholesale_price: data.estimated_wholesale ?? (aiWholesale || ""),
        seo_tags: (data.seo_tags || []).join(", "),
        selling_points: (data.selling_points || []).join("\n"),
        image_url: "",
        source_link: aiInput.startsWith("http") ? aiInput : "",
        status: "draft",
      });
      setEditId(null);
      toast.success("AI listing crafted — review & publish below");
      if (data.margin_note) toast.info(data.margin_note);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setGenerating(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("A title is required");
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      price: parseFloat(form.price) || 0,
      wholesale_price: parseFloat(form.wholesale_price) || 0,
      seo_tags: form.seo_tags.split(",").map((t) => t.trim()).filter(Boolean),
      selling_points: form.selling_points.split("\n").map((t) => t.trim()).filter(Boolean),
    };
    try {
      if (editId) {
        await api.put(`/admin/products/${editId}`, payload);
        toast.success("Product updated");
      } else {
        await api.post("/admin/products", payload);
        toast.success("Product added to the vault");
      }
      setForm(EMPTY);
      setEditId(null);
      setAiInput("");
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const editProduct = (p) => {
    setEditId(p.id);
    setForm({
      title: p.title, description: p.description, category: p.category,
      price: p.price, wholesale_price: p.wholesale_price,
      seo_tags: (p.seo_tags || []).join(", "),
      selling_points: (p.selling_points || []).join("\n"),
      image_url: p.image_url || "", source_link: p.source_link || "", status: p.status,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const togglePublish = async (p) => {
    try {
      await api.put(`/admin/products/${p.id}`, {
        title: p.title, description: p.description, category: p.category,
        price: p.price, wholesale_price: p.wholesale_price, seo_tags: p.seo_tags,
        selling_points: p.selling_points, image_url: p.image_url, source_link: p.source_link,
        status: p.status === "published" ? "draft" : "published",
      });
      toast.success(p.status === "published" ? "Moved to drafts" : "Live on storefront");
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const remove = async (p) => {
    if (!window.confirm(`Permanently delete "${p.title}" from the vault?`)) return;
    try {
      await api.delete(`/admin/products/${p.id}`);
      toast.success("Product removed");
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  return (
    <div className="space-y-10 fade-up" data-testid="admin-products-page">
      <div>
        <h1 className="font-serif text-3xl font-bold gold-text">Products & AI Atelier</h1>
        <p className="text-sm text-slate-400 mt-1">Paste a wholesale link or raw title — let AI craft a viral luxury listing.</p>
      </div>

      <div className="glass-card rounded-2xl p-6 space-y-4" data-testid="ai-generator-card">
        <div className="flex items-center gap-2 text-amber-200 font-serif text-lg">
          <Sparkles className="w-5 h-5 text-gold" /> AI Product Generator
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input data-testid="ai-input" value={aiInput} onChange={(e) => setAiInput(e.target.value)}
            placeholder="e.g. 'Rose gold women watch' or Meesho/wholesale link"
            className="input-luxe rounded-lg px-4 py-3 text-sm md:col-span-2" />
          <input data-testid="ai-wholesale-price" value={aiWholesale} onChange={(e) => setAiWholesale(e.target.value)}
            placeholder="Wholesale cost ₹ (optional)" type="number" min="0"
            className="input-luxe rounded-lg px-4 py-3 text-sm" />
        </div>
        <button onClick={generate} disabled={generating} data-testid="ai-generate-btn" className="btn-gold rounded-lg px-6 py-3 text-sm flex items-center gap-2">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? "AI is crafting..." : "AI Generate Listing"}
        </button>
      </div>

      <form onSubmit={save} className="glass-card rounded-2xl p-6 space-y-5" data-testid="product-form">
        <div className="flex items-center justify-between">
          <div className="text-amber-200 font-serif text-lg">{editId ? "Edit Product" : "Listing Details"}</div>
          {editId && (
            <button type="button" data-testid="cancel-edit-btn" onClick={() => { setEditId(null); setForm(EMPTY); }}
              className="text-xs text-slate-400 hover:text-gold transition-colors">Cancel edit</button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Marketing Title</label>
            <input data-testid="product-title-input" value={form.title} onChange={(e) => set("title", e.target.value)}
              className="input-luxe w-full rounded-lg px-4 py-3 text-sm mt-2" placeholder="AI will fill this..." />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Description</label>
            <textarea data-testid="product-description-input" rows={4} value={form.description} onChange={(e) => set("description", e.target.value)}
              className="input-luxe w-full rounded-lg px-4 py-3 text-sm mt-2" placeholder="Persuasive description..." />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Category</label>
            <input data-testid="product-category-input" value={form.category} onChange={(e) => set("category", e.target.value)}
              className="input-luxe w-full rounded-lg px-4 py-3 text-sm mt-2" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Image URL</label>
            <div className="flex gap-2 mt-2">
              <input data-testid="product-image-input" value={form.image_url} onChange={(e) => set("image_url", e.target.value)}
                className="input-luxe flex-1 rounded-lg px-4 py-3 text-sm" placeholder="https://... or upload" />
              <label data-testid="product-image-upload"
                className={`btn-ghost-gold rounded-lg px-4 py-3 text-xs flex items-center gap-2 cursor-pointer shrink-0 ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload
                <input type="file" accept="image/*" className="hidden" onChange={uploadImage} disabled={uploading} />
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Retail Price ₹</label>
            <input data-testid="product-price-input" type="number" min="0" value={form.price} onChange={(e) => set("price", e.target.value)}
              className="input-luxe w-full rounded-lg px-4 py-3 text-sm mt-2" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Wholesale Cost ₹</label>
            <input data-testid="product-wholesale-input" type="number" min="0" value={form.wholesale_price} onChange={(e) => set("wholesale_price", e.target.value)}
              className="input-luxe w-full rounded-lg px-4 py-3 text-sm mt-2" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">SEO Tags (comma separated)</label>
            <input data-testid="product-tags-input" value={form.seo_tags} onChange={(e) => set("seo_tags", e.target.value)}
              className="input-luxe w-full rounded-lg px-4 py-3 text-sm mt-2" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Selling Points (one per line)</label>
            <textarea data-testid="product-points-input" rows={3} value={form.selling_points} onChange={(e) => set("selling_points", e.target.value)}
              className="input-luxe w-full rounded-lg px-4 py-3 text-sm mt-2" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <select data-testid="product-status-select" value={form.status} onChange={(e) => set("status", e.target.value)}
            className="input-luxe rounded-lg px-4 py-3 text-sm">
            <option value="draft">Draft</option>
            <option value="published">Published (live)</option>
          </select>
          <button type="submit" disabled={saving} data-testid="product-save-btn" className="btn-gold rounded-lg px-8 py-3 text-sm">
            {saving ? "Saving..." : editId ? "Update Product" : "Save Product"}
          </button>
        </div>
      </form>

      <div>
        <h2 className="font-serif text-2xl text-amber-200 mb-5">The Vault ({products.length})</h2>
        {products.length === 0 ? (
          <div className="glass-card rounded-xl p-10 text-center text-slate-500 text-sm" data-testid="products-empty">
            <Package className="w-8 h-8 mx-auto mb-3 text-slate-600" /> No products yet. Generate your first listing above.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((p) => (
              <div key={p.id} data-testid={`product-card-${p.id}`} className="glass-card glass-card-hover rounded-xl overflow-hidden flex flex-col">
                {p.image_url ? (
                  <img src={imgUrl(p.image_url)} alt={p.title} className="h-44 w-full object-cover" />
                ) : (
                  <div className="h-44 w-full flex items-center justify-center bg-black/40">
                    <Package className="w-8 h-8 text-slate-700" />
                  </div>
                )}
                <div className="p-4 flex-1 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-100 leading-snug">{p.title}</h3>
                    <span data-testid={`product-status-badge-${p.id}`}
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase border ${
                        p.status === "published" ? "text-green-400 border-green-400/30 bg-green-400/10" : "text-slate-400 border-slate-600 bg-slate-800/50"}`}>
                      {p.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">{p.category}</div>
                  <div className="mt-auto flex items-end justify-between pt-2">
                    <div>
                      <div className="text-gold font-serif font-bold">{inr(p.price)}</div>
                      <div className="text-[10px] text-slate-500 font-mono">cost {inr(p.wholesale_price)}</div>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => editProduct(p)} data-testid={`product-edit-${p.id}`} title="Edit"
                        className="p-2 rounded-lg btn-ghost-gold"><FileEdit className="w-3.5 h-3.5" /></button>
                      <button onClick={() => togglePublish(p)} data-testid={`product-publish-toggle-${p.id}`} title={p.status === "published" ? "Unpublish" : "Publish"}
                        className="p-2 rounded-lg btn-ghost-gold"><Globe className="w-3.5 h-3.5" /></button>
                      <button onClick={() => remove(p)} data-testid={`product-delete-${p.id}`} title="Delete"
                        className="p-2 rounded-lg border border-red-900/50 text-red-400 hover:bg-red-950/40 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
