import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { PlusCircle, Trash2, BookOpen, ArrowLeft, GripVertical, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const inp = "rounded-xl mt-1.5 bg-[#0B0F19] border-[#1E293B] text-white placeholder:text-[#475569]";
const EMPTY_SECTION = () => ({ heading: "", content: "" });

export default function CreateNote() {
  const nav = useNavigate();
  const [catalog, setCatalog] = useState({});
  const [batches, setBatches] = useState([]);
  const [busy, setBusy] = useState(false);

  // metadata
  const [meta, setMeta] = useState({
    title: "", class_level: "9", subject: "", chapter: "", topic: "", batch_id: "",
    intro: "",
  });

  // sections — array of { heading, content }
  const [sections, setSections] = useState([EMPTY_SECTION()]);
  // quick revision bullets
  const [qr, setQr] = useState([""]);
  // key terms
  const [kt, setKt] = useState([""]);

  useEffect(() => {
    api.get("/catalog").then((r) => setCatalog(r.data)).catch(() => {});
    api.get("/batches").then((r) => setBatches(r.data || [])).catch(() => {});
  }, []);

  const subjects = catalog[meta.class_level] ? Object.keys(catalog[meta.class_level]) : [];
  const chapters = catalog[meta.class_level]?.[meta.subject] || [];

  // ---- section helpers ----
  const addSection = () => setSections((s) => [...s, EMPTY_SECTION()]);
  const removeSection = (i) => setSections((s) => s.filter((_, idx) => idx !== i));
  const updateSection = (i, field, val) =>
    setSections((s) => s.map((sec, idx) => (idx === i ? { ...sec, [field]: val } : sec)));

  // ---- list helpers (quick_revision / key_terms) ----
  const listAdder = (setter) => () => setter((l) => [...l, ""]);
  const listUpdater = (setter) => (i, val) => setter((l) => l.map((x, idx) => (idx === i ? val : x)));
  const listRemover = (setter) => (i) => setter((l) => l.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!meta.title.trim()) { toast.error("Please add a title"); return; }
    if (!meta.subject) { toast.error("Select a subject"); return; }
    if (!meta.chapter) { toast.error("Select a chapter"); return; }
    const validSections = sections.filter((s) => s.heading.trim() && s.content.trim());
    if (!validSections.length) { toast.error("Add at least one section with a heading and content"); return; }

    setBusy(true);
    try {
      const payload = {
        ...meta,
        batch_id: meta.batch_id || null,
        sections: validSections,
        quick_revision: qr.filter((x) => x.trim()),
        key_terms: kt.filter((x) => x.trim()),
      };
      const r = await api.post("/notes", payload);
      toast.success("Note published!");
      nav(`/notes/${r.data.id}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to save note");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto pb-20">
      <button onClick={() => nav("/notes")} className="flex items-center gap-1 text-sm text-[#94A3B8] hover:text-white mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to library
      </button>

      <span className="text-xs uppercase tracking-widest text-[#06B6D4] font-600">Teacher Studio</span>
      <h1 className="font-head text-3xl font-700 tracking-tight flex items-center gap-2 text-white mt-1">
        Create Class Notes <BookOpen className="h-6 w-6 text-[#06B6D4]" />
      </h1>
      <p className="text-[#94A3B8] mt-2">
        Write structured notes for your students — add sections, quick revision bullets, and key terms.
        Notes are published instantly.
      </p>

      {/* ── Metadata ── */}
      <div className="mt-6 space-y-5 rounded-3xl bg-[#111827] border border-[#1E293B] p-6 sm:p-8">
        <h2 className="text-sm font-700 uppercase tracking-widest text-[#94A3B8]">Details</h2>

        <div>
          <Label className="font-600 text-[#94A3B8]">Title</Label>
          <Input data-testid="note-title" className={inp} value={meta.title}
            onChange={(e) => setMeta({ ...meta, title: e.target.value })}
            placeholder="e.g. Chemical Reactions — Complete Notes" />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="font-600 text-[#94A3B8]">Class</Label>
            <Select value={meta.class_level}
              onValueChange={(v) => setMeta({ ...meta, class_level: v, subject: "", chapter: "" })}>
              <SelectTrigger data-testid="note-class" className={inp}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="9">Class 9</SelectItem>
                <SelectItem value="10">Class 10</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-600 text-[#94A3B8]">Subject</Label>
            <Select value={meta.subject} onValueChange={(v) => setMeta({ ...meta, subject: v, chapter: "" })}>
              <SelectTrigger data-testid="note-subject" className={inp}><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-600 text-[#94A3B8]">Chapter</Label>
            <Select value={meta.chapter} onValueChange={(v) => setMeta({ ...meta, chapter: v })}>
              <SelectTrigger data-testid="note-chapter" className={inp}><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{chapters.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-600 text-[#94A3B8]">Topic <span className="text-[#94A3B8]/50 font-400">(optional)</span></Label>
            <Input data-testid="note-topic" className={inp} value={meta.topic}
              onChange={(e) => setMeta({ ...meta, topic: e.target.value })}
              placeholder="e.g. Redox reactions" />
          </div>
          <div className="sm:col-span-2">
            <Label className="font-600 text-[#94A3B8]">Batch Access</Label>
            <Select value={meta.batch_id || "all"} onValueChange={(v) => setMeta({ ...meta, batch_id: v === "all" ? "" : v })}>
              <SelectTrigger data-testid="note-batch" className={inp}>
                <SelectValue placeholder="All Batches (General)" />
              </SelectTrigger>
              <SelectContent className="bg-[#111827] border-[#1E293B] text-white">
                <SelectItem value="all">All Batches (General Notes)</SelectItem>
                {batches
                  .filter((b) => String(b.class_level) === String(meta.class_level))
                  .map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} (Class {b.class_level})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-[#34D399]">
              <ShieldCheck className="h-3.5 w-3.5" />
              {meta.batch_id ? "Only students in the selected batch can read this note." : "Visible to all your students."}
            </div>
          </div>
        </div>

        <div>
          <Label className="font-600 text-[#94A3B8]">Introduction <span className="text-[#94A3B8]/50 font-400">(optional)</span></Label>
          <Textarea className={inp + " mt-1.5"} rows={3} value={meta.intro}
            onChange={(e) => setMeta({ ...meta, intro: e.target.value })}
            placeholder="Brief introduction or overview for this chapter…" />
        </div>
      </div>

      {/* ── Sections ── */}
      <div className="mt-4 rounded-3xl bg-[#111827] border border-[#1E293B] p-6 sm:p-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-700 uppercase tracking-widest text-[#94A3B8]">Sections</h2>
          <Button type="button" variant="outline" size="sm"
            className="rounded-full border-[#1E293B] bg-transparent text-white hover:bg-white/5 font-600"
            onClick={addSection}>
            <PlusCircle className="h-4 w-4 mr-1" /> Add Section
          </Button>
        </div>

        <div className="space-y-4">
          {sections.map((sec, i) => (
            <div key={i} className="group rounded-2xl bg-[#0B0F19] border border-[#1E293B] p-4 space-y-3 relative">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-[#334155] shrink-0" />
                <Input
                  placeholder={`Section ${i + 1} heading — e.g. "What is a chemical reaction?"`}
                  className="flex-1 rounded-lg bg-[#111827] border-[#1E293B] text-white placeholder:text-[#475569]"
                  value={sec.heading}
                  onChange={(e) => updateSection(i, "heading", e.target.value)}
                />
                {sections.length > 1 && (
                  <button onClick={() => removeSection(i)} className="text-[#475569] hover:text-red-400 transition-colors p-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Textarea
                placeholder="Write the section content here. You can use plain text — lists, formulas, explanations…"
                rows={5}
                className="rounded-lg bg-[#111827] border-[#1E293B] text-white placeholder:text-[#475569] font-mono text-sm"
                value={sec.content}
                onChange={(e) => updateSection(i, "content", e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick Revision ── */}
      <div className="mt-4 rounded-3xl bg-[#111827] border border-[#1E293B] p-6 sm:p-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-700 uppercase tracking-widest text-[#94A3B8]">Quick Revision Points</h2>
            <p className="text-xs text-[#475569] mt-0.5">Bullet points students should memorise</p>
          </div>
          <Button type="button" variant="outline" size="sm"
            className="rounded-full border-[#1E293B] bg-transparent text-white hover:bg-white/5 font-600"
            onClick={listAdder(setQr)}>
            <PlusCircle className="h-4 w-4 mr-1" /> Add Point
          </Button>
        </div>
        <div className="space-y-2">
          {qr.map((point, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[#06B6D4] font-700 text-sm w-4 shrink-0">•</span>
              <Input className="flex-1 rounded-lg bg-[#0B0F19] border-[#1E293B] text-white placeholder:text-[#475569]"
                placeholder={`Revision point ${i + 1}`} value={point}
                onChange={(e) => listUpdater(setQr)(i, e.target.value)} />
              {qr.length > 1 && (
                <button onClick={() => listRemover(setQr)(i)} className="text-[#475569] hover:text-red-400 transition-colors p-1">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Key Terms ── */}
      <div className="mt-4 rounded-3xl bg-[#111827] border border-[#1E293B] p-6 sm:p-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-700 uppercase tracking-widest text-[#94A3B8]">Key Terms</h2>
            <p className="text-xs text-[#475569] mt-0.5">Important vocabulary from this chapter</p>
          </div>
          <Button type="button" variant="outline" size="sm"
            className="rounded-full border-[#1E293B] bg-transparent text-white hover:bg-white/5 font-600"
            onClick={listAdder(setKt)}>
            <PlusCircle className="h-4 w-4 mr-1" /> Add Term
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {kt.map((term, i) => (
            <div key={i} className="flex items-center gap-1 bg-[#0B0F19] border border-[#1E293B] rounded-full px-3 py-1">
              <Input className="bg-transparent border-none text-white text-sm p-0 h-auto w-28 placeholder:text-[#475569] focus-visible:ring-0"
                placeholder="Term…" value={term}
                onChange={(e) => listUpdater(setKt)(i, e.target.value)} />
              {kt.length > 1 && (
                <button onClick={() => listRemover(setKt)(i)} className="text-[#475569] hover:text-red-400 transition-colors ml-1">
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Submit ── */}
      <div className="mt-6">
        <Button data-testid="generate-note-btn" onClick={submit} disabled={busy}
          className="w-full rounded-full bg-[#3B82F6] text-white font-700 h-12 hover:bg-[#60A5FA] glow-blue">
          {busy ? "Publishing…" : "Publish Note"}
        </Button>
      </div>
    </div>
  );
}
