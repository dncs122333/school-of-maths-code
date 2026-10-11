import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import {
  Plus, FileQuestion, Sparkles, Clock, CheckCircle2, Lock,
  PlayCircle, Trophy, ChevronDown, Folder, Pencil, Trash2, Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

function timeLeft(iso) {
  const diff = new Date(iso) - new Date();
  if (diff <= 0) return "expired";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

function Leaderboard({ testId }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const toggle = () => {
    if (!open && rows === null) {
      api.get(`/tests/${testId}/leaderboard`).then((r) => setRows(r.data)).catch(() => setRows([]));
    }
    setOpen(!open);
  };
  return (
    <div className="mt-3">
      <button data-testid={`leaderboard-${testId}`} onClick={toggle}
        className="w-full flex items-center justify-center gap-1 text-xs font-head font-bold text-[#1E293B] hover:text-[#5B9BD5] py-1 transition-colors">
        <Trophy className="h-3.5 w-3.5 text-[#F5C842]" /> Leaderboard
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-3 shadow-[2px_2px_0_#1E293B]">
          {rows === null ? <div className="text-xs text-[#64748B] font-bold">Loading…</div>
            : rows.length === 0 ? <div className="text-xs text-[#64748B]">No submissions yet.</div>
            : rows.slice(0, 5).map((r, i) => (
                <div key={i} className="flex items-center justify-between py-1 text-xs">
                  <span className="text-[#1E293B] font-medium truncate">{i + 1}. {r.student_name}</span>
                  <span className="font-head font-bold text-[#1E293B]">{r.score}% <span className="text-[#64748B] font-normal">({r.correct}/{r.total})</span></span>
                </div>
              ))}
        </div>
      )}
    </div>
  );
}

function TestCard({ t, isTeacher, isDpp, i, onEdit, onDelete, deleting }) {
  const active = isTeacher ? true : t.is_active;
  const done = t.submitted;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
      className="relative group rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-6 flex flex-col justify-between shadow-[4px_4px_0_#1E293B] hover:-translate-y-1 transition-all">

      <div>
        {/* Teacher action buttons */}
        {isTeacher && (
          <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <button
              data-testid={`edit-test-${t.id}`}
              onClick={() => onEdit(t)}
              className="h-8 w-8 rounded-full bg-white hover:bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] flex items-center justify-center text-[#1E293B] transition-colors"
              title="Edit test">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              data-testid={`delete-test-${t.id}`}
              onClick={() => onDelete(t)}
              disabled={deleting === t.id}
              className="h-8 w-8 rounded-full bg-white hover:bg-[#FF6B5E]/20 border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] flex items-center justify-center text-[#FF6B5E] transition-colors disabled:opacity-50"
              title="Delete test">
              {deleting === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-3 pr-16">
          <span className="text-[11px] font-head font-bold uppercase tracking-wide px-3 py-0.5 rounded-full border-2 border-[#1E293B] bg-[#FFF9E8] text-[#1E293B]">{t.subject}</span>
          {!isTeacher && (done
            ? <span className="flex items-center gap-1 text-xs font-head font-bold text-[#4CAF7D]"><CheckCircle2 className="h-4 w-4" /> {t.score}%</span>
            : active ? <span className="flex items-center gap-1 text-xs font-head font-bold text-[#5B9BD5]"><PlayCircle className="h-4 w-4" /> Live</span>
            : <span className="flex items-center gap-1 text-xs font-head font-bold text-[#64748B]"><Lock className="h-3.5 w-3.5" /> Closed</span>)}
        </div>
        <h3 className="font-head text-lg font-900 leading-snug text-[#1E293B]">{t.title}</h3>
        <div className="text-xs text-[#64748B] mt-1 font-bold">Class {t.class_level} • {t.chapter}{t.topic ? ` • ${t.topic}` : ""}</div>
        <div className="mt-4 flex items-center gap-3 text-xs text-[#1E293B] font-mono font-bold">
          <span className="flex items-center gap-1"><FileQuestion className="h-3.5 w-3.5 text-[#5B9BD5]" /> {t.question_count} Qs</span>
          {!isDpp && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-[#F5C842]" /> {t.duration_minutes} min</span>}
        </div>
        {!isTeacher && !isDpp && active && !done && (
          <div className="text-xs text-[#5B9BD5] font-bold mt-2 font-mono">{timeLeft(t.valid_until)}</div>
        )}
      </div>

      <div className="mt-5">
        {isTeacher ? (
          t.status === "processing" ? (
            <Button disabled className="w-full rounded-full font-head font-bold bg-[#FFF9E8] text-[#64748B] border-2 border-[#1E293B]">Building…</Button>
          ) : t.status === "failed" ? (
            <Button disabled className="w-full rounded-full font-head font-bold bg-[#FFF9E8] text-[#FF6B5E] border-2 border-[#1E293B]">Failed</Button>
          ) : (
            <Button data-testid={`view-quiz-${t.id}`} asChild variant="outline" className="w-full rounded-full border-2 border-[#1E293B] bg-white text-[#1E293B] hover:bg-[#FFF9E8] font-head font-bold shadow-[2px_2px_0_#1E293B]">
              <Link to={`/quiz/${t.id}`}>Preview Test</Link>
            </Button>
          )
        ) : done ? (
          <Button disabled className="w-full rounded-full font-head font-bold bg-[#FFF9E8] text-[#64748B] border-2 border-[#1E293B]">Completed</Button>
        ) : active ? (
          <Button data-testid={`start-quiz-${t.id}`} asChild className="w-full rounded-full bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold">
            <Link to={`/quiz/${t.id}`}>{isDpp ? "Practice Sprint" : "Start Test"}</Link>
          </Button>
        ) : (
          <Button disabled className="w-full rounded-full font-head font-bold bg-[#FFF9E8] text-[#64748B] border-2 border-[#1E293B]">Not Active</Button>
        )}
      </div>
      {!isDpp && <Leaderboard testId={t.id} />}
    </motion.div>
  );
}

const inp = "rounded-xl mt-1.5 bg-[#FFF9E8] border-2 border-[#1E293B] text-[#1E293B]";

export default function QuizList({ kind }) {
  const { user } = useAuth();
  const isTeacher = user.role === "teacher" || user.role === "admin";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const isDpp = kind === "dpp";

  // Delete state
  const [deleting, setDeleting] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Edit state
  const [editTest, setEditTest] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/tests", { params: { kind } }).then((r) => setItems(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group by Class → Batch
  const classGroups = useMemo(() => {
    return items.reduce((acc, t) => {
      const cl = `Class ${t.class_level || "?"}`;
      const batch = t.batch_name?.trim() || "General";
      if (!acc[cl]) acc[cl] = {};
      if (!acc[cl][batch]) acc[cl][batch] = [];
      acc[cl][batch].push(t);
      return acc;
    }, {});
  }, [items]);
  const sortedClasses = useMemo(() => Object.keys(classGroups).sort(), [classGroups]);

  /* ---- Delete ---- */
  const handleDelete = async (test) => {
    setDeleting(test.id);
    try {
      await api.delete(`/tests/${test.id}`);
      toast.success("Test deleted");
      setItems((prev) => prev.filter((t) => t.id !== test.id));
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Delete failed");
    } finally {
      setDeleting(null);
      setDeleteConfirm(null);
    }
  };

  /* ---- Edit ---- */
  const openEdit = (test) => {
    setEditTest(test);
    setEditForm({ title: test.title, valid_hours: test.valid_hours || 24 });
  };

  const saveEdit = async () => {
    if (!editTest) return;
    setSaving(true);
    try {
      const res = await api.patch(`/tests/${editTest.id}`, editForm);
      toast.success("Test updated");
      setItems((prev) => prev.map((t) => (t.id === editTest.id ? { ...t, ...res.data } : t)));
      setEditTest(null);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 sm:p-8 rounded-3xl bg-[#F5C842] border-[3px] border-[#1E293B] shadow-[5px_5px_0_#1E293B]">
        <div>
          <span className="text-xs uppercase tracking-widest text-[#1E293B] font-head font-extrabold px-3 py-1 bg-white rounded-full border-2 border-[#1E293B]">
            {isDpp ? "Chapterwise Practice" : "Board Assessments"}
          </span>
          <h1 className="font-head text-3xl sm:text-4xl font-900 tracking-tight text-[#1E293B] uppercase mt-2">
            {isDpp ? "Chapterwise Tests (DPP)" : "Class Tests"}
          </h1>
        </div>
        {isTeacher && (
          <Button data-testid="new-quiz-btn" asChild className="rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold hover:bg-[#FFF9E8]">
            <Link to={isDpp ? "/dpp/new" : "/tests/new"}>
              <Plus className="h-4 w-4 mr-1" /> + Create {isDpp ? "DPP" : "Test"}
            </Link>
          </Button>
        )}
      </div>

      {loading ? <p className="text-[#64748B] font-bold">Loading assessments…</p> : items.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-[#1E293B] bg-white p-16 text-center shadow-[4px_4px_0_#1E293B]">
          {isDpp ? <Sparkles className="h-10 w-10 mx-auto text-[#64748B]" /> : <FileQuestion className="h-10 w-10 mx-auto text-[#64748B]" />}
          <p className="mt-3 text-[#1E293B] font-bold">Nothing here yet{!isTeacher && ". Join a batch to receive tests from your teacher."}</p>
        </div>
      ) : (
        <div className="space-y-10">
          {sortedClasses.map((cl) => {
            const batchMap = classGroups[cl];
            const sortedBatches = Object.keys(batchMap).sort((a, b) => a === "General" ? 1 : b === "General" ? -1 : a.localeCompare(b));
            return (
              <div key={cl}>
                {/* Class header */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="h-8 w-8 rounded-xl bg-[#5B9BD5] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center">
                    <Folder className="h-4 w-4 text-white" />
                  </div>
                  <h2 className="font-head text-2xl font-900 text-[#1E293B] uppercase">{cl}</h2>
                  <div className="flex-1 h-0.5 bg-[#1E293B]" />
                </div>

                <div className="space-y-6 pl-2 border-l-2 border-[#1E293B]">
                  {sortedBatches.map((batch) => {
                    const batchItems = batchMap[batch];
                    return (
                      <div key={batch}>
                        {/* Batch sub-header */}
                        <div className="flex items-center gap-2 mb-4 ml-4">
                          <Folder className="h-4 w-4 text-[#F5C842]" />
                          <h3 className="font-head font-bold text-[#1E293B] text-sm tracking-wide uppercase">{batch}</h3>
                          <span className="text-xs text-[#64748B] font-mono font-bold">({batchItems.length})</span>
                          <div className="flex-1 h-0.5 bg-[#1E293B]/20 ml-1" />
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 pl-4">
                          {batchItems.map((t, i) => (
                            <TestCard
                              key={t.id} t={t} isTeacher={isTeacher} isDpp={isDpp} i={i}
                              onEdit={openEdit} onDelete={setDeleteConfirm} deleting={deleting}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- Delete confirmation ---- */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent className="bg-white border-[3px] border-[#1E293B] max-w-md rounded-3xl p-6 shadow-[6px_6px_0_#1E293B] text-[#1E293B]">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B] font-head text-xl font-900">Delete test?</DialogTitle>
          </DialogHeader>
          <p className="text-[#64748B] text-sm leading-relaxed font-medium">
            <span className="font-bold text-[#1E293B]">"{deleteConfirm?.title}"</span> will be permanently removed.
            Students who haven't taken it yet will lose access.
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
      <Dialog open={!!editTest} onOpenChange={(o) => { if (!o) setEditTest(null); }}>
        <DialogContent className="bg-white border-[3px] border-[#1E293B] max-w-md rounded-3xl p-6 shadow-[6px_6px_0_#1E293B] text-[#1E293B]">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B] font-head text-xl font-900">Edit test</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="font-head font-bold text-xs uppercase text-[#1E293B]">Title</Label>
              <Input className={inp} value={editForm.title || ""}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
            </div>
            {!isDpp && (
              <div>
                <Label className="font-head font-bold text-xs uppercase text-[#1E293B]">
                  Active window (hours from start)
                </Label>
                <Input
                  className={inp}
                  type="number" min={1} max={720}
                  value={editForm.valid_hours || ""}
                  onChange={(e) => setEditForm({ ...editForm, valid_hours: parseInt(e.target.value, 10) || 24 })}
                />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" className="rounded-full border-2 border-[#1E293B] text-[#1E293B]"
              onClick={() => setEditTest(null)}>Cancel</Button>
            <Button className="rounded-full bg-[#5B9BD5] hover:bg-[#4D8BC4] text-white border-2 border-[#1E293B] font-head font-bold"
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
