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
  ShieldAlert,
  ShieldCheck,
  UserX,
  UserCheck,
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
  const [blockModal, setBlockModal] = useState({
    open: false,
    student: null,
    saving: false,
  });
  const [statusBusyId, setStatusBusyId] = useState(null);

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

  // Toggle Disable / Enable Student
  const handleToggleDisable = async (student) => {
    const willDisable = !student.is_disabled;
    const action = willDisable ? "disable" : "enable";
    setStatusBusyId(student.id);
    try {
      await api.post(`/batches/${selectedBatchId}/students/${student.id}/status`, { action });
      toast.success(
        willDisable
          ? `Student "${student.name}" has been disabled.`
          : `Student "${student.name}" has been enabled.`
      );
      setBatchStudentsData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          students: (prev.students || []).map((s) =>
            s.id === student.id ? { ...s, is_disabled: willDisable } : s
          ),
        };
      });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to update student status.");
    } finally {
      setStatusBusyId(null);
    }
  };

  // Open Block Confirmation Modal
  const handleOpenBlockModal = (student) => {
    setBlockModal({
      open: true,
      student,
      saving: false,
    });
  };

  // Confirm Block Student Account
  const handleConfirmBlock = async () => {
    if (!blockModal.student) return;
    const student = blockModal.student;
    setBlockModal((prev) => ({ ...prev, saving: true }));
    try {
      const res = await api.post(`/batches/${selectedBatchId}/students/${student.id}/status`, { action: "block" });
      const newCode = res.data?.new_batch_code;
      toast.success(
        newCode
          ? `Student "${student.name}" blocked! Batch code regenerated to: ${newCode}`
          : `Student "${student.name}" blocked.`
      );
      if (newCode) {
        setBatches((prev) =>
          prev.map((b) => (b.id === selectedBatchId ? { ...b, code: newCode } : b))
        );
      }
      setBatchStudentsData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          students: (prev.students || []).map((s) =>
            s.id === student.id ? { ...s, is_blocked: true } : s
          ),
        };
      });
      setBlockModal({ open: false, student: null, saving: false });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to block student account.");
      setBlockModal((prev) => ({ ...prev, saving: false }));
    }
  };

  // Unblock Student Account
  const handleUnblock = async (student) => {
    setStatusBusyId(student.id);
    try {
      await api.post(`/batches/${selectedBatchId}/students/${student.id}/status`, { action: "unblock" });
      toast.success(`Student "${student.name}" account unblocked.`);
      setBatchStudentsData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          students: (prev.students || []).map((s) =>
            s.id === student.id ? { ...s, is_blocked: false } : s
          ),
        };
      });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to unblock student account.");
    } finally {
      setStatusBusyId(null);
    }
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

  const inp = "rounded-xl mt-1.5 bg-[#FFF9E8] border-2 border-[#1E293B] text-[#1E293B] font-semibold focus:ring-2 focus:ring-[#F5C842]";

  const renderBatchFeeFields = (data, setter, isEdit = false) => {
    const scheduleSum = (data.fee_schedule || []).reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
    const totalAnnual = Number(data.fee_amount) || 0;
    const matches = scheduleSum === totalAnnual;

    return (
      <div className="space-y-4 pt-1">
        {/* Annual & Monthly Fee Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="font-semibold text-xs text-[#1E293B]/70 uppercase">
              Total Annual Fees (Whole Year)
            </Label>
            <div className="relative mt-1.5">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#1E293B]/60 font-mono">₹</span>
              <Input
                type="number"
                min={0}
                className="pl-8 rounded-xl bg-white border-2 border-[#1E293B] text-[#1E293B] font-mono text-sm shadow-[2px_2px_0_#1E293B]"
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
            <span className="text-[10px] text-[#1E293B]/60 mt-0.5 block">Full year total course fees</span>
          </div>

          <div>
            <Label className="font-semibold text-xs text-[#1E293B]/70 uppercase">
              Monthly Payment (Installment)
            </Label>
            <div className="relative mt-1.5">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#1E293B]/60 font-mono">₹</span>
              <Input
                type="number"
                min={0}
                className="pl-8 rounded-xl bg-white border-2 border-[#1E293B] text-[#1E293B] font-mono text-sm shadow-[2px_2px_0_#1E293B]"
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
            <span className="text-[10px] text-[#1E293B]/60 mt-0.5 block">Default monthly installment</span>
          </div>
        </div>

        {/* Advance Option: Month-by-month Schedule Accordion */}
        <div className="rounded-2xl border-2 border-[#1E293B] bg-[#FFF9E8] p-3.5 sm:p-4 space-y-3 shadow-[3px_3px_0_#1E293B]">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setter((prev) => ({ ...prev, show_advance: !prev.show_advance }))}
              className="flex items-center gap-2 text-xs font-bold text-[#1E293B] hover:text-[#3E7CB1] transition-colors"
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
              className="h-7 px-2 text-[10px] font-mono border-2 border-[#1E293B] bg-white text-[#1E293B] hover:bg-[#FFF9E8] rounded-lg shadow-[1px_1px_0_#1E293B]"
              title="Auto-fill all 12 months with the monthly installment"
            >
              Distribute Evenly
            </Button>
          </div>

          {data.show_advance && (
            <div className="space-y-3 pt-2 border-t-2 border-[#1E293B]/20">
              <p className="text-[11px] text-[#1E293B]/70">
                Set the exact amount to be collected in each month (April to March):
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {(data.fee_schedule || []).map((item) => (
                  <div key={item.month} className="p-2 rounded-xl bg-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]">
                    <span className="text-[11px] font-bold text-[#1E293B] block">{item.month}</span>
                    <div className="relative mt-1">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-[#1E293B]/60 font-mono">₹</span>
                      <Input
                        type="number"
                        min={0}
                        value={item.amount}
                        onChange={(e) => handleUpdateMonthAmount(item.month, e.target.value, isEdit)}
                        className="h-7 pl-5 pr-1 text-xs font-mono rounded-lg bg-white border border-[#1E293B] text-[#1E293B]"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-xs font-mono pt-1 text-[#1E293B]/70">
                <span>Schedule Sum: <strong className="text-[#1E293B]">₹{scheduleSum.toLocaleString()}</strong></span>
                <span className={matches ? "text-[#2F8A5F] font-bold" : "text-[#B45309] font-bold"}>
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
      <div className="rounded-3xl bg-[#F5C842] border-[2.5px] border-[#1E293B] p-6 sm:p-8 shadow-[4px_4px_0_#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block px-3 py-1 rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] text-xs font-black uppercase tracking-widest shadow-[2px_2px_0_#1E293B]">
              Cohort Management
            </span>
            <span className="text-xs font-bold text-[#1E293B] font-mono">{batches.length} Active Batches</span>
          </div>
          <h1 className="font-head text-3xl sm:text-4xl font-black tracking-tight text-[#1E293B] mt-2">
            ACTIVE COACHING BATCHES
          </h1>
          <p className="text-[#1E293B]/80 font-medium text-sm mt-1">
            View enrolled students, batch leaderboard rankings, and in-depth student concept analysis.
          </p>
        </div>

        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button className="rounded-full bg-white hover:bg-[#FFF9E8] text-[#1E293B] font-black text-sm h-11 px-6 border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none shrink-0">
              <Plus className="h-4 w-4 mr-1.5 text-[#1E293B]" /> Create New Batch
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl border-[2.5px] border-[#1E293B] bg-white text-[#1E293B] max-w-lg max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-[6px_6px_0_#1E293B]">
            <DialogHeader>
              <DialogTitle className="font-head text-2xl font-black text-[#1E293B]">CREATE A COACHING BATCH</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-3">
              <div>
                <Label className="font-semibold text-xs text-[#1E293B]/70 uppercase">Batch Name</Label>
                <Input
                  className={inp}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Class 10 — Newton Scholars"
                />
              </div>
              <div>
                <Label className="font-semibold text-xs text-[#1E293B]/70 uppercase">CBSE Class Level</Label>
                <Select
                  value={form.class_level}
                  onValueChange={(v) => setForm({ ...form, class_level: v })}
                >
                  <SelectTrigger className={inp}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-2 border-[#1E293B] text-[#1E293B] shadow-[4px_4px_0_#1E293B]">
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
                className="rounded-full bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] border-2 border-[#1E293B] font-black w-full h-11 shadow-[3px_3px_0_#1E293B] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                Create Batch &amp; Generate Code
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 2. Active Batches Selection Cards */}
      {batches.length === 0 ? (
        <div className="rounded-3xl bg-white p-16 text-center border-2 border-dashed border-[#1E293B] shadow-[4px_4px_0_#1E293B] space-y-3">
          <Users className="h-12 w-12 mx-auto text-[#1E293B]/40" />
          <h3 className="font-head text-lg font-bold text-[#1E293B]">No coaching batches created yet</h3>
          <p className="text-xs text-[#1E293B]/70 max-w-md mx-auto">
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
                className={`group cursor-pointer rounded-3xl p-5 sm:p-6 transition-all duration-150 border-[2.5px] border-[#1E293B] relative overflow-hidden flex flex-col justify-between ${
                  isSelected
                    ? "bg-[#F5C842] shadow-[4px_4px_0_#1E293B] translate-x-[-1px] translate-y-[-1px]"
                    : "bg-white hover:bg-[#FFF9E8] shadow-[3px_3px_0_#1E293B]"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] flex items-center justify-center shadow-[2px_2px_0_#1E293B]">
                      <Orbit className="h-5 w-5 text-[#1E293B]" />
                    </div>
                    <Badge className="bg-white text-[#1E293B] border-2 border-[#1E293B] text-xs font-mono font-900 px-2.5 py-0.5 shadow-[1px_1px_0_#1E293B]">
                      Class {b.class_level}
                    </Badge>
                  </div>

                  <h3 className="font-head text-lg font-800 text-[#1E293B] mt-4 truncate">
                    {b.name}
                  </h3>

                  <div className="text-xs text-[#1E293B]/80 flex items-center gap-1.5 mt-1 font-mono font-bold">
                    <Users className="h-4 w-4 text-[#1E293B]" />
                    <span className="text-[#1E293B] font-900">{b.student_count || 0}</span> students enrolled
                  </div>

                  <div className="mt-2.5 flex items-center gap-2 text-[11px] font-mono text-[#1E293B] bg-[#FFF9E8] px-2.5 py-1 rounded-xl border-2 border-[#1E293B]">
                    <span className="text-[#4CAF7D] font-900">₹{Number(b.fee_amount || 0).toLocaleString()} <span className="text-[10px] text-[#1E293B]/60 font-bold">/yr</span></span>
                    <span className="text-[#1E293B]/40">•</span>
                    <span className="text-[#5B9BD5] font-900">₹{Number(b.monthly_fee || 0).toLocaleString()} <span className="text-[10px] text-[#1E293B]/60 font-bold">/mo</span></span>
                  </div>
                </div>

                <div className="mt-4 pt-3.5 border-t-2 border-[#1E293B]/20 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-[#1E293B] font-mono font-bold">
                    Code:{" "}
                    <code className="text-[#1E293B] font-900 bg-white px-2 py-0.5 rounded border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B]">
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
                      className="h-8 px-2 rounded-xl text-[#1E293B]/70 hover:text-[#1E293B] hover:bg-[#FFF9E8] text-xs font-bold"
                      title="Edit Batch Details & Fees"
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1 text-[#3E7CB1]" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyCode(b.code);
                      }}
                      className="h-8 px-2.5 rounded-xl text-[#1E293B]/70 hover:text-[#1E293B] hover:bg-[#FFF9E8] text-xs font-bold"
                    >
                      <Copy className="h-3.5 w-3.5 mr-1 text-[#1E293B]" /> Copy
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
        <div className="rounded-3xl bg-white p-6 sm:p-8 space-y-6 border-[2.5px] border-[#1E293B] shadow-[5px_5px_0_#1E293B]">
          {/* Header of Selected Batch */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b-2 border-[#1E293B]/20">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-[#FFF9E8] text-[#1E293B] border-2 border-[#1E293B] text-xs font-mono font-bold shadow-[1px_1px_0_#1E293B]">
                  Class {currentBatch.class_level} Cohort
                </Badge>
                <span className="text-xs text-[#1E293B]/70 font-mono">
                  Join Code: <span className="text-[#1E293B] font-black">{currentBatch.code}</span>
                </span>
                <span className="text-[#1E293B]/40">•</span>
                <span className="text-xs text-[#2F8A5F] font-mono font-bold">
                  Annual: ₹{Number(currentBatch.fee_amount || 0).toLocaleString()}
                </span>
                <span className="text-[#1E293B]/40">•</span>
                <span className="text-xs text-[#3E7CB1] font-mono font-bold">
                  Monthly: ₹{Number(currentBatch.monthly_fee || 0).toLocaleString()}
                </span>
              </div>
              <h2 className="font-head text-2xl sm:text-3xl font-black text-[#1E293B] mt-1">
                {currentBatch.name}
              </h2>
            </div>

            <div className="flex items-center gap-2.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleOpenEditBatch(currentBatch)}
                className="rounded-2xl border-2 border-[#1E293B] bg-white text-[#1E293B] hover:bg-[#FFF9E8] text-xs h-10 px-3.5 flex items-center gap-1.5 shrink-0 shadow-[2px_2px_0_#1E293B] font-bold"
              >
                <Pencil className="h-3.5 w-3.5 text-[#3E7CB1]" /> Edit Batch
              </Button>

              {/* Live Search Input */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#1E293B]/60" />
                <Input
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search student in batch…"
                  className="pl-10 rounded-2xl bg-white border-2 border-[#1E293B] text-[#1E293B] text-xs h-10 placeholder:text-[#1E293B]/40 focus:border-[#F5C842] shadow-[2px_2px_0_#1E293B]"
                />
              </div>
            </div>
          </div>

          {/* Quick Metrics Strip: Students & Fees */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B]">
              <div className="flex items-center justify-between text-xs text-[#1E293B]/70">
                <span className="font-mono uppercase tracking-wider text-[10px] font-bold">Enrolled Students</span>
                <Users className="h-4 w-4 text-[#3E7CB1]" />
              </div>
              <div className="font-head text-2xl font-black text-[#1E293B] mt-1">
                {batchStudentsData?.summary?.total_students ?? currentBatch.student_count ?? 0}
              </div>
              <div className="text-[11px] text-[#1E293B]/60 font-mono mt-0.5">Active in this cohort</div>
            </div>

            <div className="p-4 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B]">
              <div className="flex items-center justify-between text-xs text-[#1E293B]/70">
                <span className="font-mono uppercase tracking-wider text-[10px] font-bold">Fees Collected</span>
                <IndianRupee className="h-4 w-4 text-[#2F8A5F]" />
              </div>
              <div className="font-head text-2xl font-black text-[#2F8A5F] mt-1">
                ₹{(batchStudentsData?.summary?.total_collected ?? 0).toLocaleString()}
              </div>
              <div className="text-[11px] text-[#2F8A5F] font-mono mt-0.5 font-bold">
                {batchStudentsData?.summary?.paid_count || 0} fully paid
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B]">
              <div className="flex items-center justify-between text-xs text-[#1E293B]/70">
                <span className="font-mono uppercase tracking-wider text-[10px] font-bold">Total Dues</span>
                <Clock className="h-4 w-4 text-[#E04A3C]" />
              </div>
              <div className="font-head text-2xl font-black text-[#E04A3C] mt-1">
                ₹{(batchStudentsData?.summary?.total_dues ?? 0).toLocaleString()}
              </div>
              <div className="text-[11px] text-[#E04A3C] font-mono mt-0.5 font-bold">
                {(batchStudentsData?.summary?.due_count || 0) + (batchStudentsData?.summary?.partial_count || 0)} pending
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B]">
              <div className="flex items-center justify-between text-xs text-[#1E293B]/70">
                <span className="font-mono uppercase tracking-wider text-[10px] font-bold">Collection Status</span>
                <CheckCircle2 className="h-4 w-4 text-[#B45309]" />
              </div>
              <div className="font-head text-lg font-bold text-[#1E293B] mt-1.5 flex items-center gap-1.5 flex-wrap">
                <span className="text-[#2F8A5F] text-sm font-black">{batchStudentsData?.summary?.paid_count || 0} Paid</span>
                <span className="text-[#1E293B]/40">•</span>
                <span className="text-[#B45309] text-sm font-black">{batchStudentsData?.summary?.partial_count || 0} Part</span>
                <span className="text-[#1E293B]/40">•</span>
                <span className="text-[#E04A3C] text-sm font-black">{batchStudentsData?.summary?.due_count || 0} Due</span>
              </div>
              <div className="text-[11px] text-[#1E293B]/60 font-mono mt-0.5">Across cohort members</div>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex items-center gap-2 border-b-2 border-[#1E293B]/20 pb-3">
            <button
              type="button"
              data-testid="tab-students-fees"
              onClick={() => setActiveTab("roster")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-black transition-all ${
                activeTab === "roster"
                  ? "bg-[#F5C842] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                  : "bg-white text-[#1E293B]/70 hover:text-[#1E293B] hover:bg-[#FFF9E8] border-2 border-[#1E293B]"
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Students &amp; Fee Status</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-black ${
                activeTab === "roster" ? "bg-white text-[#1E293B] border border-[#1E293B]" : "bg-[#FFF9E8] text-[#1E293B]"
              }`}>
                {rosterStudents.length}
              </span>
            </button>

            <button
              type="button"
              data-testid="tab-mastery-leaderboard"
              onClick={() => setActiveTab("leaderboard")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-black transition-all ${
                activeTab === "leaderboard"
                  ? "bg-[#F5C842] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                  : "bg-white text-[#1E293B]/70 hover:text-[#1E293B] hover:bg-[#FFF9E8] border-2 border-[#1E293B]"
              }`}
            >
              <Trophy className="h-4 w-4 text-[#B45309]" />
              <span>Academic Leaderboard</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-black ${
                activeTab === "leaderboard" ? "bg-white text-[#1E293B] border border-[#1E293B]" : "bg-[#FFF9E8] text-[#1E293B]"
              }`}>
                {filteredStudents.length}
              </span>
            </button>
          </div>

          {/* VIEW 1: STUDENTS & FEE ROSTER */}
          {activeTab === "roster" && (
            loadingStudents ? (
              <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-16 text-center text-[#1E293B] flex items-center justify-center gap-2.5 shadow-[3px_3px_0_#1E293B]">
                <span className="h-5 w-5 border-2 border-[#1E293B] border-t-transparent rounded-full animate-spin" />
                <span className="font-mono text-sm font-bold">Loading enrolled students and fee records…</span>
              </div>
            ) : rosterStudents.length === 0 ? (
              <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-12 text-center space-y-2 text-[#1E293B] shadow-[3px_3px_0_#1E293B]">
                <Users className="h-9 w-9 mx-auto text-[#1E293B]/50" />
                <h4 className="font-head text-lg font-bold text-[#1E293B]">No students enrolled yet</h4>
                <p className="text-xs max-w-sm mx-auto leading-relaxed text-[#1E293B]/70">
                  Give your students batch code <span className="font-mono text-[#1E293B] font-black bg-white px-2 py-0.5 rounded border border-[#1E293B]">{currentBatch.code}</span> to join this cohort.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-[#1E293B]/70 font-mono flex items-center justify-between px-2">
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
                        className="rounded-2xl p-4 sm:p-5 bg-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] transition-[transform,box-shadow] duration-150 flex flex-col gap-3.5"
                      >
                        {/* Top row: Student profile & Financial totals & Actions */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          {/* Student Info - Clickable */}
                          <div
                            onClick={() => handleOpenFeeModal(st)}
                            className="flex items-center gap-3.5 min-w-0 cursor-pointer group"
                            title="Click to view & customize student fees and advance proportions"
                          >
                            <div className="h-11 w-11 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] group-hover:scale-105 flex items-center justify-center font-head font-black text-base text-[#1E293B] shrink-0 transition-all shadow-[2px_2px_0_#1E293B]">
                              {st.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-head text-base font-bold text-[#1E293B] group-hover:text-[#3E7CB1] transition-colors truncate flex items-center gap-1.5">
                                <span>{st.name}</span>
                                <Pencil className="h-3 w-3 opacity-40 group-hover:opacity-100 text-[#3E7CB1] transition-opacity" />
                              </h4>
                              <div className="text-xs text-[#1E293B]/70 font-mono truncate">
                                {st.email}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {st.is_blocked ? (
                                  <Badge
                                    data-testid={`badge-blocked-${st.id}`}
                                    className="bg-[#E04A3C]/15 text-[#E04A3C] border-2 border-[#1E293B] font-mono text-[10px] font-bold px-2 py-0.5 flex items-center gap-1"
                                  >
                                    <ShieldAlert className="h-3 w-3" /> Account Blocked
                                  </Badge>
                                ) : st.is_disabled ? (
                                  <Badge
                                    data-testid={`badge-disabled-${st.id}`}
                                    className="bg-[#F5C842]/30 text-[#B45309] border-2 border-[#1E293B] font-mono text-[10px] font-bold px-2 py-0.5 flex items-center gap-1"
                                  >
                                    <UserX className="h-3 w-3" /> Disabled
                                  </Badge>
                                ) : (
                                  <Badge
                                    data-testid={`badge-active-${st.id}`}
                                    className="bg-[#2F8A5F]/15 text-[#2F8A5F] border-2 border-[#1E293B] font-mono text-[10px] font-bold px-2 py-0.5 flex items-center gap-1"
                                  >
                                    <CheckCircle2 className="h-3 w-3" /> Active
                                  </Badge>
                                )}
                              </div>
                              {st.last_payment_date && (
                                <div className="text-[10px] text-[#1E293B]/60 font-mono mt-0.5">
                                  Last payment: {new Date(st.last_payment_date).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Fee Status Breakdown & Actions */}
                          <div className="flex flex-wrap items-center justify-between md:justify-end gap-3 sm:gap-6 pt-3 md:pt-0 border-t md:border-t-0 border-[#1E293B]/20">
                            {/* Financials Numbers */}
                            <div className="flex items-center gap-4 sm:gap-6 font-mono text-right">
                              <div
                                onClick={() => handleOpenFeeModal(st)}
                                className="cursor-pointer group"
                                title="Click to adjust total fee & proportional monthly schedule"
                              >
                                <span className="text-[10px] text-[#1E293B]/60 uppercase block group-hover:text-[#3E7CB1] transition-colors">Total Fee</span>
                                <span className="text-xs sm:text-sm font-bold text-[#1E293B] group-hover:text-[#3E7CB1] transition-colors underline decoration-[#1E293B]/30 underline-offset-2">
                                  ₹{Number(st.total_fee || 0).toLocaleString()}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-[#1E293B]/60 uppercase block">Paid So Far</span>
                                <span className="text-xs sm:text-sm font-black text-[#2F8A5F]">
                                  ₹{Number(st.paid_fee || 0).toLocaleString()}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-[#1E293B]/60 uppercase block">Dues</span>
                                <span className={`text-xs sm:text-sm font-black ${st.due_fee > 0 ? "text-[#E04A3C]" : "text-[#2F8A5F]"}`}>
                                  ₹{Number(st.due_fee || 0).toLocaleString()}
                                </span>
                              </div>
                            </div>

                            {/* Fee Status Pill */}
                            <div className="shrink-0">
                              {isPaid ? (
                                <Badge className="bg-[#2F8A5F]/15 text-[#2F8A5F] border-2 border-[#1E293B] text-xs font-mono font-bold px-3 py-1 flex items-center gap-1 shadow-[1px_1px_0_#1E293B]">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Fees Paid
                                </Badge>
                              ) : isPartial ? (
                                <Badge className="bg-[#F5C842]/30 text-[#B45309] border-2 border-[#1E293B] text-xs font-mono font-bold px-3 py-1 flex items-center gap-1 shadow-[1px_1px_0_#1E293B]">
                                  <Clock className="h-3.5 w-3.5" /> Partial Paid
                                </Badge>
                              ) : (
                                <Badge className="bg-[#E04A3C]/15 text-[#E04A3C] border-2 border-[#1E293B] text-xs font-mono font-bold px-3 py-1 flex items-center gap-1 shadow-[1px_1px_0_#1E293B]">
                                  <AlertCircle className="h-3.5 w-3.5" /> Fees Due
                                </Badge>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                              {(selectedMonthsMap[st.id] || []).length > 0 && (
                                <>
                                  <Button
                                    size="sm"
                                    data-testid={`mark-selected-paid-header-${st.id}`}
                                    onClick={() => handleMarkSelectedMonthsPaid(st)}
                                    className="h-8 px-3 rounded-xl bg-[#2F8A5F] hover:bg-[#27734F] text-white text-xs font-bold border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center gap-1.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                                    title="Mark selected months as paid in full"
                                  >
                                    <Check className="h-3.5 w-3.5" /> Mark Paid ({selectedMonthsMap[st.id].length})
                                  </Button>
                                  <Button
                                    size="sm"
                                    data-testid={`partial-selected-header-${st.id}`}
                                    onClick={() => handleOpenPartialModal(st, selectedMonthsMap[st.id][0])}
                                    className="h-8 px-3 rounded-xl bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] text-xs font-bold border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center gap-1.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
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
                                  className="h-8 px-2.5 rounded-xl border-2 border-[#1E293B] text-[#2F8A5F] hover:bg-[#2F8A5F]/10 text-xs font-bold shadow-[1px_1px_0_#1E293B]"
                                  title="Mark full payment completed"
                                >
                                  Mark All Paid
                                </Button>
                              )}
                              <Button
                                size="sm"
                                data-testid={`record-fee-btn-${st.id}`}
                                onClick={() => handleOpenFeeModal(st)}
                                className="h-8 px-3 rounded-xl bg-white hover:bg-[#FFF9E8] text-[#1E293B] border-2 border-[#1E293B] text-xs font-bold shadow-[2px_2px_0_#1E293B] flex items-center gap-1 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                              >
                                <IndianRupee className="h-3.5 w-3.5" /> Manage Fees
                              </Button>

                              {/* Student Account Controls: Disable/Enable and Block/Unblock */}
                              <div className="flex items-center gap-1.5 border-l-2 border-[#1E293B]/20 pl-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  data-testid={`toggle-disable-btn-${st.id}`}
                                  disabled={statusBusyId === st.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleDisable(st);
                                  }}
                                  className={`h-8 px-2.5 rounded-xl text-xs font-bold border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] flex items-center gap-1 transition-all ${
                                    st.is_disabled
                                      ? "text-[#2F8A5F] bg-[#2F8A5F]/10 hover:bg-[#2F8A5F]/20"
                                      : "text-[#B45309] bg-[#F5C842]/20 hover:bg-[#F5C842]/30"
                                  }`}
                                  title={st.is_disabled ? "Click to re-enable student login" : "Click to disable student login"}
                                >
                                  {st.is_disabled ? (
                                    <>
                                      <UserCheck className="h-3.5 w-3.5" /> Enable
                                    </>
                                  ) : (
                                    <>
                                      <UserX className="h-3.5 w-3.5" /> Disable
                                    </>
                                  )}
                                </Button>

                                {st.is_blocked ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    data-testid={`unblock-btn-${st.id}`}
                                    disabled={statusBusyId === st.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUnblock(st);
                                    }}
                                    className="h-8 px-2.5 rounded-xl border-2 border-[#1E293B] text-[#3E7CB1] bg-[#3E7CB1]/10 hover:bg-[#3E7CB1]/20 text-xs font-bold shadow-[1px_1px_0_#1E293B] flex items-center gap-1 transition-all"
                                    title="Click to unblock student account"
                                  >
                                    <ShieldCheck className="h-3.5 w-3.5" /> Unblock
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    data-testid={`block-btn-${st.id}`}
                                    disabled={statusBusyId === st.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenBlockModal(st);
                                    }}
                                    className="h-8 px-2.5 rounded-xl border-2 border-[#1E293B] text-[#E04A3C] bg-[#E04A3C]/10 hover:bg-[#E04A3C]/20 text-xs font-bold shadow-[1px_1px_0_#1E293B] flex items-center gap-1 transition-all"
                                    title="Block student account and regenerate batch code"
                                  >
                                    <ShieldAlert className="h-3.5 w-3.5" /> Block
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Month-by-Month Status & Green-Dot Fee Schedule */}
                        <div className="pt-3 border-t-2 border-[#1E293B]/20 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                            <div className="flex items-center gap-2">
                              <span className="text-[#1E293B]/60 text-[10px] font-bold uppercase">Monthly Status:</span>
                              <span className="flex items-center gap-1.5 text-[#2F8A5F] font-bold text-xs">
                                <span className="h-2 w-2 rounded-full bg-[#2F8A5F] inline-block" />
                                {st.collected_months?.length || 0} Collected
                              </span>
                              {st.partial_months?.length > 0 && (
                                <span className="flex items-center gap-1.5 text-[#B45309] font-bold text-xs ml-1">
                                  <span className="h-2 w-2 rounded-full bg-[#B45309] inline-block" />
                                  {st.partial_months.length} Partial
                                </span>
                              )}
                              {st.due_months?.length > 0 && (
                                <span className="flex items-center gap-1.5 text-[#E04A3C] font-bold text-xs ml-1">
                                  <span className="h-2 w-2 rounded-full bg-[#E04A3C] inline-block" />
                                  {st.due_months.length} Due
                                </span>
                              )}
                            </div>

                            {/* Text summary of months */}
                            <div className="text-[11px] text-[#1E293B]/70 flex items-center gap-2">
                              {st.collected_months?.length > 0 ? (
                                <span className="text-[#2F8A5F] font-semibold truncate max-w-xs" title={st.collected_months.map((m) => m.month).join(", ")}>
                                  Collected: {st.collected_months.map((m) => m.month).join(", ")}
                                </span>
                              ) : (
                                <span className="text-[#1E293B]/50">No fees collected yet</span>
                              )}
                              {st.partial_months?.length > 0 && (
                                <>
                                  <span className="text-[#1E293B]/40">•</span>
                                  <span className="text-[#B45309] font-semibold truncate max-w-xs" title={st.partial_months.map((m) => `${m.month} (₹${m.paid_amount})`).join(", ")}>
                                    Partial: {st.partial_months.map((m) => m.month).join(", ")}
                                  </span>
                                </>
                              )}
                              {st.due_months?.length > 0 && (
                                <>
                                  <span className="text-[#1E293B]/40">•</span>
                                  <span className="text-[#E04A3C] font-semibold truncate max-w-xs" title={st.due_months.map((m) => m.month).join(", ")}>
                                    Due: {st.due_months.map((m) => m.month).join(", ")}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Quick selection banner when 1 or more unpaid months selected */}
                          {(selectedMonthsMap[st.id] || []).length > 0 && (
                            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-[#FFF9E8] border-2 border-[#1E293B] text-[#1E293B] shadow-[2px_2px_0_#1E293B] animate-in fade-in duration-200">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-[#2F8A5F] shrink-0" />
                                <span className="text-xs font-mono font-bold">
                                  Selected: <strong className="text-[#1E293B]">{(selectedMonthsMap[st.id] || []).join(", ")}</strong>
                                  <span className="text-[#1E293B]/70 ml-1.5">
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
                                  className="h-7 px-2.5 text-[11px] text-[#1E293B]/70 hover:text-[#1E293B]"
                                >
                                  Clear
                                </Button>
                                <Button
                                  size="sm"
                                  data-testid={`partial-selected-banner-${st.id}`}
                                  onClick={() => handleOpenPartialModal(st, selectedMonthsMap[st.id][0])}
                                  className="h-7 px-3 rounded-lg bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] text-xs font-bold border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] flex items-center gap-1.5"
                                  title="Record partial payment for selected month"
                                >
                                  <IndianRupee className="h-3.5 w-3.5" /> Partial Paid
                                </Button>
                                <Button
                                  size="sm"
                                  data-testid={`mark-selected-paid-banner-${st.id}`}
                                  onClick={() => handleMarkSelectedMonthsPaid(st)}
                                  className="h-7 px-3.5 rounded-lg bg-[#2F8A5F] hover:bg-[#27734F] text-white text-xs font-bold border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] flex items-center gap-1.5"
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
                                  className={`p-1.5 rounded-xl border-2 flex flex-col items-center justify-center text-center transition-all cursor-pointer relative group text-left ${
                                    isMonthPaid
                                      ? "bg-[#2F8A5F]/15 border-[#2F8A5F] text-[#2F8A5F] hover:bg-[#E04A3C]/20 hover:border-[#E04A3C]"
                                      : isMonthPartial
                                      ? "bg-[#F5C842]/20 border-[#B45309] text-[#B45309] hover:bg-[#F5C842]/40"
                                      : isSelected
                                      ? "bg-[#3E7CB1] border-[#1E293B] text-white shadow-[2px_2px_0_#1E293B]"
                                      : "bg-white border-[#1E293B] text-[#1E293B] hover:bg-[#FFF9E8]"
                                  }`}
                                >
                                  <div className="flex items-center gap-1">
                                    {isMonthPaid ? (
                                      <span className="h-2 w-2 rounded-full bg-[#2F8A5F] shrink-0 group-hover:bg-[#E04A3C]" />
                                    ) : isMonthPartial ? (
                                      <span className="h-2 w-2 rounded-full bg-[#B45309] shrink-0" />
                                    ) : isSelected ? (
                                      <Check className="h-2.5 w-2.5 text-white shrink-0" />
                                    ) : (
                                      <span className="h-1.5 w-1.5 rounded-full bg-[#1E293B]/40 shrink-0" />
                                    )}
                                    <span
                                      className={`text-[10px] sm:text-[11px] font-bold ${
                                        isMonthPaid
                                          ? "text-[#2F8A5F] group-hover:text-[#E04A3C]"
                                          : isMonthPartial
                                          ? "text-[#B45309]"
                                          : isSelected
                                          ? "text-white"
                                          : "text-[#1E293B]"
                                      }`}
                                    >
                                      {ms.month.slice(0, 3)}
                                    </span>
                                  </div>
                                  <span className="text-[9px] text-[#1E293B]/70 mt-0.5 font-mono font-semibold">
                                    {isMonthPartial
                                      ? `₹${Number(ms.paid_amount || 0).toLocaleString()}`
                                      : `₹${Number(ms.amount || 0).toLocaleString()}`}
                                  </span>
                                  <span
                                    className={`text-[8px] font-bold uppercase mt-0.5 px-1 py-0.2 rounded transition-colors ${
                                      isMonthPaid
                                        ? "text-[#2F8A5F] bg-[#2F8A5F]/15 group-hover:text-[#E04A3C] group-hover:bg-[#E04A3C]/20"
                                        : isMonthPartial
                                        ? "text-[#B45309] bg-[#F5C842]/30"
                                        : isSelected
                                        ? "text-white bg-black/20 font-black"
                                        : "text-[#E04A3C] bg-[#E04A3C]/15"
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
              <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-16 text-center text-[#1E293B] flex items-center justify-center gap-2.5 shadow-[3px_3px_0_#1E293B]">
                <span className="h-5 w-5 border-2 border-[#1E293B] border-t-transparent rounded-full animate-spin" />
                <span className="font-mono text-sm font-bold">Computing student rankings &amp; topic metrics…</span>
              </div>
            ) : rankedStudents.length === 0 ? (
              <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-12 text-center space-y-2 text-[#1E293B] shadow-[3px_3px_0_#1E293B]">
                <Users className="h-9 w-9 mx-auto text-[#1E293B]/50" />
                <h4 className="font-head text-lg font-bold text-[#1E293B]">No test submissions yet</h4>
                <p className="text-xs max-w-sm mx-auto leading-relaxed text-[#1E293B]/70">
                  Once enrolled students submit tests, their ranks and concept analysis appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-[#1E293B]/70 font-mono flex items-center justify-between px-2">
                  <span>Showing {filteredStudents.length} of {rankedStudents.length} students</span>
                  <span>Click any student to view detailed diagnostic analysis ➔</span>
                </div>

                <div className="space-y-2.5">
                  {filteredStudents.map((st) => {
                    const isTop3 = st.rank <= 3;
                    const rankColor =
                      st.rank === 1
                        ? "bg-[#F5C842] border-2 border-[#1E293B] text-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                        : st.rank === 2
                        ? "bg-[#E2E8F0] border-2 border-[#1E293B] text-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                        : st.rank === 3
                        ? "bg-[#FED7AA] border-2 border-[#1E293B] text-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                        : "bg-[#FFF9E8] border-2 border-[#1E293B] text-[#1E293B]";

                    const scoreColor =
                      st.overall >= 75
                        ? "text-[#2F8A5F] bg-[#2F8A5F]/15 border-2 border-[#1E293B]"
                        : st.overall >= 55
                        ? "text-[#B45309] bg-[#F5C842]/30 border-2 border-[#1E293B]"
                        : "text-[#E04A3C] bg-[#E04A3C]/15 border-2 border-[#1E293B]";

                    return (
                      <div
                        key={st.id}
                        onClick={() => handleOpenStudentAnalysis(st)}
                        className="group cursor-pointer rounded-2xl p-4 sm:p-5 bg-white border-2 border-[#1E293B] hover:shadow-[5px_5px_0_#1E293B] transition-[transform,box-shadow] duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[3px_3px_0_#1E293B]"
                      >
                        {/* Rank + Student Info */}
                        <div className="flex items-center gap-4 min-w-0">
                          {/* Rank Badge */}
                          <div
                            className={`h-11 w-11 rounded-2xl flex items-center justify-center font-head font-black text-base shrink-0 ${rankColor}`}
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
                              <h4 className="font-head text-base sm:text-lg font-bold text-[#1E293B] truncate group-hover:text-[#3E7CB1] transition-colors">
                                {st.name}
                              </h4>
                              {isTop3 && (
                                <Badge className="bg-[#F5C842]/40 text-[#1E293B] border-2 border-[#1E293B] text-[10px] font-bold font-mono">
                                  Top Tier
                                </Badge>
                              )}
                              {st.is_blocked ? (
                                <Badge className="bg-[#E04A3C]/15 text-[#E04A3C] border-2 border-[#1E293B] text-[10px] font-bold font-mono flex items-center gap-1">
                                  <ShieldAlert className="h-2.5 w-2.5" /> Blocked
                                </Badge>
                              ) : st.is_disabled ? (
                                <Badge className="bg-[#F5C842]/30 text-[#B45309] border-2 border-[#1E293B] text-[10px] font-bold font-mono flex items-center gap-1">
                                  <UserX className="h-2.5 w-2.5" /> Disabled
                                </Badge>
                              ) : null}
                            </div>
                            <div className="text-xs text-[#1E293B]/70 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>{st.topicCount} topics tested</span>
                              <span>•</span>
                              <span className="text-[#2F8A5F] font-bold">{st.strongCount} strong</span>
                              <span>•</span>
                              <span className="text-[#E04A3C] font-bold">{st.weakCount} weak</span>
                              {st.weakestTopicName && (
                                <>
                                  <span>•</span>
                                  <span className="text-[#E04A3C] font-semibold truncate max-w-[200px]">
                                    Needs help in {st.weakestTopicName}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Accuracy Score Pill & Drilldown Arrow */}
                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#1E293B]/20">
                          <div className="text-right font-mono">
                            <div className="flex items-center gap-2">
                              <div className={`px-3 py-1.5 rounded-xl font-mono text-sm font-black shadow-[1px_1px_0_#1E293B] ${scoreColor}`}>
                                {st.overall}%
                              </div>
                            </div>
                            <span className="text-[10px] text-[#1E293B]/60 uppercase block mt-0.5">Overall Accuracy</span>
                          </div>

                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-9 px-3 rounded-xl text-[#1E293B] group-hover:bg-[#FFF9E8] text-xs font-bold flex items-center gap-1 border-2 border-transparent group-hover:border-[#1E293B]"
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
          <DialogContent className="bg-white border-[2.5px] border-[#1E293B] text-[#1E293B] max-w-2xl rounded-3xl p-6 sm:p-8 max-h-[88vh] overflow-y-auto shadow-[6px_6px_0_#1E293B]">
            <DialogHeader>
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] flex items-center justify-center text-xl font-black text-[#1E293B] shrink-0 shadow-[2px_2px_0_#1E293B]">
                  {selectedStudent.name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-[#F5C842] text-[#1E293B] border-2 border-[#1E293B] font-mono font-bold text-xs shadow-[1px_1px_0_#1E293B]">
                      Rank #{selectedStudent.rank} in Batch
                    </Badge>
                    <span className="text-xs text-[#1E293B]/70 font-mono font-semibold">{currentBatch?.name}</span>
                  </div>
                  <DialogTitle className="font-head text-2xl sm:text-3xl font-black text-[#1E293B] mt-1 truncate">
                    {selectedStudent.name}
                  </DialogTitle>
                </div>
              </div>
            </DialogHeader>

            {loadingDrill ? (
              <div className="p-16 text-center text-xs text-[#1E293B]/70 flex items-center justify-center gap-2.5">
                <span className="h-5 w-5 border-2 border-[#1E293B] border-t-transparent rounded-full animate-spin" />
                <span className="font-bold">Loading complete student diagnostic telemetry…</span>
              </div>
            ) : studentDrill ? (
              <div className="mt-6 space-y-6">
                {/* Score & Summary KPI Header */}
                <div className="p-5 rounded-3xl bg-[#FFF9E8] border-2 border-[#1E293B] flex flex-col sm:flex-row items-center justify-around gap-4 shadow-[3px_3px_0_#1E293B]">
                  <CircularProgress
                    score={selectedStudent.overall}
                    size={84}
                    strokeWidth={7}
                    color={
                      selectedStudent.overall >= 75
                        ? "#2F8A5F"
                        : selectedStudent.overall >= 55
                        ? "#B45309"
                        : "#E04A3C"
                    }
                  />

                  <div className="grid grid-cols-2 gap-3 w-full sm:w-auto font-mono text-xs text-center sm:text-left">
                    <div className="p-3 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]">
                      <span className="text-[#1E293B]/60 text-[10px] block uppercase font-bold">Assessments</span>
                      <span className="text-[#1E293B] font-black text-base">{studentDrill.trend?.length || 0} completed</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]">
                      <span className="text-[#1E293B]/60 text-[10px] block uppercase font-bold">Weak Concepts</span>
                      <span className="text-[#E04A3C] font-black text-base">{selectedStudent.weakCount} flagged</span>
                    </div>
                  </div>
                </div>

                {/* Detailed Concept Breakdown List */}
                <div className="space-y-3">
                  <h4 className="text-xs uppercase font-bold tracking-wider text-[#1E293B] font-mono">
                    Concept Mastery Calibration ({studentDrill.topics?.length || 0})
                  </h4>

                  {studentDrill.topics?.length === 0 ? (
                    <p className="text-xs text-[#1E293B]/70 p-4 bg-[#FFF9E8] rounded-2xl border-2 border-[#1E293B]">
                      No topic calibrations recorded yet.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {studentDrill.topics.map((t, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-2xl bg-white border-2 border-[#1E293B] flex items-center justify-between gap-3 text-xs shadow-[2px_2px_0_#1E293B]"
                        >
                          <div className="min-w-0">
                            <span className="text-[#1E293B] font-bold truncate block">{t.topic}</span>
                            <span className="text-[11px] text-[#1E293B]/70 truncate block font-mono">
                              {t.subject} • {t.chapter} • {t.attempts} Qs
                            </span>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span
                              className={`font-mono font-black px-2.5 py-1 rounded-xl border-2 border-[#1E293B] ${
                                t.band === "weak"
                                  ? "text-[#E04A3C] bg-[#E04A3C]/15"
                                  : t.band === "strong"
                                  ? "text-[#2F8A5F] bg-[#2F8A5F]/15"
                                  : "text-[#B45309] bg-[#F5C842]/30"
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
                  <h4 className="text-xs uppercase font-bold tracking-wider text-[#1E293B] font-mono">
                    Submission History Log ({studentDrill.trend?.length || 0})
                  </h4>

                  {studentDrill.trend?.length === 0 ? (
                    <p className="text-xs text-[#1E293B]/70">No submissions recorded.</p>
                  ) : (
                    <div className="space-y-2">
                      {studentDrill.trend.slice(0, 5).map((tr, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-2xl bg-white border-2 border-[#1E293B] text-xs font-mono shadow-[2px_2px_0_#1E293B]"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="text-[#1E293B] font-bold block truncate">{tr.title || "Assessment"}</span>
                            <span className="text-[#1E293B]/70 text-[11px]">
                              {tr.correct}/{tr.total} correct • {tr.kind === "dpp" ? "Chapterwise Practice" : "Timed Test"}
                            </span>
                          </div>
                          <span
                            className={`font-black px-2.5 py-1 rounded-xl border-2 border-[#1E293B] shrink-0 ${
                              tr.score >= 75
                                ? "bg-[#2F8A5F]/15 text-[#2F8A5F]"
                                : tr.score >= 55
                                ? "bg-[#F5C842]/30 text-[#B45309]"
                                : "bg-[#E04A3C]/15 text-[#E04A3C]"
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
                <div className="flex items-center justify-end gap-3 pt-3 border-t-2 border-[#1E293B]/20">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedStudent(null)}
                    className="rounded-full border-2 border-[#1E293B] text-[#1E293B] hover:bg-[#FFF9E8] font-bold"
                  >
                    Close
                  </Button>
                  <Button
                    asChild
                    className="rounded-full bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] border-2 border-[#1E293B] font-bold shadow-[2px_2px_0_#1E293B]"
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
            <DialogContent data-testid="fee-modal-content" className="bg-white border-[2.5px] border-[#1E293B] text-[#1E293B] max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 sm:p-7 shadow-[6px_6px_0_#1E293B]">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] flex items-center justify-center text-[#1E293B] shadow-[2px_2px_0_#1E293B]">
                    <IndianRupee className="h-5 w-5" />
                  </div>
                  <div>
                    <DialogTitle className="font-head text-xl font-black text-[#1E293B]">
                      Manage Student Fees &amp; Proportions
                    </DialogTitle>
                    <p className="text-xs text-[#1E293B]/70 font-mono mt-0.5 truncate max-w-sm">
                      {feeModal.student.name} • {feeModal.student.email}
                    </p>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Snapshot Numbers */}
                <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] text-center font-mono shadow-[2px_2px_0_#1E293B]">
                  <div>
                    <span className="text-[10px] text-[#1E293B]/60 uppercase block font-bold">Total Fee</span>
                    <span className="text-sm font-black text-[#1E293B]">₹{studentTotal.toLocaleString()}</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-[10px] text-[#1E293B]/60 uppercase font-bold">Paid So Far</span>
                      <button
                        type="button"
                        onClick={() => setFeeModal((prev) => ({ ...prev, editPaidMode: !prev.editPaidMode }))}
                        className="p-0.5 rounded text-[#1E293B]/70 hover:text-[#2F8A5F] transition-colors"
                        title="Edit fees paid so far"
                      >
                        <Pencil className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    {feeModal.editPaidMode ? (
                      <div className="relative mt-1 px-1">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[#1E293B]/60 font-mono">₹</span>
                        <Input
                          data-testid="edit-paid-fee-input"
                          type="number"
                          min={0}
                          value={feeModal.paid_fee}
                          onChange={(e) => handlePaidFeeChange(e.target.value)}
                          className="pl-5 h-7 rounded-lg bg-white border-2 border-[#2F8A5F] text-[#2F8A5F] font-mono text-xs text-center font-bold"
                          placeholder="0"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <div
                        data-testid="display-paid-fee"
                        onClick={() => setFeeModal((prev) => ({ ...prev, editPaidMode: true }))}
                        className="text-sm font-black text-[#2F8A5F] cursor-pointer hover:underline flex items-center justify-center gap-1 mt-0.5"
                        title="Click to edit paid amount"
                      >
                        ₹{Number(feeModal.paid_fee || 0).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-[10px] text-[#1E293B]/60 uppercase font-bold">Current Due</span>
                      <button
                        type="button"
                        onClick={() => setFeeModal((prev) => ({ ...prev, editDueMode: !prev.editDueMode }))}
                        className="p-0.5 rounded text-[#1E293B]/70 hover:text-[#E04A3C] transition-colors"
                        title="Edit current due fee"
                      >
                        <Pencil className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    {feeModal.editDueMode ? (
                      <div className="relative mt-1 px-1">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[#1E293B]/60 font-mono">₹</span>
                        <Input
                          data-testid="edit-due-fee-input"
                          type="number"
                          min={0}
                          value={feeModal.due_fee}
                          onChange={(e) => handleDueFeeChange(e.target.value)}
                          className="pl-5 h-7 rounded-lg bg-white border-2 border-[#E04A3C] text-[#E04A3C] font-mono text-xs text-center font-bold"
                          placeholder="0"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <div
                        data-testid="display-due-fee"
                        onClick={() => setFeeModal((prev) => ({ ...prev, editDueMode: true }))}
                        className="text-sm font-black text-[#E04A3C] cursor-pointer hover:underline flex items-center justify-center gap-1 mt-0.5"
                        title="Click to edit due amount"
                      >
                        ₹{Number(feeModal.due_fee || 0).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Total Fee Adjuster with Proportional Notice */}
                <div className="space-y-1.5 p-3.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-[#1E293B] uppercase tracking-wider flex items-center gap-1.5">
                      <span>Total Annual Fee for this Student</span>
                    </Label>
                    {batchTotal > 0 && studentTotal !== batchTotal && (
                      <button
                        type="button"
                        onClick={() => handleStudentTotalFeeChange(String(batchTotal))}
                        className="text-[11px] text-[#3E7CB1] hover:underline font-mono font-bold"
                        title="Reset to batch default fee"
                      >
                        Reset to Batch Default (₹{batchTotal.toLocaleString()})
                      </button>
                    )}
                  </div>
                  <div className="relative mt-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#1E293B]/60 font-mono">₹</span>
                    <Input
                      data-testid="fee-total-input"
                      type="number"
                      min={0}
                      value={feeModal.total_fee}
                      onChange={(e) => handleStudentTotalFeeChange(e.target.value)}
                      className="pl-8 rounded-xl bg-white border-2 border-[#1E293B] text-[#1E293B] font-mono text-sm h-10 shadow-[2px_2px_0_#1E293B]"
                      placeholder="e.g. 60000"
                    />
                  </div>
                  <p className="text-[11px] text-[#1E293B]/70 font-mono leading-relaxed">
                    Batch default is ₹{batchTotal.toLocaleString()}. Updating this distributes monthly installment amounts proportionally.
                  </p>
                </div>

                {/* Advance Option: Month-by-Month Proportional Distribution Accordion */}
                <div className="rounded-2xl border-2 border-[#1E293B] bg-white overflow-hidden transition-all shadow-[2px_2px_0_#1E293B]">
                  <button
                    type="button"
                    data-testid="toggle-student-advance-btn"
                    onClick={() => setFeeModal((prev) => ({ ...prev, show_advance: !prev.show_advance }))}
                    className="w-full flex items-center justify-between p-3.5 text-left text-xs font-mono hover:bg-[#FFF9E8] transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4 text-[#1E293B]" />
                      <span className="font-bold text-[#1E293B]">Advance Option: Month-by-Month Distribution</span>
                    </span>
                    <span className="text-[#3E7CB1] flex items-center gap-1 font-bold text-xs">
                      {feeModal.show_advance ? (
                        <><span>Hide Schedule</span><ChevronUp className="h-4 w-4" /></>
                      ) : (
                        <><span>Customize 12 Months ({currentSched.length})</span><ChevronDown className="h-4 w-4" /></>
                      )}
                    </span>
                  </button>

                  {feeModal.show_advance && (
                    <div className="p-3.5 pt-1 space-y-3 border-t-2 border-[#1E293B]/20">
                      {/* Action buttons & Live Balance Check */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono pt-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={handleDistributeStudentScheduleEvenly}
                            className="px-2.5 py-1 rounded-lg bg-[#FFF9E8] hover:bg-[#F5C842]/30 text-[#1E293B] border-2 border-[#1E293B] text-[11px] font-mono font-bold transition-colors shadow-[1px_1px_0_#1E293B]"
                          >
                            Distribute Evenly
                          </button>
                          <button
                            type="button"
                            onClick={handleResetStudentScheduleToBatch}
                            className="px-2.5 py-1 rounded-lg bg-[#FFF9E8] hover:bg-[#F5C842]/30 text-[#1E293B] border-2 border-[#1E293B] text-[11px] font-mono font-bold transition-colors shadow-[1px_1px_0_#1E293B]"
                          >
                            Reset to Batch Proportions
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[#1E293B]/70 text-[11px] font-bold">Sum: ₹{schedSum.toLocaleString()}</span>
                          {Math.abs(diff) < 1 ? (
                            <Badge className="bg-[#2F8A5F]/15 text-[#2F8A5F] border-2 border-[#1E293B] text-[10px] font-mono px-2 py-0.5 font-bold">
                              <Check className="h-3 w-3 mr-0.5" /> Balanced
                            </Badge>
                          ) : (
                            <Badge className="bg-[#F5C842]/30 text-[#B45309] border-2 border-[#1E293B] text-[10px] font-mono px-2 py-0.5 font-bold">
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
                              className={`p-2.5 rounded-xl border-2 text-xs font-mono transition-all ${
                                isMonthPaid
                                  ? "bg-[#2F8A5F]/10 border-[#2F8A5F]"
                                  : "bg-[#FFF9E8] border-[#1E293B]"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="font-bold text-[#1E293B] text-xs">{item.month}</span>
                                <div className="flex items-center gap-1">
                                  {isMonthPaid && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#2F8A5F] inline-block" title="Paid" />
                                  )}
                                  <span className="text-[10px] text-[#1E293B]/60 font-mono font-bold">
                                    {percent}%
                                  </span>
                                </div>
                              </div>
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[#1E293B]/60">₹</span>
                                <Input
                                  type="number"
                                  min={0}
                                  value={item.amount}
                                  onChange={(e) => handleUpdateStudentMonthAmount(item.month, e.target.value)}
                                  className="pl-6 h-8 rounded-lg bg-white border border-[#1E293B] text-[#1E293B] font-mono text-xs"
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
                  <div className="pt-2 border-t-2 border-[#1E293B]/20">
                    <span className="text-[10px] uppercase font-mono text-[#1E293B]/70 block mb-1.5 font-bold">Payment History:</span>
                    <div className="max-h-28 overflow-y-auto space-y-1.5 rounded-xl bg-[#FFF9E8] p-2.5 border-2 border-[#1E293B]">
                      {feeModal.student.payments.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs font-mono text-[#1E293B]">
                          <span className="truncate">
                            ₹{Number(p.amount || 0).toLocaleString()}
                            {p.month ? <span className="text-[#2F8A5F] ml-1 font-bold">({p.month})</span> : null}
                            {p.is_partial ? <span className="text-[#B45309] ml-1 font-bold">[Partial]</span> : null}
                            {" — "}{p.notes || "Received"}
                          </span>
                          <span className="text-[10px] text-[#1E293B]/60 shrink-0 ml-2">{new Date(p.date).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 pt-2 border-t-2 border-[#1E293B]/20">
                <Button
                  variant="outline"
                  onClick={() => setFeeModal((prev) => ({ ...prev, open: false }))}
                  className="rounded-full border-2 border-[#1E293B] text-[#1E293B] hover:bg-[#FFF9E8] font-bold"
                >
                  Cancel
                </Button>
                {Number(feeModal.due_fee || 0) > 0 && (
                  <Button
                    type="button"
                    data-testid="mark-paid-full-btn"
                    onClick={() => handleSaveFee(true)}
                    disabled={feeModal.saving}
                    className="rounded-full bg-[#2F8A5F] hover:bg-[#27734F] text-white font-bold border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Mark Paid in Full
                  </Button>
                )}
                <Button
                  type="button"
                  data-testid="save-fee-payment-btn"
                  onClick={() => handleSaveFee(false)}
                  disabled={feeModal.saving}
                  className="rounded-full bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] font-bold border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs"
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
        <DialogContent className="rounded-3xl border-[2.5px] border-[#1E293B] bg-white text-[#1E293B] max-w-lg max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-[6px_6px_0_#1E293B]">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] flex items-center justify-center text-[#1E293B] shadow-[2px_2px_0_#1E293B]">
                <Pencil className="h-5 w-5 text-[#3E7CB1]" />
              </div>
              <div>
                <DialogTitle className="font-head text-2xl font-black text-[#1E293B]">Edit Batch Details</DialogTitle>
                <p className="text-xs text-[#1E293B]/70 font-mono mt-0.5">
                  Update batch name, annual fees, and monthly installments
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div>
              <Label className="font-semibold text-xs text-[#1E293B]/70 uppercase">Batch Name</Label>
              <Input
                className={inp}
                value={editModal.name}
                onChange={(e) => setEditModal({ ...editModal, name: e.target.value })}
                placeholder="e.g. Class 10 — Newton Scholars"
              />
            </div>

            <div>
              <Label className="font-semibold text-xs text-[#1E293B]/70 uppercase">CBSE Class Level</Label>
              <Select
                value={editModal.class_level}
                onValueChange={(v) => setEditModal({ ...editModal, class_level: v })}
              >
                <SelectTrigger className={inp}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-2 border-[#1E293B] text-[#1E293B] shadow-[4px_4px_0_#1E293B]">
                  <SelectItem value="9">Class 9</SelectItem>
                  <SelectItem value="10">Class 10</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {renderBatchFeeFields(editModal, setEditModal, true)}
          </div>

          <DialogFooter className="gap-2 pt-2 border-t-2 border-[#1E293B]/20">
            <Button
              variant="outline"
              onClick={() => setEditModal((prev) => ({ ...prev, open: false }))}
              className="rounded-full border-2 border-[#1E293B] text-[#1E293B] hover:bg-[#FFF9E8] font-bold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEditBatch}
              disabled={editModal.saving}
              className="rounded-full bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] font-black border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs h-10 px-6 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              {editModal.saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Save Batch Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7. Unmark Month as Paid Confirmation Modal */}
      <Dialog open={unmarkModal.open} onOpenChange={(open) => !open && setUnmarkModal((prev) => ({ ...prev, open: false }))}>
        <DialogContent className="rounded-3xl border-[2.5px] border-[#1E293B] bg-white text-[#1E293B] max-w-md p-6 sm:p-7 shadow-[6px_6px_0_#1E293B]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-[#E04A3C]/15 border-2 border-[#1E293B] flex items-center justify-center text-[#E04A3C] shadow-[2px_2px_0_#1E293B]">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="font-head text-xl font-black text-[#1E293B]">Unmark Paid Status</DialogTitle>
                <p className="text-xs text-[#1E293B]/70 font-mono mt-0.5">
                  Revert payment for {unmarkModal.student?.name}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-3 text-sm">
            <div className="p-3.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] space-y-2 shadow-[2px_2px_0_#1E293B]">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-[#1E293B]/70">Student:</span>
                <span className="font-bold text-[#1E293B]">{unmarkModal.student?.name}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-[#1E293B]/70">Month to Unmark:</span>
                <span className="font-bold text-[#E04A3C]">{unmarkModal.month}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-[#1E293B]/70">Scheduled Fee:</span>
                <span className="font-bold text-[#1E293B]">₹{Number(unmarkModal.amount || 0).toLocaleString()}</span>
              </div>
              {unmarkModal.collection_date && (
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-[#1E293B]/70">Payment Recorded On:</span>
                  <span className="text-[#2F8A5F] font-bold">{new Date(unmarkModal.collection_date).toLocaleDateString()}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-[#1E293B]/70 leading-relaxed">
              Are you sure you want to unmark <strong>{unmarkModal.month}</strong> as paid?
              The student&apos;s paid total will be reduced by <strong className="text-[#1E293B]">₹{Number(unmarkModal.amount || 0).toLocaleString()}</strong> and this month will return to <strong>Due</strong> status.
            </p>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t-2 border-[#1E293B]/20">
            <Button
              variant="outline"
              onClick={() => setUnmarkModal((prev) => ({ ...prev, open: false }))}
              className="rounded-full border-2 border-[#1E293B] text-[#1E293B] hover:bg-[#FFF9E8] font-bold"
            >
              Cancel
            </Button>
            <Button
              data-testid="confirm-unmark-paid-btn"
              onClick={handleConfirmUnmark}
              disabled={unmarkModal.saving}
              className="rounded-full bg-[#E04A3C] hover:bg-[#C93B2E] text-white font-bold text-xs px-5 border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
            >
              {unmarkModal.saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
              Confirm &amp; Unmark Paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 8. Partial Payment Modal */}
      <Dialog open={partialModal.open} onOpenChange={(open) => !open && setPartialModal((prev) => ({ ...prev, open: false }))}>
        <DialogContent className="rounded-3xl border-[2.5px] border-[#1E293B] bg-white text-[#1E293B] max-w-md p-6 sm:p-7 shadow-[6px_6px_0_#1E293B]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] flex items-center justify-center text-[#1E293B] shadow-[2px_2px_0_#1E293B]">
                <IndianRupee className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="font-head text-xl font-black text-[#1E293B]">Record Partial Payment</DialogTitle>
                <p className="text-xs text-[#1E293B]/70 font-mono mt-0.5">
                  {partialModal.student?.name} • Month of {partialModal.month}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-3 text-sm">
            {/* Status breakdown for this month */}
            <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] text-center font-mono text-xs shadow-[2px_2px_0_#1E293B]">
              <div>
                <span className="text-[10px] text-[#1E293B]/60 uppercase block font-bold">Scheduled</span>
                <span className="font-bold text-[#1E293B]">₹{Number(partialModal.scheduledAmount || 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[10px] text-[#1E293B]/60 uppercase block font-bold">Paid So Far</span>
                <span className="font-black text-[#2F8A5F]">₹{Number(partialModal.paidSoFar || 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[10px] text-[#1E293B]/60 uppercase block font-bold">Remaining Due</span>
                <span className="font-black text-[#E04A3C]">₹{Number(partialModal.remainingDue || 0).toLocaleString()}</span>
              </div>
            </div>

            {/* Partial Amount Input */}
            <div>
              <Label className="text-xs font-bold text-[#1E293B]">
                Partial Amount Receiving Now (₹)
              </Label>
              <div className="relative mt-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#1E293B]/60 font-mono">₹</span>
                <Input
                  data-testid="partial-fee-amount-input"
                  type="number"
                  min={1}
                  value={partialModal.partialAmount}
                  onChange={(e) => setPartialModal((prev) => ({ ...prev, partialAmount: e.target.value }))}
                  placeholder="Enter partial amount"
                  className="pl-8 rounded-xl bg-white border-2 border-[#1E293B] text-[#1E293B] font-mono text-sm h-10 shadow-[2px_2px_0_#1E293B]"
                />
              </div>

              {/* Quick suggestions */}
              {partialModal.remainingDue > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setPartialModal((prev) => ({ ...prev, partialAmount: String(partialModal.remainingDue) }))}
                    className="px-2.5 py-1 rounded-lg bg-[#FFF9E8] hover:bg-[#2F8A5F]/20 text-[#2F8A5F] border-2 border-[#1E293B] text-[11px] font-mono font-bold transition-colors shadow-[1px_1px_0_#1E293B]"
                  >
                    Pay Full Remaining (₹{partialModal.remainingDue.toLocaleString()})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPartialModal((prev) => ({ ...prev, partialAmount: String(Math.round(partialModal.remainingDue / 2)) }))}
                    className="px-2.5 py-1 rounded-lg bg-[#FFF9E8] hover:bg-[#F5C842]/40 text-[#B45309] border-2 border-[#1E293B] text-[11px] font-mono font-bold transition-colors shadow-[1px_1px_0_#1E293B]"
                  >
                    Pay Half (₹{Math.round(partialModal.remainingDue / 2).toLocaleString()})
                  </button>
                </div>
              )}
            </div>

            {/* Date */}
            <div>
              <Label className="text-xs font-bold text-[#1E293B]">Date of Collection</Label>
              <Input
                type="date"
                value={partialModal.payment_date}
                onChange={(e) => setPartialModal((prev) => ({ ...prev, payment_date: e.target.value }))}
                className="mt-1 rounded-xl bg-white border-2 border-[#1E293B] text-[#1E293B] text-xs h-10 font-mono shadow-[1px_1px_0_#1E293B]"
              />
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs font-bold text-[#1E293B]">Payment Notes / Reference</Label>
              <Input
                value={partialModal.notes}
                onChange={(e) => setPartialModal((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="e.g. Partial cash payment, UPI Ref #..."
                className="mt-1 rounded-xl bg-white border-2 border-[#1E293B] text-[#1E293B] text-xs shadow-[1px_1px_0_#1E293B]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t-2 border-[#1E293B]/20">
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
                className="rounded-full border-2 border-[#1E293B] text-[#E04A3C] hover:bg-[#E04A3C]/10 text-xs font-bold mr-auto"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Revert Payments
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setPartialModal((prev) => ({ ...prev, open: false }))}
              className="rounded-full border-2 border-[#1E293B] text-[#1E293B] hover:bg-[#FFF9E8] text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              data-testid="save-partial-payment-btn"
              onClick={handleSavePartialPayment}
              disabled={partialModal.saving}
              className="rounded-full bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] border-2 border-[#1E293B] font-bold text-xs shadow-[2px_2px_0_#1E293B]"
            >
              {partialModal.saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <IndianRupee className="h-4 w-4 mr-1" />}
              Record Partial Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block Student Account & Regenerate Batch Code Confirmation Dialog */}
      <Dialog
        open={blockModal.open}
        onOpenChange={(open) => {
          if (!blockModal.saving) {
            setBlockModal({ open, student: null, saving: false });
          }
        }}
      >
        <DialogContent className="sm:max-w-md bg-white border-[2.5px] border-[#1E293B] text-[#1E293B] rounded-3xl shadow-[6px_6px_0_#1E293B]">
          <DialogHeader>
            <DialogTitle className="font-head text-lg font-black text-[#E04A3C] flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" /> Block Student Account
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-[#1E293B]/70 leading-relaxed">
              Are you sure you want to block{" "}
              <strong className="text-[#1E293B] font-bold">{blockModal.student?.name}</strong>{" "}
              (<span className="font-mono text-xs text-[#1E293B]/80 font-bold">{blockModal.student?.email}</span>)?
            </p>

            <div className="rounded-xl p-3.5 bg-[#E04A3C]/10 border-2 border-[#1E293B] space-y-2">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-[#E04A3C] shrink-0 mt-0.5" />
                <div className="text-xs text-[#1E293B] leading-relaxed space-y-1.5">
                  <p className="font-bold text-[#E04A3C]">Security Actions on Blocking:</p>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-[#1E293B]/80 font-medium">
                    <li>The student will be blocked and <strong>will not be able to log in</strong>.</li>
                    <li>
                      The <strong>batch code</strong> for <span className="font-bold text-[#1E293B]">{currentBatch?.name}</span> (currently <span className="font-mono font-bold text-[#1E293B] bg-[#FFF9E8] px-1 py-0.5 rounded border border-[#1E293B]">{currentBatch?.code}</span>) will be <strong>automatically regenerated</strong>.
                    </li>
                    <li>Existing students already enrolled remain unaffected, but the old batch code is permanently invalidated.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBlockModal({ open: false, student: null, saving: false })}
              disabled={blockModal.saving}
              className="rounded-full border-2 border-[#1E293B] bg-white text-[#1E293B] hover:bg-[#FFF9E8] text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              data-testid="confirm-block-btn"
              onClick={handleConfirmBlock}
              disabled={blockModal.saving}
              className="rounded-full bg-[#E04A3C] hover:bg-[#C93B2E] text-white font-bold text-xs flex items-center gap-1.5 border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
            >
              {blockModal.saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Blocking…
                </>
              ) : (
                <>
                  <ShieldAlert className="h-3.5 w-3.5 mr-1" /> Confirm &amp; Regenerate Code
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
