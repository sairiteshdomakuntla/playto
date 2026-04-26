import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { authApi, ApiError } from "../api";

export default function Login() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data =
        tab === "login"
          ? await authApi.login({ username, password })
          : await authApi.register({ username, password, email });

      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("username", data.username);

      navigate(data.role === "reviewer" ? "/reviewer" : "/kyc", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Background gradient orb */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-primary/[0.04] rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-[400px] relative z-10 animate-fade-up">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-[10px] bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-[17px] font-semibold text-white tracking-[-0.02em]">Playto Pay</span>
          </div>
          <p className="text-zinc-500 text-[13px]">KYC Onboarding Portal</p>
        </div>

        {/* Card */}
        <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800/80 rounded-2xl p-7 shadow-2xl shadow-black/20">
          {/* Tab switcher */}
          <div className="flex p-0.5 bg-zinc-800/50 rounded-lg mb-7">
            {(["login", "register"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(""); }}
                className={`flex-1 py-2 rounded-md text-[13px] font-medium transition-all duration-200 ${
                  tab === t
                    ? "bg-zinc-700/80 text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[13px] font-medium text-zinc-400 mb-2">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field"
                placeholder="e.g. merchant1"
              />
            </div>

            {tab === "register" && (
              <div>
                <label className="block text-[13px] font-medium text-zinc-400 mb-2">
                  Email <span className="text-zinc-600">(optional)</span>
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="you@example.com"
                />
              </div>
            )}

            <div>
              <label className="block text-[13px] font-medium text-zinc-400 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={tab === "login" ? "current-password" : "new-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/8 border border-red-500/15 text-[13px] text-red-400">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-1"
            >
              {loading && <Spinner />}
              {loading
                ? tab === "login" ? "Signing in…" : "Creating account…"
                : tab === "login" ? "Sign In" : "Create Merchant Account"
              }
            </button>
          </form>

          {tab === "login" && (
            <p className="text-center text-zinc-600 text-[11px] mt-6">
              Reviewer accounts are created by administrators.
            </p>
          )}
        </div>

        {/* Seed credentials */}
        <div className="mt-5 p-4 rounded-xl bg-zinc-900/30 border border-zinc-800/50 text-[12px] text-zinc-500">
          <p className="font-medium text-zinc-400 mb-2.5">Test credentials</p>
          <div className="space-y-1.5 font-mono text-[11px]">
            <p><span className="text-primary-light">merchant1</span> <span className="text-zinc-700">/</span> merchant1 <span className="text-zinc-700">—</span> <span className="text-zinc-600">draft</span></p>
            <p><span className="text-primary-light">merchant2</span> <span className="text-zinc-700">/</span> merchant2 <span className="text-zinc-700">—</span> <span className="text-zinc-600">under review</span></p>
            <p><span className="text-amber-500">reviewer1</span> <span className="text-zinc-700">/</span> reviewer1 <span className="text-zinc-700">—</span> <span className="text-zinc-600">reviewer</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
