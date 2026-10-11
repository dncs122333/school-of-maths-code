import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatApiErrorDetail } from "../lib/api";
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
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (user) nav("/dashboard"); }, [user, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register({ ...form, role });
      toast.success("Welcome to School of Maths!");
      nav("/dashboard");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
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
                onClick={() => setMode(m)}
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
                className="mt-1"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-xs font-head font-bold uppercase text-[#1E293B]">Password</Label>
              <Input
                id="password"
                data-testid="password-input"
                type="password"
                required
                className="mt-1"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
              />
            </div>
            <Button
              data-testid="auth-submit"
              type="submit"
              disabled={busy}
              className="hub-btn hub-btn-yellow w-full h-11 text-sm uppercase tracking-wider mt-2 font-black active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              {busy ? "Please wait…" : mode === "login" ? "Log in to Hub" : "Create Account"}
            </Button>
          </form>
          {mode === "login" && process.env.NODE_ENV === "development" && (
            <p className="text-xs text-[#64748B] text-center mt-4 font-mono font-bold">
              Teacher Demo: admin@vidya.com / admin123
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
