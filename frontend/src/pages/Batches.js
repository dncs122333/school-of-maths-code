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
  Pencil,
  Calendar,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Check,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { CircularProgress } from "../components/dashboard/WeakTopicCard";

const ACADEMIC_MONTHS = [
  "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "January", "February", "March"
];

const makeDefaultSchedule = (monthly = 5000) =>
  ACADEMIC_MONTHS.map((m) => ({ month: m, amount: String(monthly || 0) }));

export default function Batches() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialBatchId = searchParams.get("batch_id") || "";

  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(initialBatchId);
  const [batchDetails, setBatchDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    class_level: "10",
    fee_amount: "60000",
    monthly_fee: "5000",
    show_advance: false,
    fee_schedule: makeDefaultSchedule(5000),
  });
  const [editModal, setEditModal] = useState({
    open: false,
    batchId: null,
    name: "",
    class_level: "10",
    fee_amount: "60000",
    monthly_fee: "5000",
    show_advance: false,
    fee_schedule: makeDefaultSchedule(5000),
    saving: false,
  });
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
    total_fee: "",
    paid_fee: "",
    due_fee: "",
    show_advance: false,
    fee_schedule: [],
    _scheduleCustomized: false,
    editPaidMode: false,
    editDueMode: false,
    saving: false,
  });
  const [partialModal, setPartialModal] = useState({
    open: false,
    student: null,
    month: "",
    scheduledAmount: 0,
    paidSoFar: 0,
    remainingDue: 0,
    partialAmount: "",
    notes: "",
    payment_date: new Date().toISOString().slice(0, 10),
    saving: false,
  });
  const [selectedMonthsMap, setSelectedMonthsMap] = useState({}); // { [studentId]: string[] }
  const [unmarkModal, setUnmarkModal] = useState({
    open: false,
    student: null,
    month: "",
    amount: 0,
    collection_date: "",
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

  const handleOpenEditBatch = (b) => {
    const fAmt = b.fee_amount !== undefined && b.fee_amount !== null ? String(b.fee_amount) : "60000";
    const mAmt = b.monthly_fee !== undefined && b.monthly_fee !== null ? String(b.monthly_fee) : "5000";
    const existingSched = b.fee_schedule && b.fee_schedule.length > 0
      ? b.fee_schedule.map((item) => ({ month: item.month, amount: String(item.amount) }))
      : makeDefaultSchedule(Number(mAmt) || 5000);

    setEditModal({
      open: true,
      batchId: b.id,
      name: b.name || "",
      class_level: String(b.class_level || "10"),
      fee_amount: fAmt,
      monthly_fee: mAmt,
      show_advance: false,
      fee_schedule: existingSched,
      saving: false,
    });
  };

  const handleSaveEditBatch = async () => {
    if (!editModal.name.trim()) {
      toast.error("Please enter a batch name.");
      return;
    }
    setEditModal((prev) => ({ ...prev, saving: true }));
    try {
      const payload = {
        name: editModal.name.trim(),
        class_level: editModal.class_level,
        fee_amount: Number(editModal.fee_amount) || 0,
        monthly_fee: Number(editModal.monthly_fee) || 0,
        fee_schedule: editModal.fee_schedule.map((s) => ({
          month: s.month,
          amount: Number(s.amount) || 0,
        })),
      };
      await api.put(`/batches/${editModal.batchId}`, payload);
      toast.success("Batch details updated successfully!");
      setEditModal((prev) => ({ ...prev, open: false, saving: false }));
      await loadBatches();
      await loadBatchStudents(editModal.batchId);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to update batch");
      setEditModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const handleDistributeSchedule = (isEdit = false) => {
    if (isEdit) {
      const mAmt = editModal.monthly_fee || (editModal.fee_amount ? Math.round(Number(editModal.fee_amount) / 12) : 5000);
      setEditModal((prev) => ({
        ...prev,
        _scheduleCustomized: false,
        fee_schedule: ACADEMIC_MONTHS.map((m) => ({ month: m, amount: String(mAmt) })),
      }));
    } else {
      const mAmt = form.monthly_fee || (form.fee_amount ? Math.round(Number(form.fee_amount) / 12) : 5000);
      setForm((prev) => ({
        ...prev,
        _scheduleCustomized: false,
        fee_schedule: ACADEMIC_MONTHS.map((m) => ({ month: m, amount: String(mAmt) })),
      }));
    }
  };

  const handleUpdateMonthAmount = (monthName, val, isEdit = false) => {
    if (isEdit) {
      setEditModal((prev) => ({
        ...prev,
        _scheduleCustomized: true,
        fee_schedule: prev.fee_schedule.map((it) => (it.month === monthName ? { ...it, amount: val } : it)),
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        _scheduleCustomized: true,
        fee_schedule: prev.fee_schedule.map((it) => (it.month === monthName ? { ...it, amount: val } : it)),
      }));
    }
  };

  const calculateProportionalSchedule = (baseSchedule, targetTotal) => {
    const target = Math.max(0, Number(targetTotal) || 0);
    const base = baseSchedule && baseSchedule.length > 0
      ? baseSchedule
      : ACADEMIC_MONTHS.map((m) => ({ month: m, amount: "5000" }));
    const baseSum = base.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
    const n = base.length;

    if (baseSum > 0) {
      let allocated = 0;
      return base.map((it, idx) => {
        if (idx === n - 1) {
          const lastAmt = Math.max(0, target - allocated);
          return { month: it.month, amount: String(Math.round(lastAmt)) };
        }
        const ratio = (Number(it.amount) || 0) / baseSum;
        const amt = Math.round(target * ratio);
        allocated += amt;
        return { month: it.month, amount: String(amt) };
      });
    } else {
      const perMonth = Math.round(target / n);
      let allocated = 0;
      return base.map((it, idx) => {
        if (idx === n - 1) {
          const lastAmt = Math.max(0, target - allocated);
          return { month: it.month, amount: String(Math.round(lastAmt)) };
        }
        allocated += perMonth;
        return { month: it.month, amount: String(perMonth) };
      });
    }
  };

  const handleOpenFeeModal = (student) => {
    const sTotal = student.total_fee !== undefined && student.total_fee !== null ? Number(student.total_fee) : (batchStudentsData?.fee_amount || 60000);
    const sPaid = student.paid_fee !== undefined && student.paid_fee !== null ? Number(student.paid_fee) : 0;
    const sDue = student.due_fee !== undefined && student.due_fee !== null ? Number(student.due_fee) : Math.max(0, sTotal - sPaid);

    const baseSched = (student.fee_schedule && student.fee_schedule.length > 0)
      ? student.fee_schedule
      : (batchStudentsData?.fee_schedule || makeDefaultSchedule(Math.round(sTotal / 12) || 5000));
    const initialSched = calculateProportionalSchedule(baseSched, sTotal);

    setFeeModal({
      open: true,
      student,
      total_fee: String(sTotal),
      paid_fee: String(sPaid),
      due_fee: String(sDue),
      show_advance: false,
      fee_schedule: initialSched,
      _scheduleCustomized: false,
      editPaidMode: false,
      editDueMode: false,
      saving: false,
    });
  };

  const handleStudentTotalFeeChange = (val) => {
    setFeeModal((prev) => {
      const newTotal = Math.max(0, Number(val) || 0);
      const paidNum = Number(prev.paid_fee) || 0;
      const newDue = Math.max(0, newTotal - paidNum);
      const baseSched = prev._scheduleCustomized && prev.fee_schedule?.length > 0
        ? prev.fee_schedule
        : (batchStudentsData?.fee_schedule || prev.fee_schedule);
      const updatedSched = calculateProportionalSchedule(baseSched, newTotal);
      return {
        ...prev,
        total_fee: val,
        due_fee: String(newDue),
        fee_schedule: updatedSched,
      };
    });
  };

  const handlePaidFeeChange = (val) => {
    setFeeModal((prev) => {
      const paidNum = Math.max(0, Number(val) || 0);
      const totalNum = Math.max(0, Number(prev.total_fee) || 0);
      const newDue = Math.max(0, totalNum - paidNum);
      return {
        ...prev,
        paid_fee: val,
        due_fee: String(newDue),
      };
    });
  };

  const handleDueFeeChange = (val) => {
    setFeeModal((prev) => {
      const dueNum = Math.max(0, Number(val) || 0);
      const totalNum = Math.max(0, Number(prev.total_fee) || 0);
      const newPaid = Math.max(0, totalNum - dueNum);
      return {
        ...prev,
        due_fee: val,
        paid_fee: String(newPaid),
      };
    });
  };

  const handleDistributeStudentScheduleEvenly = () => {
    setFeeModal((prev) => {
      const tot = Math.max(0, Number(prev.total_fee) || 0);
      const perMonth = Math.round(tot / 12);
      let allocated = 0;
      const updated = ACADEMIC_MONTHS.map((m, idx) => {
        if (idx === 11) {
          return { month: m, amount: String(Math.max(0, tot - allocated)) };
        }
        allocated += perMonth;
        return { month: m, amount: String(perMonth) };
      });
      return {
        ...prev,
        _scheduleCustomized: false,
        fee_schedule: updated,
      };
    });
  };

  const handleResetStudentScheduleToBatch = () => {
    setFeeModal((prev) => {
      const tot = Math.max(0, Number(prev.total_fee) || 0);
      const batchSched = batchStudentsData?.fee_schedule || makeDefaultSchedule(5000);
      const updated = calculateProportionalSchedule(batchSched, tot);
      return {
        ...prev,
        _scheduleCustomized: false,
        fee_schedule: updated,
      };
    });
  };

  const handleUpdateStudentMonthAmount = (monthName, val) => {
    setFeeModal((prev) => ({
      ...prev,
      _scheduleCustomized: true,
      fee_schedule: (prev.fee_schedule || []).map((it) =>
        it.month === monthName ? { ...it, amount: val } : it
      ),
    }));
  };

  const handleSaveFee = async (markAsPaid = false) => {
    if (!feeModal.student || !selectedBatchId) return;
    setFeeModal((prev) => ({ ...prev, saving: true }));
    try {
      const totalNum = feeModal.total_fee !== "" && feeModal.total_fee !== undefined ? Number(feeModal.total_fee) : undefined;
      const paidNum = markAsPaid ? totalNum : (feeModal.paid_fee !== "" && feeModal.paid_fee !== undefined ? Number(feeModal.paid_fee) : undefined);
      const dueNum = markAsPaid ? 0 : (feeModal.due_fee !== "" && feeModal.due_fee !== undefined ? Number(feeModal.due_fee) : undefined);

      const payload = {
        total_fee: totalNum,
        paid_fee: paidNum,
        due_fee: dueNum,
        mark_as_paid: markAsPaid,
        fee_schedule: feeModal.fee_schedule ? feeModal.fee_schedule.map((s) => ({
          month: s.month,
          amount: Number(s.amount) || 0,
        })) : undefined,
      };
      await api.post(`/batches/${selectedBatchId}/students/${feeModal.student.id}/fee`, payload);
      toast.success(
        markAsPaid
          ? `Marked ${feeModal.student.name} as paid in full!`
          : `Fee record updated for ${feeModal.student.name}!`
      );
      setFeeModal({
        open: false,
        student: null,
        total_fee: "",
        paid_fee: "",
        due_fee: "",
        show_advance: false,
        fee_schedule: [],
        _scheduleCustomized: false,
        editPaidMode: false,
        editDueMode: false,
        saving: false,
      });
      await loadBatchStudents(selectedBatchId);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to update fee record");
      setFeeModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const handleOpenPartialModal = (student, monthName) => {
    const schItem = student.monthly_status?.find((m) => m.month === monthName) ||
                    student.due_months?.find((m) => m.month === monthName);
    const schAmt = schItem ? Number(schItem.amount || 0) : 0;
    const paidAmt = schItem ? Number(schItem.paid_amount || 0) : 0;
    const remDue = schItem ? (schItem.due_amount !== undefined ? Number(schItem.due_amount) : Math.max(0, schAmt - paidAmt)) : schAmt;

    setPartialModal({
      open: true,
      student,
      month: monthName,
      scheduledAmount: schAmt,
      paidSoFar: paidAmt,
      remainingDue: remDue,
      partialAmount: String(remDue > 0 ? Math.round(remDue / 2) : schAmt),
      notes: `Partial payment for ${monthName}`,
      payment_date: new Date().toISOString().slice(0, 10),
      saving: false,
    });
  };

  const handleSavePartialPayment = async () => {
    if (!partialModal.student || !selectedBatchId || !partialModal.month) return;
    const amt = Number(partialModal.partialAmount);
    if (!amt || amt <= 0) {
      toast.error("Please enter a valid partial payment amount.");
      return;
    }
    setPartialModal((prev) => ({ ...prev, saving: true }));
    try {
      await api.post(`/batches/${selectedBatchId}/students/${partialModal.student.id}/fee`, {
        month: partialModal.month,
        amount: amt,
        is_partial: true,
        notes: partialModal.notes.trim(),
        payment_date: partialModal.payment_date ? new Date(partialModal.payment_date).toISOString() : undefined,
      });
      toast.success(`Recorded partial payment of ₹${amt.toLocaleString()} for ${partialModal.month}!`);
      setPartialModal({
        open: false,
        student: null,
        month: "",
        scheduledAmount: 0,
        paidSoFar: 0,
        remainingDue: 0,
        partialAmount: "",
        notes: "",
        payment_date: new Date().toISOString().slice(0, 10),
        saving: false,
      });
      handleClearMonthSelection(partialModal.student.id);
      await loadBatchStudents(selectedBatchId);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to record partial payment");
      setPartialModal((prev) => ({ ...prev, saving: false }));
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

  const handleToggleMonthSelection = (studentId, monthName) => {
    setSelectedMonthsMap((prev) => {
      const currentList = prev[studentId] || [];
      const exists = currentList.includes(monthName);
      const updated = exists ? currentList.filter((m) => m !== monthName) : [...currentList, monthName];
      return {
        ...prev,
        [studentId]: updated,
      };
    });
  };

  const handleClearMonthSelection = (studentId) => {
    setSelectedMonthsMap((prev) => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
  };

  const handleMarkSelectedMonthsPaid = async (student) => {
    if (!selectedBatchId || !student) return;
    const monthsToPay = selectedMonthsMap[student.id] || [];
    if (monthsToPay.length === 0) return;

    try {
      await api.post(`/batches/${selectedBatchId}/students/${student.id}/fee`, {
        months_paid: monthsToPay,
      });
      toast.success(`Marked ${monthsToPay.join(", ")} as paid for ${student.name}!`);
      handleClearMonthSelection(student.id);
      await loadBatchStudents(selectedBatchId);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to mark months as paid");
    }
  };

  const handleConfirmUnmark = async () => {
    if (!selectedBatchId || !unmarkModal.student || !unmarkModal.month) return;
    setUnmarkModal((prev) => ({ ...prev, saving: true }));
    try {
      await api.post(`/batches/${selectedBatchId}/students/${unmarkModal.student.id}/fee`, {
        unmark_month: unmarkModal.month,
      });
      toast.success(`Unmarked ${unmarkModal.month} as paid for ${unmarkModal.student.name}`);
      setUnmarkModal({ open: false, student: null, month: "", amount: 0, collection_date: "", notes: "", saving: false });
      await loadBatchStudents(selectedBatchId);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to unmark month");
      setUnmarkModal((prev) => ({ ...prev, saving: false }));
    }
  };

  // Create new batch
  const handleCreateBatch = async () => {
    if (!form.name.trim()) {
      toast.error("Please enter a batch name.");
      return;
    }
    try {
      const payload = {
        name: form.name.trim(),
        class_level: form.class_level,
        fee_amount: Number(form.fee_amount) || 0,
        monthly_fee: Number(form.monthly_fee) || 0,
        fee_schedule: form.fee_schedule.map((s) => ({
          month: s.month,
          amount: Number(s.amount) || 0,
        })),
      };
      const res = await api.post("/batches", payload);
      toast.success(`Batch "${res.data.name}" created!`);
      setOpenCreate(false);
      setForm({
        name: "",
        class_level: "10",
        fee_amount: "60000",
        monthly_fee: "5000",
        show_advance: false,
        fee_schedule: makeDefaultSchedule(5000),
      });
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

  const renderBatchFeeFields = (data, setter, isEdit = false) => {
    const scheduleSum = (data.fee_schedule || []).reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
    const totalAnnual = Number(data.fee_amount) || 0;
    const matches = scheduleSum === totalAnnual;

    return (
      <div className="space-y-4 pt-1">
        {/* Annual & Monthly Fee Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="font-600 text-xs text-[#94A3B8] uppercase">
              Total Annual Fees (Whole Year)
            </Label>
            <div className="relative mt-1.5">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8] font-mono">₹</span>
              <Input
                type="number"
                min={0}
                className="pl-8 rounded-xl bg-[#0B0F19] border-[#1E293B] text-white font-mono text-sm"
                value={data.fee_amount}
                onChange={(e) => {
                  const val = e.target.value;
                  const autoMonthly = val ? Math.round(Number(val) / 12) : 0;
                  const mVal = val ? String(autoMonthly) : "";
                  setter((prev) => {
                    // Only auto-update monthly_fee if user hasn't set it themselves
                    const newMonthly = prev.monthly_fee ? Number(prev.monthly_fee) : autoMonthly;
                    return {
                      ...prev,
                      fee_amount: val,
                      monthly_fee: prev.monthly_fee || mVal,
                      // Auto-redistribute schedule using current monthly_fee or derived monthly
                      fee_schedule: !prev._scheduleCustomized
                        ? ACADEMIC_MONTHS.map((m) => ({ month: m, amount: String(newMonthly || autoMonthly) }))
                        : prev.fee_schedule,
                    };
                  });
                }}
                placeholder="e.g. 60000"
              />
            </div>
            <span className="text-[10px] text-[#94A3B8]/70 mt-0.5 block">Full year total course fees</span>
          </div>

          <div>
            <Label className="font-600 text-xs text-[#94A3B8] uppercase">
              Monthly Payment (Installment)
            </Label>
            <div className="relative mt-1.5">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8] font-mono">₹</span>
              <Input
                type="number"
                min={0}
                className="pl-8 rounded-xl bg-[#0B0F19] border-[#1E293B] text-white font-mono text-sm"
                value={data.monthly_fee}
                onChange={(e) => {
                  const val = e.target.value;
                  const newAmt = Number(val) || 0;
                  setter((prev) => ({
                    ...prev,
                    monthly_fee: val,
                    // Auto-redistribute schedule to the new monthly amount (unless user customized per-month)
                    fee_schedule: !prev._scheduleCustomized
                      ? ACADEMIC_MONTHS.map((m) => ({ month: m, amount: String(newAmt) }))
                      : prev.fee_schedule,
                  }));
                }}
                placeholder="e.g. 5000"
              />
            </div>
            <span className="text-[10px] text-[#94A3B8]/70 mt-0.5 block">Default monthly installment</span>
          </div>
        </div>

        {/* Advance Option: Month-by-month Schedule Accordion */}
        <div className="rounded-2xl border border-[#1E293B] bg-[#0B0F19]/60 p-3.5 sm:p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setter((prev) => ({ ...prev, show_advance: !prev.show_advance }))}
              className="flex items-center gap-2 text-xs font-700 text-[#60A5FA] hover:text-[#93C5FD] transition-colors"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Advance: Custom Monthly Schedule</span>
              {data.show_advance ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleDistributeSchedule(isEdit)}
              className="h-7 px-2 text-[10px] font-mono border-[#1E293B] text-[#94A3B8] hover:text-white rounded-lg"
              title="Auto-fill all 12 months with the monthly installment"
            >
              Distribute Evenly
            </Button>
          </div>

          {data.show_advance && (
            <div className="space-y-3 pt-2 border-t border-[#1E293B]/60">
              <p className="text-[11px] text-[#94A3B8]">
                Set the exact amount to be collected in each month (April to March):
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {(data.fee_schedule || []).map((item) => (
                  <div key={item.month} className="p-2 rounded-xl bg-[#111827] border border-[#1E293B]">
                    <span className="text-[11px] font-700 text-[#94A3B8] block">{item.month}</span>
                    <div className="relative mt-1">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-[#94A3B8] font-mono">₹</span>
                      <Input
                        type="number"
                        min={0}
                        value={item.amount}
                        onChange={(e) => handleUpdateMonthAmount(item.month, e.target.value, isEdit)}
                        className="h-7 pl-5 pr-1 text-xs font-mono rounded-lg bg-[#0B0F19] border-[#1E293B] text-white"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-xs font-mono pt-1 text-[#94A3B8]">
                <span>Schedule Sum: <strong className="text-white">₹{scheduleSum.toLocaleString()}</strong></span>
                <span className={matches ? "text-[#34D399]" : "text-[#FBBF24]"}>
                  {matches ? "✓ Matches Annual Total" : `Difference: ₹${Math.abs(scheduleSum - totalAnnual).toLocaleString()}`}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

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
          <DialogContent className="rounded-3xl border border-[#1E293B] bg-[#111827] text-white max-w-lg max-h-[90vh] overflow-y-auto p-6 sm:p-8">
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

              {renderBatchFeeFields(form, setForm, false)}
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

                  <div className="mt-2.5 flex items-center gap-2 text-[11px] font-mono text-[#94A3B8] bg-[#0B0F19]/60 px-2.5 py-1 rounded-xl border border-[#1E293B]">
                    <span className="text-[#34D399] font-700">₹{Number(b.fee_amount || 0).toLocaleString()} <span className="text-[10px] text-[#94A3B8] font-normal">/yr</span></span>
                    <span className="text-[#64748B]">•</span>
                    <span className="text-[#60A5FA] font-600">₹{Number(b.monthly_fee || 0).toLocaleString()} <span className="text-[10px] text-[#94A3B8] font-normal">/mo</span></span>
                  </div>
                </div>

                <div className="mt-4 pt-3.5 border-t border-[#1E293B]/70 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-[#94A3B8] font-mono">
                    Code:{" "}
                    <code className="text-[#3B82F6] font-bold bg-[#0B0F19] px-2 py-0.5 rounded border border-[#1E293B]">
                      {b.code}
                    </code>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditBatch(b);
                      }}
                      className="h-8 px-2 rounded-xl text-[#94A3B8] hover:text-white hover:bg-white/5 text-xs"
                      title="Edit Batch Details & Fees"
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
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
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-[#06B6D4]/15 text-[#22D3EE] border-[#06B6D4]/30 text-xs font-mono font-700">
                  Class {currentBatch.class_level} Cohort
                </Badge>
                <span className="text-xs text-[#94A3B8] font-mono">
                  Join Code: <span className="text-white font-bold">{currentBatch.code}</span>
                </span>
                <span className="text-[#64748B]">•</span>
                <span className="text-xs text-[#34D399] font-mono font-700">
                  Annual: ₹{Number(currentBatch.fee_amount || 0).toLocaleString()}
                </span>
                <span className="text-[#64748B]">•</span>
                <span className="text-xs text-[#60A5FA] font-mono">
                  Monthly: ₹{Number(currentBatch.monthly_fee || 0).toLocaleString()}
                </span>
              </div>
              <h2 className="font-head text-2xl sm:text-3xl font-800 text-white mt-1">
                {currentBatch.name}
              </h2>
            </div>

            <div className="flex items-center gap-2.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleOpenEditBatch(currentBatch)}
                className="rounded-2xl border-[#1E293B] bg-[#0B0F19] text-[#94A3B8] hover:text-white hover:border-[#3B82F6] text-xs h-10 px-3.5 flex items-center gap-1.5 shrink-0"
              >
                <Pencil className="h-3.5 w-3.5 text-[#3B82F6]" /> Edit Batch
              </Button>

              {/* Live Search Input */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
                <Input
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search student in batch…"
                  className="pl-10 rounded-2xl bg-[#0B0F19] border-[#1E293B] text-white text-xs h-10 placeholder:text-[#94A3B8]/60 focus:border-[#3B82F6]"
                />
              </div>
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
                        className="rounded-2xl p-4 sm:p-5 bg-[#0B0F19]/90 border border-[#1E293B] hover:border-[#3B82F6]/50 transition-all flex flex-col gap-3.5 shadow-sm"
                      >
                        {/* Top row: Student profile & Financial totals & Actions */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          {/* Student Info - Clickable */}
                          <div
                            onClick={() => handleOpenFeeModal(st)}
                            className="flex items-center gap-3.5 min-w-0 cursor-pointer group"
                            title="Click to view & customize student fees and advance proportions"
                          >
                            <div className="h-11 w-11 rounded-2xl bg-[#1E293B]/80 border border-[#3B82F6]/30 group-hover:border-[#3B82F6] group-hover:scale-105 flex items-center justify-center font-head font-800 text-base text-[#60A5FA] shrink-0 transition-all shadow-sm">
                              {st.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-head text-base font-700 text-white group-hover:text-[#60A5FA] transition-colors truncate flex items-center gap-1.5">
                                <span>{st.name}</span>
                                <Pencil className="h-3 w-3 opacity-40 group-hover:opacity-100 text-[#60A5FA] transition-opacity" />
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
                              <div
                                onClick={() => handleOpenFeeModal(st)}
                                className="cursor-pointer group"
                                title="Click to adjust total fee & proportional monthly schedule"
                              >
                                <span className="text-[10px] text-[#94A3B8] uppercase block group-hover:text-[#60A5FA] transition-colors">Total Fee</span>
                                <span className="text-xs sm:text-sm font-700 text-white group-hover:text-[#60A5FA] transition-colors underline decoration-[#3B82F6]/40 underline-offset-2">
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
                              {(selectedMonthsMap[st.id] || []).length > 0 && (
                                <>
                                  <Button
                                    size="sm"
                                    data-testid={`mark-selected-paid-header-${st.id}`}
                                    onClick={() => handleMarkSelectedMonthsPaid(st)}
                                    className="h-8 px-3 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-700 shadow-md shadow-[#10B981]/30 flex items-center gap-1.5"
                                    title="Mark selected months as paid in full"
                                  >
                                    <Check className="h-3.5 w-3.5" /> Mark Paid ({selectedMonthsMap[st.id].length})
                                  </Button>
                                  <Button
                                    size="sm"
                                    data-testid={`partial-selected-header-${st.id}`}
                                    onClick={() => handleOpenPartialModal(st, selectedMonthsMap[st.id][0])}
                                    className="h-8 px-3 rounded-xl bg-[#F59E0B] hover:bg-[#D97706] text-white text-xs font-700 shadow-md shadow-[#F59E0B]/30 flex items-center gap-1.5"
                                    title="Record partial payment for selected month"
                                  >
                                    <IndianRupee className="h-3.5 w-3.5" /> Partial Paid
                                  </Button>
                                </>
                              )}
                              {!isPaid && (
                                <Button
                                  size="sm"
                                  data-testid={`quick-mark-paid-${st.id}`}
                                  onClick={() => handleQuickMarkPaid(st)}
                                  variant="outline"
                                  className="h-8 px-2.5 rounded-xl border-[#34D399]/40 text-[#34D399] hover:bg-[#34D399]/10 text-xs font-700"
                                  title="Mark full payment completed"
                                >
                                  Mark All Paid
                                </Button>
                              )}
                              <Button
                                size="sm"
                                data-testid={`record-fee-btn-${st.id}`}
                                onClick={() => handleOpenFeeModal(st)}
                                className="h-8 px-3 rounded-xl bg-[#3B82F6] hover:bg-[#60A5FA] text-white text-xs font-700 glow-blue flex items-center gap-1"
                              >
                                <IndianRupee className="h-3.5 w-3.5" /> Manage Fees
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Month-by-Month Status & Green-Dot Fee Schedule */}
                        <div className="pt-3 border-t border-[#1E293B]/80 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                            <div className="flex items-center gap-2">
                              <span className="text-[#94A3B8] text-[10px] font-700 uppercase">Monthly Status:</span>
                              <span className="flex items-center gap-1.5 text-[#34D399] font-700 text-xs">
                                <span className="h-2 w-2 rounded-full bg-[#10B981] inline-block shadow-sm shadow-[#10B981]/50" />
                                {st.collected_months?.length || 0} Collected
                              </span>
                              {st.partial_months?.length > 0 && (
                                <span className="flex items-center gap-1.5 text-[#FBBF24] font-700 text-xs ml-1">
                                  <span className="h-2 w-2 rounded-full bg-[#F59E0B] inline-block shadow-sm shadow-[#F59E0B]/50" />
                                  {st.partial_months.length} Partial
                                </span>
                              )}
                              {st.due_months?.length > 0 && (
                                <span className="flex items-center gap-1.5 text-[#F87171] font-700 text-xs ml-1">
                                  <span className="h-2 w-2 rounded-full bg-[#F87171] inline-block" />
                                  {st.due_months.length} Due
                                </span>
                              )}
                            </div>

                            {/* Text summary of months */}
                            <div className="text-[11px] text-[#94A3B8] flex items-center gap-2">
                              {st.collected_months?.length > 0 ? (
                                <span className="text-[#34D399] truncate max-w-xs" title={st.collected_months.map((m) => m.month).join(", ")}>
                                  Collected: {st.collected_months.map((m) => m.month).join(", ")}
                                </span>
                              ) : (
                                <span className="text-[#94A3B8]/60">No fees collected yet</span>
                              )}
                              {st.partial_months?.length > 0 && (
                                <>
                                  <span className="text-[#64748B]">•</span>
                                  <span className="text-[#FBBF24] truncate max-w-xs" title={st.partial_months.map((m) => `${m.month} (₹${m.paid_amount})`).join(", ")}>
                                    Partial: {st.partial_months.map((m) => m.month).join(", ")}
                                  </span>
                                </>
                              )}
                              {st.due_months?.length > 0 && (
                                <>
                                  <span className="text-[#64748B]">•</span>
                                  <span className="text-[#F87171] truncate max-w-xs" title={st.due_months.map((m) => m.month).join(", ")}>
                                    Due: {st.due_months.map((m) => m.month).join(", ")}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Quick selection banner when 1 or more unpaid months selected */}
                          {(selectedMonthsMap[st.id] || []).length > 0 && (
                            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-[#3B82F6]/15 border border-[#3B82F6]/40 text-white animate-in fade-in duration-200">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-[#60A5FA] shrink-0" />
                                <span className="text-xs font-mono font-600">
                                  Selected: <strong className="text-white">{(selectedMonthsMap[st.id] || []).join(", ")}</strong>
                                  <span className="text-[#94A3B8] ml-1.5">
                                    ({selectedMonthsMap[st.id].length} month{selectedMonthsMap[st.id].length > 1 ? "s" : ""} • ₹
                                    {selectedMonthsMap[st.id]
                                      .reduce((sum, mName) => {
                                        const msItem = (st.monthly_status || []).find((x) => x.month === mName);
                                        return sum + (Number(msItem?.amount) || 0);
                                      }, 0)
                                      .toLocaleString()}
                                    )
                                  </span>
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleClearMonthSelection(st.id)}
                                  className="h-7 px-2.5 text-[11px] text-[#94A3B8] hover:text-white"
                                >
                                  Clear
                                </Button>
                                <Button
                                  size="sm"
                                  data-testid={`partial-selected-banner-${st.id}`}
                                  onClick={() => handleOpenPartialModal(st, selectedMonthsMap[st.id][0])}
                                  className="h-7 px-3 rounded-lg bg-[#F59E0B] hover:bg-[#D97706] text-white text-xs font-700 shadow-md shadow-[#F59E0B]/30 flex items-center gap-1.5"
                                  title="Record partial payment for selected month"
                                >
                                  <IndianRupee className="h-3.5 w-3.5" /> Partial Paid
                                </Button>
                                <Button
                                  size="sm"
                                  data-testid={`mark-selected-paid-banner-${st.id}`}
                                  onClick={() => handleMarkSelectedMonthsPaid(st)}
                                  className="h-7 px-3.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-700 shadow-md shadow-[#10B981]/30 flex items-center gap-1.5"
                                >
                                  <Check className="h-3.5 w-3.5" /> Mark Paid
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Visual Month Chips Grid */}
                          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1.5 font-mono">
                            {(st.monthly_status || []).map((ms) => {
                              const isMonthPaid = ms.is_paid;
                              const isMonthPartial = ms.is_partial;
                              const isSelected = (selectedMonthsMap[st.id] || []).includes(ms.month);
                              return (
                                <button
                                  type="button"
                                  key={ms.month}
                                  data-testid={`month-chip-${st.id}-${ms.month}`}
                                  onClick={() => {
                                    if (isMonthPaid) {
                                      setUnmarkModal({
                                        open: true,
                                        student: st,
                                        month: ms.month,
                                        amount: ms.amount,
                                        collection_date: ms.collection_date,
                                        notes: ms.notes,
                                        saving: false,
                                      });
                                    } else if (isMonthPartial) {
                                      handleOpenPartialModal(st, ms.month);
                                    } else {
                                      handleToggleMonthSelection(st.id, ms.month);
                                    }
                                  }}
                                  title={
                                    isMonthPaid
                                      ? `${ms.month}: ₹${Number(ms.amount || 0).toLocaleString()} COLLECTED${ms.collection_date ? ` on ${new Date(ms.collection_date).toLocaleDateString()}` : ""}${ms.notes ? ` (${ms.notes})` : ""}\n👉 Click to unmark as paid`
                                      : isMonthPartial
                                      ? `${ms.month}: ₹${Number(ms.paid_amount || 0).toLocaleString()} of ₹${Number(ms.amount || 0).toLocaleString()} PAID (Partial)\n👉 Click to record partial payment or complete`
                                      : isSelected
                                      ? `${ms.month}: ₹${Number(ms.amount || 0).toLocaleString()} SELECTED\n👉 Click to deselect`
                                      : `${ms.month}: ₹${Number(ms.amount || 0).toLocaleString()} DUE\n👉 Click to select for payment`
                                  }
                                  className={`p-1.5 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer relative group text-left ${
                                    isMonthPaid
                                      ? "bg-[#10B981]/10 border-[#10B981]/40 text-white shadow-sm shadow-[#10B981]/10 hover:border-[#EF4444]/60 hover:bg-[#EF4444]/15"
                                      : isMonthPartial
                                      ? "bg-[#F59E0B]/10 border-[#F59E0B]/50 text-white shadow-sm shadow-[#F59E0B]/20 hover:border-[#F59E0B] hover:bg-[#F59E0B]/20"
                                      : isSelected
                                      ? "bg-[#3B82F6]/25 border-[#3B82F6] ring-2 ring-[#3B82F6]/70 text-white shadow-md shadow-[#3B82F6]/30"
                                      : "bg-[#111827] border-[#1E293B] text-[#94A3B8] hover:border-[#3B82F6]/60 hover:text-white"
                                  }`}
                                >
                                  <div className="flex items-center gap-1">
                                    {isMonthPaid ? (
                                      <span className="h-2 w-2 rounded-full bg-[#10B981] shadow-sm shadow-[#10B981]/80 shrink-0 group-hover:bg-[#EF4444]" />
                                    ) : isMonthPartial ? (
                                      <span className="h-2 w-2 rounded-full bg-[#F59E0B] shadow-sm shadow-[#F59E0B]/80 shrink-0" />
                                    ) : isSelected ? (
                                      <Check className="h-2.5 w-2.5 text-[#60A5FA] shrink-0" />
                                    ) : (
                                      <span className="h-1.5 w-1.5 rounded-full bg-[#64748B] shrink-0" />
                                    )}
                                    <span
                                      className={`text-[10px] sm:text-[11px] font-700 ${
                                        isMonthPaid
                                          ? "text-[#34D399] group-hover:text-[#F87171]"
                                          : isMonthPartial
                                          ? "text-[#FBBF24]"
                                          : isSelected
                                          ? "text-white"
                                          : "text-[#94A3B8]"
                                      }`}
                                    >
                                      {ms.month.slice(0, 3)}
                                    </span>
                                  </div>
                                  <span className="text-[9px] text-[#64748B] mt-0.5 font-mono">
                                    {isMonthPartial
                                      ? `₹${Number(ms.paid_amount || 0).toLocaleString()}`
                                      : `₹${Number(ms.amount || 0).toLocaleString()}`}
                                  </span>
                                  <span
                                    className={`text-[8px] font-700 uppercase mt-0.5 px-1 py-0.2 rounded transition-colors ${
                                      isMonthPaid
                                        ? "text-[#10B981] bg-[#10B981]/15 group-hover:text-[#F87171] group-hover:bg-[#EF4444]/20"
                                        : isMonthPartial
                                        ? "text-[#F59E0B] bg-[#F59E0B]/15"
                                        : isSelected
                                        ? "text-[#60A5FA] bg-[#3B82F6]/20 font-800"
                                        : "text-[#F87171] bg-[#F87171]/15"
                                    }`}
                                  >
                                    {isMonthPaid ? (
                                      <>
                                        <span className="group-hover:hidden">Paid</span>
                                        <span className="hidden group-hover:inline">Unmark</span>
                                      </>
                                    ) : isMonthPartial ? (
                                      "Partial"
                                    ) : isSelected ? (
                                      "Selected"
                                    ) : (
                                      "Due"
                                    )}
                                  </span>
                                </button>
                              );
                            })}
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

      {/* 5. Record / Update Fee Payment & Student Proportions Modal */}
      <Dialog open={feeModal.open} onOpenChange={(open) => !open && setFeeModal((prev) => ({ ...prev, open: false }))}>
        {feeModal.student && (() => {
          const studentTotal = Number(feeModal.total_fee) || 0;
          const currentSched = feeModal.fee_schedule || [];
          const schedSum = currentSched.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
          const diff = Math.round(schedSum - studentTotal);
          const batchTotal = Number(batchStudentsData?.fee_amount || 0);

          return (
            <DialogContent data-testid="fee-modal-content" className="bg-[#111827] border border-[#1E293B] text-white max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 sm:p-7">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-[#3B82F6]/20 border border-[#3B82F6]/40 flex items-center justify-center text-[#60A5FA]">
                    <IndianRupee className="h-5 w-5" />
                  </div>
                  <div>
                    <DialogTitle className="font-head text-xl font-800 text-white">
                      Manage Student Fees &amp; Proportions
                    </DialogTitle>
                    <p className="text-xs text-[#94A3B8] font-mono mt-0.5 truncate max-w-sm">
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
                    <span className="text-sm font-800 text-white">₹{studentTotal.toLocaleString()}</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-[10px] text-[#94A3B8] uppercase">Paid So Far</span>
                      <button
                        type="button"
                        onClick={() => setFeeModal((prev) => ({ ...prev, editPaidMode: !prev.editPaidMode }))}
                        className="p-0.5 rounded text-[#94A3B8] hover:text-[#34D399] transition-colors"
                        title="Edit fees paid so far"
                      >
                        <Pencil className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    {feeModal.editPaidMode ? (
                      <div className="relative mt-1 px-1">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[#94A3B8] font-mono">₹</span>
                        <Input
                          data-testid="edit-paid-fee-input"
                          type="number"
                          min={0}
                          value={feeModal.paid_fee}
                          onChange={(e) => handlePaidFeeChange(e.target.value)}
                          className="pl-5 h-7 rounded-lg bg-[#111827] border-[#34D399]/60 text-[#34D399] font-mono text-xs text-center font-bold"
                          placeholder="0"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <div
                        data-testid="display-paid-fee"
                        onClick={() => setFeeModal((prev) => ({ ...prev, editPaidMode: true }))}
                        className="text-sm font-800 text-[#34D399] cursor-pointer hover:underline flex items-center justify-center gap-1 mt-0.5"
                        title="Click to edit paid amount"
                      >
                        ₹{Number(feeModal.paid_fee || 0).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-[10px] text-[#94A3B8] uppercase">Current Due</span>
                      <button
                        type="button"
                        onClick={() => setFeeModal((prev) => ({ ...prev, editDueMode: !prev.editDueMode }))}
                        className="p-0.5 rounded text-[#94A3B8] hover:text-[#F87171] transition-colors"
                        title="Edit current due fee"
                      >
                        <Pencil className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    {feeModal.editDueMode ? (
                      <div className="relative mt-1 px-1">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[#94A3B8] font-mono">₹</span>
                        <Input
                          data-testid="edit-due-fee-input"
                          type="number"
                          min={0}
                          value={feeModal.due_fee}
                          onChange={(e) => handleDueFeeChange(e.target.value)}
                          className="pl-5 h-7 rounded-lg bg-[#111827] border-[#F87171]/60 text-[#F87171] font-mono text-xs text-center font-bold"
                          placeholder="0"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <div
                        data-testid="display-due-fee"
                        onClick={() => setFeeModal((prev) => ({ ...prev, editDueMode: true }))}
                        className="text-sm font-800 text-[#F87171] cursor-pointer hover:underline flex items-center justify-center gap-1 mt-0.5"
                        title="Click to edit due amount"
                      >
                        ₹{Number(feeModal.due_fee || 0).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Total Fee Adjuster with Proportional Notice */}
                <div className="space-y-1.5 p-3.5 rounded-2xl bg-[#0B0F19]/80 border border-[#1E293B]">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-700 text-white uppercase tracking-wider flex items-center gap-1.5">
                      <span>Total Annual Fee for this Student</span>
                    </Label>
                    {batchTotal > 0 && studentTotal !== batchTotal && (
                      <button
                        type="button"
                        onClick={() => handleStudentTotalFeeChange(String(batchTotal))}
                        className="text-[11px] text-[#60A5FA] hover:underline font-mono"
                        title="Reset to batch default fee"
                      >
                        Reset to Batch Default (₹{batchTotal.toLocaleString()})
                      </button>
                    )}
                  </div>
                  <div className="relative mt-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8] font-mono">₹</span>
                    <Input
                      data-testid="fee-total-input"
                      type="number"
                      min={0}
                      value={feeModal.total_fee}
                      onChange={(e) => handleStudentTotalFeeChange(e.target.value)}
                      className="pl-8 rounded-xl bg-[#111827] border-[#1E293B] text-white font-mono text-sm h-10"
                      placeholder="e.g. 60000"
                    />
                  </div>
                  <p className="text-[11px] text-[#94A3B8] font-mono leading-relaxed">
                    Batch default is ₹{batchTotal.toLocaleString()}. Updating this distributes monthly installment amounts proportionally.
                  </p>
                </div>

                {/* Advance Option: Month-by-Month Proportional Distribution Accordion */}
                <div className="rounded-2xl border border-[#1E293B] bg-[#0B0F19]/60 overflow-hidden transition-all">
                  <button
                    type="button"
                    data-testid="toggle-student-advance-btn"
                    onClick={() => setFeeModal((prev) => ({ ...prev, show_advance: !prev.show_advance }))}
                    className="w-full flex items-center justify-between p-3.5 text-left text-xs font-mono hover:bg-[#1E293B]/40 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4 text-[#60A5FA]" />
                      <span className="font-700 text-white">Advance Option: Month-by-Month Distribution</span>
                    </span>
                    <span className="text-[#60A5FA] flex items-center gap-1 font-600 text-xs">
                      {feeModal.show_advance ? (
                        <><span>Hide Schedule</span><ChevronUp className="h-4 w-4" /></>
                      ) : (
                        <><span>Customize 12 Months ({currentSched.length})</span><ChevronDown className="h-4 w-4" /></>
                      )}
                    </span>
                  </button>

                  {feeModal.show_advance && (
                    <div className="p-3.5 pt-1 space-y-3 border-t border-[#1E293B]/80">
                      {/* Action buttons & Live Balance Check */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono pt-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={handleDistributeStudentScheduleEvenly}
                            className="px-2.5 py-1 rounded-lg bg-[#3B82F6]/15 hover:bg-[#3B82F6]/30 text-[#60A5FA] border border-[#3B82F6]/30 text-[11px] font-mono transition-colors"
                          >
                            Distribute Evenly
                          </button>
                          <button
                            type="button"
                            onClick={handleResetStudentScheduleToBatch}
                            className="px-2.5 py-1 rounded-lg bg-[#1E293B] hover:bg-[#1E293B]/80 text-[#94A3B8] hover:text-white border border-[#1E293B] text-[11px] font-mono transition-colors"
                          >
                            Reset to Batch Proportions
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[#94A3B8] text-[11px]">Sum: ₹{schedSum.toLocaleString()}</span>
                          {Math.abs(diff) < 1 ? (
                            <Badge className="bg-[#10B981]/15 text-[#34D399] border-[#10B981]/30 text-[10px] font-mono px-2 py-0.5">
                              <Check className="h-3 w-3 mr-0.5" /> Balanced
                            </Badge>
                          ) : (
                            <Badge className="bg-[#F59E0B]/15 text-[#FBBF24] border-[#F59E0B]/30 text-[10px] font-mono px-2 py-0.5">
                              Diff: {diff > 0 ? `+₹${diff.toLocaleString()}` : `-₹${Math.abs(diff).toLocaleString()}`}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* 12-Month Proportional Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                        {currentSched.map((item) => {
                          const amtNum = Number(item.amount) || 0;
                          const percent = studentTotal > 0 ? ((amtNum / studentTotal) * 100).toFixed(1) : "0.0";
                          const isMonthPaid = feeModal.student.paid_months?.includes(item.month);

                          return (
                            <div
                              key={item.month}
                              className={`p-2.5 rounded-xl border text-xs font-mono transition-all ${
                                isMonthPaid
                                  ? "bg-[#10B981]/5 border-[#10B981]/25"
                                  : "bg-[#111827] border-[#1E293B]"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="font-700 text-white text-xs">{item.month}</span>
                                <div className="flex items-center gap-1">
                                  {isMonthPaid && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] inline-block" title="Paid" />
                                  )}
                                  <span className="text-[10px] text-[#94A3B8] font-mono">
                                    {percent}%
                                  </span>
                                </div>
                              </div>
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[#94A3B8]">₹</span>
                                <Input
                                  type="number"
                                  min={0}
                                  value={item.amount}
                                  onChange={(e) => handleUpdateStudentMonthAmount(item.month, e.target.value)}
                                  className="pl-6 h-8 rounded-lg bg-[#0B0F19] border-[#1E293B] text-white font-mono text-xs"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Previous Payments History */}
                {feeModal.student.payments?.length > 0 && (
                  <div className="pt-2 border-t border-[#1E293B]">
                    <span className="text-[10px] uppercase font-mono text-[#94A3B8] block mb-1.5">Payment History:</span>
                    <div className="max-h-28 overflow-y-auto space-y-1.5 rounded-xl bg-[#0B0F19] p-2.5 border border-[#1E293B]">
                      {feeModal.student.payments.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs font-mono text-[#94A3B8]">
                          <span className="truncate">
                            ₹{Number(p.amount || 0).toLocaleString()}
                            {p.month ? <span className="text-[#34D399] ml-1">({p.month})</span> : null}
                            {p.is_partial ? <span className="text-[#FBBF24] ml-1">[Partial]</span> : null}
                            {" — "}{p.notes || "Received"}
                          </span>
                          <span className="text-[10px] text-[#94A3B8]/60 shrink-0 ml-2">{new Date(p.date).toLocaleDateString()}</span>
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
                {Number(feeModal.due_fee || 0) > 0 && (
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
                  disabled={feeModal.saving}
                  className="rounded-full bg-[#3B82F6] hover:bg-[#60A5FA] text-white font-700 glow-blue text-xs"
                >
                  {feeModal.saving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <IndianRupee className="h-4 w-4 mr-1" />
                  )}
                  Save Fee &amp; Schedule
                </Button>
              </DialogFooter>
            </DialogContent>
          );
        })()}
      </Dialog>

      {/* 6. Edit Batch Details Modal */}
      <Dialog open={editModal.open} onOpenChange={(open) => !open && setEditModal((prev) => ({ ...prev, open: false }))}>
        <DialogContent className="rounded-3xl border border-[#1E293B] bg-[#111827] text-white max-w-lg max-h-[90vh] overflow-y-auto p-6 sm:p-8">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-2xl bg-[#3B82F6]/20 border border-[#3B82F6]/40 flex items-center justify-center text-[#60A5FA]">
                <Pencil className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="font-head text-2xl font-800 text-white">Edit Batch Details</DialogTitle>
                <p className="text-xs text-[#94A3B8] font-mono mt-0.5">
                  Update batch name, annual fees, and monthly installments
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div>
              <Label className="font-600 text-xs text-[#94A3B8] uppercase">Batch Name</Label>
              <Input
                className={inp}
                value={editModal.name}
                onChange={(e) => setEditModal({ ...editModal, name: e.target.value })}
                placeholder="e.g. Class 10 — Newton Scholars"
              />
            </div>

            <div>
              <Label className="font-600 text-xs text-[#94A3B8] uppercase">CBSE Class Level</Label>
              <Select
                value={editModal.class_level}
                onValueChange={(v) => setEditModal({ ...editModal, class_level: v })}
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

            {renderBatchFeeFields(editModal, setEditModal, true)}
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-[#1E293B]">
            <Button
              variant="outline"
              onClick={() => setEditModal((prev) => ({ ...prev, open: false }))}
              className="rounded-full border-[#1E293B] text-[#94A3B8] hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEditBatch}
              disabled={editModal.saving}
              className="rounded-full bg-[#3B82F6] hover:bg-[#60A5FA] text-white font-800 glow-blue text-xs h-10 px-6"
            >
              {editModal.saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Save Batch Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7. Unmark Month as Paid Confirmation Modal */}
      <Dialog open={unmarkModal.open} onOpenChange={(open) => !open && setUnmarkModal((prev) => ({ ...prev, open: false }))}>
        <DialogContent className="rounded-3xl border border-[#1E293B] bg-[#111827] text-white max-w-md p-6 sm:p-7">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-[#EF4444]/20 border border-[#EF4444]/40 flex items-center justify-center text-[#F87171]">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="font-head text-xl font-800 text-white">Unmark Paid Status</DialogTitle>
                <p className="text-xs text-[#94A3B8] font-mono mt-0.5">
                  Revert payment for {unmarkModal.student?.name}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-3 text-sm">
            <div className="p-3.5 rounded-2xl bg-[#0B0F19] border border-[#1E293B] space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-[#94A3B8]">Student:</span>
                <span className="font-700 text-white">{unmarkModal.student?.name}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-[#94A3B8]">Month to Unmark:</span>
                <span className="font-700 text-[#F87171]">{unmarkModal.month}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-[#94A3B8]">Scheduled Fee:</span>
                <span className="font-700 text-white">₹{Number(unmarkModal.amount || 0).toLocaleString()}</span>
              </div>
              {unmarkModal.collection_date && (
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-[#94A3B8]">Payment Recorded On:</span>
                  <span className="text-[#34D399]">{new Date(unmarkModal.collection_date).toLocaleDateString()}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-[#94A3B8] leading-relaxed">
              Are you sure you want to unmark <strong>{unmarkModal.month}</strong> as paid?
              The student&apos;s paid total will be reduced by <strong className="text-white">₹{Number(unmarkModal.amount || 0).toLocaleString()}</strong> and this month will return to <strong>Due</strong> status.
            </p>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-[#1E293B]">
            <Button
              variant="outline"
              onClick={() => setUnmarkModal((prev) => ({ ...prev, open: false }))}
              className="rounded-full border-[#1E293B] text-[#94A3B8] hover:text-white"
            >
              Cancel
            </Button>
            <Button
              data-testid="confirm-unmark-paid-btn"
              onClick={handleConfirmUnmark}
              disabled={unmarkModal.saving}
              className="rounded-full bg-[#EF4444] hover:bg-[#DC2626] text-white font-700 text-xs px-5"
            >
              {unmarkModal.saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
              Confirm &amp; Unmark Paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 8. Partial Payment Modal */}
      <Dialog open={partialModal.open} onOpenChange={(open) => !open && setPartialModal((prev) => ({ ...prev, open: false }))}>
        <DialogContent className="rounded-3xl border border-[#1E293B] bg-[#111827] text-white max-w-md p-6 sm:p-7">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-[#F59E0B]/20 border border-[#F59E0B]/40 flex items-center justify-center text-[#FBBF24]">
                <IndianRupee className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="font-head text-xl font-800 text-white">Record Partial Payment</DialogTitle>
                <p className="text-xs text-[#94A3B8] font-mono mt-0.5">
                  {partialModal.student?.name} • Month of {partialModal.month}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-3 text-sm">
            {/* Status breakdown for this month */}
            <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-[#0B0F19] border border-[#1E293B] text-center font-mono text-xs">
              <div>
                <span className="text-[10px] text-[#94A3B8] uppercase block">Scheduled</span>
                <span className="font-700 text-white">₹{Number(partialModal.scheduledAmount || 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[10px] text-[#94A3B8] uppercase block">Paid So Far</span>
                <span className="font-700 text-[#34D399]">₹{Number(partialModal.paidSoFar || 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[10px] text-[#94A3B8] uppercase block">Remaining Due</span>
                <span className="font-700 text-[#F87171]">₹{Number(partialModal.remainingDue || 0).toLocaleString()}</span>
              </div>
            </div>

            {/* Partial Amount Input */}
            <div>
              <Label className="text-xs font-600 text-[#94A3B8]">
                Partial Amount Receiving Now (₹)
              </Label>
              <div className="relative mt-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8] font-mono">₹</span>
                <Input
                  data-testid="partial-fee-amount-input"
                  type="number"
                  min={1}
                  value={partialModal.partialAmount}
                  onChange={(e) => setPartialModal((prev) => ({ ...prev, partialAmount: e.target.value }))}
                  placeholder="Enter partial amount"
                  className="pl-8 rounded-xl bg-[#0B0F19] border-[#1E293B] text-white font-mono text-sm h-10"
                />
              </div>

              {/* Quick suggestions */}
              {partialModal.remainingDue > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setPartialModal((prev) => ({ ...prev, partialAmount: String(partialModal.remainingDue) }))}
                    className="px-2.5 py-1 rounded-lg bg-[#10B981]/15 hover:bg-[#10B981]/30 text-[#34D399] border border-[#10B981]/30 text-[11px] font-mono transition-colors"
                  >
                    Pay Full Remaining (₹{partialModal.remainingDue.toLocaleString()})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPartialModal((prev) => ({ ...prev, partialAmount: String(Math.round(partialModal.remainingDue / 2)) }))}
                    className="px-2.5 py-1 rounded-lg bg-[#F59E0B]/15 hover:bg-[#F59E0B]/30 text-[#FBBF24] border border-[#F59E0B]/30 text-[11px] font-mono transition-colors"
                  >
                    Pay Half (₹{Math.round(partialModal.remainingDue / 2).toLocaleString()})
                  </button>
                </div>
              )}
            </div>

            {/* Date */}
            <div>
              <Label className="text-xs font-600 text-[#94A3B8]">Date of Collection</Label>
              <Input
                type="date"
                value={partialModal.payment_date}
                onChange={(e) => setPartialModal((prev) => ({ ...prev, payment_date: e.target.value }))}
                className="mt-1 rounded-xl bg-[#0B0F19] border-[#1E293B] text-white text-xs h-10 font-mono"
              />
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs font-600 text-[#94A3B8]">Payment Notes / Reference</Label>
              <Input
                value={partialModal.notes}
                onChange={(e) => setPartialModal((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="e.g. Partial cash payment, UPI Ref #..."
                className="mt-1 rounded-xl bg-[#0B0F19] border-[#1E293B] text-white text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-[#1E293B]">
            {partialModal.paidSoFar > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const currStudent = partialModal.student;
                  const currMonth = partialModal.month;
                  const paidSoFar = partialModal.paidSoFar;
                  setPartialModal((prev) => ({ ...prev, open: false }));
                  setUnmarkModal({
                    open: true,
                    student: currStudent,
                    month: currMonth,
                    amount: paidSoFar,
                    collection_date: "",
                    notes: "Partial payment reverted",
                    saving: false,
                  });
                }}
                className="rounded-full border-[#EF4444]/40 text-[#EF4444] hover:bg-[#EF4444]/10 text-xs font-600 mr-auto"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Revert Payments
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setPartialModal((prev) => ({ ...prev, open: false }))}
              className="rounded-full border-[#1E293B] text-[#94A3B8] hover:text-white text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              data-testid="save-partial-payment-btn"
              onClick={handleSavePartialPayment}
              disabled={partialModal.saving}
              className="rounded-full bg-[#F59E0B] hover:bg-[#D97706] text-white font-700 text-xs"
            >
              {partialModal.saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <IndianRupee className="h-4 w-4 mr-1" />}
              Record Partial Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
