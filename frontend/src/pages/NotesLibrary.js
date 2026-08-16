import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { BookOpen, Plus, User } from "lucide-react";
import { motion } from "framer-motion";

const CHIP = ["bg-brand-blue", "bg-brand-purple", "bg-brand-mint", "bg-brand-yellow", "bg-brand-pink"];

export default function NotesLibrary() {
  const { user } = useAuth();
  const isTeacher = user.role === "teacher" || user.role === "admin";
  const [notes, setNotes] = useState([]);
  const [catalog, setCatalog] = useState({});
  const [cls, setCls] = useState("all");
  const [subject, setSubject] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get("/catalog").then((r) => setCatalog(r.data)); }, []);
  useEffect(() => {
    const p = {};
    if (cls !== "all") p.class_level = cls;
    if (subject !== "all") p.subject = subject;
    setLoading(true);
    api.get("/notes", { params: p }).then((r) => setNotes(r.data)).finally(() => setLoading(false));
  }, [cls, subject]);

  const subjects = cls !== "all" && catalog[cls] ? Object.keys(catalog[cls]) : ["Science", "Maths", "Social Science", "English", "Hindi"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs uppercase tracking-widest text-brand-purple font-700">Library</span>
          <h1 className="font-head text-3xl font-700 tracking-tight">Beautiful Notes</h1>
        </div>
        {isTeacher && (
          <Button data-testid="new-note-btn" asChild className="rounded-full bg-brand-blue text-brand-ink border-2 border-brand-ink font-700">
            <Link to="/notes/new"><Plus className="h-4 w-4 mr-1" /> New notes</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={cls} onValueChange={(v) => { setCls(v); setSubject("all"); }}>
          <SelectTrigger data-testid="filter-class" className="w-40 rounded-full border-2 border-brand-ink/15"><SelectValue placeholder="Class" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            <SelectItem value="9">Class 9</SelectItem>
            <SelectItem value="10">Class 10</SelectItem>
          </SelectContent>
        </Select>
        <Select value={subject} onValueChange={setSubject}>
          <SelectTrigger data-testid="filter-subject" className="w-48 rounded-full border-2 border-brand-ink/15"><SelectValue placeholder="Subject" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subjects</SelectItem>
            {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? <p className="text-brand-ink/50">Loading…</p> : notes.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-brand-ink/20 p-16 text-center">
          <BookOpen className="h-10 w-10 mx-auto text-brand-ink/30" />
          <p className="mt-3 text-brand-ink/50">No notes yet {isTeacher && "— create your first beautiful notes!"}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {notes.map((n, i) => (
            <motion.div key={n.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={`/notes/${n.id}`} data-testid={`note-card-${n.id}`} className="block rounded-3xl bg-white border-2 border-brand-ink p-6 hover:-translate-y-1 transition-transform h-full">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[11px] font-700 uppercase tracking-wide px-2.5 py-1 rounded-full border-2 border-brand-ink ${CHIP[i % CHIP.length]}`}>{n.subject}</span>
                  <span className="text-[11px] text-brand-ink/50 font-600">Class {n.class_level}</span>
                </div>
                <h3 className="font-head text-lg font-600 leading-snug">{n.title}</h3>
                <p className="text-sm text-brand-ink/60 mt-1 line-clamp-2">{n.intro}</p>
                <div className="mt-4 flex items-center gap-1.5 text-xs text-brand-ink/50 font-500">
                  <span className="px-2 py-0.5 rounded-full bg-muted">{n.chapter}</span>
                  {n.topic && <span className="px-2 py-0.5 rounded-full bg-muted">{n.topic}</span>}
                </div>
                <div className="mt-3 flex items-center gap-1 text-xs text-brand-ink/40"><User className="h-3 w-3" /> {n.teacher_name}</div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
