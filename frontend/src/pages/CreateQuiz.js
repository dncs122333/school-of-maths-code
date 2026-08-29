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
      toast.success(isDpp ? "DPP published!" : "Test is building — it'll go live in a moment");
      nav(isDpp ? "/dpp" : "/tests");
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); } finally { setBusy(false); }
  };

  const inp = "rounded-xl mt-1.5 bg-[#0B0F19] border-[#1E293B]";

  return (
    <div className="max-w-3xl mx-auto">
      <span className="text-xs uppercase tracking-widest text-[#06B6D4] font-600">Teacher studio</span>
      <h1 className="font-head text-3xl font-700 tracking-tight flex items-center gap-2 text-white">{isDpp ? "New Daily Practice" : "Launch a timed test"} <Wand2 className="h-6 w-6 text-[#06B6D4]" /></h1>
      <p className="text-[#94A3B8] mt-2">Pick a class, subject and chapter — we sample from your reviewed question bank ({isDpp ? "for open practice" : "and activate it for the window you set"}).</p>

      <div className="mt-6 space-y-5 rounded-3xl bg-[#111827] border border-[#1E293B] p-6 sm:p-8">
        <div>
          <Label className="font-600 text-[#94A3B8]">Title</Label>
          <Input data-testid="quiz-title" className={inp} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={isDpp ? "e.g. Motion — DPP 1" : "e.g. Weekly Test — Chemical Reactions"} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="font-600 text-[#94A3B8]">Class</Label>
            <Select value={f.class_level} onValueChange={(v) => setF({ ...f, class_level: v, subject: "", chapter: "" })}>
              <SelectTrigger data-testid="quiz-class" className={inp}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="9">Class 9</SelectItem><SelectItem value="10">Class 10</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-600 text-[#94A3B8]">Subject</Label>
            <Select value={f.subject} onValueChange={(v) => setF({ ...f, subject: v, chapter: "" })}>
              <SelectTrigger data-testid="quiz-subject" className={inp}><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-600 text-[#94A3B8]">Chapter</Label>
            <Select value={f.chapter} onValueChange={(v) => setF({ ...f, chapter: v })}>
              <SelectTrigger data-testid="quiz-chapter" className={inp}><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{chapters.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-600 text-[#94A3B8]">Topic <span className="text-[#94A3B8]/50 font-400">(optional)</span></Label>
            <Input data-testid="quiz-topic" className={inp} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="e.g. Newton's laws" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="font-600 text-[#94A3B8]">Number of questions</Label>
            <Input data-testid="quiz-count" type="number" min={1} max={50} className={inp + " font-mono"} value={f.question_count} onChange={(e) => setF({ ...f, question_count: e.target.value })} />
          </div>
          {isDpp ? (
            <div className="flex items-end text-xs text-[#94A3B8] pb-2">Practice is untimed and repeatable.</div>
          ) : null}
        </div>

        {!isDpp && (
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <Label className="font-600 text-[#94A3B8]">Batch</Label>
              <Select value={f.batch_id} onValueChange={(v) => setF({ ...f, batch_id: v })}>
                <SelectTrigger data-testid="quiz-batch" className={inp}><SelectValue placeholder="Choose batch" /></SelectTrigger>
                <SelectContent>{batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-600 text-[#94A3B8]">Duration (min)</Label>
              <Input data-testid="quiz-duration" type="number" min={1} className={inp + " font-mono"} value={f.duration_minutes} onChange={(e) => setF({ ...f, duration_minutes: e.target.value })} />
            </div>
            <div>
              <Label className="font-600 text-[#94A3B8]">Valid for (hours)</Label>
              <Input data-testid="quiz-validity" type="number" min={1} className={inp + " font-mono"} value={f.valid_hours} onChange={(e) => setF({ ...f, valid_hours: e.target.value })} />
            </div>
          </div>
        )}

        <Button data-testid="generate-quiz-btn" onClick={submit} disabled={busy} className="w-full rounded-full bg-[#3B82F6] text-white font-700 h-12 hover:bg-[#60A5FA] glow-blue">
          {busy ? <><Sparkles className="h-5 w-5 mr-2 animate-spin" /> Building…</> : <><Sparkles className="h-5 w-5 mr-2" /> {isDpp ? "Publish DPP" : "Create & activate test"}</>}
        </Button>
      </div>
    </div>
  );
}
