import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  IndianRupee,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  ExternalLink,
  Wallet,
  Calendar,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

const DEFAULT_ACADEMIC_MONTHS = [
  "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "January", "February", "March"
];

export default function BatchFeeStatusTab({ batchId, activeBatch }) {
  const [feeData, setFeeData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Determine current calendar month name as default (e.g. "October")
  const currentCalendarMonth = useMemo(() => {
    return new Date().toLocaleString("en-US", { month: "long" });
  }, []);

  const [selectedMonth, setSelectedMonth] = useState(currentCalendarMonth);

  useEffect(() => {
    if (!batchId) return;
    setLoading(true);
    api.get(`/batches/${batchId}/students`)
      .then((res) => {
        setFeeData(res.data);
      })
      .catch((err) => {
        toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to load fee status");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [batchId]);

  const rawStudents = useMemo(() => feeData?.students || [], [feeData]);

  // Available months from schedule or default academic cycle
  const availableMonths = useMemo(() => {
    if (feeData?.fee_schedule && feeData.fee_schedule.length > 0) {
      return feeData.fee_schedule.map((item) => item.month);
    }
    return DEFAULT_ACADEMIC_MONTHS;
  }, [feeData]);

  // Ensure selectedMonth is valid in the available schedule; fallback to current month or first
  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.some((m) => m.toLowerCase() === selectedMonth.toLowerCase())) {
      const match = availableMonths.find((m) => m.toLowerCase() === currentCalendarMonth.toLowerCase());
      if (match) {
        setSelectedMonth(match);
      } else {
        setSelectedMonth(availableMonths[0]);
      }
    }
  }, [availableMonths, currentCalendarMonth, selectedMonth]);

  // Process each student for the selected month and compute past arrears
  const processedStudents = useMemo(() => {
    return rawStudents.map((s) => {
      const monthlyList = s.monthly_status || [];
      const activeIdx = monthlyList.findIndex(
        (m) => m.month?.toLowerCase() === selectedMonth.toLowerCase()
      );

      let monthItem = null;
      let pastMonths = [];

      if (activeIdx !== -1) {
        monthItem = monthlyList[activeIdx];
        pastMonths = monthlyList.slice(0, activeIdx);
      } else {
        // Fallback search if exact index not found
        monthItem = monthlyList.find(
          (m) => m.month?.toLowerCase() === selectedMonth.toLowerCase()
        );
        const curIdx = DEFAULT_ACADEMIC_MONTHS.findIndex(
          (m) => m.toLowerCase() === selectedMonth.toLowerCase()
        );
        if (curIdx > 0) {
          const pastNames = DEFAULT_ACADEMIC_MONTHS.slice(0, curIdx);
          pastMonths = monthlyList.filter((m) =>
            pastNames.some((pn) => pn.toLowerCase() === m.month?.toLowerCase())
          );
        }
      }

      // Current month figures
      const monthAmount = Number(monthItem?.amount || (s.total_fee ? Math.round(s.total_fee / 12) : 0));
      const monthPaid = Number(monthItem?.paid_amount || 0);
      const monthDue = Number(
        monthItem !== null && monthItem !== undefined
          ? monthItem.due_amount
          : Math.max(0, monthAmount - monthPaid)
      );
      const isPaid = Boolean(monthItem?.is_paid || (monthAmount > 0 && monthPaid >= monthAmount));
      const isPartial = Boolean(monthItem?.is_partial || (monthPaid > 0 && !isPaid));
      const monthStatus = isPaid ? "paid" : isPartial ? "partial" : "due";

      // Past arrears: previous months where due_amount > 0 or not paid
      const overduePastList = pastMonths.filter(
        (m) => Number(m.due_amount || 0) > 0 || (!m.is_paid && !m.is_partial && Number(m.amount || 0) > 0)
      );
      const pastArrearsAmount = overduePastList.reduce(
        (acc, m) => acc + Number(m.due_amount || m.amount || 0),
        0
      );
      const pastOverdueMonths = overduePastList.map((m) => m.month);

      return {
        ...s,
        monthAmount,
        monthPaid,
        monthDue,
        monthStatus,
        isPaid,
        isPartial,
        pastArrearsAmount,
        pastOverdueMonths,
        pastOverdueCount: overduePastList.length,
      };
    });
  }, [rawStudents, selectedMonth]);

  // Sort students: pending for this month or past month come first!
  // Priority:
  // 1. Students with past arrears (delinquent past months)
  // 2. Students with this month due
  // 3. Students with this month partial
  // 4. Fully paid students
  // Within same rank: sort by total pending (monthDue + pastArrearsAmount) descending, then alphabetical name
  const sortedStudents = useMemo(() => {
    return [...processedStudents].sort((a, b) => {
      // Past arrears priority
      const aHasPast = a.pastArrearsAmount > 0;
      const bHasPast = b.pastArrearsAmount > 0;
      if (aHasPast !== bHasPast) return aHasPast ? -1 : 1;

      // Current month status urgency: due (0) > partial (1) > paid (2)
      const getStatusScore = (s) => (s.monthStatus === "due" ? 0 : s.monthStatus === "partial" ? 1 : 2);
      const statusScoreDiff = getStatusScore(a) - getStatusScore(b);
      if (statusScoreDiff !== 0) return statusScoreDiff;

      // Total pending amount descending
      const aTotalPending = a.monthDue + a.pastArrearsAmount;
      const bTotalPending = b.monthDue + b.pastArrearsAmount;
      if (bTotalPending !== aTotalPending) return bTotalPending - aTotalPending;

      // Tie breaker: Alphabetical name
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [processedStudents]);

  // Filtered students by search query
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return sortedStudents;
    const q = searchQuery.toLowerCase().trim();
    return sortedStudents.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q)
    );
  }, [sortedStudents, searchQuery]);

  // Aggregate current month telemetry
  const monthTelemetry = useMemo(() => {
    const totalStudents = processedStudents.length;
    const thisMonthExpected = processedStudents.reduce((sum, s) => sum + s.monthAmount, 0);
    const thisMonthCollected = processedStudents.reduce((sum, s) => sum + s.monthPaid, 0);
    const thisMonthDues = processedStudents.reduce((sum, s) => sum + s.monthDue, 0);

    const paidCount = processedStudents.filter((s) => s.isPaid).length;
    const partialCount = processedStudents.filter((s) => s.isPartial).length;
    const dueCount = processedStudents.filter((s) => !s.isPaid && !s.isPartial).length;

    const totalPastArrears = processedStudents.reduce((sum, s) => sum + s.pastArrearsAmount, 0);
    const studentsWithArrearsCount = processedStudents.filter((s) => s.pastArrearsAmount > 0).length;

    const collectionRate = thisMonthExpected > 0
      ? Math.round((thisMonthCollected / thisMonthExpected) * 100)
      : 0;

    return {
      totalStudents,
      thisMonthExpected,
      thisMonthCollected,
      thisMonthDues,
      paidCount,
      partialCount,
      dueCount,
      totalPastArrears,
      studentsWithArrearsCount,
      collectionRate,
    };
  }, [processedStudents]);

  if (loading) {
    return (
      <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] p-12 text-center text-[#1E293B]">
        <div className="inline-block h-8 w-8 border-3 border-[#1E293B] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="font-head text-base font-bold text-[#1E293B]">
          Fetching Fee Status for {activeBatch?.name || "Cohort"}…
        </p>
        <p className="text-xs text-[#64748B] font-mono mt-1">Retrieving {selectedMonth} fee telemetry and balances</p>
      </div>
    );
  }

  if (!loading && rawStudents.length === 0) {
    return (
      <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] p-10 sm:p-14 text-center space-y-4">
        <div className="h-14 w-14 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center mx-auto">
          <Users className="h-7 w-7 text-[#5B9BD5]" />
        </div>
        <div>
          <h3 className="font-head text-xl font-900 text-[#1E293B]">No Students Enrolled in this Cohort</h3>
          <p className="text-xs sm:text-sm text-[#64748B] font-medium max-w-md mx-auto mt-1">
            Share the batch code with your students so they can join and appear on this fee ledger.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 bg-[#FFF9E8] px-4 py-2 rounded-2xl border-2 border-[#1E293B] font-mono text-xs font-bold text-[#1E293B]">
          <span>Batch Code:</span>
          <code className="bg-white px-2.5 py-1 rounded-lg border-2 border-[#1E293B] text-sm font-black text-[#1E293B]">
            {activeBatch?.code}
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. KEY TELEMETRY STRIP - THIS MONTH FOCUS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Cohort Students */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span className="font-head font-bold uppercase tracking-wider text-[10px]">
              Enrolled Students
            </span>
            <div className="h-7 w-7 rounded-lg bg-[#5B9BD5]/15 flex items-center justify-center border border-[#1E293B]">
              <Users className="h-3.5 w-3.5 text-[#5B9BD5]" />
            </div>
          </div>
          <div className="font-head text-2xl sm:text-3xl font-900 text-[#1E293B] mt-2">
            {monthTelemetry.totalStudents}
          </div>
          <div className="text-[11px] text-[#64748B] font-mono font-bold mt-1">
            Class {activeBatch?.class_level || feeData?.class_level} Cohort
          </div>
        </div>

        {/* Card 2: This Month Collected */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span className="font-head font-bold uppercase tracking-wider text-[10px]">
              {selectedMonth} Collected
            </span>
            <div className="h-7 w-7 rounded-lg bg-[#2F8A5F]/15 flex items-center justify-center border border-[#1E293B]">
              <IndianRupee className="h-3.5 w-3.5 text-[#2F8A5F]" />
            </div>
          </div>
          <div className="font-head text-2xl sm:text-3xl font-900 text-[#2F8A5F] mt-2">
            ₹{monthTelemetry.thisMonthCollected.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#2F8A5F] font-mono font-bold mt-1 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            <span>{monthTelemetry.paidCount} students clear for {selectedMonth}</span>
          </div>
        </div>

        {/* Card 3: This Month Pending */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span className="font-head font-bold uppercase tracking-wider text-[10px]">
              {selectedMonth} Pending
            </span>
            <div className="h-7 w-7 rounded-lg bg-[#E04A3C]/15 flex items-center justify-center border border-[#1E293B]">
              <Clock className="h-3.5 w-3.5 text-[#E04A3C]" />
            </div>
          </div>
          <div className="font-head text-2xl sm:text-3xl font-900 text-[#E04A3C] mt-2">
            ₹{monthTelemetry.thisMonthDues.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#E04A3C] font-mono font-bold mt-1 flex items-center gap-1">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span>{monthTelemetry.dueCount + monthTelemetry.partialCount} students pending for {selectedMonth}</span>
          </div>
        </div>

        {/* Card 4: Past Arrears & Month Collection Rate */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span className="font-head font-bold uppercase tracking-wider text-[10px]">
              Past Arrears
            </span>
            <div className="h-7 w-7 rounded-lg bg-[#B45309]/15 flex items-center justify-center border border-[#1E293B]">
              <Wallet className="h-3.5 w-3.5 text-[#B45309]" />
            </div>
          </div>
          <div className="font-head text-2xl sm:text-3xl font-900 text-[#B45309] mt-2">
            ₹{monthTelemetry.totalPastArrears.toLocaleString()}
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#64748B] font-mono font-bold mt-1">
            <span className="text-[#B45309]">
              {monthTelemetry.studentsWithArrearsCount} with past dues
            </span>
            <span className="text-[#1E293B]">
              {monthTelemetry.collectionRate}% {selectedMonth.slice(0, 3)} Settled
            </span>
          </div>
          <div className="w-full bg-[#E2E8F0] h-1.5 rounded-full border border-[#1E293B] overflow-hidden mt-1">
            <div
              className="bg-[#4CAF7D] h-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, monthTelemetry.collectionRate))}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2. STUDENT FEE ROSTER SECTION */}
      <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] p-5 sm:p-7 space-y-4">
        {/* Header with Month Selector, Search and Open Full Ledger */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b-2 border-[#1E293B]/20">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="font-head text-lg sm:text-xl font-900 text-[#1E293B] flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#5B9BD5]" />
                Cohort Fee Status
              </h3>
              {/* Month Selector Pill */}
              <div className="relative inline-flex items-center">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="appearance-none bg-[#FFF9E8] hover:bg-[#FBEFC8] border-2 border-[#1E293B] rounded-xl pl-3 pr-8 py-1 text-xs font-head font-900 text-[#1E293B] shadow-[2px_2px_0_#1E293B] cursor-pointer focus:outline-none transition-colors"
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-3.5 w-3.5 absolute right-2.5 pointer-events-none text-[#1E293B]" />
              </div>
            </div>
            <p className="text-xs text-[#64748B] font-medium mt-1">
              Showing <span className="font-bold text-[#1E293B]">{selectedMonth}</span> fees sorted by pending accounts &amp; past arrears
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="relative w-full sm:w-56">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
              <Input
                placeholder="Search student…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs rounded-xl bg-[#FFF9E8] border-2 border-[#1E293B] text-[#1E293B] font-semibold"
              />
            </div>
            <Button
              asChild
              size="sm"
              className="rounded-xl bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] border-2 border-[#1E293B] font-head font-bold text-xs h-9 shadow-[2px_2px_0_#1E293B] shrink-0"
            >
              <Link to={`/batches?batch_id=${batchId}`}>
                Open Full Ledger <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Student Table / Cards */}
        {filteredStudents.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#64748B] font-mono bg-[#FFF9E8] rounded-2xl border-2 border-[#1E293B]">
            No students match your search criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-[#1E293B]/20 text-[#64748B] font-head font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Student</th>
                  <th className="py-2.5 px-3">{selectedMonth} Fee</th>
                  <th className="py-2.5 px-3">Paid</th>
                  <th className="py-2.5 px-3">Due</th>
                  <th className="py-2.5 px-3">Past Arrears</th>
                  <th className="py-2.5 px-3 text-center">{selectedMonth} Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]/10 font-mono">
                {filteredStudents.map((s) => {
                  const isPaid = s.isPaid;
                  const isPartial = s.isPartial;
                  const status = s.monthStatus;
                  const hasArrears = s.pastArrearsAmount > 0;

                  return (
                    <tr
                      key={s.id}
                      className={`transition-colors ${
                        hasArrears
                          ? "bg-[#E04A3C]/5 hover:bg-[#E04A3C]/10"
                          : !isPaid
                          ? "hover:bg-[#FFF9E8]"
                          : "hover:bg-[#FFF9E8]/60"
                      }`}
                    >
                      {/* Student info */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`h-8 w-8 rounded-full border-2 border-[#1E293B] flex items-center justify-center font-head font-black text-xs shrink-0 ${
                              hasArrears
                                ? "bg-[#E04A3C]/20 text-[#E04A3C]"
                                : !isPaid
                                ? "bg-[#F5C842]/40 text-[#B45309]"
                                : "bg-[#FFF9E8] text-[#1E293B]"
                            }`}
                          >
                            {s.name?.charAt(0)?.toUpperCase() || "S"}
                          </div>
                          <div className="min-w-0">
                            <span className="font-head font-bold text-sm text-[#1E293B] block truncate font-sans">
                              {s.name}
                            </span>
                            <span className="text-[11px] text-[#64748B] truncate block">
                              {s.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Month Fee */}
                      <td className="py-3 px-3 font-bold text-[#1E293B]">
                        ₹{Number(s.monthAmount || 0).toLocaleString()}
                      </td>

                      {/* Month Paid */}
                      <td className="py-3 px-3 font-bold text-[#2F8A5F]">
                        ₹{Number(s.monthPaid || 0).toLocaleString()}
                      </td>

                      {/* Month Due */}
                      <td className="py-3 px-3 font-bold text-[#E04A3C]">
                        ₹{Number(s.monthDue || 0).toLocaleString()}
                      </td>

                      {/* Past Arrears */}
                      <td className="py-3 px-3">
                        {hasArrears ? (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#E04A3C]/15 border border-[#E04A3C]/50 text-[#E04A3C] font-bold text-[11px]">
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            <span>₹{Number(s.pastArrearsAmount).toLocaleString()}</span>
                            <span className="text-[9px] uppercase tracking-tight opacity-80">
                              ({s.pastOverdueCount} {s.pastOverdueCount === 1 ? "mo" : "mos"})
                            </span>
                          </div>
                        ) : (
                          <span className="text-[#2F8A5F] text-[11px] font-bold inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 shrink-0" />
                            Clear
                          </span>
                        )}
                      </td>

                      {/* Status for Selected Month */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-head font-black uppercase border border-[#1E293B] shadow-[1px_1px_0_#1E293B] ${
                            isPaid
                              ? "bg-[#2F8A5F]/20 text-[#2F8A5F]"
                              : isPartial
                              ? "bg-[#F5C842]/40 text-[#B45309]"
                              : "bg-[#E04A3C]/20 text-[#E04A3C]"
                          }`}
                        >
                          {status}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-3 text-right">
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2.5 text-xs font-head font-bold text-[#5B9BD5] hover:text-[#1E293B] hover:bg-[#FFF9E8]"
                        >
                          <Link to={`/batches?batch_id=${batchId}`}>
                            Record <ArrowRight className="h-3 w-3 ml-1" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
