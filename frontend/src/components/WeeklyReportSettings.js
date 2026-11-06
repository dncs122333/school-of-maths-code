import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Eye, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Label } from "./ui/label";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const REASONS = {
  no_class_test: "No class test had results ready this week.",
  no_parent_consent: "Parent hasn't agreed yet",
  no_parent_email: "No parent email",
  paused_for_student: "Paused for this student",
  student_not_active: "Student is disabled or blocked",
  student_removed: "Student left the batch",
  batch_removed: "Batch was deleted",
  undeliverable_address: "Email address can't receive mail",
  email_not_configured: "Email isn't set up on this server",
  joined_after_tests: "This student joined after this week's tests.",
};

function nextSendText(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

function Preview({ batchId, onClose }) {
  const [studentId, setStudentId] = useState("");
  const [data, setData] = useState(null);
  const [students, setStudents] = useState([]);

  useEffect(() => {
    setData(null);
    api.get(`/batches/${batchId}/reports/preview`, { params: studentId ? { student_id: studentId } : {} })
      .then((r) => {
        setData(r.data);
        if (r.data.students) setStudents(r.data.students);
      })
      .catch((err) => setData({ has_report: false, error: formatApiErrorDetail(err.response?.data?.detail) }));
  }, [batchId, studentId]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto grid-cols-[minmax(0,1fr)] w-[calc(100vw-1.5rem)] max-w-lg">
        <DialogHeader><DialogTitle>Report preview</DialogTitle></DialogHeader>
        <p className="text-xs text-[#64748B]">This is what it would say if it went out now. Nothing is sent.</p>
        {students.length > 1 && (
          <div>
            <Label htmlFor="report-preview-student" className="text-xs font-head font-bold uppercase text-[#1E293B]">Student</Label>
            <select id="report-preview-student" data-testid="report-preview-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}
              className="mt-1 w-full min-h-11 rounded-xl border-2 border-[#1E293B] bg-white px-3 text-sm">
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        {!data ? <p role="status" className="text-sm">Loading…</p> : data.has_report ? (
          <>
            <p className="text-xs font-bold text-[#1E293B] break-words">Subject: {data.subject}</p>
            {/* Sandboxed: an email's content can't run or reach the page */}
            <iframe title="Report preview" data-testid="report-preview-frame" sandbox="" srcDoc={data.html} className="w-full h-[55vh] rounded-xl border-2 border-[#1E293B] bg-white" />
          </>
        ) : (
          <p data-testid="report-preview-empty" className="text-sm text-[#1E293B]">{data.error || REASONS[data.reason] || "No report to show."}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Parents' weekly report for one batch: the day it goes out, pause, note, preview, and how the last one went
export default function WeeklyReportSettings({ batchId }) {
  const [status, setStatus] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get(`/batches/${batchId}/reports/status`);
    setStatus(res.data);
    setNote(res.data.report_note || "");
  }, [batchId]);

  useEffect(() => {
    setStatus(null);
    load().catch((err) => toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not load report settings"));
  }, [load]);

  const save = async (fields, done) => {
    setBusy(true);
    try {
      await api.put(`/batches/${batchId}`, fields);
      await load();
      if (done) toast.success(done);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not save");
    } finally { setBusy(false); }
  };

  const retry = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/batches/${batchId}/reports/retry`);
      await load();
      toast.success(`${res.data.requeued} queued to send again`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not retry");
    } finally { setBusy(false); }
  };

  if (!status) return <p role="status" className="text-sm text-[#1E293B]/70 py-8 text-center">Loading…</p>;

  const day = status.report_weekday;
  const dayLoad = day === null ? 0 : status.weekday_load[day] || 0;
  const overCap = day !== null && dayLoad > status.daily_cap;
  const run = status.last_run;

  return (
    <div data-testid="weekly-report-settings" className="space-y-4 text-[#1E293B]">
      <section className="rounded-2xl border-2 border-[#1E293B] bg-white p-4 sm:p-5 shadow-[3px_3px_0_#1E293B] space-y-4">
        <div>
          <h4 className="font-head text-lg font-bold">Weekly report to parents</h4>
          <p className="text-sm text-[#1E293B]/70 mt-1">One email a week to parents who have agreed. Class tests only: practice and students' own tests aren't included.</p>
        </div>
        <div>
          <Label htmlFor="report-day" className="text-xs font-head font-bold uppercase">Report day (6 pm)</Label>
          <select id="report-day" data-testid="report-day" disabled={busy} value={day === null ? "" : String(day)}
            onChange={(e) => save({ report_weekday: e.target.value === "" ? -1 : Number(e.target.value) }, "Report day saved")}
            className="mt-1 w-full min-h-11 rounded-xl border-2 border-[#1E293B] bg-white px-3 text-sm">
            <option value="">Choose a day</option>
            {DAYS.map((name, i) => (
              <option key={name} value={i}>{name} ({status.weekday_load[i] || 0} reports due)</option>
            ))}
          </select>
          {day === null && (
            <p data-testid="report-no-day" className="mt-2 text-sm font-bold text-[#B45309]">No reports go out until you choose a day.</p>
          )}
          {overCap && (
            <p data-testid="report-over-cap" role="alert" className="mt-2 flex items-start gap-2 text-sm font-bold text-[#B45309]">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              {DAYS[day]} has {dayLoad} reports, over the limit of {status.daily_cap} a day. The extra ones will go the next day. Choose a quieter day to avoid the delay.
            </p>
          )}
          {day !== null && !status.reports_paused && (
            <p className="mt-2 text-xs text-[#1E293B]/70">Next one: {nextSendText(status.next_send)}</p>
          )}
        </div>
        <label className="flex items-center gap-3 min-h-11 cursor-pointer text-sm font-bold">
          <input type="checkbox" data-testid="report-paused" disabled={busy} checked={status.reports_paused}
            onChange={(e) => save({ reports_paused: e.target.checked }, e.target.checked ? "Reports paused" : "Reports resumed")}
            className="h-5 w-5 accent-[#3E7CB1]" />
          Pause reports for this batch
        </label>
        {status.reports_paused && (
          <p className="text-xs text-[#1E293B]/70">Nothing goes out while paused. Tests from a paused week go in the next report.</p>
        )}
        <div>
          <Label htmlFor="report-note" className="text-xs font-head font-bold uppercase">Note from you (optional)</Label>
          <textarea id="report-note" data-testid="report-note" maxLength={300} rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-xl border-2 border-[#1E293B] bg-white p-3 text-sm" placeholder="Goes to every parent in this batch" />
          <Button type="button" variant="outline" data-testid="report-note-save" disabled={busy || note === (status.report_note || "")} onClick={() => save({ report_note: note }, "Note saved")}
            className="mt-2 min-h-11 rounded-full border-2 border-[#1E293B] font-bold text-sm">Save note</Button>
        </div>
        <Button type="button" data-testid="report-preview" onClick={() => setPreview(true)} className="hub-btn hub-btn-yellow w-full min-h-11 text-sm font-black">
          <Eye className="h-4 w-4 mr-2" /> Preview a report
        </Button>
      </section>

      <section data-testid="report-last-run" className="rounded-2xl border-2 border-[#1E293B] bg-white p-4 sm:p-5 shadow-[3px_3px_0_#1E293B] space-y-3">
        <h4 className="font-head text-lg font-bold">Last report</h4>
        {!run ? <p className="text-sm text-[#1E293B]/70">None yet.</p> : run.status === "skipped" ? (
          <p className="text-sm">{run.week}: nothing sent. {REASONS[run.reason] || ""}</p>
        ) : (
          <>
            <p className="text-sm font-bold">Week of {run.week}</p>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              {[["Sent", run.counts.sent], ["Waiting", run.counts.queued], ["Failed", run.counts.failed], ["Skipped", run.counts.skipped]].map(([label, value]) => (
                <div key={label} className="rounded-xl border-2 border-[#1E293B]/20 p-2">
                  <dd className="font-head text-xl font-black">{value}</dd>
                  <dt className="text-xs text-[#1E293B]/70">{label}</dt>
                </div>
              ))}
            </dl>
            {run.delayed > 0 && <p data-testid="report-delayed" className="text-sm font-bold text-[#B45309]">{run.delayed} delayed by the daily limit. They go out first tomorrow.</p>}
            {run.problems.length > 0 && (
              <ul className="text-sm space-y-1">
                {run.problems.map((p) => (
                  <li key={p.student_id}><strong>{p.name}</strong>: {p.status === "failed" ? "Couldn't send" : (REASONS[p.reason] || p.reason)}</li>
                ))}
              </ul>
            )}
            {run.counts.failed > 0 && (
              <Button type="button" variant="outline" data-testid="report-retry" disabled={busy} onClick={retry} className="min-h-11 rounded-full border-2 border-[#1E293B] font-bold text-sm">
                <RotateCcw className="h-4 w-4 mr-2" /> Try failed ones again
              </Button>
            )}
          </>
        )}
      </section>
      {preview && <Preview batchId={batchId} onClose={() => setPreview(false)} />}
    </div>
  );
}
