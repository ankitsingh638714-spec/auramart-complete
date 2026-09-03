import { useEffect, useState } from "react";
import { api, formatApiError, imgUrl } from "../../lib/api";
import { toast } from "sonner";
import { Image as ImageIcon, Video, Sparkles, Loader2, Trash2, CheckCircle2, Film, Upload } from "lucide-react";

export default function Media() {
  const [banners, setBanners] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(null); // 'image' | 'video'

  const load = () => api.get("/admin/media").then((r) => setBanners(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const generate = async (kind) => {
    if (!prompt.trim()) {
      toast.error("Describe the banner scene first");
      return;
    }
    setBusy(kind);
    try {
      const endpoint = kind === "video" ? "/admin/media/generate-video" : "/admin/media/generate-banner";
      const { data } = await api.post(endpoint, { prompt }, { timeout: 120000 });
      toast.success(kind === "video"
        ? "Cinematic poster generated — video hook ready for your provider"
        : "Hero banner forged by AI");
      setPrompt("");
      load();
      if (kind === "video" && data.note) toast.info(data.note);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(null);
    }
  };

  const uploadBanner = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/admin/media/upload", fd);
      toast.success("Banner uploaded to media storage");
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(null);
    }
  };

  const activate = async (b) => {
    try {
      await api.post(`/admin/media/${b.id}/activate`);
      toast.success("Storefront hero updated — live now");
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const remove = async (b) => {
    if (!window.confirm("Delete this banner permanently?")) return;
    try {
      await api.delete(`/admin/media/${b.id}`);
      toast.success("Banner removed");
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  return (
    <div className="space-y-10 fade-up" data-testid="admin-media-page">
      <div>
        <h1 className="font-serif text-3xl font-bold gold-text">Hero Media Studio</h1>
        <p className="text-sm text-slate-400 mt-1">Generate cinematic AI banners & video hooks — push them live to the storefront in one click.</p>
      </div>

      <div className="glass-card rounded-2xl p-6 space-y-4" data-testid="media-generator-card">
        <div className="flex items-center gap-2 text-amber-200 font-serif text-lg">
          <Film className="w-5 h-5 text-gold" /> AI Banner & Video Generator
        </div>
        <textarea data-testid="media-prompt-input" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. 'Gold perfume bottle on black silk with drifting smoke and champagne bokeh'"
          className="input-luxe w-full rounded-lg px-4 py-3 text-sm" />
        <div className="flex flex-wrap gap-3">
          <button onClick={() => generate("image")} disabled={!!busy} data-testid="generate-banner-btn"
            className="btn-gold rounded-lg px-6 py-3 text-sm flex items-center gap-2">
            {busy === "image" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
            {busy === "image" ? "Forging banner (up to 1 min)..." : "Generate AI Banner"}
          </button>
          <button onClick={() => generate("video")} disabled={!!busy} data-testid="generate-video-btn"
            className="btn-ghost-gold rounded-lg px-6 py-3 text-sm flex items-center gap-2">
            {busy === "video" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
            {busy === "video" ? "Rendering poster..." : "Generate Cinematic Video (Hook)"}
          </button>
          <label data-testid="upload-banner-btn"
            className={`btn-ghost-gold rounded-lg px-6 py-3 text-sm flex items-center gap-2 cursor-pointer ${busy ? "opacity-50 pointer-events-none" : ""}`}>
            {busy === "upload" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {busy === "upload" ? "Uploading..." : "Upload Banner"}
            <input type="file" accept="image/*" className="hidden" onChange={uploadBanner} disabled={!!busy} />
          </label>
        </div>
        <p className="text-[11px] text-slate-600 font-mono">Video generation is an integration hook — connect Veo / Runway / Sora to render full 10s clips. Poster frames generate instantly.</p>
      </div>

      <div>
        <h2 className="font-serif text-2xl text-amber-200 mb-5">Banner Gallery ({banners.length})</h2>
        {banners.length === 0 ? (
          <div className="glass-card rounded-xl p-10 text-center text-slate-500 text-sm" data-testid="media-empty">
            <Sparkles className="w-8 h-8 mx-auto mb-3 text-slate-600" /> No banners yet. Generate your first hero above.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {busy && (
              <div data-testid="banner-skeleton" className="glass-card rounded-xl overflow-hidden animate-pulse">
                <div className="h-44 w-full bg-gold/5 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-gold/60 animate-spin" />
                </div>
                <div className="p-4 space-y-2">
                  <div className="h-3 w-3/4 rounded bg-white/5" />
                  <div className="h-3 w-1/2 rounded bg-white/5" />
                </div>
              </div>
            )}
            {banners.map((b) => (
              <div key={b.id} data-testid={`banner-card-${b.id}`}
                className={`glass-card rounded-xl overflow-hidden transition-colors duration-300 ${b.active ? "border-gold/70 shadow-[0_0_25px_rgba(212,175,55,0.2)]" : ""}`}>
                <div className="relative">
                  <img src={imgUrl(b.image_url)} alt={b.prompt} className="h-44 w-full object-cover" />
                  <div className="absolute top-3 left-3 flex gap-2">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase bg-black/70 border border-gold/30 text-gold flex items-center gap-1">
                      {b.type === "video" ? <Video className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                      {b.type}
                    </span>
                    {b.active && (
                      <span data-testid={`banner-active-badge-${b.id}`}
                        className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase bg-gold text-black font-semibold">
                        Live on Storefront
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-xs text-slate-400 line-clamp-2">{b.prompt}</p>
                  <div className="flex gap-2">
                    {!b.active && (
                      <button onClick={() => activate(b)} data-testid={`banner-activate-${b.id}`}
                        className="btn-gold rounded-lg px-4 py-2 text-xs flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Set as Hero
                      </button>
                    )}
                    <button onClick={() => remove(b)} data-testid={`banner-delete-${b.id}`}
                      className="p-2 rounded-lg border border-red-900/50 text-red-400 hover:bg-red-950/40 transition-colors ml-auto">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
