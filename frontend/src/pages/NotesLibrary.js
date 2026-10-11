import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { BookOpen, Plus, User, Pencil, Trash2, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const CHIP = [
  "text-[#1E293B] border-2 border-[#1E293B] bg-[#F5C842]",
  "text-white border-2 border-[#1E293B] bg-[#4CAF7D]",
  "text-white border-2 border-[#1E293B] bg-[#5B9BD5]",
  "text-white border-2 border-[#1E293B] bg-[#9B7EDE]",
  "text-white border-2 border-[#1E293B] bg-[#FF6B5E]",
];

const inp = "rounded-xl mt-1.5 bg-[#FFF9E8] border-2 border-[#1E293B] text-[#1E293B]";

export default function NotesLibrary() {
  const { user } = useAuth();
  const isTeacher = user.role === "teacher" || user.role === "admin";
  const [notes, setNotes] = useState([]);
  const [catalog, setCatalog] = useState({});
  const [batches, setBatches] = useState([]);
  const [cls, setCls] = useState("all");
  const [subject, setSubject] = useState("all");
  const [loading, setLoading] = useState(true);

  // Delete state
  const [deleting, setDeleting] = useState(null); // note id being deleted
  const [deleteConfirm, setDeleteConfirm] = useState(null); // note to confirm

  // Edit state
  const [editNote, setEditNote] = useState(null); // note being edited
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/catalog").then((r) => setCatalog(r.data)); }, []);
  useEffect(() => {
    if (isTeacher) api.get("/batches").then((r) => setBatches(r.data)).catch(() => {});
  }, [isTeacher]);

  const load = () => {
    const p = {};
    if (cls !== "all") p.class_level = cls;
    if (subject !== "all") p.subject = subject;
    setLoading(true);
    api.get("/notes", { params: p }).then((r) => setNotes(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [cls, subject]); // eslint-disable-line react-hooks/exhaustive-deps

  const subjects = cls !== "all" && catalog[cls] ? Object.keys(catalog[cls]) : ["Science", "Maths", "Social Science", "English", "Hindi"];

  /* ---- Delete ---- */
  const handleDelete = async (note) => {
    setDeleting(note.id);
    try {
      await api.delete(`/notes/${note.id}`);
      toast.success("Note deleted");
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Delete failed");
    } finally {
      setDeleting(null);
      setDeleteConfirm(null);
    }
  };

  /* ---- Edit ---- */
  const openEdit = (note) => {
    setEditNote(note);
    setEditForm({
      title: note.title,
      class_level: note.class_level,
      subject: note.subject,
      chapter: note.chapter,
      topic: note.topic || "",
      batch_id: note.batch_id || "",
    });
  };

  const saveEdit = async () => {
    if (!editNote) return;
    setSaving(true);
    try {
      const payload = { ...editForm };
      if (!payload.batch_id) payload.batch_id = null;
      const res = await api.patch(`/notes/${editNote.id}`, payload);
      toast.success("Note updated");
      setNotes((prev) => prev.map((n) => (n.id === editNote.id ? { ...n, ...res.data } : n)));
      setEditNote(null);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const editSubjects = editForm.class_level && catalog[editForm.class_level]
    ? Object.keys(catalog[editForm.class_level])
    : ["Science", "Maths", "Social Science", "English", "Hindi"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 sm:p-8 rounded-3xl bg-[#F5C842] border-[3px] border-[#1E293B] shadow-[5px_5px_0_#1E293B]">
        <div>
          <span className="text-xs uppercase tracking-widest text-[#1E293B] font-head font-extrabold px-3 py-1 bg-white rounded-full border-2 border-[#1E293B]">Concept Repository</span>
          <h1 className="font-head text-3xl sm:text-4xl font-900 tracking-tight text-[#1E293B] uppercase mt-2">AI Study Notes</h1>
        </div>
        {isTeacher && (
          <Button data-testid="new-note-btn" asChild className="rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold hover:bg-[#FFF9E8]">
            <Link to="/notes/new"><Plus className="h-4 w-4 mr-1" /> + New Note</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={cls} onValueChange={(v) => { setCls(v); setSubject("all"); }}>
          <SelectTrigger data-testid="filter-class" className="w-40 rounded-full border-2 border-[#1E293B] bg-white text-[#1E293B] font-head font-bold shadow-[2px_2px_0_#1E293B]"><SelectValue placeholder="Class" /></SelectTrigger>
          <SelectContent className="bg-white border-2 border-[#1E293B]">
            <SelectItem value="all">All classes</SelectItem>
            <SelectItem value="9">Class 9</SelectItem>
            <SelectItem value="10">Class 10</SelectItem>
          </SelectContent>
        </Select>
        <Select value={subject} onValueChange={setSubject}>
          <SelectTrigger data-testid="filter-subject" className="w-48 rounded-full border-2 border-[#1E293B] bg-white text-[#1E293B] font-head font-bold shadow-[2px_2px_0_#1E293B]"><SelectValue placeholder="Subject" /></SelectTrigger>
          <SelectContent className="bg-white border-2 border-[#1E293B]">
            <SelectItem value="all">All subjects</SelectItem>
            {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? <p className="text-[#64748B] font-bold">Loading notes…</p> : notes.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-[#1E293B] bg-white p-16 text-center shadow-[4px_4px_0_#1E293B]">
          <BookOpen className="h-10 w-10 mx-auto text-[#64748B]" />
          <p className="mt-3 text-[#1E293B] font-bold">No notes yet {isTeacher && "— create your first notes!"}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {notes.map((n, i) => (
            <motion.div key={n.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="relative group rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] hover:-translate-y-1 transition-all">

              {/* Teacher action buttons — top-right overlay on hover */}
              {isTeacher && (
                <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    data-testid={`edit-note-${n.id}`}
                    onClick={(e) => { e.preventDefault(); openEdit(n); }}
                    className="h-8 w-8 rounded-full bg-white hover:bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] flex items-center justify-center text-[#1E293B] transition-colors"
                    title="Edit note">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    data-testid={`delete-note-${n.id}`}
                    onClick={(e) => { e.preventDefault(); setDeleteConfirm(n); }}
                    disabled={deleting === n.id}
                    className="h-8 w-8 rounded-full bg-white hover:bg-[#FF6B5E]/20 border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] flex items-center justify-center text-[#FF6B5E] transition-colors disabled:opacity-50"
                    title="Delete note">
                    {deleting === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              )}

              <Link to={`/notes/${n.id}`} data-testid={`note-card-${n.id}`} className="block p-6 h-full">
                <div className="flex items-center gap-2 mb-3 flex-wrap pr-16">
                  <span className={`text-[11px] font-head font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full border-2 ${CHIP[i % CHIP.length]}`}>{n.subject}</span>
                  <span className="text-[11px] text-[#64748B] font-bold font-mono">Class {n.class_level}</span>
                  {n.batch_name && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#FFF9E8] border-2 border-[#1E293B] text-[#1E293B] font-bold">
                      {n.batch_name}
                    </span>
                  )}
                  {n.status === "processing" && <span className="ml-auto text-[10px] font-head font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border-2 border-[#1E293B] bg-[#F5C842] text-[#1E293B] animate-pulse">Generating</span>}
                  {n.status === "failed" && <span className="ml-auto text-[10px] font-head font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border-2 border-[#1E293B] bg-[#FF6B5E] text-white">Failed</span>}
                </div>
                <h3 className="font-head text-lg font-900 leading-snug text-[#1E293B]">{n.title}</h3>
                <p className="text-sm text-[#64748B] mt-1 line-clamp-2">{n.intro}</p>
                <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-[#1E293B] font-bold">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#FFF9E8] border-2 border-[#1E293B]">{n.chapter}</span>
                  {n.topic && <span className="px-2.5 py-0.5 rounded-full bg-[#FFF9E8] border-2 border-[#1E293B]">{n.topic}</span>}
                </div>
                <div className="mt-3 flex items-center gap-1 text-xs text-[#64748B] font-medium"><User className="h-3 w-3" /> {n.teacher_name}</div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* ---- Delete confirmation dialog ---- */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent className="bg-white border-[3px] border-[#1E293B] max-w-md rounded-3xl p-6 shadow-[6px_6px_0_#1E293B] text-[#1E293B]">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B] font-head text-xl font-900">Delete note?</DialogTitle>
          </DialogHeader>
          <p className="text-[#64748B] text-sm leading-relaxed">
            <span className="font-bold text-[#1E293B]">"{deleteConfirm?.title}"</span> will be permanently removed and students will lose access immediately.
          </p>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" className="rounded-full border-2 border-[#1E293B] text-[#1E293B]"
              onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              className="rounded-full bg-[#FF6B5E] hover:bg-[#EE594B] text-white border-2 border-[#1E293B] font-head font-bold"
              disabled={!!deleting}
              onClick={() => handleDelete(deleteConfirm)}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Edit dialog ---- */}
      <Dialog open={!!editNote} onOpenChange={(o) => { if (!o) setEditNote(null); }}>
        <DialogContent className="bg-white border-[3px] border-[#1E293B] max-w-lg rounded-3xl p-6 shadow-[6px_6px_0_#1E293B] text-[#1E293B]">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B] font-head text-xl font-900">Edit note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="font-600 text-[#94A3B8]">Title</Label>
              <Input className={inp} value={editForm.title || ""} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="font-600 text-[#94A3B8]">Class</Label>
                <Select value={editForm.class_level} onValueChange={(v) => setEditForm({ ...editForm, class_level: v, subject: "" })}>
                  <SelectTrigger className={inp}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9">Class 9</SelectItem>
                    <SelectItem value="10">Class 10</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="font-600 text-[#94A3B8]">Subject</Label>
                <Select value={editForm.subject} onValueChange={(v) => setEditForm({ ...editForm, subject: v })}>
                  <SelectTrigger className={inp}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{editSubjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="font-600 text-[#94A3B8]">Chapter</Label>
                <Input className={inp} value={editForm.chapter || ""} onChange={(e) => setEditForm({ ...editForm, chapter: e.target.value })} />
              </div>
              <div>
                <Label className="font-600 text-[#94A3B8]">Topic <span className="text-[#94A3B8]/50 font-400">(optional)</span></Label>
                <Input className={inp} value={editForm.topic || ""} onChange={(e) => setEditForm({ ...editForm, topic: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="font-600 text-[#94A3B8]">Batch <span className="text-[#94A3B8]/50 font-400">(optional)</span></Label>
              <Select value={editForm.batch_id || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, batch_id: v === "__none__" ? "" : v })}>
                <SelectTrigger className={inp}><SelectValue placeholder="All students" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">All students (no batch)</SelectItem>
                  {batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-full border-[#1E293B] text-[#94A3B8]"
              onClick={() => setEditNote(null)}>Cancel</Button>
            <Button className="rounded-full bg-[#3B82F6] hover:bg-[#60A5FA] text-white font-700"
              disabled={saving} onClick={saveEdit}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
