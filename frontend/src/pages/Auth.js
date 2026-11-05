import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { BookOpen, Presentation } from "lucide-react";
import { toast } from "sonner";

export default function Auth() {
  const [params] = useSearchParams();
  const { login, register, user } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState(params.get("mode") === "register" ? "register" : "login");
  const [role, setRole] = useState(params.get("role") === "teacher" ? "teacher" : "student");
  const [form, setForm] = useState({
    name: "",
    email: process.env.NODE_ENV === "development" ? "admin@vidya.com" : "",
    password: process.env.NODE_ENV === "development" ? "admin123" : ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingMessage, setPendingMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [resetSent, setResetSent] = useState("");

  useEffect(() => { if (user) nav("/dashboard", { replace: true }); }, [user, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setPendingMessage("");
    setResetSent("");
    try {
      if (mode === "forgot") {
        const res = await api.post("/auth/forgot-password", { email: form.email });
        setResetSent(res.data.message);
        return;
      }
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        const res = await register({ ...form, role, consent });
        if (res?.pendingApproval) {
          setPendingMessage(res.message);
          setMode("login");
          return;
        }
      }
      toast.success("Welcome to School of Maths!");
      nav("/dashboard", { replace: true });
    } catch (err) {
      // Shown under the form: a toast is easy to miss on a phone
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen classroom-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md relative">
        {/* Retro Logo Badge */}
        <div className="flex items-center justify-center gap-2.5 mb-8 cursor-pointer" onClick={() => nav("/")}>
          <div className="h-12 w-12 rounded-2xl bg-[#F5C842] border-[2.5px] border-[#1E293B] shadow-[3px_3px_0_#1E293B] flex items-center justify-center">
            <span className="text-2xl">📐</span>
          </div>
          <div className="flex flex-col">
            <span className="font-head font-black text-2xl tracking-tight text-[#1E293B] uppercase leading-none">
              School <span className="text-[#E04A3C]">of</span> Maths
            </span>
            <span className="text-[11px] font-head font-bold uppercase tracking-wider text-[#64748B] mt-0.5">
              Classroom Hub Portal
            </span>
          </div>
        </div>

        {/* White Card with Thick Borders & Hard Shadow */}
        <div className="bg-white rounded-3xl border-[3px] border-[#1E293B] shadow-[6px_6px_0_#1E293B] p-8">
          {/* Mode Switcher Pills */}
          <div className="flex gap-2 p-1.5 bg-[#FFF9E8] border-2 border-[#1E293B] rounded-full mb-6">
            {["login", "register"].map((m) => (
              <button
                key={m}
                data-testid={`tab-${m}`}
                onClick={() => { setMode(m); setError(""); setResetSent(""); }}
                className={`flex-1 py-2 rounded-full text-xs font-head font-bold uppercase tracking-wider transition-all ${
                  mode === m
                    ? "bg-[#F5C842] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                    : "text-[#1E293B] hover:bg-white"
                }`}
              >
                {m === "login" ? "Log in" : "Sign up"}
              </button>
            ))}
          </div>

          {pendingMessage && (
            <div role="status" data-testid="teacher-pending" className="mb-5 rounded-2xl bg-[#EAF7EE] border-2 border-[#2F8A5F] p-4 text-sm text-[#1E293B]">
              <p className="font-head font-bold">Request sent</p>
              <p className="mt-1">{pendingMessage}</p>
            </div>
          )}
          {mode === "forgot" && (
            <div className="mb-4">
              <p className="font-head font-bold text-[#1E293B]">Forgot your password?</p>
              <p className="text-sm text-[#64748B] mt-1">Enter your email and we'll send you a link to choose a new one.</p>
            </div>
          )}
          {resetSent && (
            <div role="status" data-testid="reset-sent" className="mb-5 rounded-2xl bg-[#EAF7EE] border-2 border-[#2F8A5F] p-4 text-sm text-[#1E293B]">
              {resetSent}
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <>
                <div>
                  <Label className="text-xs font-head font-bold uppercase text-[#1E293B]">I am a</Label>
                  <div className="grid grid-cols-2 gap-2.5 mt-1.5">
                    {[{ v: "student", icon: BookOpen, l: "Student" }, { v: "teacher", icon: Presentation, l: "Teacher" }].map((r) => (
                      <button
                        type="button"
                        key={r.v}
                        data-testid={`role-${r.v}`}
                        onClick={() => setRole(r.v)}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-2xl border-2 border-[#1E293B] font-head font-bold text-xs transition-all ${
                          role === r.v
                            ? "bg-[#3E7CB1] text-white shadow-[2px_2px_0_#1E293B]"
                            : "bg-[#FFF9E8] text-[#1E293B] hover:bg-white"
                        }`}
                      >
                        <r.icon className="h-4 w-4" /> {r.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="name" className="text-xs font-head font-bold uppercase text-[#1E293B]">Full name</Label>
                  <Input
                    id="name"
                    data-testid="name-input"
                    required
                    autoComplete="name"
                    className="mt-1"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Aarav Sharma"
                  />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="email" className="text-xs font-head font-bold uppercase text-[#1E293B]">Email</Label>
              <Input
                id="email"
                data-testid="email-input"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                className="mt-1"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
              />
            </div>
            {mode !== "forgot" && (
              <div>
                <Label htmlFor="password" className="text-xs font-head font-bold uppercase text-[#1E293B]">Password</Label>
                <Input
                  id="password"
                  data-testid="password-input"
                  type="password"
                  required
                  minLength={mode === "register" ? 6 : undefined}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="mt-1"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                />
              </div>
            )}
            {mode === "login" && (
              <button
                type="button"
                data-testid="forgot-password-link"
                onClick={() => { setMode("forgot"); setError(""); setPendingMessage(""); }}
                className="min-h-11 text-sm font-bold text-[#3E7CB1] hover:underline"
              >
                Forgot password?
              </button>
            )}
            {mode === "register" && (
              <label className="flex items-start gap-3 min-h-11 cursor-pointer text-sm text-[#1E293B]">
                <input
                  type="checkbox"
                  required
                  data-testid="consent-checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#3E7CB1]"
                />
                <span>
                  I agree to the <Link to="/terms" target="_blank" className="font-bold underline">Terms</Link> and{" "}
                  <Link to="/privacy" target="_blank" className="font-bold underline">Privacy Policy</Link>. If I'm under 18,
                  my parent or guardian has read them and agrees too.
                </span>
              </label>
            )}
            {error && (
              <p role="alert" data-testid="auth-error" className="text-sm font-bold text-[#E04A3C]">{error}</p>
            )}
            {mode === "register" && role === "teacher" && (
              <p className="text-xs text-[#64748B]">Teacher accounts are checked by the admin before you can log in.</p>
            )}
            <Button
              data-testid="auth-submit"
              type="submit"
              disabled={busy}
              className="hub-btn hub-btn-yellow w-full h-11 text-sm uppercase tracking-wider mt-2 font-black active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              {busy ? "Please wait…" : mode === "login" ? "Log in to Hub" : mode === "forgot" ? "Send reset link" : "Create Account"}
            </Button>
            {mode === "forgot" && (
              <button
                type="button"
                data-testid="back-to-login"
                onClick={() => { setMode("login"); setError(""); setResetSent(""); }}
                className="block w-full min-h-11 text-sm font-bold text-[#3E7CB1] hover:underline"
              >
                Back to log in
              </button>
            )}
          </form>
          {mode === "login" && process.env.NODE_ENV === "development" && (
            <button
              type="button"
              id="quick-demo-fill"
              onClick={() => setForm({ email: "admin@vidya.com", password: "admin123" })}
              className="block w-full text-xs text-[#3E7CB1] hover:text-[#1E293B] hover:underline text-center mt-4 font-mono font-bold cursor-pointer p-1"
            >
              Teacher Demo: admin@vidya.com / admin123 (Click to fill)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
