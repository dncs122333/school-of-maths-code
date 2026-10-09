import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import {
  Users,
  Plus,
  Copy,
  Orbit,
  Trophy,
  Award,
  TrendingDown,
  TrendingUp,
  Search,
  ChevronRight,
  Activity,
  Clock,
  BookOpen,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  FileQuestion,
  Layers,
  IndianRupee,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { CircularProgress } from "../components/dashboard/WeakTopicCard";

export default function Batches() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialBatchId = searchParams.get("batch_id") || "";

  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(initialBatchId);
  const [batchDetails, setBatchDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({ name: "", class_level: "10" });
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDrill, setStudentDrill] = useState(null);
  const [loadingDrill, setLoadingDrill] = useState(false);

  // Batch Students & Fees State
  const [batchStudentsData, setBatchStudentsData] = useState(null);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [activeTab, setActiveTab] = useState("roster"); // "roster" (Students & Fees) or "leaderboard"
  const [feeModal, setFeeModal] = useState({
    open: false,
    student: null,
    amount: "",
    total_fee: "",
    notes: "",
    saving: false,
  });

  // Load all batches
  const loadBatches = async () => {
    try {
      const res = await api.get("/batches");
      const list = res.data || [];
      setBatches(list);
      if (!selectedBatchId && list.length > 0) {
        // Default to first batch or initial query param
        const targetId = initialBatchId && list.some((b) => b.id === initialBatchId) ? initialBatchId : list[0].id;
        setSelectedBatchId(targetId);
      }
    } catch (err) {
      toast.error("Failed to load batches.");
    }
  };

  useEffect(() => {
    loadBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBatchStudents = async (bid) => {
    if (!bid) {
      setBatchStudentsData(null);
      return;
    }
    setLoadingStudents(true);
    try {
      const res = await api.get(`/batches/${bid}/students`);
      setBatchStudentsData(res.data);
    } catch (err) {
      // ignore
    } finally {
      setLoadingStudents(false);
    }
  };

  // Fetch student roster and mastery data for the selected batch
  useEffect(() => {
    if (!selectedBatchId) {
      setBatchDetails(null);
      setBatchStudentsData(null);
      return;
    }
    setLoadingDetails(true);
    api.get("/mastery/teacher", { params: { batch_id: selectedBatchId } })
      .then((res) => {
        setBatchDetails(res.data);
      })
      .catch((err) => {
        toast.error(formatApiErrorDetail(err.response?.data?.detail));
        setBatchDetails(null);
      })
      .finally(() => setLoadingDetails(false));

    loadBatchStudents(selectedBatchId);
  }, [selectedBatchId]);

  const handleOpenFeeModal = (student) => {
    setFeeModal({
      open: true,
      student,
      amount: "",
      total_fee: student.total_fee || 5000,
      notes: "",
      saving: false,
    });
  };

  const handleSaveFee = async (markAsPaid = false) => {
    if (!feeModal.student || !selectedBatchId) return;
    setFeeModal((prev) => ({ ...prev, saving: true }));
    try {
      const payload = {
        amount: markAsPaid ? undefined : (feeModal.amount ? Number(feeModal.amount) : undefined),
        total_fee: feeModal.total_fee ? Number(feeModal.total_fee) : undefined,
        mark_as_paid: markAsPaid,
        notes: feeModal.notes,
      };
      await api.post(`/batches/${selectedBatchId}/students/${feeModal.student.id}/fee`, payload);
      toast.success(markAsPaid ? `Marked ${feeModal.student.name} as paid in full!` : `Payment recorded for ${feeModal.student.name}!`);
      setFeeModal({ open: false, student: null, amount: "", total_fee: "", notes: "", saving: false });
      await loadBatchStudents(selectedBatchId);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to update fee record");
      setFeeModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const handleQuickMarkPaid = async (student) => {
    if (!selectedBatchId) return;
    try {
      await api.post(`/batches/${selectedBatchId}/students/${student.id}/fee`, { mark_as_paid: true });
      toast.success(`Marked ${student.name} as paid in full!`);
      await loadBatchStudents(selectedBatchId);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to mark paid");
    }
  };

  // Create new batch
  const handleCreateBatch = async () => {
    if (!form.name.trim()) {
      toast.error("Please enter a batch name.");
      return;
    }
    try {
      const res = await api.post("/batches", form);
      toast.success(`Batch "${res.data.name}" created!`);
      setOpenCreate(false);
      setForm({ name: "", class_level: "10" });
      await loadBatches();
      setSelectedBatchId(res.data.id);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    toast.success(`Batch code "${code}" copied to clipboard!`);
  };

  // Open detailed analysis modal for a student
  const handleOpenStudentAnalysis = async (st) => {
    setSelectedStudent(st);
    setLoadingDrill(true);
    try {
      const res = await api.get(`/mastery/teacher/student/${st.id}`);
      setStudentDrill(res.data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setLoadingDrill(false);
    }
  };

  // Selected batch object
  const currentBatch = useMemo(() => {
    return batches.find((b) => b.id === selectedBatchId) || batches[0];
  }, [batches, selectedBatchId]);

  // Process & rank students in current batch
  const rankedStudents = useMemo(() => {
    const rawList = batchDetails?.students || [];
    const processed = rawList.map((s) => {
      const topics = s.topics || [];
      const totalScore = topics.reduce((acc, t) => acc + (t.score || 0), 0);
      const overall = topics.length > 0 ? Math.round(totalScore / topics.length) : 0;
      const weakTopics = topics.filter((t) => t.band === "weak" || (t.score !== undefined && t.score < 55));
      const strongTopics = topics.filter((t) => t.band === "strong" || (t.score !== undefined && t.score >= 75));
      return {
        ...s,
        overall,
        weakCount: weakTopics.length,
        strongCount: strongTopics.length,
        topicCount: topics.length,
        weakestTopicName: weakTopics.length > 0 ? weakTopics[0].topic : null,
      };
    });

    // Sort by overall mastery descending to calculate ranks
    processed.sort((a, b) => b.overall - a.overall);

    return processed.map((s, idx) => ({
      ...s,
      rank: idx + 1,
    }));
  }, [batchDetails]);

  // Filter students by search
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return rankedStudents;
    return rankedStudents.filter((st) =>
      (st.name || "").toLowerCase().includes(studentSearch.toLowerCase().trim())
    );
  }, [rankedStudents, studentSearch]);

  // Filter enrolled roster students for fee section
  const rosterStudents = useMemo(() => {
    const list = batchStudentsData?.students || [];
    if (!studentSearch.trim()) return list;
    const q = studentSearch.toLowerCase().trim();
    return list.filter((st) =>
      (st.name || "").toLowerCase().includes(q) || (st.email || "").toLowerCase().includes(q)
    );
  }, [batchStudentsData, studentSearch]);

  const inp = "rounded-xl mt-1.5 bg-[#0B0F19] border-[#1E293B] text-white";

  return (
    <div className="space-y-8 pb-16">
      {/* 1. Header & Create Batch Action */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-[#06B6D4] font-700 font-mono">
              Cohort Management
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#06B6D4]" />
            <span className="text-xs text-[#94A3B8] font-mono">{batches.length} Active Batches</span>
          </div>
          <h1 className="font-head text-3xl sm:text-4xl font-800 tracking-tight text-white mt-1">
            Active Coaching Batches
          </h1>
          <p className="text-[#94A3B8] text-sm mt-1">
            View enrolled students, batch leaderboard rankings, and in-depth student concept analysis.
          </p>
        </div>

        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button className="rounded-full bg-[#3B82F6] hover:bg-[#60A5FA] text-white font-800 text-sm h-11 px-6 glow-blue shadow-lg shadow-[#3B82F6]/25 shrink-0">
              <Plus className="h-4 w-4 mr-1.5" /> Create New Batch
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl border border-[#1E293B] bg-[#111827] text-white max-w-md p-6 sm:p-8">
            <DialogHeader>
              <DialogTitle className="font-head text-2xl font-800 text-white">Create a Coaching Batch</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-3">
              <div>
                <Label className="font-600 text-xs text-[#94A3B8] uppercase">Batch Name</Label>
                <Input
                  className={inp}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Class 10 — Newton Scholars"
                />
              </div>
              <div>
                <Label className="font-600 text-xs text-[#94A3B8] uppercase">CBSE Class Level</Label>
                <Select
                  value={form.class_level}
                  onValueChange={(v) => setForm({ ...form, class_level: v })}
                >
                  <SelectTrigger className={inp}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111827] border-[#1E293B] text-white">
                    <SelectItem value="9">Class 9</SelectItem>
                    <SelectItem value="10">Class 10</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleCreateBatch}
                className="rounded-full bg-[#3B82F6] hover:bg-[#60A5FA] text-white font-800 w-full h-11 glow-blue"
              >
                Create Batch & Generate Code
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 2. Active Batches Selection Cards */}
      {batches.length === 0 ? (
        <div className="rounded-3xl glass-panel p-16 text-center border border-dashed border-[#1E293B] space-y-3">
          <Users className="h-12 w-12 mx-auto text-[#94A3B8]/40" />
          <h3 className="font-head text-lg font-700 text-white">No coaching batches created yet</h3>
          <p className="text-xs text-[#94A3B8] max-w-md mx-auto">
            Create your first batch above, and share the auto-generated 6-character code with your students.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {batches.map((b) => {
            const isSelected = selectedBatchId === b.id;
            return (
              <div
                key={b.id}
                onClick={() => setSelectedBatchId(b.id)}
                className={`group cursor-pointer rounded-3xl p-5 sm:p-6 transition-all duration-300 border relative overflow-hidden flex flex-col justify-between ${
                  isSelected
                    ? "bg-gradient-to-b from-[#172554]/90 to-[#0F172A] border-[#3B82F6] shadow-xl shadow-[#3B82F6]/15 ring-1 ring-[#3B82F6]"
                    : "glass-panel-interactive border-[#1E293B] hover:border-[#3B82F6]/50"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-2xl bg-[#0B0F19] border border-[#06B6D4]/30 flex items-center justify-center">
                      <Orbit className="h-5 w-5 text-[#06B6D4]" />
                    </div>
                    <Badge className="bg-[#3B82F6]/15 text-[#60A5FA] border-[#3B82F6]/30 text-xs font-mono font-700 px-2.5 py-0.5">
                      Class {b.class_level}
                    </Badge>
                  </div>

                  <h3 className="font-head text-lg font-700 text-white mt-4 truncate group-hover:text-[#60A5FA] transition-colors">
                    {b.name}
                  </h3>

                  <div className="text-xs text-[#94A3B8] flex items-center gap-1.5 mt-1 font-mono">
                    <Users className="h-3.5 w-3.5 text-[#3B82F6]" />
                    <span className="text-white font-700">{b.student_count || 0}</span> students enrolled
                  </div>
                </div>

                <div className="mt-4 pt-3.5 border-t border-[#1E293B]/70 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-[#94A3B8] font-mono">
                    Code:{" "}
                    <code className="text-[#3B82F6] font-bold bg-[#0B0F19] px-2 py-0.5 rounded border border-[#1E293B]">
                      {b.code}
                    </code>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyCode(b.code);
                    }}
                    className="h-8 px-2.5 rounded-xl text-[#94A3B8] hover:text-white hover:bg-white/5 text-xs"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. Batch Leaderboard & Enrolled Students Roster with Fee Status (Tier 2) */}
      {currentBatch && (
        <div className="rounded-3xl glass-panel p-6 sm:p-8 space-y-6 border border-[#1E293B] shadow-2xl">
          {/* Header of Selected Batch */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1E293B]">
            <div>
              <div className="flex items-center gap-2">
                <Badge className="bg-[#06B6D4]/15 text-[#22D3EE] border-[#06B6D4]/30 text-xs font-mono font-700">
                  Class {currentBatch.class_level} Cohort
                </Badge>
                <span className="text-xs text-[#94A3B8] font-mono">
                  Join Code: <span className="text-white font-bold">{currentBatch.code}</span>
                </span>
              </div>
              <h2 className="font-head text-2xl sm:text-3xl font-800 text-white mt-1">
                {currentBatch.name}
              </h2>
            </div>

            {/* Live Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
              <Input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search student in batch…"
                className="pl-10 rounded-2xl bg-[#0B0F19] border-[#1E293B] text-white text-xs h-10 placeholder:text-[#94A3B8]/60 focus:border-[#3B82F6]"
              />
            </div>
          </div>

          {/* Quick Metrics Strip: Students & Fees */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-[#0B0F19]/90 border border-[#1E293B]">
              <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                <span className="font-mono uppercase tracking-wider text-[10px]">Enrolled Students</span>
                <Users className="h-4 w-4 text-[#3B82F6]" />
              </div>
              <div className="font-head text-2xl font-800 text-white mt-1">
                {batchStudentsData?.summary?.total_students ?? currentBatch.student_count ?? 0}
              </div>
              <div className="text-[11px] text-[#94A3B8] font-mono mt-0.5">Active in this cohort</div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0B0F19]/90 border border-[#1E293B]">
              <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                <span className="font-mono uppercase tracking-wider text-[10px]">Fees Collected</span>
                <IndianRupee className="h-4 w-4 text-[#34D399]" />
              </div>
              <div className="font-head text-2xl font-800 text-[#34D399] mt-1">
                ₹{(batchStudentsData?.summary?.total_collected ?? 0).toLocaleString()}
              </div>
              <div className="text-[11px] text-[#34D399] font-mono mt-0.5">
                {batchStudentsData?.summary?.paid_count || 0} fully paid
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0B0F19]/90 border border-[#1E293B]">
              <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                <span className="font-mono uppercase tracking-wider text-[10px]">Total Dues</span>
                <Clock className="h-4 w-4 text-[#F87171]" />
              </div>
              <div className="font-head text-2xl font-800 text-[#F87171] mt-1">
                ₹{(batchStudentsData?.summary?.total_dues ?? 0).toLocaleString()}
              </div>
              <div className="text-[11px] text-[#F87171] font-mono mt-0.5">
                {(batchStudentsData?.summary?.due_count || 0) + (batchStudentsData?.summary?.partial_count || 0)} pending
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0B0F19]/90 border border-[#1E293B]">
              <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                <span className="font-mono uppercase tracking-wider text-[10px]">Collection Status</span>
                <CheckCircle2 className="h-4 w-4 text-[#FBBF24]" />
              </div>
              <div className="font-head text-lg font-700 text-white mt-1.5 flex items-center gap-1.5 flex-wrap">
                <span className="text-[#34D399] text-sm font-bold">{batchStudentsData?.summary?.paid_count || 0} Paid</span>
                <span className="text-[#94A3B8]">•</span>
                <span className="text-[#FBBF24] text-sm font-bold">{batchStudentsData?.summary?.partial_count || 0} Part</span>
                <span className="text-[#94A3B8]">•</span>
                <span className="text-[#F87171] text-sm font-bold">{batchStudentsData?.summary?.due_count || 0} Due</span>
              </div>
              <div className="text-[11px] text-[#94A3B8] font-mono mt-0.5">Across cohort members</div>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex items-center gap-2 border-b border-[#1E293B] pb-3">
            <button
              type="button"
              data-testid="tab-students-fees"
              onClick={() => setActiveTab("roster")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-700 transition-all ${
                activeTab === "roster"
                  ? "bg-[#3B82F6] text-white shadow-lg shadow-[#3B82F6]/25"
                  : "bg-[#111827] text-[#94A3B8] hover:text-white hover:bg-[#1E293B] border border-[#1E293B]"
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Students &amp; Fee Status</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                activeTab === "roster" ? "bg-white/20 text-white" : "bg-[#1E293B] text-[#94A3B8]"
              }`}>
                {rosterStudents.length}
              </span>
            </button>

            <button
              type="button"
              data-testid="tab-mastery-leaderboard"
              onClick={() => setActiveTab("leaderboard")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-700 transition-all ${
                activeTab === "leaderboard"
                  ? "bg-[#3B82F6] text-white shadow-lg shadow-[#3B82F6]/25"
                  : "bg-[#111827] text-[#94A3B8] hover:text-white hover:bg-[#1E293B] border border-[#1E293B]"
              }`}
            >
              <Trophy className="h-4 w-4 text-[#FBBF24]" />
              <span>Academic Leaderboard</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                activeTab === "leaderboard" ? "bg-white/20 text-white" : "bg-[#1E293B] text-[#94A3B8]"
              }`}>
                {filteredStudents.length}
              </span>
            </button>
          </div>

          {/* VIEW 1: STUDENTS & FEE ROSTER */}
          {activeTab === "roster" && (
            loadingStudents ? (
              <div className="rounded-2xl bg-[#0B0F19] border border-[#1E293B] p-16 text-center text-[#94A3B8] flex items-center justify-center gap-2.5">
                <span className="h-5 w-5 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
                <span className="font-mono text-sm">Loading enrolled students and fee records…</span>
              </div>
            ) : rosterStudents.length === 0 ? (
              <div className="rounded-2xl bg-[#0B0F19] border border-[#1E293B] p-12 text-center space-y-2 text-[#94A3B8]">
                <Users className="h-9 w-9 mx-auto text-[#06B6D4] opacity-50" />
                <h4 className="font-head text-lg font-700 text-white">No students enrolled yet</h4>
                <p className="text-xs max-w-sm mx-auto leading-relaxed">
                  Give your students batch code <span className="font-mono text-white font-bold">{currentBatch.code}</span> to join this cohort.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-[#94A3B8] font-mono flex items-center justify-between px-2">
                  <span>Enrolled Roster: {rosterStudents.length} students</span>
                  <span>Click Record Payment to update fees</span>
                </div>

                <div className="space-y-2.5">
                  {rosterStudents.map((st) => {
                    const isPaid = st.status === "paid" || st.due_fee === 0;
                    const isPartial = st.status === "partial" || (st.paid_fee > 0 && st.due_fee > 0);

                    return (
                      <div
                        key={st.id}
                        data-testid={`student-fee-card-${st.id}`}
                        className="rounded-2xl p-4 sm:p-5 bg-[#0B0F19]/90 border border-[#1E293B] hover:border-[#3B82F6]/50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
                      >
                        {/* Student Info */}
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="h-11 w-11 rounded-2xl bg-[#1E293B]/80 border border-[#3B82F6]/30 flex items-center justify-center font-head font-800 text-base text-[#60A5FA] shrink-0">
                            {st.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-head text-base font-700 text-white truncate">
                              {st.name}
                            </h4>
                            <div className="text-xs text-[#94A3B8] font-mono truncate">
                              {st.email}
                            </div>
                            {st.last_payment_date && (
                              <div className="text-[10px] text-[#94A3B8]/70 font-mono mt-0.5">
                                Last payment: {new Date(st.last_payment_date).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Fee Status Breakdown & Actions */}
                        <div className="flex flex-wrap items-center justify-between md:justify-end gap-3 sm:gap-6 pt-3 md:pt-0 border-t md:border-t-0 border-[#1E293B]">
                          {/* Financials Numbers */}
                          <div className="flex items-center gap-4 sm:gap-6 font-mono text-right">
                            <div>
                              <span className="text-[10px] text-[#94A3B8] uppercase block">Total Fee</span>
                              <span className="text-xs sm:text-sm font-700 text-white">
                                ₹{Number(st.total_fee || 0).toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-[#94A3B8] uppercase block">Paid So Far</span>
                              <span className="text-xs sm:text-sm font-800 text-[#34D399]">
                                ₹{Number(st.paid_fee || 0).toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-[#94A3B8] uppercase block">Dues</span>
                              <span className={`text-xs sm:text-sm font-800 ${st.due_fee > 0 ? "text-[#F87171]" : "text-[#34D399]"}`}>
                                ₹{Number(st.due_fee || 0).toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {/* Fee Status Pill */}
                          <div className="shrink-0">
                            {isPaid ? (
                              <Badge className="bg-[#34D399]/15 text-[#34D399] border-[#34D399]/30 text-xs font-mono font-700 px-3 py-1 flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Fees Paid
                              </Badge>
                            ) : isPartial ? (
                              <Badge className="bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/30 text-xs font-mono font-700 px-3 py-1 flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" /> Partial Paid
                              </Badge>
                            ) : (
                              <Badge className="bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30 text-xs font-mono font-700 px-3 py-1 flex items-center gap-1">
                                <AlertCircle className="h-3.5 w-3.5" /> Fees Due
                              </Badge>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 shrink-0">
                            {!isPaid && (
                              <Button
                                size="sm"
                                data-testid={`quick-mark-paid-${st.id}`}
                                onClick={() => handleQuickMarkPaid(st)}
                                variant="outline"
                                className="h-8 px-2.5 rounded-xl border-[#34D399]/40 text-[#34D399] hover:bg-[#34D399]/10 text-xs font-700"
                                title="Mark full payment completed"
                              >
                                Mark Paid
                              </Button>
                            )}
                            <Button
                              size="sm"
                              data-testid={`record-fee-btn-${st.id}`}
                              onClick={() => handleOpenFeeModal(st)}
                              className="h-8 px-3 rounded-xl bg-[#3B82F6] hover:bg-[#60A5FA] text-white text-xs font-700 glow-blue flex items-center gap-1"
                            >
                              <IndianRupee className="h-3.5 w-3.5" /> Record Payment
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}

          {/* VIEW 2: ACADEMIC LEADERBOARD */}
          {activeTab === "leaderboard" && (
            loadingDetails ? (
              <div className="rounded-2xl bg-[#0B0F19] border border-[#1E293B] p-16 text-center text-[#94A3B8] flex items-center justify-center gap-2.5">
                <span className="h-5 w-5 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
                <span className="font-mono text-sm">Computing student rankings & topic metrics…</span>
              </div>
            ) : rankedStudents.length === 0 ? (
              <div className="rounded-2xl bg-[#0B0F19] border border-[#1E293B] p-12 text-center space-y-2 text-[#94A3B8]">
                <Users className="h-9 w-9 mx-auto text-[#06B6D4] opacity-50" />
                <h4 className="font-head text-lg font-700 text-white">No test submissions yet</h4>
                <p className="text-xs max-w-sm mx-auto leading-relaxed">
                  Once enrolled students submit tests, their ranks and concept analysis appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-[#94A3B8] font-mono flex items-center justify-between px-2">
                  <span>Showing {filteredStudents.length} of {rankedStudents.length} students</span>
                  <span>Click any student to view detailed diagnostic analysis ➔</span>
                </div>

                <div className="space-y-2.5">
                  {filteredStudents.map((st) => {
                    const isTop3 = st.rank <= 3;
                    const rankColor =
                      st.rank === 1
                        ? "bg-[#FBBF24]/20 border-[#FBBF24]/40 text-[#FBBF24]"
                        : st.rank === 2
                        ? "bg-[#E2E8F0]/20 border-[#E2E8F0]/40 text-[#E2E8F0]"
                        : st.rank === 3
                        ? "bg-[#B45309]/20 border-[#B45309]/40 text-[#D97706]"
                        : "bg-[#1E293B]/60 border-[#1E293B] text-[#94A3B8]";

                    const scoreColor =
                      st.overall >= 75
                        ? "text-[#34D399] bg-[#34D399]/15 border-[#34D399]/30"
                        : st.overall >= 55
                        ? "text-[#FBBF24] bg-[#FBBF24]/15 border-[#FBBF24]/30"
                        : "text-[#F87171] bg-[#F87171]/15 border-[#F87171]/30";

                    return (
                      <div
                        key={st.id}
                        onClick={() => handleOpenStudentAnalysis(st)}
                        className="group cursor-pointer rounded-2xl p-4 sm:p-5 bg-[#0B0F19]/90 border border-[#1E293B] hover:border-[#3B82F6]/50 hover:bg-[#172033]/80 transition-all hover:translate-x-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
                      >
                        {/* Rank + Student Info */}
                        <div className="flex items-center gap-4 min-w-0">
                          {/* Rank Badge */}
                          <div
                            className={`h-11 w-11 rounded-2xl flex items-center justify-center font-head font-800 text-base shrink-0 border shadow-md ${rankColor}`}
                          >
                            {isTop3 ? (
                              <Trophy className="h-5 w-5" />
                            ) : (
                              `#${st.rank}`
                            )}
                          </div>

                          {/* Student Name & Meta */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-head text-base sm:text-lg font-700 text-white truncate group-hover:text-[#60A5FA] transition-colors">
                                {st.name}
                              </h4>
                              {isTop3 && (
                                <Badge className="bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/30 text-[10px] font-700 font-mono">
                                  Top Tier
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-[#94A3B8] font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>{st.topicCount} topics tested</span>
                              <span>•</span>
                              <span className="text-[#34D399] font-600">{st.strongCount} strong</span>
                              <span>•</span>
                              <span className="text-[#F87171] font-600">{st.weakCount} weak</span>
                              {st.weakestTopicName && (
                                <>
                                  <span>•</span>
                                  <span className="text-[#F87171] truncate max-w-[200px]">
                                    Needs help in {st.weakestTopicName}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Accuracy Score Pill & Drilldown Arrow */}
                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#1E293B]">
                          <div className="text-right font-mono">
                            <div className="flex items-center gap-2">
                              <div className={`px-3 py-1.5 rounded-xl font-mono text-sm font-800 border ${scoreColor}`}>
                                {st.overall}%
                              </div>
                            </div>
                            <span className="text-[10px] text-[#94A3B8] uppercase block mt-0.5">Overall Accuracy</span>
                          </div>

                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-9 px-3 rounded-xl text-[#3B82F6] group-hover:bg-[#3B82F6]/10 text-xs font-700 flex items-center gap-1"
                          >
                            Analysis <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* 4. Student Deep-Dive Analysis Modal (Tier 3) */}
      <Dialog open={!!selectedStudent} onOpenChange={(open) => !open && setSelectedStudent(null)}>
        {selectedStudent && (
          <DialogContent className="bg-[#111827] border border-[#1E293B] text-white max-w-2xl rounded-3xl p-6 sm:p-8 max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-[#3B82F6]/20 border border-[#3B82F6]/40 flex items-center justify-center text-xl font-800 text-[#60A5FA] shrink-0">
                  {selectedStudent.name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-[#FBBF24]/20 text-[#FBBF24] border-[#FBBF24]/40 font-mono font-700 text-xs">
                      Rank #{selectedStudent.rank} in Batch
                    </Badge>
                    <span className="text-xs text-[#94A3B8] font-mono">{currentBatch?.name}</span>
                  </div>
                  <DialogTitle className="font-head text-2xl sm:text-3xl font-800 text-white mt-1 truncate">
                    {selectedStudent.name}
                  </DialogTitle>
                </div>
              </div>
            </DialogHeader>

            {loadingDrill ? (
              <div className="p-16 text-center text-xs text-[#94A3B8] flex items-center justify-center gap-2.5">
                <span className="h-5 w-5 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
                <span>Loading complete student diagnostic telemetry…</span>
              </div>
            ) : studentDrill ? (
              <div className="mt-6 space-y-6">
                {/* Score & Summary KPI Header */}
                <div className="p-5 rounded-3xl bg-[#0B0F19] border border-[#1E293B] flex flex-col sm:flex-row items-center justify-around gap-4">
                  <CircularProgress
                    score={selectedStudent.overall}
                    size={84}
                    strokeWidth={7}
                    color={
                      selectedStudent.overall >= 75
                        ? "#34D399"
                        : selectedStudent.overall >= 55
                        ? "#FBBF24"
                        : "#F87171"
                    }
                  />

                  <div className="grid grid-cols-2 gap-3 w-full sm:w-auto font-mono text-xs text-center sm:text-left">
                    <div className="p-3 rounded-2xl bg-[#111827] border border-[#1E293B]">
                      <span className="text-[#94A3B8] text-[10px] block uppercase">Assessments</span>
                      <span className="text-white font-800 text-base">{studentDrill.trend?.length || 0} completed</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-[#111827] border border-[#1E293B]">
                      <span className="text-[#94A3B8] text-[10px] block uppercase">Weak Concepts</span>
                      <span className="text-[#F87171] font-800 text-base">{selectedStudent.weakCount} flagged</span>
                    </div>
                  </div>
                </div>

                {/* Detailed Concept Breakdown List */}
                <div className="space-y-3">
                  <h4 className="text-xs uppercase font-700 tracking-wider text-[#06B6D4] font-mono">
                    Concept Mastery Calibration ({studentDrill.topics?.length || 0})
                  </h4>

                  {studentDrill.topics?.length === 0 ? (
                    <p className="text-xs text-[#94A3B8] p-4 bg-[#0B0F19] rounded-2xl border border-[#1E293B]">
                      No topic calibrations recorded yet.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {studentDrill.topics.map((t, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-2xl bg-[#0B0F19] border border-[#1E293B] flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="text-white font-700 truncate block">{t.topic}</span>
                            <span className="text-[11px] text-[#94A3B8] truncate block font-mono">
                              {t.subject} • {t.chapter} • {t.attempts} Qs
                            </span>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span
                              className={`font-mono font-800 px-2.5 py-1 rounded-xl ${
                                t.band === "weak"
                                  ? "text-[#F87171] bg-[#F87171]/15 border border-[#F87171]/30"
                                  : t.band === "strong"
                                  ? "text-[#34D399] bg-[#34D399]/15 border border-[#34D399]/30"
                                  : "text-[#FBBF24] bg-[#FBBF24]/15 border border-[#FBBF24]/30"
                              }`}
                            >
                              {t.score}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Assessment History Trend */}
                <div className="space-y-3">
                  <h4 className="text-xs uppercase font-700 tracking-wider text-[#06B6D4] font-mono">
                    Submission History Log ({studentDrill.trend?.length || 0})
                  </h4>

                  {studentDrill.trend?.length === 0 ? (
                    <p className="text-xs text-[#94A3B8]">No submissions recorded.</p>
                  ) : (
                    <div className="space-y-2">
                      {studentDrill.trend.slice(0, 5).map((tr, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-2xl bg-[#0B0F19] border border-[#1E293B] text-xs font-mono"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="text-white font-700 block truncate">{tr.title || "Assessment"}</span>
                            <span className="text-[#94A3B8] text-[11px]">
                              {tr.correct}/{tr.total} correct • {tr.kind === "dpp" ? "Chapterwise Practice" : "Timed Test"}
                            </span>
                          </div>
                          <span
                            className={`font-800 px-2.5 py-1 rounded-xl border shrink-0 ${
                              tr.score >= 75
                                ? "bg-[#34D399]/15 text-[#34D399] border-[#34D399]/30"
                                : tr.score >= 55
                                ? "bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/30"
                                : "bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30"
                            }`}
                          >
                            {tr.score}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Modal Footer Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1E293B]">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedStudent(null)}
                    className="rounded-full border-[#1E293B] text-[#94A3B8] hover:text-white"
                  >
                    Close
                  </Button>
                  <Button
                    asChild
                    className="rounded-full bg-[#3B82F6] hover:bg-[#60A5FA] text-white font-700 glow-blue"
                  >
                    <Link to="/dpp/new">
                      <Sparkles className="h-4 w-4 mr-1.5" /> Launch Chapterwise Test for Cohort
                    </Link>
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        )}
      </Dialog>

      {/* 5. Record / Update Fee Payment Modal */}
      <Dialog open={feeModal.open} onOpenChange={(open) => !open && setFeeModal((prev) => ({ ...prev, open: false }))}>
        {feeModal.student && (
          <DialogContent data-testid="fee-modal-content" className="bg-[#111827] border border-[#1E293B] text-white max-w-md rounded-3xl p-6 sm:p-7">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-[#3B82F6]/20 border border-[#3B82F6]/40 flex items-center justify-center text-[#60A5FA]">
                  <IndianRupee className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="font-head text-xl font-800 text-white">
                    Record Fee Payment
                  </DialogTitle>
                  <p className="text-xs text-[#94A3B8] font-mono mt-0.5 truncate max-w-[280px]">
                    {feeModal.student.name} • {feeModal.student.email}
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Snapshot Numbers */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-[#0B0F19] border border-[#1E293B] text-center font-mono">
                <div>
                  <span className="text-[10px] text-[#94A3B8] uppercase block">Total Fee</span>
                  <span className="text-sm font-800 text-white">₹{Number(feeModal.total_fee || feeModal.student.total_fee || 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#94A3B8] uppercase block">Paid So Far</span>
                  <span className="text-sm font-800 text-[#34D399]">₹{Number(feeModal.student.paid_fee || 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#94A3B8] uppercase block">Current Due</span>
                  <span className="text-sm font-800 text-[#F87171]">₹{Number(feeModal.student.due_fee || 0).toLocaleString()}</span>
                </div>
              </div>

              {/* Amount Receiving */}
              <div>
                <Label className="text-xs font-600 text-[#94A3B8]">Payment Amount Receiving (₹)</Label>
                <div className="relative mt-1.5">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8] font-mono">₹</span>
                  <Input
                    data-testid="fee-amount-input"
                    type="number"
                    min={0}
                    value={feeModal.amount}
                    onChange={(e) => setFeeModal((prev) => ({ ...prev, amount: e.target.value }))}
                    placeholder={`e.g. ${feeModal.student.due_fee > 0 ? feeModal.student.due_fee : 1000}`}
                    className="pl-8 rounded-xl bg-[#0B0F19] border-[#1E293B] text-white font-mono text-sm"
                  />
                </div>
                {/* Quick suggestion buttons */}
                {feeModal.student.due_fee > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setFeeModal((prev) => ({ ...prev, amount: String(feeModal.student.due_fee) }))}
                      className="px-2.5 py-1 rounded-lg bg-[#3B82F6]/15 hover:bg-[#3B82F6]/30 text-[#60A5FA] border border-[#3B82F6]/30 text-[11px] font-mono transition-colors"
                    >
                      Clear Due: ₹{feeModal.student.due_fee}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFeeModal((prev) => ({ ...prev, amount: "1000" }))}
                      className="px-2.5 py-1 rounded-lg bg-[#1E293B] hover:bg-[#334155] text-[#94A3B8] text-[11px] font-mono transition-colors"
                    >
                      +₹1,000
                    </button>
                    <button
                      type="button"
                      onClick={() => setFeeModal((prev) => ({ ...prev, amount: "2000" }))}
                      className="px-2.5 py-1 rounded-lg bg-[#1E293B] hover:bg-[#334155] text-[#94A3B8] text-[11px] font-mono transition-colors"
                    >
                      +₹2,000
                    </button>
                  </div>
                )}
              </div>

              {/* Total Fee Adjuster */}
              <div>
                <Label className="text-xs font-600 text-[#94A3B8]">
                  Total Batch Fee (₹) <span className="text-[#94A3B8]/50 font-normal">(change if discount or revised)</span>
                </Label>
                <div className="relative mt-1.5">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8] font-mono">₹</span>
                  <Input
                    data-testid="fee-total-input"
                    type="number"
                    min={0}
                    value={feeModal.total_fee}
                    onChange={(e) => setFeeModal((prev) => ({ ...prev, total_fee: e.target.value }))}
                    className="pl-8 rounded-xl bg-[#0B0F19] border-[#1E293B] text-white font-mono text-sm"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label className="text-xs font-600 text-[#94A3B8]">
                  Payment Notes / Reference <span className="text-[#94A3B8]/50 font-normal">(optional)</span>
                </Label>
                <Input
                  data-testid="fee-notes-input"
                  value={feeModal.notes}
                  onChange={(e) => setFeeModal((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Cash, UPI #78392, or October Tuition"
                  className="mt-1.5 rounded-xl bg-[#0B0F19] border-[#1E293B] text-white text-xs"
                />
              </div>

              {/* Previous Payments History */}
              {feeModal.student.payments?.length > 0 && (
                <div className="pt-1">
                  <span className="text-[10px] uppercase font-mono text-[#94A3B8] block mb-1">Payment History:</span>
                  <div className="max-h-20 overflow-y-auto space-y-1 rounded-xl bg-[#0B0F19] p-2 border border-[#1E293B]">
                    {feeModal.student.payments.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs font-mono text-[#94A3B8]">
                        <span>₹{Number(p.amount || 0).toLocaleString()} — {p.notes || "Received"}</span>
                        <span className="text-[10px] text-[#94A3B8]/60">{new Date(p.date).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 pt-2 border-t border-[#1E293B]">
              <Button
                variant="outline"
                onClick={() => setFeeModal((prev) => ({ ...prev, open: false }))}
                className="rounded-full border-[#1E293B] text-[#94A3B8] hover:text-white"
              >
                Cancel
              </Button>
              {feeModal.student.due_fee > 0 && (
                <Button
                  type="button"
                  data-testid="mark-paid-full-btn"
                  onClick={() => handleSaveFee(true)}
                  disabled={feeModal.saving}
                  className="rounded-full bg-[#10B981] hover:bg-[#059669] text-white font-700 text-xs"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Mark Paid in Full
                </Button>
              )}
              <Button
                type="button"
                data-testid="save-fee-payment-btn"
                onClick={() => handleSaveFee(false)}
                disabled={feeModal.saving || (!feeModal.amount && feeModal.total_fee === feeModal.student.total_fee)}
                className="rounded-full bg-[#3B82F6] hover:bg-[#60A5FA] text-white font-700 glow-blue text-xs"
              >
                {feeModal.saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <IndianRupee className="h-4 w-4 mr-1" />}
                Save Payment
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
