import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Orbit, BookOpen, Presentation } from "lucide-react";
import { toast } from "sonner";

export default function Auth() {
  const [params] = useSearchParams();
  const { login, register, user } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState(params.get("mode") === "register" ? "register" : "login");
  const [role, setRole] = useState(params.get("role") === "teacher" ? "teacher" : "student");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (user) nav("/dashboard"); }, [user, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register({ ...form, role });
      toast.success("Welcome to VidyaLab!");
      nav("/dashboard");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen cosmic-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md relative">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-48 rounded-full border border-dashed border-white/10 animate-spin-slow" />
        <div className="flex items-center justify-center gap-2.5 mb-8 cursor-pointer relative z-10" onClick={() => nav("/")}>
          <div className="h-10 w-10 rounded-xl bg-[#3B82F6] flex items-center justify-center glow-blue">
            <Orbit className="h-6 w-6 text-white" />
          </div>
          <span className="font-head font-700 text-2xl tracking-tight text-white">Vidya<span className="text-[#06B6D4]">Lab</span></span>
        </div>

        <div className="bg-[#111827] rounded-3xl border border-[#1E293B] p-8 relative z-10">
          <div className="flex gap-2 p-1 bg-[#0B0F19] border border-[#1E293B] rounded-full mb-6">
            {["login", "register"].map((m) => (
              <button key={m} data-testid={`tab-${m}`} onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-full text-sm font-600 capitalize transition-colors ${mode === m ? "bg-[#3B82F6] text-white" : "text-[#94A3B8]"}`}>
                {m === "login" ? "Log in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <>
                <div>
                  <Label className="text-sm font-600 text-[#94A3B8]">I am a</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    {[{ v: "student", icon: BookOpen, l: "Student" }, { v: "teacher", icon: Presentation, l: "Teacher" }].map((r) => (
                      <button type="button" key={r.v} data-testid={`role-${r.v}`} onClick={() => setRole(r.v)}
                        className={`flex items-center justify-center gap-2 py-3 rounded-2xl border font-600 transition-colors ${role === r.v ? "border-[#3B82F6] bg-[#3B82F6]/10 text-white" : "border-[#1E293B] text-[#94A3B8]"}`}>
                        <r.icon className="h-4 w-4" /> {r.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="name" className="text-sm font-600 text-[#94A3B8]">Full name</Label>
                  <Input id="name" data-testid="name-input" required className="rounded-xl mt-1.5 bg-[#0B0F19] border-[#1E293B]" value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Aarav Sharma" />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="email" className="text-sm font-600 text-[#94A3B8]">Email</Label>
              <Input id="email" data-testid="email-input" type="email" required className="rounded-xl mt-1.5 bg-[#0B0F19] border-[#1E293B]" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
            </div>
            <div>
              <Label htmlFor="password" className="text-sm font-600 text-[#94A3B8]">Password</Label>
              <Input id="password" data-testid="password-input" type="password" required className="rounded-xl mt-1.5 bg-[#0B0F19] border-[#1E293B]" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
            </div>
            <Button data-testid="auth-submit" type="submit" disabled={busy}
              className="w-full rounded-full bg-[#3B82F6] text-white font-700 hover:bg-[#60A5FA] h-11 glow-blue">
              {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
            </Button>
          </form>
          {mode === "login" && (
            <p className="text-xs text-[#94A3B8]/70 text-center mt-4 font-mono">admin@vidya.com / admin123</p>
          )}
        </div>
      </div>
    </div>
  );
}
