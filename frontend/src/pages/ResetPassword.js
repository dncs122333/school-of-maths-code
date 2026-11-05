import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(token ? "" : "This reset link isn't complete. Please ask for a new one.");
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError("The two passwords don't match."); return; }
    setBusy(true);
    setError("");
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen classroom-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl border-[3px] border-[#1E293B] shadow-[6px_6px_0_#1E293B] p-8">
        <h1 className="font-head font-black text-2xl text-[#1E293B]">
          {done ? "Password changed" : "Choose a new password"}
        </h1>
        {done ? (
          <div data-testid="reset-done" className="mt-4 space-y-5">
            <p className="text-sm text-[#1E293B]">You can log in with your new password now. Any other devices have been logged out.</p>
            <Link to="/auth" className="hub-btn hub-btn-yellow flex h-11 items-center justify-center text-sm uppercase tracking-wider font-black">
              Go to log in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <Label htmlFor="new-password" className="text-xs font-head font-bold uppercase text-[#1E293B]">New password</Label>
              <Input id="new-password" data-testid="new-password" type="password" required minLength={6} autoComplete="new-password"
                className="mt-1" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="confirm-password" className="text-xs font-head font-bold uppercase text-[#1E293B]">Type it again</Label>
              <Input id="confirm-password" data-testid="confirm-password" type="password" required minLength={6} autoComplete="new-password"
                className="mt-1" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <p role="alert" data-testid="reset-error" className="text-sm font-bold text-[#E04A3C]">{error}</p>}
            <Button data-testid="reset-submit" type="submit" disabled={busy || !token}
              className="hub-btn hub-btn-yellow w-full h-11 text-sm uppercase tracking-wider font-black">
              {busy ? "Please wait…" : "Change password"}
            </Button>
            <Link to="/auth" className="flex min-h-11 items-center justify-center text-sm font-bold text-[#3E7CB1] hover:underline">
              Back to log in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
