import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Upload, Sparkles, FileText, Wand2 } from "lucide-react";
import { toast } from "sonner";

export default function CreateQuiz({ kind }) {
  const nav = useNavigate();
  const isDpp = kind === "dpp";
  const [catalog, setCatalog] = useState({});
  const [batches, setBatches] = useState([]);
  const [f, setF] = useState({ title: "", class_level: "9", subject: "", chapter: "", topic: "",
    batch_id: "", raw_text: "", duration_minutes: 20, valid_hours: 24, activate_now: true });
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    api.get("/catalog").then((r) => setCatalog(r.data));
    if (!isDpp) api.get("/batches").then((r) => setBatches(r.data));
  }, [isDpp]);
  const subjects = catalog[f.class_level] ? Object.keys(catalog[f.class_level]) : [];
  const chapters = catalog[f.class_level]?.[f.subject] || [];

  const onFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/extract", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (r.data.text?.trim()) { setF((p) => ({ ...p, raw_text: (p.raw_text + "\n" + r.data.text).trim() })); toast.success("Text extracted"); }
      else toast.error("Couldn't read text — try pasting");
    } catch (e) { toast.error("Extraction failed"); } finally { setExtracting(false); }
  };

  const submit = async () => {
    if (!f.title || !f.subject || !f.chapter || !f.raw_text.trim()) { toast.error("Fill title, subject, chapter and content"); return; }
    if (!isDpp && !f.batch_id) { toast.error("Select a batch for this test"); return; }
    setBusy(true);
    try {
      await api.post("/tests", { ...f, kind, batch_id: isDpp ? null : f.batch_id,
        duration_minutes: Number(f.duration_minutes), valid_hours: Number(f.valid_hours) });
      toast.success(isDpp ? "DPP published!" : "Test is live!");
      nav(isDpp ? "/dpp" : "/tests");
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <span className="text-xs uppercase tracking-widest text-brand-purple font-700">Teacher studio</span>
      <h1 className="font-head text-3xl font-700 tracking-tight flex items-center gap-2">{isDpp ? "New Daily Practice" : "Launch a timed test"} <Wand2 className="h-6 w-6 text-brand-purple" /></h1>
      <p className="text-brand-ink/60 mt-2">Upload or paste your {isDpp ? "questions" : "test sheet"}. AI converts it into clean MCQs {isDpp ? "for practice" : "live for the window you set"}.</p>

      <div className="mt-8 space-y-5 rounded-3xl bg-white border-2 border-brand-ink p-6 sm:p-8">
        <div>
          <Label className="font-600">Title</Label>
          <Input data-testid="quiz-title" className="rounded-xl mt-1.5" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={isDpp ? "e.g. Motion — DPP 1" : "e.g. Weekly Test — Chemical Reactions"} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="font-600">Class</Label>
            <Select value={f.class_level} onValueChange={(v) => setF({ ...f, class_level: v, subject: "", chapter: "" })}>
              <SelectTrigger data-testid="quiz-class" className="rounded-xl mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="9">Class 9</SelectItem><SelectItem value="10">Class 10</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-600">Subject</Label>
            <Select value={f.subject} onValueChange={(v) => setF({ ...f, subject: v, chapter: "" })}>
              <SelectTrigger data-testid="quiz-subject" className="rounded-xl mt-1.5"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-600">Chapter</Label>
            <Select value={f.chapter} onValueChange={(v) => setF({ ...f, chapter: v })}>
              <SelectTrigger data-testid="quiz-chapter" className="rounded-xl mt-1.5"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{chapters.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-600">Topic <span className="text-brand-ink/40 font-400">(optional)</span></Label>
            <Input data-testid="quiz-topic" className="rounded-xl mt-1.5" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="e.g. Newton's laws" />
          </div>
        </div>

        {!isDpp && (
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <Label className="font-600">Batch</Label>
              <Select value={f.batch_id} onValueChange={(v) => setF({ ...f, batch_id: v })}>
                <SelectTrigger data-testid="quiz-batch" className="rounded-xl mt-1.5"><SelectValue placeholder="Choose batch" /></SelectTrigger>
                <SelectContent>{batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-600">Duration (min)</Label>
              <Input data-testid="quiz-duration" type="number" min={1} className="rounded-xl mt-1.5" value={f.duration_minutes} onChange={(e) => setF({ ...f, duration_minutes: e.target.value })} />
            </div>
            <div>
              <Label className="font-600">Valid for (hours)</Label>
              <Input data-testid="quiz-validity" type="number" min={1} className="rounded-xl mt-1.5" value={f.valid_hours} onChange={(e) => setF({ ...f, valid_hours: e.target.value })} />
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label className="font-600">{isDpp ? "Questions / topics" : "Test sheet"}</Label>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" hidden onChange={onFile} />
            <Button data-testid="quiz-upload-btn" type="button" variant="outline" size="sm" className="rounded-full border-2 border-brand-ink/15 font-600" onClick={() => fileRef.current.click()} disabled={extracting}>
              {extracting ? <><FileText className="h-4 w-4 mr-1 animate-pulse" /> Reading…</> : <><Upload className="h-4 w-4 mr-1" /> Upload file</>}
            </Button>
          </div>
          <Textarea data-testid="quiz-text" rows={9} className="rounded-xl" value={f.raw_text} onChange={(e) => setF({ ...f, raw_text: e.target.value })} placeholder="Paste MCQs, questions, or just the topics to test on…" />
        </div>

        <Button data-testid="generate-quiz-btn" onClick={submit} disabled={busy} className="w-full rounded-full bg-brand-blue text-brand-ink border-2 border-brand-ink font-700 h-12">
          {busy ? <><Sparkles className="h-5 w-5 mr-2 animate-spin" /> Building MCQs…</> : <><Sparkles className="h-5 w-5 mr-2" /> {isDpp ? "Publish DPP" : "Create & activate test"}</>}
        </Button>
      </div>
    </div>
  );
}
