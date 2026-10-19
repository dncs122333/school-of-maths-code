import React, { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import {
  X,
  Radio,
  BookOpen,
  FileQuestion,
  Clock,
  Users,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Inbox,
} from "lucide-react";
import { Badge } from "../ui/badge";

/** Slide-over drawer listing all live tests with toggle capability. */
export default function LiveTestsDrawer({ open, onClose }) {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState({}); // { [testId]: bool }

  const fetchLive = useCallback(() => {
    if (!open) return;
    setLoading(true);
    api
      .get("/tests/live")
      .then((r) => setTests(r.data || []))
      .catch(() => toast.error("Could not load live tests"))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    fetchLive();
  }, [fetchLive]);

  const handleToggle = async (test) => {
    const nextVal = !test.is_active;
    setToggling((p) => ({ ...p, [test.id]: true }));
    try {
      await api.patch(`/tests/${test.id}`, { is_active: nextVal });
      setTests((prev) =>
        nextVal
          ? prev.map((t) => (t.id === test.id ? { ...t, is_active: true } : t))
          : prev.filter((t) => t.id !== test.id) // removing from live list when deactivated
      );
      toast.success(
        nextVal
          ? `"${test.title}" is now live.`
          : `"${test.title}" deactivated.`
      );
    } catch {
      toast.error("Failed to update test status");
    } finally {
      setToggling((p) => ({ ...p, [test.id]: false }));
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-[#FFFDF5] border-l-2 border-[#1E293B] shadow-[-6px_0_0_#1E293B] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b-2 border-[#1E293B] bg-white">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-[#FF6B5E] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center">
              <Radio className="h-4 w-4 text-white animate-pulse" />
            </div>
            <div>
              <h2 className="font-head text-base font-900 text-[#1E293B]">
                Live Tests
              </h2>
              <p className="text-[10px] text-[#64748B] font-mono font-bold">
                {tests.length} currently active
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-xl border-2 border-[#1E293B] bg-white hover:bg-[#FFF9E8] flex items-center justify-center transition-colors shadow-[2px_2px_0_#1E293B]"
          >
            <X className="h-4 w-4 text-[#1E293B]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-[#64748B]">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs font-mono font-bold">Loading…</span>
            </div>
          ) : tests.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-[#64748B]">
              <Inbox className="h-8 w-8 opacity-40" />
              <p className="text-xs font-mono font-bold text-center">
                No tests are currently live.
                <br />
                Activate a test from /tests or /dpp.
              </p>
            </div>
          ) : (
            tests.map((t) => (
              <TestRow
                key={t.id}
                test={t}
                toggling={!!toggling[t.id]}
                onToggle={handleToggle}
              />
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="px-6 py-4 border-t-2 border-[#1E293B] bg-white">
          <p className="text-[10px] text-[#94A3B8] font-mono text-center leading-relaxed">
            Toggle the switch to deactivate a live test instantly.
            <br />
            Students will see it as closed immediately.
          </p>
        </div>
      </div>
    </>
  );
}

function TestRow({ test, toggling, onToggle }) {
  const isClassTest = test.kind === "test";
  const kindColor = isClassTest ? "#FF6B5E" : "#5B9BD5";
  const kindLabel = isClassTest ? "Class Test" : "Chapterwise";
  const KindIcon = isClassTest ? FileQuestion : BookOpen;

  return (
    <div className="group rounded-2xl bg-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] p-4 flex flex-col gap-3 hover:-translate-y-0.5 transition-all">
      {/* Row 1: Kind badge + title */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <Badge
            className="shrink-0 border-2 border-[#1E293B] text-white text-[10px] font-bold px-2 py-0.5"
            style={{ backgroundColor: kindColor }}
          >
            <KindIcon className="h-3 w-3 mr-1 inline" />
            {kindLabel}
          </Badge>
          <span className="font-head text-sm font-800 text-[#1E293B] truncate">
            {test.title}
          </span>
        </div>

        {/* Toggle */}
        <button
          disabled={toggling}
          onClick={() => onToggle(test)}
          className={`shrink-0 transition-all ${
            toggling ? "opacity-50 cursor-not-allowed" : "hover:scale-110"
          }`}
          title={test.is_active ? "Click to deactivate" : "Click to activate"}
        >
          {toggling ? (
            <Loader2 className="h-6 w-6 animate-spin text-[#64748B]" />
          ) : test.is_active ? (
            <ToggleRight className="h-7 w-7 text-[#4CAF7D]" />
          ) : (
            <ToggleLeft className="h-7 w-7 text-[#94A3B8]" />
          )}
        </button>
      </div>

      {/* Row 2: meta chips */}
      <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono font-bold text-[#64748B]">
        <span className="bg-[#FFF9E8] border border-[#1E293B] px-2 py-0.5 rounded-full">
          Class {test.class_level}
        </span>
        <span className="bg-[#FFF9E8] border border-[#1E293B] px-2 py-0.5 rounded-full truncate max-w-[120px]">
          {test.chapter}
        </span>
        {test.batch_name && (
          <span className="flex items-center gap-1 bg-[#EEF6FF] border border-[#5B9BD5] px-2 py-0.5 rounded-full">
            <Users className="h-2.5 w-2.5" />
            {test.batch_name}
          </span>
        )}
        {test.duration_minutes > 0 && (
          <span className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {test.duration_minutes}m
          </span>
        )}
        {test.question_count != null && (
          <span>{test.question_count} Qs</span>
        )}
      </div>
    </div>
  );
}
