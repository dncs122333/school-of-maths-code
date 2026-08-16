import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { BookOpen, Plus, User } from "lucide-react";
import { motion } from "framer-motion";

const CHIP = [
  "text-[#3B82F6] border-[#3B82F6]/40 bg-[#3B82F6]/10",
  "text-[#06B6D4] border-[#06B6D4]/40 bg-[#06B6D4]/10",
  "text-[#34D399] border-[#34D399]/40 bg-[#34D399]/10",
  "text-[#FBBF24] border-[#FBBF24]/40 bg-[#FBBF24]/10",
  "text-[#F472B6] border-[#F472B6]/40 bg-[#F472B6]/10",
];

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
          <span className="text-xs uppercase tracking-widest text-[#06B6D4] font-600">Library</span>
          <h1 className="font-head text-3xl font-700 tracking-tight text-white">Notes</h1>
        </div>
        {isTeacher && (
          <Button data-testid="new-note-btn" asChild className="rounded-full bg-[#3B82F6] text-white font-700 hover:bg-[#60A5FA]">
            <Link to="/notes/new"><Plus className="h-4 w-4 mr-1" /> New notes</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={cls} onValueChange={(v) => { setCls(v); setSubject("all"); }}>
          <SelectTrigger data-testid="filter-class" className="w-40 rounded-full border-[#1E293B] bg-[#111827]"><SelectValue placeholder="Class" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            <SelectItem value="9">Class 9</SelectItem>
            <SelectItem value="10">Class 10</SelectItem>
          </SelectContent>
        </Select>
        <Select value={subject} onValueChange={setSubject}>
          <SelectTrigger data-testid="filter-subject" className="w-48 rounded-full border-[#1E293B] bg-[#111827]"><SelectValue placeholder="Subject" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subjects</SelectItem>
            {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? <p className="text-[#94A3B8]">Loading…</p> : notes.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#1E293B] p-16 text-center">
          <BookOpen className="h-10 w-10 mx-auto text-[#94A3B8]/40" />
          <p className="mt-3 text-[#94A3B8]">No notes yet {isTeacher && "— create your first beautiful notes!"}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {notes.map((n, i) => (
            <motion.div key={n.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={`/notes/${n.id}`} data-testid={`note-card-${n.id}`} className="block rounded-3xl bg-[#111827] border border-[#1E293B] p-6 hover:border-[#3B82F6]/40 hover:-translate-y-0.5 transition-transform h-full">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[11px] font-600 uppercase tracking-wide px-2.5 py-1 rounded-full border ${CHIP[i % CHIP.length]}`}>{n.subject}</span>
                  <span className="text-[11px] text-[#94A3B8] font-600 font-mono">Class {n.class_level}</span>
                  {n.status === "processing" && <span className="ml-auto text-[10px] font-600 uppercase tracking-wide px-2 py-0.5 rounded-full border border-[#FBBF24]/40 bg-[#FBBF24]/10 text-[#FBBF24] animate-pulse">Generating</span>}
                  {n.status === "failed" && <span className="ml-auto text-[10px] font-600 uppercase tracking-wide px-2 py-0.5 rounded-full border border-[#F87171]/40 bg-[#F87171]/10 text-[#F87171]">Failed</span>}
                </div>
                <h3 className="font-head text-lg font-600 leading-snug text-white">{n.title}</h3>
                <p className="text-sm text-[#94A3B8] mt-1 line-clamp-2">{n.intro}</p>
                <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-[#94A3B8] font-500">
                  <span className="px-2 py-0.5 rounded-full bg-[#0B0F19] border border-[#1E293B]">{n.chapter}</span>
                  {n.topic && <span className="px-2 py-0.5 rounded-full bg-[#0B0F19] border border-[#1E293B]">{n.topic}</span>}
                </div>
                <div className="mt-3 flex items-center gap-1 text-xs text-[#94A3B8]/70"><User className="h-3 w-3" /> {n.teacher_name}</div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
