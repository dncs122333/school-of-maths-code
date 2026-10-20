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
  PlayCircle, Trophy, ChevronDown, Folder, Pencil, Trash2, Loader2, Users,
  Copy, Send,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { motion } from "framer-motion";
import { toast } from "sonner";

function formatExpiry(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const datePart = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timePart = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${datePart}, ${timePart}`;
}

function ChapterwiseSubmissions({ testId }) {
  const [open, setOpen] = useState(false);
  const [submissions, setSubmissions] = useState(null);
  const toggle = () => {
    if (!open && submissions === null) {
      api.get(`/tests/${testId}/submissions`).then((r) => setSubmissions(r.data || [])).catch(() => setSubmissions([]));
    }
    setOpen(!open);
  };
  return (
    <div className="mt-3">
      <button
        data-testid={`submissions-${testId}`}
        onClick={toggle}
        className="w-full flex items-center justify-center gap-1.5 text-xs font-head font-bold text-[#1E293B] hover:text-[#2F8A5F] py-1 transition-colors"
      >
        <Users className="h-3.5 w-3.5 text-[#2F8A5F]" />
        Student Attempts ({submissions === null ? "View" : submissions.length})
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-3 shadow-[2px_2px_0_#1E293B] space-y-2">
          {submissions === null ? (
            <div className="text-xs text-[#64748B] font-bold">Loading attempts…</div>
          ) : submissions.length === 0 ? (
            <div className="text-xs text-[#64748B]">No students have attempted this chapterwise test yet.</div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {submissions.map((s, idx) => (
                <div key={s.id || idx} className="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-white border border-[#1E293B]/20 text-xs">
                  <div className="min-w-0 flex-1 pr-2">
                    <span className="font-bold text-[#1E293B] truncate block">{s.student_name}</span>
                    <span className="text-[10px] text-[#64748B] font-mono">
                      {s.created_at ? new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-head font-bold text-[#1E293B]">{s.score}%</span>
                    <span className="text-[10px] text-[#64748B] block font-mono">({s.correct}/{s.total} Qs)</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
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

function TestCard({ t, isTeacher, isDpp, i, onEdit, onDelete, deleting, onReuse, onToggleActive, togglingActive }) {
  const done = t.submitted;
  const isDraft = Boolean(t.is_draft || (!t.valid_until && t.is_active === false) || (t.is_active === false && t.batch_name === "Saved / Unassigned"));
  const isExpired = !isDraft && t.valid_until ? new Date(t.valid_until) <= new Date() : false;
  const isTeacherLive = !isDraft && !isExpired && t.is_active !== false;
  const isTeacherPaused = !isDraft && !isExpired && t.is_active === false;
  const studentLive = !isTeacher && !isDraft && t.is_active && !isExpired;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
      className="relative group rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-6 flex flex-col justify-between shadow-[4px_4px_0_#1E293B] hover:-translate-y-1 transition-all">

      <div>
        {/* Teacher action buttons */}
        {isTeacher && (
          <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <button
              data-testid={`reuse-icon-${t.id}`}
              onClick={() => onReuse(t)}
              className="h-8 w-8 rounded-full bg-white hover:bg-[#F5C842]/40 border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] flex items-center justify-center text-[#1E293B] transition-colors"
              title="Reuse test / assign to batch">
              <Copy className="h-3.5 w-3.5 text-[#1E293B]" />
            </button>
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
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-head font-bold uppercase tracking-wide px-3 py-0.5 rounded-full border-2 border-[#1E293B] bg-[#FFF9E8] text-[#1E293B]">{t.subject}</span>
            {isTeacher && (
              isDraft ? (
                <button
                  type="button"
                  data-testid={`assign-template-${t.id}`}
                  onClick={() => onReuse(t)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-head font-bold border-2 transition-all bg-[#F3E8FF] text-[#7E22CE] border-[#7E22CE]/40 hover:bg-[#E9D5FF] cursor-pointer"
                  title="Master Template. Click to assign to a batch as a live test."
                >
                  <span className="h-2 w-2 rounded-full bg-[#9333EA]" />
                  Template
                </button>
              ) : (
                <button
                  type="button"
                  data-testid={`toggle-active-${t.id}`}
                  onClick={() => onToggleActive(t)}
                  disabled={togglingActive === t.id || isExpired}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-head font-bold border-2 transition-all ${
                    isExpired
                      ? "bg-[#F1F5F9] text-[#64748B] border-[#94A3B8]/60 cursor-not-allowed opacity-90"
                      : isTeacherLive
                      ? "bg-[#EAF7EE] text-[#2F8A5F] border-[#2F8A5F]/50 hover:bg-[#d5f0dd] cursor-pointer"
                      : "bg-[#FFFBEB] text-[#B45309] border-[#F59E0B]/50 hover:bg-[#FEF3C7] cursor-pointer"
                  }`}
                  title={
                    isExpired
                      ? "Test window has expired. Click Edit (pencil icon) to extend."
                      : isTeacherLive
                      ? "Currently live for students. Click to pause."
                      : "Currently paused. Click to make live."
                  }
                >
                  {togglingActive === t.id ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isExpired
                          ? "bg-[#94A3B8]"
                          : isTeacherLive
                          ? "bg-[#2F8A5F] animate-pulse"
                          : "bg-[#F59E0B]"
                      }`}
                    />
                  )}
                  {isExpired ? "Expired" : isTeacherLive ? "Live" : "Paused"}
                </button>
              )
            )}
          </div>
          {!isTeacher && (done ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs font-head font-bold text-[#64748B]">
                <Lock className="h-3.5 w-3.5" /> Closed
              </span>
              <span className="flex items-center gap-1 text-xs font-head font-bold text-[#4CAF7D]">
                <CheckCircle2 className="h-4 w-4" /> {t.score}%
              </span>
            </div>
          ) : studentLive ? (
            <span className="flex items-center gap-1.5 text-xs font-head font-bold text-[#2F8A5F] bg-[#EAF7EE] px-2.5 py-0.5 rounded-full border border-[#2F8A5F]/40">
              <span className="h-2 w-2 rounded-full bg-[#2F8A5F] animate-pulse" /> Live
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-head font-bold text-[#64748B] bg-[#F1F5F9] px-2.5 py-0.5 rounded-full border border-[#94A3B8]/40">
              <Lock className="h-3.5 w-3.5" /> Closed
            </span>
          ))}
        </div>
        <h3 className="font-head text-lg font-900 leading-snug text-[#1E293B]">{t.title}</h3>
        <div className="text-xs text-[#64748B] mt-1 font-bold">
          Class {t.class_level} • {t.chapter}{t.topic ? ` • ${t.topic}` : ""}{t.batch_name ? ` • Batch: ${t.batch_name}` : ""}
        </div>
        <div className="mt-4 flex items-center gap-3 text-xs text-[#1E293B] font-mono font-bold">
          <span className="flex items-center gap-1"><FileQuestion className="h-3.5 w-3.5 text-[#5B9BD5]" /> {t.question_count} Qs</span>
          {t.duration_minutes > 0 ? (
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-[#F5C842]" /> {t.duration_minutes} min</span>
          ) : isDpp ? (
            <span className="flex items-center gap-1 text-[#64748B]"><Clock className="h-3.5 w-3.5 text-[#64748B]" /> Untimed</span>
          ) : null}
        </div>
        {isDraft ? (
          <div className="text-xs font-bold mt-2 font-mono flex items-center gap-1.5 text-[#7E22CE]">
            <Clock className="h-3.5 w-3.5" />
            <span>Master Template • Ready to assign</span>
          </div>
        ) : t.valid_until ? (
          <div className={`text-xs font-bold mt-2 font-mono flex items-center gap-1.5 ${isExpired ? "text-[#64748B]" : "text-[#5B9BD5]"}`}>
            <Clock className="h-3.5 w-3.5" />
            <span>{isExpired ? "Expired:" : "Expires:"} {formatExpiry(t.valid_until)}</span>
          </div>
        ) : null}
      </div>

      <div className="mt-5">
        {isTeacher ? (
          t.status === "processing" ? (
            <Button disabled className="w-full rounded-full font-head font-bold bg-[#FFF9E8] text-[#64748B] border-2 border-[#1E293B]">Building…</Button>
          ) : t.status === "failed" ? (
            <Button disabled className="w-full rounded-full font-head font-bold bg-[#FFF9E8] text-[#FF6B5E] border-2 border-[#1E293B]">Failed</Button>
          ) : isDraft ? (
            <div className="grid grid-cols-2 gap-2">
              <Button data-testid={`view-quiz-${t.id}`} asChild variant="outline" className="rounded-full border-2 border-[#1E293B] bg-white text-[#1E293B] hover:bg-[#FFF9E8] font-head font-bold shadow-[2px_2px_0_#1E293B] text-xs h-9">
                <Link to={`/quiz/${t.id}`}>Preview</Link>
              </Button>
              <Button
                data-testid={`assign-quiz-${t.id}`}
                onClick={() => onReuse(t)}
                className="rounded-full bg-[#F5C842] hover:bg-[#ebd438] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs h-9 flex items-center justify-center gap-1.5"
              >
                <Send className="h-3.5 w-3.5" /> Assign to Batch
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button data-testid={`view-quiz-${t.id}`} asChild variant="outline" className="rounded-full border-2 border-[#1E293B] bg-white text-[#1E293B] hover:bg-[#FFF9E8] font-head font-bold shadow-[2px_2px_0_#1E293B] text-xs h-9">
                <Link to={`/quiz/${t.id}`}>Preview</Link>
              </Button>
              <Button
                data-testid={`reuse-quiz-${t.id}`}
                onClick={() => onReuse(t)}
                className="rounded-full bg-[#F5C842] hover:bg-[#ebd438] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs h-9 flex items-center justify-center gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" /> Reuse
              </Button>
            </div>
          )
        ) : done ? (
          <Button disabled className="w-full rounded-full font-head font-bold bg-[#FFF9E8] text-[#64748B] border-2 border-[#1E293B]">Completed</Button>
        ) : studentLive ? (
          <Button data-testid={`start-quiz-${t.id}`} asChild className="w-full rounded-full bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold">
            <Link to={`/quiz/${t.id}`}>{isDpp ? "Practice Sprint" : "Start Test"}</Link>
          </Button>
        ) : (
          <Button disabled className="w-full rounded-full font-head font-bold bg-[#F1F5F9] text-[#64748B] border-2 border-[#1E293B]">Closed</Button>
        )}
      </div>
      {!isDpp && <Leaderboard testId={t.id} />}
      {isDpp && isTeacher && <ChapterwiseSubmissions testId={t.id} />}
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

  // Batches for reuse modal
  const [batches, setBatches] = useState([]);
  useEffect(() => {
    if (isTeacher) {
      api.get("/batches").then((r) => setBatches(r.data || [])).catch(() => setBatches([]));
    }
  }, [isTeacher]);

  // Live / Paused / Draft toggle state
  const [togglingActive, setTogglingActive] = useState(null);
  const handleToggleActive = async (test) => {
    const isDraft = Boolean(test.is_draft || (!test.valid_until && test.is_active === false) || (test.is_active === false && test.batch_name === "Saved / Unassigned"));
    const isExpired = !isDraft && test.valid_until ? new Date(test.valid_until) <= new Date() : false;
    if (isExpired) {
      toast.info("This test has expired. Click Edit (pencil icon) to extend the active window.");
      return;
    }
    setTogglingActive(test.id);
    const nextVal = test.is_active === false;
    try {
      const payload = { is_active: nextVal, is_draft: false };
      if (isDraft) {
        payload.valid_hours = test.valid_hours || 24;
      }
      const res = await api.patch(`/tests/${test.id}`, payload);
      setItems((prev) =>
        prev.map((t) =>
          t.id === test.id
            ? { ...t, ...res.data, is_active: res.data?.is_active ?? nextVal, is_draft: false }
            : t
        )
      );
      toast.success(
        isDraft
          ? "Draft published and now Live for students!"
          : nextVal
          ? "Test is now Live for students"
          : "Test Paused (hidden from students)"
      );
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to update status");
    } finally {
      setTogglingActive(null);
    }
  };

  // Reuse / Duplicate state
  const [reuseTest, setReuseTest] = useState(null);
  const [reuseForm, setReuseForm] = useState({
    title: "",
    batch_id: "all",
    duration_minutes: 0,
    valid_hours: 24,
    timing_mode: "untimed",
  });
  const [reusing, setReusing] = useState(false);

  const openReuse = (test) => {
    setReuseTest(test);
    const dur = test.duration_minutes || 0;
    setReuseForm({
      title: test.title, // Option A: same title as template
      batch_id: test.batch_id || "all",
      duration_minutes: dur,
      valid_hours: test.valid_hours || 24,
      timing_mode: dur > 0 ? "timed" : "untimed",
    });
  };

  const handleDuplicate = async () => {
    if (!reuseTest) return;
    setReusing(true);
    try {
      const payload = {
        title: reuseForm.title || reuseTest.title,
        batch_id: reuseForm.batch_id === "all" ? "" : reuseForm.batch_id,
        duration_minutes: reuseForm.timing_mode === "timed" ? Number(reuseForm.duration_minutes) || 15 : 0,
        valid_hours: Number(reuseForm.valid_hours) || 24,
      };
      const res = await api.post(`/tests/${reuseTest.id}/duplicate`, payload);
      toast.success(
        reuseTest.is_draft
          ? `Test launched live${res.data?.batch_name ? ` for ${res.data.batch_name}` : ""}! Master template preserved.`
          : `Test created & assigned${res.data?.batch_name ? ` to ${res.data.batch_name}` : ""}!`
      );
      setReuseTest(null);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to duplicate test");
    } finally {
      setReusing(false);
    }
  };

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
      const batch = t.batch_name?.trim() || (isTeacher ? "Saved / Unassigned" : "General");
      if (!acc[cl]) acc[cl] = {};
      if (!acc[cl][batch]) acc[cl][batch] = [];
      acc[cl][batch].push(t);
      return acc;
    }, {});
  }, [items, isTeacher]);
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
                              onReuse={openReuse} onToggleActive={handleToggleActive} togglingActive={togglingActive}
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

      {/* ---- Reuse / Duplicate dialog ---- */}
      <Dialog open={!!reuseTest} onOpenChange={(o) => { if (!o) setReuseTest(null); }}>
        <DialogContent className="bg-white border-[3px] border-[#1E293B] max-w-lg rounded-3xl p-6 shadow-[6px_6px_0_#1E293B] text-[#1E293B]">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B] font-head text-xl font-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#F5C842]" />
              {reuseTest?.is_draft ? "Assign Template to Batch" : "Reuse / Assign Test"}
            </DialogTitle>
          </DialogHeader>

          {reuseTest && (
            <div className="space-y-4 py-2">
              {/* Summary Box */}
              <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-3 text-xs space-y-1">
                <div className="font-head font-bold text-[#1E293B] flex items-center justify-between">
                  <span>Class {reuseTest.class_level} • {reuseTest.subject}</span>
                  <span className="font-mono text-[#5B9BD5] font-bold">{reuseTest.question_count} Questions</span>
                </div>
                <div className="text-[#64748B] font-medium truncate">
                  {reuseTest.chapter}{reuseTest.topic ? ` • ${reuseTest.topic}` : ""}
                </div>
                <div className="text-[11px] text-[#2F8A5F] font-bold pt-0.5">
                  {reuseTest.is_draft
                    ? "✓ Creates a fresh live test for the batch. Master template remains preserved in your library."
                    : "✓ Reuses exact questions with a fresh attempt history & leaderboard."}
                </div>
              </div>

              {/* Title */}
              <div>
                <Label className="font-head font-bold text-xs uppercase text-[#1E293B]">New Test Title</Label>
                <Input
                  data-testid="reuse-title-input"
                  className={inp}
                  value={reuseForm.title}
                  onChange={(e) => setReuseForm({ ...reuseForm, title: e.target.value })}
                />
              </div>

              {/* Target Batch */}
              <div>
                <Label className="font-head font-bold text-xs uppercase text-[#1E293B]">Target Batch</Label>
                <Select
                  value={reuseForm.batch_id}
                  onValueChange={(v) => setReuseForm({ ...reuseForm, batch_id: v })}
                >
                  <SelectTrigger data-testid="reuse-batch-select" className={inp}>
                    <SelectValue placeholder="Choose batch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {isDpp ? "All Students / Open (Classwide)" : "All Students"}
                    </SelectItem>
                    {batches
                      .filter((b) => !b.class_level || String(b.class_level) === String(reuseTest.class_level))
                      .map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} (Class {b.class_level || reuseTest.class_level})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Timing & Validity */}
              <div className="grid grid-cols-2 gap-3">
                {isDpp ? (
                  <div>
                    <Label className="font-head font-bold text-xs uppercase text-[#1E293B]">Mode</Label>
                    <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                      <button
                        type="button"
                        onClick={() => setReuseForm({ ...reuseForm, timing_mode: "untimed", duration_minutes: 0 })}
                        className={`py-2 rounded-xl text-xs font-head font-bold border-2 transition-all ${
                          reuseForm.timing_mode === "untimed"
                            ? "bg-[#F5C842] text-[#1E293B] border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                            : "bg-[#FFF9E8] text-[#1E293B]/70 border-[#1E293B]/30"
                        }`}
                      >
                        Untimed
                      </button>
                      <button
                        type="button"
                        onClick={() => setReuseForm({ ...reuseForm, timing_mode: "timed", duration_minutes: reuseForm.duration_minutes || 15 })}
                        className={`py-2 rounded-xl text-xs font-head font-bold border-2 transition-all ${
                          reuseForm.timing_mode === "timed"
                            ? "bg-[#F5C842] text-[#1E293B] border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                            : "bg-[#FFF9E8] text-[#1E293B]/70 border-[#1E293B]/30"
                        }`}
                      >
                        Timed
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label className="font-head font-bold text-xs uppercase text-[#1E293B]">Duration (min)</Label>
                    <Input
                      type="number" min={1}
                      className={inp + " font-mono"}
                      value={reuseForm.duration_minutes}
                      onChange={(e) => setReuseForm({ ...reuseForm, duration_minutes: e.target.value })}
                    />
                  </div>
                )}

                <div>
                  <Label className="font-head font-bold text-xs uppercase text-[#1E293B]">Valid for (hours)</Label>
                  <Input
                    type="number" min={1} max={720}
                    className={inp + " font-mono"}
                    value={reuseForm.valid_hours}
                    onChange={(e) => setReuseForm({ ...reuseForm, valid_hours: e.target.value })}
                  />
                  {reuseForm.valid_hours && (
                    <div className="text-[11px] text-[#5B9BD5] font-bold font-mono mt-1">
                      Expires: {formatExpiry(new Date(Date.now() + (Number(reuseForm.valid_hours) || 24) * 3600000))}
                    </div>
                  )}
                </div>
              </div>

              {reuseForm.timing_mode === "timed" && isDpp && (
                <div>
                  <Label className="font-head font-bold text-xs uppercase text-[#1E293B]">Sprint Duration (minutes)</Label>
                  <Input
                    type="number" min={1}
                    className={inp + " font-mono"}
                    value={reuseForm.duration_minutes}
                    onChange={(e) => setReuseForm({ ...reuseForm, duration_minutes: e.target.value })}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" className="rounded-full border-2 border-[#1E293B] text-[#1E293B]"
              onClick={() => setReuseTest(null)}>Cancel</Button>
            <Button
              data-testid="confirm-reuse-btn"
              className="rounded-full bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] border-2 border-[#1E293B] font-head font-bold shadow-[2px_2px_0_#1E293B]"
              disabled={reusing}
              onClick={handleDuplicate}
            >
              {reusing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              {reuseTest?.is_draft ? "Launch to Batch" : "Launch Fresh Test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <div>
              <Label className="font-head font-bold text-xs uppercase text-[#1E293B]">
                Active window (hours from now)
              </Label>
              <Input
                className={inp}
                type="number" min={1} max={720}
                value={editForm.valid_hours || ""}
                onChange={(e) => setEditForm({ ...editForm, valid_hours: parseInt(e.target.value, 10) || 24 })}
              />
              {editForm.valid_hours && (
                <div className="text-[11px] text-[#5B9BD5] font-bold font-mono mt-1">
                  Expires: {formatExpiry(new Date(Date.now() + (Number(editForm.valid_hours) || 24) * 3600000))}
                </div>
              )}
            </div>
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
