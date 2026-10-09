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
        className="w-full flex items-center justify-center gap-1 text-xs font-600 text-[#94A3B8] hover:text-white py-1 transition-colors">
        <Trophy className="h-3.5 w-3.5" /> Leaderboard
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 rounded-2xl bg-[#0B0F19] border border-[#1E293B] p-3">
          {rows === null ? <div className="text-xs text-[#94A3B8]">Loading…</div>
            : rows.length === 0 ? <div className="text-xs text-[#94A3B8]">No submissions yet.</div>
            : rows.slice(0, 5).map((r, i) => (
                <div key={i} className="flex items-center justify-between py-1 text-xs">
                  <span className="text-[#94A3B8] truncate">{i + 1}. {r.student_name}</span>
                  <span className="font-700 text-white">{r.score}% <span className="text-[#94A3B8] font-400">({r.correct}/{r.total})</span></span>
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
      className="relative group rounded-3xl bg-[#111827] border border-[#1E293B] p-6 flex flex-col hover:border-[#3B82F6]/40 transition-colors">

      {/* Teacher action buttons */}
      {isTeacher && (
        <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <button
            data-testid={`edit-test-${t.id}`}
            onClick={() => onEdit(t)}
            className="h-7 w-7 rounded-full bg-[#1E293B] hover:bg-[#3B82F6]/20 border border-[#3B82F6]/30 flex items-center justify-center text-[#3B82F6] transition-colors"
            title="Edit test">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            data-testid={`delete-test-${t.id}`}
            onClick={() => onDelete(t)}
            disabled={deleting === t.id}
            className="h-7 w-7 rounded-full bg-[#1E293B] hover:bg-[#F87171]/20 border border-[#F87171]/30 flex items-center justify-center text-[#F87171] transition-colors disabled:opacity-50"
            title="Delete test">
            {deleting === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-3 pr-16">
        <span className="text-[11px] font-600 uppercase tracking-wide px-2.5 py-1 rounded-full border border-[#06B6D4]/40 bg-[#06B6D4]/10 text-[#06B6D4]">{t.subject}</span>
        {!isTeacher && (done
          ? <span className="flex items-center gap-1 text-xs font-700 text-[#34D399]"><CheckCircle2 className="h-4 w-4" /> {t.score}%</span>
          : active ? <span className="flex items-center gap-1 text-xs font-700 text-[#3B82F6]"><PlayCircle className="h-4 w-4" /> Live</span>
          : <span className="flex items-center gap-1 text-xs font-600 text-[#94A3B8]/60"><Lock className="h-3.5 w-3.5" /> Closed</span>)}
      </div>
      <h3 className="font-head text-lg font-600 leading-snug text-white">{t.title}</h3>
      <div className="text-xs text-[#94A3B8] mt-1 font-500">Class {t.class_level} • {t.chapter}{t.topic ? ` • ${t.topic}` : ""}</div>
      <div className="mt-4 flex items-center gap-3 text-xs text-[#94A3B8] font-500 font-mono">
        <span className="flex items-center gap-1"><FileQuestion className="h-3.5 w-3.5" /> {t.question_count} Qs</span>
        {!isDpp && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {t.duration_minutes} min</span>}
      </div>
      {!isTeacher && !isDpp && active && !done && (
        <div className="text-xs text-[#3B82F6] font-600 mt-2 font-mono">{timeLeft(t.valid_until)}</div>
      )}
      <div className="mt-5">
        {isTeacher ? (
          t.status === "processing" ? (
            <Button disabled className="w-full rounded-full font-600 bg-[#1E293B] text-[#94A3B8]">Building…</Button>
          ) : t.status === "failed" ? (
            <Button disabled className="w-full rounded-full font-600 bg-[#1E293B] text-[#F87171]">Failed</Button>
          ) : (
            <Button data-testid={`view-quiz-${t.id}`} asChild variant="outline" className="w-full rounded-full border-[#1E293B] bg-transparent text-white hover:bg-white/5 font-600">
              <Link to={`/quiz/${t.id}`}>Preview</Link>
            </Button>
          )
        ) : done ? (
          <Button disabled className="w-full rounded-full font-600 bg-[#1E293B] text-[#94A3B8]">Completed</Button>
        ) : active ? (
          <Button data-testid={`start-quiz-${t.id}`} asChild className="w-full rounded-full bg-[#3B82F6] text-white font-700 hover:bg-[#60A5FA]">
            <Link to={`/quiz/${t.id}`}>{isDpp ? "Practice" : "Start test"}</Link>
          </Button>
        ) : (
          <Button disabled className="w-full rounded-full font-600 bg-[#1E293B] text-[#94A3B8]">Not active</Button>
        )}
      </div>
      {!isDpp && <Leaderboard testId={t.id} />}
    </motion.div>
  );
}

const inp = "rounded-xl mt-1.5 bg-[#0B0F19] border-[#1E293B]";

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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs uppercase tracking-widest text-[#06B6D4] font-600">{isDpp ? "Daily Practice" : "Assessments"}</span>
          <h1 className="font-head text-3xl font-700 tracking-tight text-white">{isDpp ? "Practice Problems" : "Timed Tests"}</h1>
        </div>
        {isTeacher && (
          <Button data-testid="new-quiz-btn" asChild className="rounded-full bg-[#3B82F6] text-white font-700 hover:bg-[#60A5FA]">
            <Link to={isDpp ? "/dpp/new" : "/tests/new"}><Plus className="h-4 w-4 mr-1" /> New {isDpp ? "DPP" : "test"}</Link>
          </Button>
        )}
      </div>

      {loading ? <p className="text-[#94A3B8]">Loading…</p> : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#1E293B] p-16 text-center">
          {isDpp ? <Sparkles className="h-10 w-10 mx-auto text-[#94A3B8]/40" /> : <FileQuestion className="h-10 w-10 mx-auto text-[#94A3B8]/40" />}
          <p className="mt-3 text-[#94A3B8]">Nothing here yet{!isTeacher && ". Join a batch to get tests from your teacher."}</p>
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
                  <div className="h-7 w-7 rounded-xl bg-[#3B82F6]/15 border border-[#3B82F6]/30 flex items-center justify-center">
                    <Folder className="h-4 w-4 text-[#3B82F6]" />
                  </div>
                  <h2 className="font-head text-xl font-700 text-white">{cl}</h2>
                  <div className="flex-1 h-px bg-[#1E293B]" />
                </div>

                <div className="space-y-6 pl-2 border-l-2 border-[#1E293B]">
                  {sortedBatches.map((batch) => {
                    const batchItems = batchMap[batch];
                    return (
                      <div key={batch}>
                        {/* Batch sub-header */}
                        <div className="flex items-center gap-2 mb-4 ml-4">
                          <Folder className="h-3.5 w-3.5 text-[#FBBF24]" />
                          <h3 className="font-head font-600 text-[#FBBF24] text-sm tracking-wide">{batch}</h3>
                          <span className="text-xs text-[#94A3B8]/50 font-mono">{batchItems.length}</span>
                          <div className="flex-1 h-px bg-[#1E293B] ml-1" />
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pl-4">
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
        <DialogContent className="bg-[#111827] border-[#1E293B] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white font-head text-xl">Delete test?</DialogTitle>
          </DialogHeader>
          <p className="text-[#94A3B8] text-sm leading-relaxed">
            <span className="font-600 text-white">"{deleteConfirm?.title}"</span> will be permanently removed.
            Students who haven't taken it yet will lose access. Existing submissions are not affected.
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" className="rounded-full border-[#1E293B] text-[#94A3B8]"
              onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              className="rounded-full bg-[#F87171] hover:bg-[#EF4444] text-white font-700"
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
        <DialogContent className="bg-[#111827] border-[#1E293B] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white font-head text-xl">Edit test</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="font-600 text-[#94A3B8]">Title</Label>
              <Input className={inp} value={editForm.title || ""}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
            </div>
            {!isDpp && (
              <div>
                <Label className="font-600 text-[#94A3B8]">
                  Active window <span className="text-[#94A3B8]/50 font-400">(hours from start)</span>
                </Label>
                <Input
                  className={inp}
                  type="number" min={1} max={720}
                  value={editForm.valid_hours || ""}
                  onChange={(e) => setEditForm({ ...editForm, valid_hours: parseInt(e.target.value, 10) || 24 })}
                />
                <p className="text-xs text-[#94A3B8]/70 mt-1.5">
                  Current window: {editTest?.valid_hours ?? "–"} h.
                  Changing this recalculates the expiry from the original start time.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-full border-[#1E293B] text-[#94A3B8]"
              onClick={() => setEditTest(null)}>Cancel</Button>
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
