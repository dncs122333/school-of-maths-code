import React, { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { api, mediaUrl } from "../lib/api";
import { Button } from "../components/ui/button";
import { ArrowLeft, Lightbulb, Sparkles, ListChecks, Sigma, Orbit } from "lucide-react";
import { motion } from "framer-motion";

const STEPS = [
  "Reading your source material…",
  "Extracting every concept, formula & fact…",
  "Writing beautiful, accurate notes…",
  "Painting concept illustrations…",
  "Double-checking nothing was missed…",
];

export default function NoteReader() {
  const { id } = useParams();
  const [note, setNote] = useState(null);
  const [step, setStep] = useState(0);
  const timer = useRef();

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const r = await api.get(`/notes/${id}`);
        setNote(r.data);
        if (r.data.status === "processing" && !stop) timer.current = setTimeout(poll, 3000);
      } catch (e) { if (!stop) timer.current = setTimeout(poll, 3000); }
    };
    poll();
    const si = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 3500);
    return () => { stop = true; clearTimeout(timer.current); clearInterval(si); };
  }, [id]);

  if (!note) return <div className="py-20 text-center text-[#94A3B8]">Loading notes…</div>;

  if (note.status === "processing") {
    return (
      <div className="max-w-xl mx-auto py-16 text-center">
        <div className="relative h-32 w-32 mx-auto">
          <div className="absolute inset-0 rounded-full border border-dashed border-white/15 animate-spin-slow" />
          <div className="absolute inset-3 rounded-full border-2 border-[#3B82F6] border-t-transparent animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center"><Orbit className="h-10 w-10 text-[#06B6D4]" /></div>
        </div>
        <h1 className="font-head text-2xl font-700 text-white mt-8">Crafting your beautiful notes</h1>
        <p className="text-[#94A3B8] mt-2">Our multi-pass accuracy engine is working — this can take a minute or two. You can leave and come back; it'll be ready.</p>
        <motion.p key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-6 font-mono text-sm text-[#06B6D4]">{STEPS[step]}</motion.p>
        <Button asChild variant="ghost" className="rounded-full mt-8 text-[#94A3B8] hover:text-white hover:bg-white/5"><Link to="/notes"><ArrowLeft className="h-4 w-4 mr-1" /> Back to library</Link></Button>
      </div>
    );
  }

  if (note.status === "failed") {
    return (
      <div className="max-w-xl mx-auto py-16 text-center">
        <h1 className="font-head text-2xl font-700 text-white">Generation didn't complete</h1>
        <p className="text-[#94A3B8] mt-2">Something went wrong while generating these notes. Please try creating them again.</p>
        <Button asChild className="rounded-full mt-6 bg-[#3B82F6] text-white"><Link to="/notes/new">Try again</Link></Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Button data-testid="back-btn" asChild variant="ghost" className="rounded-full mb-4 -ml-2 text-[#94A3B8] hover:text-white hover:bg-white/5">
        <Link to="/notes"><ArrowLeft className="h-4 w-4 mr-1" /> Back to library</Link>
      </Button>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[11px] font-600 uppercase tracking-wide px-2.5 py-1 rounded-full border border-[#3B82F6]/40 bg-[#3B82F6]/10 text-[#3B82F6]">{note.subject}</span>
        <span className="text-[11px] font-600 uppercase tracking-wide px-2.5 py-1 rounded-full bg-[#0B0F19] border border-[#1E293B] font-mono">Class {note.class_level}</span>
        <span className="text-[11px] font-500 px-2.5 py-1 rounded-full bg-[#0B0F19] border border-[#1E293B] text-[#94A3B8]">{note.chapter}</span>
      </div>
      <h1 className="font-head text-3xl sm:text-4xl font-700 tracking-tight leading-tight text-white">{note.title}</h1>
      <p className="mt-3 text-lg text-[#94A3B8] leading-relaxed">{note.intro}</p>

      <div className="mt-10 space-y-8">
        {note.sections?.map((s, i) => (
          <motion.section key={i} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}
            className="rounded-3xl bg-[#172033] border border-[#1E293B] p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-3">
              <span className="h-8 w-8 rounded-xl bg-[#3B82F6]/15 border border-[#3B82F6]/40 flex items-center justify-center font-head font-700 text-sm text-[#3B82F6]">{i + 1}</span>
              <h2 className="font-head text-2xl font-600 tracking-tight text-white">{s.heading}</h2>
            </div>
            {s.image_path && (
              <img src={mediaUrl(s.image_path)} alt={s.heading} className="rounded-2xl border border-[#1E293B] w-full max-h-80 object-contain bg-white my-4" />
            )}
            <p className="note-content text-[17px]">{s.content}</p>
            {s.formulas?.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {s.formulas.map((fm, j) => (
                  <div key={j} className="flex items-center gap-2 font-mono text-[#06B6D4] bg-[#0B0F19] border border-[#1E293B] rounded-xl px-4 py-2.5 text-sm">
                    <Sigma className="h-4 w-4 shrink-0" /> {fm}
                  </div>
                ))}
              </div>
            )}
            {s.key_points?.length > 0 && (
              <div className="mt-4 rounded-2xl bg-[#0B0F19] border border-[#1E293B] p-5">
                <div className="flex items-center gap-2 font-600 mb-2 text-[#06B6D4]"><ListChecks className="h-4 w-4" /> Key points</div>
                <ul className="space-y-1.5">
                  {s.key_points.map((k, j) => (
                    <li key={j} className="flex gap-2 text-[#D1D5DB]"><span className="text-[#06B6D4] font-700">•</span>{k}</li>
                  ))}
                </ul>
              </div>
            )}
          </motion.section>
        ))}
      </div>

      {note.mnemonics?.length > 0 && (
        <div className="mt-8 rounded-3xl bg-[#FBBF24]/10 border border-[#FBBF24]/30 p-6">
          <div className="flex items-center gap-2 font-head text-xl font-600 mb-3 text-[#FBBF24]"><Lightbulb className="h-5 w-5" /> Memory tricks</div>
          <ul className="space-y-2">{note.mnemonics.map((m, i) => <li key={i} className="text-[#F8FAFC]/90">✦ {m}</li>)}</ul>
        </div>
      )}

      {note.quick_revision?.length > 0 && (
        <div className="mt-6 rounded-3xl bg-[#06B6D4]/10 border border-[#06B6D4]/30 p-6">
          <div className="flex items-center gap-2 font-head text-xl font-600 mb-3 text-[#06B6D4]"><Sparkles className="h-5 w-5" /> Quick revision</div>
          <ul className="space-y-2">{note.quick_revision.map((m, i) => <li key={i} className="flex gap-2 text-[#F8FAFC]/90"><span className="font-700 font-mono text-[#06B6D4]">{i + 1}.</span>{m}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
