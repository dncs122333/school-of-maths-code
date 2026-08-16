import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, mediaUrl } from "../lib/api";
import { Button } from "../components/ui/button";
import { ArrowLeft, Lightbulb, Sparkles, ListChecks } from "lucide-react";
import { motion } from "framer-motion";

export default function NoteReader() {
  const { id } = useParams();
  const [note, setNote] = useState(null);
  useEffect(() => { api.get(`/notes/${id}`).then((r) => setNote(r.data)); }, [id]);

  if (!note) return <div className="py-20 text-center text-brand-ink/50">Loading notes…</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <Button data-testid="back-btn" asChild variant="ghost" className="rounded-full mb-4 -ml-2">
        <Link to="/notes"><ArrowLeft className="h-4 w-4 mr-1" /> Back to library</Link>
      </Button>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[11px] font-700 uppercase tracking-wide px-2.5 py-1 rounded-full border-2 border-brand-ink bg-brand-blue">{note.subject}</span>
        <span className="text-[11px] font-700 uppercase tracking-wide px-2.5 py-1 rounded-full bg-muted">Class {note.class_level}</span>
        <span className="text-[11px] font-600 px-2.5 py-1 rounded-full bg-muted text-brand-ink/60">{note.chapter}</span>
      </div>
      <h1 className="font-head text-3xl sm:text-4xl font-700 tracking-tight leading-tight">{note.title}</h1>
      <p className="mt-3 text-lg text-brand-ink/70 leading-relaxed">{note.intro}</p>

      <div className="mt-10 space-y-10">
        {note.sections?.map((s, i) => (
          <motion.section key={i} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
            <div className="flex items-center gap-3 mb-3">
              <span className="h-8 w-8 rounded-xl bg-brand-purple border-2 border-brand-ink flex items-center justify-center font-head font-700 text-sm">{i + 1}</span>
              <h2 className="font-head text-2xl font-600 tracking-tight">{s.heading}</h2>
            </div>
            {s.image_path && (
              <img src={mediaUrl(s.image_path)} alt={s.heading} className="rounded-2xl border-2 border-brand-ink w-full max-h-80 object-contain bg-white my-4" />
            )}
            <p className="note-content text-brand-ink/85 text-[17px]">{s.content}</p>
            {s.key_points?.length > 0 && (
              <div className="mt-4 rounded-2xl bg-brand-cream border-2 border-brand-ink p-5">
                <div className="flex items-center gap-2 font-600 mb-2"><ListChecks className="h-4 w-4" /> Key points</div>
                <ul className="space-y-1.5">
                  {s.key_points.map((k, j) => (
                    <li key={j} className="flex gap-2 text-brand-ink/80"><span className="text-brand-purple font-700">•</span>{k}</li>
                  ))}
                </ul>
              </div>
            )}
          </motion.section>
        ))}
      </div>

      {note.mnemonics?.length > 0 && (
        <div className="mt-10 rounded-3xl bg-brand-yellow border-2 border-brand-ink p-6">
          <div className="flex items-center gap-2 font-head text-xl font-600 mb-3"><Lightbulb className="h-5 w-5" /> Memory tricks</div>
          <ul className="space-y-2">{note.mnemonics.map((m, i) => <li key={i} className="text-brand-ink/85">💡 {m}</li>)}</ul>
        </div>
      )}

      {note.quick_revision?.length > 0 && (
        <div className="mt-6 rounded-3xl bg-brand-mint border-2 border-brand-ink p-6">
          <div className="flex items-center gap-2 font-head text-xl font-600 mb-3"><Sparkles className="h-5 w-5" /> Quick revision</div>
          <ul className="space-y-2">{note.quick_revision.map((m, i) => <li key={i} className="flex gap-2 text-brand-ink/85"><span className="font-700">{i + 1}.</span>{m}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
