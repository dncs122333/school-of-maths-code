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

export default function CreateNote() {
  const nav = useNavigate();
  const [catalog, setCatalog] = useState({});
  const [f, setF] = useState({ title: "", class_level: "9", subject: "", chapter: "", topic: "", raw_text: "" });
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const fileRef = useRef();

  useEffect(() => { api.get("/catalog").then((r) => setCatalog(r.data)); }, []);
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
      if (r.data.text?.trim()) { setF((p) => ({ ...p, raw_text: (p.raw_text + "\n" + r.data.text).trim() })); toast.success("Text extracted from file"); }
      else toast.error("Couldn't read text — try pasting it instead");
    } catch (e) { toast.error("Extraction failed"); } finally { setExtracting(false); }
  };

  const submit = async () => {
    if (!f.title || !f.subject || !f.chapter || !f.raw_text.trim()) { toast.error("Fill title, subject, chapter and notes"); return; }
    setBusy(true);
    try {
      const r = await api.post("/notes", f);
      toast.success("Beautiful notes created!");
      nav(`/notes/${r.data.id}`);
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <span className="text-xs uppercase tracking-widest text-brand-purple font-700">Teacher studio</span>
      <h1 className="font-head text-3xl font-700 tracking-tight flex items-center gap-2">Create beautiful notes <Wand2 className="h-6 w-6 text-brand-purple" /></h1>
      <p className="text-brand-ink/60 mt-2">Upload or paste rough notes. Our AI restructures them into memorable notes with concept illustrations.</p>

      <div className="mt-8 space-y-5 rounded-3xl bg-white border-2 border-brand-ink p-6 sm:p-8">
        <div>
          <Label className="font-600">Title</Label>
          <Input data-testid="note-title" className="rounded-xl mt-1.5" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Chemical Reactions — Complete Notes" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="font-600">Class</Label>
            <Select value={f.class_level} onValueChange={(v) => setF({ ...f, class_level: v, subject: "", chapter: "" })}>
              <SelectTrigger data-testid="note-class" className="rounded-xl mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="9">Class 9</SelectItem><SelectItem value="10">Class 10</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-600">Subject</Label>
            <Select value={f.subject} onValueChange={(v) => setF({ ...f, subject: v, chapter: "" })}>
              <SelectTrigger data-testid="note-subject" className="rounded-xl mt-1.5"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-600">Chapter</Label>
            <Select value={f.chapter} onValueChange={(v) => setF({ ...f, chapter: v })}>
              <SelectTrigger data-testid="note-chapter" className="rounded-xl mt-1.5"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{chapters.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-600">Topic <span className="text-brand-ink/40 font-400">(optional)</span></Label>
            <Input data-testid="note-topic" className="rounded-xl mt-1.5" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="e.g. Redox reactions" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label className="font-600">Rough notes</Label>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" hidden onChange={onFile} />
            <Button data-testid="upload-file-btn" type="button" variant="outline" size="sm" className="rounded-full border-2 border-brand-ink/15 font-600" onClick={() => fileRef.current.click()} disabled={extracting}>
              {extracting ? <><FileText className="h-4 w-4 mr-1 animate-pulse" /> Reading…</> : <><Upload className="h-4 w-4 mr-1" /> Upload PDF/DOCX</>}
            </Button>
          </div>
          <Textarea data-testid="note-text" rows={10} className="rounded-xl" value={f.raw_text} onChange={(e) => setF({ ...f, raw_text: e.target.value })} placeholder="Paste your rough notes here, or upload a file…" />
        </div>

        <Button data-testid="generate-note-btn" onClick={submit} disabled={busy} className="w-full rounded-full bg-brand-blue text-brand-ink border-2 border-brand-ink font-700 h-12">
          {busy ? <><Sparkles className="h-5 w-5 mr-2 animate-spin" /> Crafting beautiful notes (this takes ~30s)…</> : <><Sparkles className="h-5 w-5 mr-2" /> Generate beautiful notes</>}
        </Button>
      </div>
    </div>
  );
}
