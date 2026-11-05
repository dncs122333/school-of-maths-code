import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

// What a student sees until a parent agrees. Everything else stays closed, on the server too.
export default function WaitingForConsent() {
  const { user, refreshUser, logout } = useAuth();
  const withdrawn = user.parent_consent_status === "withdrawn";
  const [parentEmail, setParentEmail] = useState(user.parent?.email || "");
  const [savedEmail, setSavedEmail] = useState(user.parent?.email || "");
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState("");
  const [joined, setJoined] = useState("");
  const [busy, setBusy] = useState("");

  // The app opens by itself once the parent agrees
  useEffect(() => {
    const check = () => { if (document.visibilityState === "visible") refreshUser().catch(() => {}); };
    const timer = setInterval(check, 20000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", check); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (name, action) => {
    setBusy(name);
    try {
      await action();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Something went wrong. Please try again.");
    } finally { setBusy(""); }
  };

  const resend = () => run("resend", async () => {
    await api.post("/consent/resend");
    toast.success(`Email sent to ${savedEmail}`);
  });

  const changeEmail = (e) => {
    e.preventDefault();
    run("email", async () => {
      const res = await api.put("/consent/parent-email", { parent_email: parentEmail });
      setSavedEmail(res.data.sent_to);
      setEditing(false);
      toast.success(`Email sent to ${res.data.sent_to}`);
    });
  };

  const join = (e) => {
    e.preventDefault();
    run("join", async () => {
      const res = await api.post("/batches/join", { code });
      setJoined(res.data.name || "your batch");
      setCode("");
    });
  };

  const check = () => run("check", async () => {
    const fresh = await refreshUser();
    if (fresh.parent_consent_status === "pending" || fresh.parent_consent_status === "withdrawn") {
      toast("Not yet. Ask your parent to open the email and tap \"I agree\".");
    }
  });

  return (
    <div className="min-h-screen classroom-bg flex items-center justify-center p-4">
      <div data-testid="waiting-for-consent" className="w-full max-w-md bg-white rounded-3xl border-[3px] border-[#1E293B] shadow-[6px_6px_0_#1E293B] p-6 sm:p-8 space-y-5 text-[#1E293B]">
        <div>
          <h1 className="font-head font-black text-2xl">
            {withdrawn ? "Your parent's agreement was withdrawn" : "One step left: your parent's agreement"}
          </h1>
          <p className="mt-2 text-sm">
            {withdrawn
              ? "Your account is closed until a parent agrees again. Send them a new email, or speak to your teacher."
              : <>We emailed <strong className="break-all">{savedEmail}</strong>. Your notes and tests will open as soon as your parent taps "I agree". Ask them to check their spam folder too.</>}
          </p>
        </div>

        <Button data-testid="consent-check" onClick={check} disabled={!!busy} className="hub-btn hub-btn-yellow w-full h-11 text-sm font-black">
          {busy === "check" ? "Checking…" : "My parent has agreed"}
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button data-testid="consent-resend" variant="outline" onClick={resend} disabled={!!busy} className="min-h-11 rounded-full border-2 border-[#1E293B] font-bold text-sm">
            Send again
          </Button>
          <Button data-testid="consent-edit-email" variant="outline" onClick={() => setEditing((v) => !v)} disabled={!!busy} className="min-h-11 rounded-full border-2 border-[#1E293B] font-bold text-sm">
            Change email
          </Button>
        </div>

        {editing && (
          <form onSubmit={changeEmail} className="space-y-2">
            <Label htmlFor="parent-email-new" className="text-xs font-head font-bold uppercase">Parent's email</Label>
            <Input id="parent-email-new" data-testid="consent-new-email" type="email" required autoCapitalize="none" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} />
            <Button type="submit" disabled={!!busy} className="hub-btn hub-btn-yellow w-full h-11 text-sm font-black">Save and send</Button>
          </form>
        )}

        <form onSubmit={join} className="pt-4 border-t-2 border-[#1E293B]/15 space-y-2">
          <Label htmlFor="waiting-batch-code" className="text-xs font-head font-bold uppercase">Have a batch code?</Label>
          <p className="text-xs text-[#64748B]">Enter it so your teacher can see you're waiting and help.</p>
          <div className="flex gap-2">
            <Input id="waiting-batch-code" data-testid="consent-batch-code" required autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value)} />
            <Button type="submit" variant="outline" disabled={!!busy} className="min-h-11 rounded-full border-2 border-[#1E293B] font-bold text-sm">Add</Button>
          </div>
          {joined && <p role="status" data-testid="consent-joined" className="text-sm font-bold text-[#2F8A5F]">Added to {joined}.</p>}
        </form>

        <p className="text-xs text-[#64748B]">Parent has no email? Your teacher can give you a form to sign instead.</p>
        <button type="button" onClick={logout} className="min-h-11 text-sm font-bold text-[#3E7CB1] hover:underline">Log out</button>
      </div>
    </div>
  );
}
