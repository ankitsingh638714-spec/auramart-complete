import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { Gem, Lock } from "lucide-react";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      navigate("/admin/login");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md fade-up">
        <div className="text-center mb-8">
          <Gem className="w-10 h-10 text-gold mx-auto mb-4" />
          <h1 className="font-serif text-3xl font-bold gold-text">New Password</h1>
        </div>
        <div className="glass-card rounded-2xl p-8">
          {!token ? (
            <div data-testid="reset-no-token" className="text-center space-y-4">
              <p className="text-slate-300 text-sm">This reset link is invalid or incomplete.</p>
              <Link to="/forgot-password" className="text-gold text-sm hover:underline">Request a new link</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5" data-testid="reset-password-form">
              {[{ label: "New Password", val: password, set: setPassword, id: "reset-new-password" },
                { label: "Confirm Password", val: confirm, set: setConfirm, id: "reset-confirm-password" }].map((f) => (
                <div key={f.id}>
                  <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">{f.label}</label>
                  <div className="relative mt-2">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input data-testid={f.id} type="password" required value={f.val}
                      onChange={(e) => f.set(e.target.value)} placeholder="••••••••••"
                      className="input-luxe w-full rounded-lg pl-10 pr-4 py-3 text-sm" />
                  </div>
                </div>
              ))}
              {error && <div data-testid="reset-error" className="text-sm text-red-400">{error}</div>}
              <button data-testid="reset-submit-btn" type="submit" disabled={loading}
                className="btn-gold w-full rounded-lg py-3 text-sm">
                {loading ? "Updating..." : "Update Password"}
              </button>
              <div className="text-center">
                <Link to="/admin/login" className="text-xs text-slate-400 hover:text-gold transition-colors">Back to sign in</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
