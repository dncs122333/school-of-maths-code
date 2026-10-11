import React, { useState, useEffect } from "react";
import { api, formatApiErrorDetail } from "../../lib/api";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Check, X, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
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
    <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-[#F5C842]" />
          <h3 className="font-head text-lg font-900 text-[#1E293B]">Pending Question Reviews</h3>
        </div>
        <Badge className="bg-[#F5C842] text-[#1E293B] border-2 border-[#1E293B] font-mono text-xs">
          {questions.length} Pending
        </Badge>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-[#1E293B] flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-[#1E293B]" /> Loading review queue…
        </div>
      ) : questions.length === 0 ? (
        <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-6 text-center space-y-1.5 text-[#64748B]">
          <CheckCircle2 className="h-7 w-7 text-[#4CAF7D] mx-auto" />
          <p className="text-sm font-head font-bold text-[#1E293B]">Question Bank Verified</p>
          <p className="text-xs">No questions pending review. All imported questions are clean and active.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
          {questions.map((q) => (
            <div
              key={q.id}
              className="p-4 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-[#5B9BD5] text-white border-2 border-[#1E293B] text-[10px]">
                      {q.subject}
                    </Badge>
                    <span className="text-xs text-[#64748B] font-bold">{q.chapter}</span>
                  </div>
                  <h4 className="font-head font-bold text-sm text-[#1E293B] mt-1">{q.question}</h4>
                </div>
                <Badge className="bg-[#FF6B5E] text-white border-2 border-[#1E293B] text-[10px] shrink-0">
                  Flagged
                </Badge>
              </div>

              {/* Options Preview */}
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {(q.options || []).map((opt, optIdx) => (
                  <div
                    key={optIdx}
                    className={`p-2 rounded-xl border-2 border-[#1E293B] text-[11px] truncate ${
                      optIdx === q.correct_index
                        ? "bg-[#4CAF7D] text-white font-bold"
                        : "bg-white text-[#1E293B]"
                    }`}
                  >
                    <span className="font-mono font-bold mr-1.5">{String.fromCharCode(65 + optIdx)}:</span>
                    {opt}
                  </div>
                ))}
              </div>

              {q.explanation && (
                <p className="text-[11px] text-[#1E293B] bg-white p-2.5 rounded-xl border-2 border-[#1E293B]">
                  <span className="font-bold text-[#F5C842]">Explanation:</span> {q.explanation}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1 border-t-2 border-[#1E293B]/20">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionId === q.id}
                  onClick={() => handleReject(q.id)}
                  className="rounded-full h-8 text-xs bg-white text-[#FF6B5E] border-2 border-[#1E293B] hover:bg-[#FF6B5E]/10 px-3 font-head font-bold"
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Reject
                </Button>
                <Button
                  size="sm"
                  disabled={actionId === q.id}
                  onClick={() => handleApprove(q.id)}
                  className="rounded-full h-8 text-xs bg-[#4CAF7D] hover:bg-[#429E6F] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold px-3"
                >
                  <Check className="h-3.5 w-3.5 mr-1" /> Approve
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
