import React, { useState, useEffect } from "react";
import { api, formatApiErrorDetail } from "../../lib/api";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Check, X, AlertTriangle, HelpCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function PendingReviewsQueue({ onQueueChange }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const res = await api.get("/questions", { params: { status: "pending_review" } });
      setQuestions(res.data || []);
    } catch {
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleApprove = async (qId) => {
    setActionId(qId);
    try {
      await api.put(`/questions/${qId}/review`, { status: "active" });
      toast.success("Question approved and live in question bank!");
      setQuestions((prev) => prev.filter((q) => q.id !== qId));
      if (onQueueChange) onQueueChange();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (qId) => {
    setActionId(qId);
    try {
      await api.delete(`/questions/${qId}`);
      toast.success("Question rejected and removed from bank.");
      setQuestions((prev) => prev.filter((q) => q.id !== qId));
      if (onQueueChange) onQueueChange();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="rounded-3xl bg-[#111827] border border-[#1E293B] p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-[#FBBF24]" />
          <h3 className="font-head text-lg font-700 text-white">Pending Question Reviews</h3>
        </div>
        <Badge className="bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/30 font-mono text-xs">
          {questions.length} Pending
        </Badge>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-[#94A3B8] flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-[#3B82F6]" /> Loading review queue…
        </div>
      ) : questions.length === 0 ? (
        <div className="rounded-2xl bg-[#0B0F19] border border-[#1E293B] p-6 text-center space-y-1.5 text-[#94A3B8]">
          <CheckCircle2 className="h-7 w-7 text-[#34D399] mx-auto" />
          <p className="text-sm font-600 text-white">Question Bank Verified</p>
          <p className="text-xs">No questions pending review. All imported questions are clean and active.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
          {questions.map((q) => (
            <div
              key={q.id}
              className="p-4 rounded-2xl bg-[#0B0F19] border border-[#FBBF24]/20 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-[#3B82F6]/15 text-[#60A5FA] border-[#3B82F6]/30 text-[10px]">
                      {q.subject}
                    </Badge>
                    <span className="text-xs text-[#94A3B8]">{q.chapter}</span>
                  </div>
                  <h4 className="font-600 text-sm text-white mt-1">{q.question}</h4>
                </div>
                <Badge className="bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30 text-[10px] shrink-0">
                  Mismatch Flagged
                </Badge>
              </div>

              {/* Options Preview */}
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {(q.options || []).map((opt, optIdx) => (
                  <div
                    key={optIdx}
                    className={`p-2 rounded-xl border text-[11px] truncate ${
                      optIdx === q.correct_index
                        ? "border-[#34D399]/40 bg-[#34D399]/10 text-[#34D399] font-600"
                        : "border-[#1E293B] bg-[#111827] text-[#94A3B8]"
                    }`}
                  >
                    <span className="font-mono text-white/50 mr-1.5">{String.fromCharCode(65 + optIdx)}:</span>
                    {opt}
                  </div>
                ))}
              </div>

              {q.explanation && (
                <p className="text-[11px] text-[#94A3B8] bg-[#111827] p-2 rounded-xl border border-[#1E293B]">
                  <span className="font-600 text-[#FBBF24]">Explanation:</span> {q.explanation}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#1E293B]/60">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionId === q.id}
                  onClick={() => handleReject(q.id)}
                  className="rounded-full h-8 text-xs border-[#F87171]/30 text-[#F87171] hover:bg-[#F87171]/10 px-3"
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Reject
                </Button>
                <Button
                  size="sm"
                  disabled={actionId === q.id}
                  onClick={() => handleApprove(q.id)}
                  className="rounded-full h-8 text-xs bg-[#34D399] hover:bg-[#10B981] text-black font-700 px-3"
                >
                  <Check className="h-3.5 w-3.5 mr-1" /> Approve Active
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
