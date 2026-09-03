import { useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { Gem, Mail } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setDone(true);
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
          <h1 className="font-serif text-3xl font-bold gold-text">Forgot Password</h1>
        </div>
        <div className="glass-card rounded-2xl p-8">
          {done ? (
            <div data-testid="forgot-success" className="text-center space-y-4">
              <p className="text-slate-300 text-sm leading-relaxed">
                If that email is registered, a reset link has been sent. Please check your inbox — the link expires in 1 hour.
              </p>
              <Link to="/admin/login" data-testid="back-to-login-link" className="text-gold text-sm hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5" data-testid="forgot-password-form">
              <div>
                <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Admin Email</label>
                <div className="relative mt-2">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input data-testid="forgot-email-input" type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)} placeholder="owner@auramartluxe.com"
                    className="input-luxe w-full rounded-lg pl-10 pr-4 py-3 text-sm" />
                </div>
              </div>
              {error && <div data-testid="forgot-error" className="text-sm text-red-400">{error}</div>}
              <button data-testid="forgot-submit-btn" type="submit" disabled={loading}
                className="btn-gold w-full rounded-lg py-3 text-sm">
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
              <div className="text-center">
                <Link to="/admin/login" data-testid="back-to-login-link" className="text-xs text-slate-400 hover:text-gold transition-colors">
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
