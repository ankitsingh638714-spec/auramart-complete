import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatApiError } from "../lib/api";
import { Gem, Lock, Mail, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/admin");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{ backgroundImage: "radial-gradient(circle at 30% 20%, #D4AF37 0%, transparent 40%), radial-gradient(circle at 80% 90%, #D4AF37 0%, transparent 35%)" }} />
      <div className="w-full max-w-md fade-up">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full glass-card mb-5">
            <Gem className="w-8 h-8 text-gold" />
          </div>
          <h1 className="font-serif text-4xl font-bold gold-text" data-testid="login-brand">AuraMart Luxe</h1>
          <p className="text-sm text-slate-400 mt-2 tracking-widest uppercase font-mono">Atelier Admin Access</p>
        </div>

        <form onSubmit={submit} className="glass-card rounded-2xl p-8 space-y-5" data-testid="admin-login-form">
          <div>
            <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Email</label>
            <div className="relative mt-2">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                data-testid="admin-login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@auramartluxe.com"
                className="input-luxe w-full rounded-lg pl-10 pr-4 py-3 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Password</label>
            <div className="relative mt-2">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                data-testid="admin-login-password"
                type={showPw ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                className="input-luxe w-full rounded-lg pl-10 pr-11 py-3 text-sm"
              />
              <button type="button" data-testid="toggle-password-visibility" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-gold transition-colors">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div data-testid="login-error" className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}

          <button data-testid="admin-login-submit" type="submit" disabled={loading}
            className="btn-gold w-full rounded-lg py-3 text-sm tracking-wide">
            {loading ? "Unlocking vault..." : "Enter the Atelier"}
          </button>

          <div className="text-center">
            <Link to="/forgot-password" data-testid="forgot-password-link"
              className="text-xs text-slate-400 hover:text-gold transition-colors">
              Forgot your password?
            </Link>
          </div>
        </form>

        <p className="text-center text-xs text-slate-600 mt-8">
          <Link to="/" data-testid="back-to-store-link" className="hover:text-gold transition-colors">← Return to storefront</Link>
        </p>
      </div>
    </div>
  );
}
