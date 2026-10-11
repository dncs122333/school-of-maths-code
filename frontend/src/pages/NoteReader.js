import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import AuthedImage from "../components/AuthedImage";
import WatermarkOverlay from "../components/WatermarkOverlay";
import { Button } from "../components/ui/button";
import { ArrowLeft, Lightbulb, BookMarked, ListChecks, Sigma, Tag, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";

export default function NoteReader() {
  const { id } = useParams();
  const { user } = useAuth();
  const [note, setNote] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get(`/notes/${id}`).then((r) => setNote(r.data)).catch(() => setErr("Could not load this note."));
  }, [id]);

  if (!note && !err) return <div className="py-20 text-center text-[#94A3B8]">Loading notes…</div>;
  if (err) return (
    <div className="max-w-xl mx-auto py-16 text-center">
      <h1 className="font-head text-2xl font-700 text-white">Note not found</h1>
      <p className="text-[#94A3B8] mt-2">{err}</p>
      <Button asChild className="rounded-full mt-6 bg-[#3B82F6] text-white"><Link to="/notes">Back to library</Link></Button>
    </div>
  );

  const ENABLE_WATERMARKING = process.env.REACT_APP_ENABLE_WATERMARKING === "true";

  return (
    <div className="max-w-3xl mx-auto relative overflow-hidden rounded-3xl p-1 sm:p-3">
      {/* Dynamic & Tiled Rotated Watermark */}
      {ENABLE_WATERMARKING && (
        <WatermarkOverlay studentName={user?.name} studentEmail={user?.email} />
      )}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <Button data-testid="back-btn" asChild variant="ghost" className="rounded-full -ml-2 text-[#1E293B] hover:text-[#1E293B] hover:bg-[#F5C842]/20 font-bold">
          <Link to="/notes"><ArrowLeft className="h-4 w-4 mr-1" /> Back to library</Link>
        </Button>
        <div className="flex items-center gap-1.5 text-xs text-[#1E293B] font-mono bg-white px-3 py-1 rounded-full border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]">
          <ShieldCheck className="h-3.5 w-3.5 text-[#2F8A5F]" />
          <span>Licensed Copy: <strong className="text-[#1E293B] font-medium">{user?.name || "Student"}</strong></span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[11px] font-head font-bold uppercase tracking-wide px-3 py-1 rounded-full border-2 border-[#1E293B] bg-[#F5C842] text-[#1E293B]">{note.subject}</span>
        <span className="text-[11px] font-head font-bold uppercase tracking-wide px-3 py-1 rounded-full bg-white border-2 border-[#1E293B] text-[#1E293B] font-mono">Class {note.class_level}</span>
        <span className="text-[11px] font-head font-bold px-3 py-1 rounded-full bg-[#FFF9E8] border-2 border-[#1E293B] text-[#1E293B]">{note.chapter}</span>
        {note.batch_name && (
          <span className="text-[11px] font-head font-bold px-3 py-1 rounded-full border-2 border-[#1E293B] bg-[#3E7CB1] text-white font-mono">
            Batch: {note.batch_name}
          </span>
        )}
      </div>
      <h1 className="font-head text-3xl sm:text-4xl font-black tracking-tight leading-tight text-[#1E293B]">{note.title}</h1>
      <p className="mt-3 text-lg text-[#64748B] leading-relaxed font-medium">{note.intro}</p>

      <div className="mt-8 space-y-8">
        {note.sections?.map((s, i) => (
          <motion.section key={i} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}
            className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-3">
              <span className="h-8 w-8 rounded-xl bg-[#F5C842] border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] flex items-center justify-center font-head font-black text-sm text-[#1E293B]">{i + 1}</span>
              <h2 className="font-head text-2xl font-extrabold tracking-tight text-[#1E293B]">{s.heading}</h2>
            </div>
            {s.image_path && (
              <AuthedImage path={s.image_path} alt={s.heading} className="rounded-2xl border-2 border-[#1E293B] w-full max-h-80 object-contain bg-[#FFF9E8] my-4" />
            )}
            <p className="note-content text-[17px] text-[#1E293B]">{s.content}</p>
            {s.formulas?.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {s.formulas.map((fm, j) => (
                  <div key={j} className="flex items-center gap-2 font-mono text-[#1E293B] font-bold bg-[#FFF9E8] border-2 border-[#1E293B] rounded-xl px-4 py-2.5 text-sm">
                    <Sigma className="h-4 w-4 shrink-0 text-[#3E7CB1]" /> {fm}
                  </div>
                ))}
              </div>
            )}
            {s.key_points?.length > 0 && (
              <div className="mt-4 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-5">
                <div className="flex items-center gap-2 font-head font-bold mb-2 text-[#1E293B]"><ListChecks className="h-4 w-4 text-[#2F8A5F]" /> Key points</div>
                <ul className="space-y-1.5">
                  {s.key_points.map((k, j) => (
                    <li key={j} className="flex gap-2 text-[#1E293B] font-medium"><span className="text-[#2F8A5F] font-bold">•</span>{k}</li>
                  ))}
                </ul>
              </div>
            )}
          </motion.section>
        ))}
      </div>

      {note.mnemonics?.length > 0 && (
        <div className="mt-8 rounded-3xl bg-[#F5C842] border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] p-6 text-[#1E293B]">
          <div className="flex items-center gap-2 font-head text-xl font-black mb-3 text-[#1E293B]"><Lightbulb className="h-5 w-5" /> Memory tricks</div>
          <ul className="space-y-2">{note.mnemonics.map((m, i) => <li key={i} className="text-[#1E293B] font-bold">✦ {m}</li>)}</ul>
        </div>
      )}

      {note.quick_revision?.length > 0 && (
        <div className="mt-6 rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] p-6">
          <div className="flex items-center gap-2 font-head text-xl font-bold mb-3 text-[#1E293B]"><BookMarked className="h-5 w-5 text-[#3E7CB1]" /> Quick revision</div>
          <ul className="space-y-2">{note.quick_revision.map((m, i) => <li key={i} className="flex gap-2 text-[#1E293B]"><span className="font-bold font-mono text-[#3E7CB1]">{i + 1}.</span>{m}</li>)}</ul>
        </div>
      )}

      {note.key_terms?.length > 0 && (
        <div className="mt-6 rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] p-6">
          <div className="flex items-center gap-2 font-head text-xl font-bold mb-3 text-[#1E293B]"><Tag className="h-5 w-5 text-[#F5C842]" /> Key Terms</div>
          <div className="flex flex-wrap gap-2">
            {note.key_terms.map((t, i) => (
              <span key={i} className="px-3 py-1 rounded-full bg-[#FFF9E8] border border-[#1E293B] text-[#1E293B] text-sm font-medium">{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
