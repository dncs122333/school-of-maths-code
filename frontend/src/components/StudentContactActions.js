import React, { useState } from "react";
import { FileText, MessageCircle, Pencil, Phone } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiErrorDetail } from "../lib/api";
import { useConfirm } from "./ConfirmDialog";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const CONTACT_LINK = "inline-flex items-center gap-1 h-8 px-2.5 rounded-xl border-2 border-[#1E293B] bg-white hover:bg-[#FFF9E8] text-xs font-bold text-[#1E293B] shadow-[1px_1px_0_#1E293B]";

const EVENT_LABELS = { requested: "Link issued to parent", confirmed: "Parent agreed", withdrawn: "Agreement withdrawn" };
const REPORT_LABELS = { sent: "Report sent", queued: "Report waiting", failed: "Report failed", skipped: "No report sent" };
const METHOD_LABELS = { email_link: "email link", signed_form: "signed form" };

export const isWaitingForConsent = (student) => ["pending", "withdrawn"].includes(student.parent_consent_status);

function ConsentRecords({ student, onClose }) {
  const [records, setRecords] = useState(null);
  React.useEffect(() => {
    api.get(`/admin/students/${student.id}/consent-records`)
      .then((r) => setRecords(r.data))
      .catch((err) => { toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not load the record"); setRecords([]); });
  }, [student.id]);

  const download = () => {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consent-record-${student.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Consent record: {student.name}</DialogTitle></DialogHeader>
        {!records ? <p className="text-sm">Loading…</p> : records.length === 0 ? <p className="text-sm">No consent records.</p> : (
          <ol data-testid="consent-records" className="space-y-3 text-sm text-[#1E293B]">
            {records.map((r) => (
              <li key={r.id} className="rounded-xl border-2 border-[#1E293B] p-3 space-y-1">
                <p className="font-bold">{EVENT_LABELS[r.event] || r.event}{r.method ? ` (${METHOD_LABELS[r.method] || r.method})` : ""}</p>
                <p className="text-xs">{new Date(r.at).toLocaleString()}</p>
                <p className="text-xs break-words">Parent: {r.parent_name}, {r.parent_email}, {r.parent_phone}</p>
                {r.actor_name && <p className="text-xs">By: {r.actor_name}</p>}
                {r.ip && <p className="text-xs break-words">From: {r.ip}{r.user_agent ? `, ${r.user_agent}` : ""}</p>}
                {r.event === "confirmed" && <p className="text-xs italic">"{r.wording}" (version {r.wording_version})</p>}
              </li>
            ))}
          </ol>
        )}
        {records?.length > 0 && <Button onClick={download} data-testid="consent-download" className="hub-btn hub-btn-yellow w-full h-11 text-sm font-black">Download record</Button>}
      </DialogContent>
    </Dialog>
  );
}

function EditContact({ student, batchId, onClose, onChanged }) {
  const waiting = isWaitingForConsent(student);
  const [form, setForm] = useState({
    phone: student.phone || "", parent_name: student.parent?.name || "",
    parent_phone: student.parent?.phone || "", parent_email: student.parent?.email || "",
  });
  const [busy, setBusy] = useState(false);
  const field = (key, label, props = {}) => (
    <div>
      <Label htmlFor={`edit-${key}`} className="text-xs font-head font-bold uppercase text-[#1E293B]">{label}</Label>
      <Input id={`edit-${key}`} data-testid={`edit-${key}`} required className="mt-1" value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...props} />
    </div>
  );
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/batches/${batchId}/students/${student.id}/contact`, {
        phone: form.phone, parent_name: form.parent_name, parent_phone: form.parent_phone,
        ...(waiting ? { parent_email: form.parent_email } : {}),
      });
      toast.success("Contact details saved");
      onChanged?.();
      onClose();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not save");
    } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Contact details: {student.name}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          {field("phone", "Student's mobile", { inputMode: "tel" })}
          {field("parent_name", "Parent's name")}
          {field("parent_phone", "Parent's mobile", { inputMode: "tel" })}
          {waiting
            ? field("parent_email", "Parent's email", { type: "email" })
            : <p className="text-xs text-[#64748B]">Parent's email: {student.parent?.email}. It can't be changed after they've agreed.</p>}
          {waiting && <p className="text-xs text-[#64748B]">Changing the email sends a new link to the new address.</p>}
          <Button type="submit" disabled={busy} data-testid="edit-contact-save" className="hub-btn hub-btn-yellow w-full h-11 text-sm font-black">Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Consent status and ways to reach a student's family. Accounts from before sign-up collected these show only what exists.
export default function StudentContactActions({ student, batchId, isAdmin, onChanged }) {
  const confirm = useConfirm();
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const parent = student.parent;
  const status = student.parent_consent_status;
  const waiting = isWaitingForConsent(student);
  const stop = (e) => e.stopPropagation();

  const act = async (action, success) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      onChanged?.();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Something went wrong");
    } finally { setBusy(false); }
  };

  const resend = () => act(() => api.post(`/batches/${batchId}/students/${student.id}/consent/resend`), `Email sent to ${parent?.email}`);
  const signedForm = async () => {
    if (!await confirm({
      title: `Signed form received for ${student.name}?`,
      description: "Only confirm if you have the form signed by a parent. Keep it safe. This opens the student's access, and your name is saved on the record.",
      confirmLabel: "Yes, I have the form",
    })) return;
    act(() => api.post(`/batches/${batchId}/students/${student.id}/consent/signed-form`), "Recorded. The student can start now.");
  };
  const togglePause = async () => {
    if (student.report_paused) {
      act(() => api.put(`/batches/${batchId}/students/${student.id}/report-pause`, { paused: false }), `${student.name}'s weekly report resumed`);
      return;
    }
    if (!await confirm({
      title: `Pause ${student.name}'s weekly report?`,
      description: "This parent stops getting the weekly email. Everyone else in the batch still gets theirs. It doesn't change consent, and a report that's waiting to go is stopped too. Results from paused weeks aren't sent later.",
      confirmLabel: "Pause report",
    })) return;
    act(() => api.put(`/batches/${batchId}/students/${student.id}/report-pause`, { paused: true }), `${student.name}'s weekly report paused`);
  };
  const withdraw = async () => {
    if (!await confirm({
      title: `Withdraw consent for ${student.name}?`,
      description: "Use this when a parent asks. The student's access closes until a parent agrees again. The record stays.",
      confirmLabel: "Withdraw",
      destructive: true,
    })) return;
    act(() => api.post(`/admin/students/${student.id}/consent/withdraw`), "Consent withdrawn");
  };

  return (
    <div data-testid={`student-contact-${student.id}`} className="flex flex-wrap items-center gap-1.5" onClick={stop}>
      {status && (
        <span data-testid={`consent-status-${student.id}`} className={`inline-flex items-center h-8 px-2.5 rounded-xl border-2 text-xs font-bold ${
          waiting ? "border-[#B45309] bg-[#F5C842]/25 text-[#1E293B]" : "border-[#2F8A5F] bg-[#EAF7EE] text-[#1E293B]"}`}>
          {status === "withdrawn" ? "Consent withdrawn" : waiting ? "Waiting for parent" : "Parent confirmed"}
        </span>
      )}
      {student.report_paused ? (
        <span data-testid={`report-paused-${student.id}`} className="inline-flex items-center h-8 px-2.5 rounded-xl border-2 border-[#B45309] bg-[#F5C842]/25 text-xs font-bold text-[#1E293B]">
          Report paused
        </span>
      ) : REPORT_LABELS[student.report_status] && (
        <span data-testid={`report-status-${student.id}`} className="inline-flex items-center h-8 px-2.5 rounded-xl border-2 border-[#1E293B]/30 bg-white text-xs font-bold text-[#1E293B]">
          {REPORT_LABELS[student.report_status]}
        </span>
      )}
      {student.phone && <a href={`tel:+91${student.phone}`} className={CONTACT_LINK}><Phone className="h-3.5 w-3.5" /> Call student</a>}
      {parent?.phone && (
        <>
          <a href={`tel:+91${parent.phone}`} title={parent.name} className={CONTACT_LINK}><Phone className="h-3.5 w-3.5" /> Call parent</a>
          <a href={`https://wa.me/91${parent.phone}`} target="_blank" rel="noopener noreferrer" title={parent.name} className={CONTACT_LINK}>
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp parent
          </a>
        </>
      )}
      {waiting && parent && (
        <>
          <button type="button" disabled={busy} data-testid={`consent-resend-${student.id}`} onClick={resend} className={CONTACT_LINK}>Resend email</button>
          <button type="button" disabled={busy} data-testid={`consent-signed-${student.id}`} onClick={signedForm} className={CONTACT_LINK}>Signed form received</button>
        </>
      )}
      {student.report_paused !== undefined && parent && (
        <button type="button" disabled={busy} data-testid={`report-pause-${student.id}`} onClick={togglePause} className={CONTACT_LINK}>
          {student.report_paused ? "Resume weekly report" : "Pause weekly report"}
        </button>
      )}
      {(student.phone || parent) && (
        <button type="button" data-testid={`edit-contact-${student.id}`} onClick={() => setDialog("edit")} className={CONTACT_LINK}><Pencil className="h-3.5 w-3.5" /> Edit</button>
      )}
      {isAdmin && status && (
        <button type="button" data-testid={`consent-records-${student.id}`} onClick={() => setDialog("records")} className={CONTACT_LINK}><FileText className="h-3.5 w-3.5" /> Consent record</button>
      )}
      {isAdmin && status === "confirmed" && (
        <button type="button" disabled={busy} data-testid={`consent-withdraw-${student.id}`} onClick={withdraw} className={CONTACT_LINK}>Withdraw consent</button>
      )}
      {dialog === "edit" && <EditContact student={student} batchId={batchId} onClose={() => setDialog(null)} onChanged={onChanged} />}
      {dialog === "records" && <ConsentRecords student={student} onClose={() => setDialog(null)} />}
    </div>
  );
}
