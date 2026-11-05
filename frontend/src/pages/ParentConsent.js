import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";

// The page a parent reaches from the emailed link. It needs no login. Agreeing takes a tap on the button,
// so an email scanner that opens the link can't agree for them.
export default function ParentConsent() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [details, setDetails] = useState(null);
  const [error, setError] = useState(token ? "" : "This link isn't complete. Please ask for a new one.");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.post("/consent/details", { token })
      .then((r) => setDetails(r.data))
      .catch((err) => setError(formatApiErrorDetail(err.response?.data?.detail) || "Please check your connection and try again."));
  }, [token]);

  const agree = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post("/consent/confirm", { token });
      setDone(true);
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || "Please check your connection and try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen classroom-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl border-[3px] border-[#1E293B] shadow-[6px_6px_0_#1E293B] p-6 sm:p-8 space-y-4 text-[#1E293B]">
        <p className="font-head font-black text-sm uppercase tracking-wide">School of Maths</p>
        {done ? (
          <div data-testid="parent-consent-done" className="space-y-2">
            <h1 className="font-head font-black text-2xl">Thank you</h1>
            <p className="text-sm">{details?.student_name} can start now. You can close this page.</p>
          </div>
        ) : details ? (
          <>
            <h1 className="font-head font-black text-2xl">Please confirm for {details.student_name}</h1>
            <p data-testid="parent-consent-wording" className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-4 text-sm leading-relaxed">{details.wording}</p>
            <p className="text-sm">
              Read the <Link to="/terms" target="_blank" className="font-bold underline">Terms</Link> and{" "}
              <Link to="/privacy" target="_blank" className="font-bold underline">Privacy Policy</Link>. You can withdraw your agreement at any time by contacting the centre.
            </p>
            {error && <p role="alert" className="text-sm font-bold text-[#E04A3C]">{error}</p>}
            <Button data-testid="parent-consent-agree" onClick={agree} disabled={busy} className="hub-btn hub-btn-yellow w-full h-12 text-sm font-black">
              {busy ? "Please wait…" : "I agree"}
            </Button>
            <p className="text-xs text-[#64748B]">If you don't know this student or don't agree, close this page. Their access stays closed.</p>
          </>
        ) : error ? (
          <>
            <h1 className="font-head font-black text-2xl">This link can't be used</h1>
            <p role="alert" data-testid="parent-consent-error" className="text-sm">{error}</p>
          </>
        ) : (
          <p role="status" className="text-sm">Loading…</p>
        )}
      </div>
    </div>
  );
}
