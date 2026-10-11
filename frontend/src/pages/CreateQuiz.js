import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";

export default function CreateQuiz({ kind }) {
  const nav = useNavigate();
  const isDpp = kind === "dpp";
  const [catalog, setCatalog] = useState({});
  const [batches, setBatches] = useState([]);
  const [f, setF] = useState({ title: "", class_level: "9", subject: "", chapter: "", topic: "",
    batch_id: "", question_count: 10, duration_minutes: 20, valid_hours: 24, activate_now: true });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/catalog").then((r) => setCatalog(r.data));
    if (!isDpp) api.get("/batches").then((r) => setBatches(r.data));
  }, [isDpp]);
  const subjects = catalog[f.class_level] ? Object.keys(catalog[f.class_level]) : [];
  const chapters = catalog[f.class_level]?.[f.subject] || [];

  const submit = async () => {
    if (!f.title || !f.subject || !f.chapter) { toast.error("Fill title, subject and chapter"); return; }
    if (!isDpp && !f.batch_id) { toast.error("Select a batch for this test"); return; }
    setBusy(true);
    try {
      await api.post("/tests", { ...f, kind, batch_id: isDpp ? null : f.batch_id,
        question_count: Number(f.question_count), duration_minutes: Number(f.duration_minutes),
        valid_hours: Number(f.valid_hours) });
      toast.success(isDpp ? "Chapterwise Test published!" : "Test is building — it'll go live in a moment");
      nav(isDpp ? "/dpp" : "/tests");
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); } finally { setBusy(false); }
  };

  const inp = "rounded-xl mt-1.5 bg-[#FFF9E8] border-2 border-[#1E293B] text-[#1E293B] font-semibold focus:ring-2 focus:ring-[#F5C842]";

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 rounded-3xl bg-[#F5C842] border-[2.5px] border-[#1E293B] p-6 sm:p-8 shadow-[4px_4px_0_#1E293B]">
        <span className="inline-block px-3 py-1 rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] text-xs font-900 uppercase tracking-widest shadow-[2px_2px_0_#1E293B]">Teacher studio</span>
        <h1 className="font-head text-3xl sm:text-4xl font-900 tracking-tight flex items-center gap-2 text-[#1E293B] mt-2">
          {isDpp ? "NEW CHAPTERWISE TEST" : "LAUNCH A TIMED TEST"} <Wand2 className="h-7 w-7 text-[#1E293B]" />
        </h1>
        <p className="text-[#1E293B]/80 font-medium mt-2">
          Pick a class, subject and chapter — we sample from your reviewed question bank ({isDpp ? "for open practice" : "and activate it for the window you set"}).
        </p>
      </div>

      <div className="space-y-5 rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-6 sm:p-8 shadow-[4px_4px_0_#1E293B]">
        <div>
          <Label className="font-800 text-[#1E293B]">Title</Label>
          <Input data-testid="quiz-title" className={inp} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={isDpp ? "e.g. Real Numbers — Chapterwise Test" : "e.g. Weekly Test — Chemical Reactions"} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="font-800 text-[#1E293B]">Class</Label>
            <Select value={f.class_level} onValueChange={(v) => setF({ ...f, class_level: v, subject: "", chapter: "" })}>
              <SelectTrigger data-testid="quiz-class" className={inp}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="9">Class 9</SelectItem><SelectItem value="10">Class 10</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-800 text-[#1E293B]">Subject</Label>
            <Select value={f.subject} onValueChange={(v) => setF({ ...f, subject: v, chapter: "" })}>
              <SelectTrigger data-testid="quiz-subject" className={inp}><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-800 text-[#1E293B]">Chapter</Label>
            <Select value={f.chapter} onValueChange={(v) => setF({ ...f, chapter: v })}>
              <SelectTrigger data-testid="quiz-chapter" className={inp}><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{chapters.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-800 text-[#1E293B]">Topic <span className="text-[#1E293B]/50 font-normal">(optional)</span></Label>
            <Input data-testid="quiz-topic" className={inp} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="e.g. Newton's laws" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="font-800 text-[#1E293B]">Number of questions</Label>
            <Input data-testid="quiz-count" type="number" min={1} max={50} className={inp + " font-mono"} value={f.question_count} onChange={(e) => setF({ ...f, question_count: e.target.value })} />
          </div>
          {isDpp ? (
            <div className="flex items-end text-xs font-semibold text-[#1E293B]/70 pb-2">Practice is untimed and repeatable.</div>
          ) : null}
        </div>

        {!isDpp && (
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <Label className="font-800 text-[#1E293B]">Batch</Label>
              <Select value={f.batch_id} onValueChange={(v) => setF({ ...f, batch_id: v })}>
                <SelectTrigger data-testid="quiz-batch" className={inp}><SelectValue placeholder="Choose batch" /></SelectTrigger>
                <SelectContent>{batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-800 text-[#1E293B]">Duration (min)</Label>
              <Input data-testid="quiz-duration" type="number" min={1} className={inp + " font-mono"} value={f.duration_minutes} onChange={(e) => setF({ ...f, duration_minutes: e.target.value })} />
            </div>
            <div>
              <Label className="font-800 text-[#1E293B]">Valid for (hours)</Label>
              <Input data-testid="quiz-validity" type="number" min={1} className={inp + " font-mono"} value={f.valid_hours} onChange={(e) => setF({ ...f, valid_hours: e.target.value })} />
            </div>
          </div>
        )}

        <Button data-testid="generate-quiz-btn" onClick={submit} disabled={busy} className="w-full rounded-full bg-[#F5C842] hover:bg-[#ebd438] text-[#1E293B] font-900 border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none h-12 text-base">
          {busy ? <><Sparkles className="h-5 w-5 mr-2 animate-spin" /> Building…</> : <><Sparkles className="h-5 w-5 mr-2" /> {isDpp ? "Publish Chapterwise Test" : "Create & activate test"}</>}
        </Button>
      </div>
    </div>
  );
}
