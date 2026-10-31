import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "../../lib/api";
import { isConfirmedWeak } from "../../lib/mastery";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import PendingReviewsQueue from "./PendingReviewsQueue";
import {
  Trophy,
  Crown,
  Flame,
  Target,
  Users,
  Search,
  Plus,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

export default function CohortLeaderboardTab({
  batchId,
  activeBatch,
  reportData,
  onRefreshStats,
}) {
  const [leaderboardData, setLeaderboardData] = useState({ topper: null, leaderboard: [] });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTier, setFilterTier] = useState("all"); // "all" | "top" | "active" | "inactive"

  // Fetch batch topper & leaderboard
  useEffect(() => {
    if (!batchId) return;
    setLoading(true);
    api.get(`/batches/${batchId}/topper`)
      .then((res) => {
        setLeaderboardData(res.data || { topper: null, leaderboard: [] });
      })
      .catch((err) => {
        toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to load leaderboard");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [batchId]);

  const leaderboard = useMemo(() => leaderboardData.leaderboard || [], [leaderboardData]);
  const topper = useMemo(() => leaderboardData.topper, [leaderboardData]);

  // Derived statistics
  const stats = useMemo(() => {
    const total = leaderboard.length;
    const active = leaderboard.filter((s) => (s.tests_taken || 0) > 0);
    const totalTests = leaderboard.reduce((acc, s) => acc + (s.tests_taken || 0), 0);
    const avgAccuracy =
      active.length > 0
        ? Math.round(active.reduce((acc, s) => acc + (s.accuracy || 0), 0) / active.length)
        : 0;

    return {
      totalEnrolled: total,
      activeCount: active.length,
      totalTestsAttempted: totalTests,
      avgAccuracy,
    };
  }, [leaderboard]);

  // Filtered student list
  const filteredLeaderboard = useMemo(() => {
    return leaderboard.filter((s) => {
      const matchesSearch = (s.name || "").toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (filterTier === "top") return (s.accuracy || 0) >= 75 && (s.tests_taken || 0) > 0;
      if (filterTier === "active") return (s.tests_taken || 0) > 0;
      if (filterTier === "inactive") return (s.tests_taken || 0) === 0;
      return true;
    });
  }, [leaderboard, searchQuery, filterTier]);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. COHORT LEADERBOARD HERO & STATS BANNER */}
      <div className="rounded-3xl bg-white border-[3px] border-[#1E293B] shadow-[6px_6px_0_#1E293B] p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b-2 border-[#1E293B]/10">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F5C842] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-900 uppercase">
                <Trophy className="h-3.5 w-3.5 text-[#1E293B]" /> Leaderboard
              </span>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#5B9BD5] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-bold">
                Class {activeBatch?.class_level || "General"}
              </span>
              <Badge className="bg-[#4CAF7D] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-mono text-xs px-3 py-0.5 rounded-full">
                {activeBatch?.name || "Active Batch"}
              </Badge>
            </div>

            <h2 className="font-head text-2xl sm:text-3xl font-900 text-[#1E293B]">
              Rankings &amp; Performance Standings
            </h2>
          </div>

          {/* Quick Action Button */}
          <div className="flex items-center gap-3 shrink-0">
            <Button
              asChild
              className="rounded-full bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] hover:-translate-y-0.5 font-head font-bold text-sm px-5 h-11"
            >
              <Link to="/dpp/new">
                <Plus className="h-4 w-4 mr-1.5" /> + New Practice Test
              </Link>
            </Button>
          </div>
        </div>

        {/* 4 Telemetry Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] space-y-1">
            <div className="flex items-center justify-between text-[#64748B]">
              <span className="text-[11px] font-mono font-bold uppercase">Enrolled Students</span>
              <Users className="h-4 w-4 text-[#5B9BD5]" />
            </div>
            <div className="font-head text-2xl sm:text-3xl font-900 text-[#1E293B]">
              {stats.totalEnrolled}
            </div>
            <span className="text-[10px] text-[#64748B] font-medium">Batch Roster</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] space-y-1">
            <div className="flex items-center justify-between text-[#64748B]">
              <span className="text-[11px] font-mono font-bold uppercase">Active Ranked</span>
              <Target className="h-4 w-4 text-[#4CAF7D]" />
            </div>
            <div className="font-head text-2xl sm:text-3xl font-900 text-[#4CAF7D]">
              {stats.activeCount}
            </div>
            <span className="text-[10px] text-[#64748B] font-medium">With &ge; 1 Submission</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] space-y-1">
            <div className="flex items-center justify-between text-[#64748B]">
              <span className="text-[11px] font-mono font-bold uppercase">Batch Accuracy</span>
              <TrendingUp className="h-4 w-4 text-[#FF6B5E]" />
            </div>
            <div className="font-head text-2xl sm:text-3xl font-900 text-[#1E293B]">
              {stats.avgAccuracy}%
            </div>
            <span className="text-[10px] text-[#64748B] font-medium">Average across tests</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] space-y-1">
            <div className="flex items-center justify-between text-[#64748B]">
              <span className="text-[11px] font-mono font-bold uppercase">Current Topper</span>
              <Crown className="h-4 w-4 text-[#F5C842]" />
            </div>
            <div className="font-head text-lg sm:text-xl font-900 text-[#1E293B] truncate">
              {topper?.name || "None yet"}
            </div>
            <span className="text-[10px] text-[#64748B] font-mono font-bold">
              {topper ? `${topper.avg_score}% Avg • ${topper.tests_taken} Tests` : "Awaiting first test"}
            </span>
          </div>
        </div>
      </div>

      {/* 2. FULL COHORT LEADERBOARD TABLE */}
      <div className="rounded-3xl bg-white border-[3px] border-[#1E293B] shadow-[6px_6px_0_#1E293B] p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-2xl bg-[#5B9BD5] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-head text-xl font-900 text-[#1E293B]">Complete Batch Standings</h3>
              <span className="text-xs text-[#64748B] font-bold">
                Showing {filteredLeaderboard.length} of {leaderboard.length} enrolled students
              </span>
            </div>
          </div>

          {/* Search & Tier Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative">
              <Search className="h-4 w-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Search student..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 w-full sm:w-48 rounded-full border-2 border-[#1E293B] text-xs bg-[#FFF9E8] font-medium"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-full bg-[#FFF9E8] border-2 border-[#1E293B] text-xs">
              <button
                type="button"
                onClick={() => setFilterTier("all")}
                className={`px-3 py-1 rounded-full font-head font-bold transition-all text-xs ${
                  filterTier === "all"
                    ? "bg-[#F5C842] text-[#1E293B] shadow-[1px_1px_0_#1E293B]"
                    : "text-[#1E293B] hover:bg-white"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterTier("top")}
                className={`px-3 py-1 rounded-full font-head font-bold transition-all text-xs ${
                  filterTier === "top"
                    ? "bg-[#4CAF7D] text-white shadow-[1px_1px_0_#1E293B]"
                    : "text-[#1E293B] hover:bg-white"
                }`}
              >
                &ge;75%
              </button>
              <button
                type="button"
                onClick={() => setFilterTier("active")}
                className={`px-3 py-1 rounded-full font-head font-bold transition-all text-xs ${
                  filterTier === "active"
                    ? "bg-[#5B9BD5] text-white shadow-[1px_1px_0_#1E293B]"
                    : "text-[#1E293B] hover:bg-white"
                }`}
              >
                Active
              </button>
            </div>
          </div>
        </div>

        {/* Table / List */}
        {loading ? (
          <div className="p-12 text-center text-sm font-head font-bold text-[#64748B]">
            Loading leaderboard standings...
          </div>
        ) : filteredLeaderboard.length === 0 ? (
          <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-8 text-center text-xs text-[#64748B] space-y-2">
            <Trophy className="h-8 w-8 text-[#F5C842] mx-auto opacity-70" />
            <p className="font-bold text-[#1E293B]">No Students Matching Filter</p>
            <p>Try clearing your search query or reset filter pills to view all students.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FFF9E8] border-b-2 border-[#1E293B] font-head font-900 text-[#1E293B] uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-4 w-16 text-center">Rank</th>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Accuracy / Score</th>
                  <th className="py-3 px-4 text-center">Tests Taken</th>
                  <th className="py-3 px-4 text-center">Streak</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-[#1E293B]/10 font-medium">
                {filteredLeaderboard.map((student, idx) => {
                  const rank = student.rank || idx + 1;
                  const isTop3 = rank <= 3;
                  const rankBadgeClass =
                    rank === 1
                      ? "bg-[#F5C842] text-[#1E293B] border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B]"
                      : rank === 2
                      ? "bg-[#E2E8F0] text-[#475569] border-2 border-[#94A3B8]"
                      : rank === 3
                      ? "bg-[#FED7AA] text-[#C2410C] border-2 border-[#FDBA74]"
                      : "bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1]";

                  return (
                    <tr
                      key={student.student_id || idx}
                      className="hover:bg-[#FFF9E8]/50 transition-colors"
                    >
                      {/* Rank */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-head font-900 text-xs ${rankBadgeClass}`}
                        >
                          {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`}
                        </span>
                      </td>

                      {/* Student info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-full border-2 border-[#1E293B] flex items-center justify-center font-head font-bold text-xs shrink-0 ${
                              isTop3 ? "bg-[#F5C842] text-[#1E293B]" : "bg-white text-[#1E293B]"
                            }`}
                          >
                            {(student.name || "S").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-head font-bold text-sm text-[#1E293B] block">
                              {student.name}
                            </span>
                            <span className="text-[10px] text-[#64748B] font-mono">
                              {student.batch_name || activeBatch?.name}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Accuracy / Score Bar */}
                      <td className="py-3.5 px-4 font-mono">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-[#1E293B]">
                            <span>{student.accuracy || 0}% Accuracy</span>
                            <span className="text-[#64748B] text-[10px]">{student.total_score || 0} pts</span>
                          </div>
                          <div className="w-full bg-[#E2E8F0] h-2 rounded-full border border-[#1E293B] overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                (student.accuracy || 0) >= 75
                                  ? "bg-[#4CAF7D]"
                                  : (student.accuracy || 0) >= 50
                                  ? "bg-[#F5C842]"
                                  : "bg-[#FF6B5E]"
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, student.accuracy || 0))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Tests Taken */}
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-[#1E293B]">
                        <span className="px-2.5 py-1 rounded-full bg-[#FFF9E8] border border-[#1E293B] text-[11px]">
                          {student.tests_taken || 0} tests
                        </span>
                      </td>

                      {/* Streak */}
                      <td className="py-3.5 px-4 text-center font-mono">
                        {(student.streak_days || 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF6B5E]/10 border border-[#FF6B5E] text-[#FF6B5E] font-bold text-[11px]">
                            <Flame className="h-3 w-3 fill-[#FF6B5E]" /> {student.streak_days}d
                          </span>
                        ) : (
                          <span className="text-[#94A3B8] text-[11px]">-</span>
                        )}
                      </td>

                      {/* Performance Status */}
                      <td className="py-3.5 px-4 text-center">
                        {(student.tests_taken || 0) === 0 ? (
                          <Badge className="bg-[#E2E8F0] text-[#64748B] border border-[#CBD5E1] text-[10px] font-mono">
                            Awaiting Test
                          </Badge>
                        ) : rank === 1 ? (
                          <Badge className="bg-[#F5C842] text-[#1E293B] border-2 border-[#1E293B] text-[10px] font-bold">
                            🌟 Batch Topper
                          </Badge>
                        ) : (student.accuracy || 0) >= 75 ? (
                          <Badge className="bg-[#4CAF7D] text-white border-2 border-[#1E293B] text-[10px] font-bold">
                            Top Performer
                          </Badge>
                        ) : (student.accuracy || 0) >= 50 ? (
                          <Badge className="bg-[#5B9BD5] text-white border-2 border-[#1E293B] text-[10px] font-bold">
                            Steady
                          </Badge>
                        ) : (
                          <Badge className="bg-[#FF6B5E] text-white border-2 border-[#1E293B] text-[10px] font-bold">
                            Needs Practice
                          </Badge>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          size="sm"
                          asChild
                          className="rounded-full bg-[#FFF9E8] hover:bg-[#F5C842] text-[#1E293B] border-2 border-[#1E293B] text-[11px] h-7 px-3 font-head font-bold shadow-[1px_1px_0_#1E293B]"
                        >
                          <Link to="/dpp/new">
                            <Plus className="h-3 w-3 mr-1" /> Practice
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

      {/* 4. ANALYTICS & REVIEWS (2 Columns: Weak Topics & Pending Reviews) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Class Weak Topics Leaderboard */}
        <div className="rounded-3xl bg-white p-6 sm:p-8 space-y-5 border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-[#FF6B5E] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center">
                <TrendingDown className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="font-head text-xl font-900 text-[#1E293B]">
                  Class Weak Topics Leaderboard
                </h3>
                <span className="text-xs text-[#64748B] font-bold">Concepts with lowest batch accuracy</span>
              </div>
            </div>
            <Badge className="bg-[#FF6B5E] text-white border-2 border-[#1E293B] font-mono text-[10px] px-2.5 py-0.5">
              Auto-Ranked
            </Badge>
          </div>

          {!reportData || (reportData.weak_topics || []).length === 0 ? (
            <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-8 text-center text-xs text-[#64748B] space-y-1">
              <CheckCircle2 className="h-8 w-8 text-[#4CAF7D] mx-auto opacity-70" />
              <p className="font-bold text-[#1E293B]">No Attempted Topics Yet</p>
              <p>Topic rankings appear once students in this batch submit tests or practice sets.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reportData.weak_topics.slice(0, 5).map((w, idx) => {
                // weak_topics is pre-sorted with batch-confirmed weak topics first, then lowest class average
                const isSevere = isConfirmedWeak(w);
                return (
                  <div
                    key={`${w.subject}|${w.chapter}|${w.topic}|${idx}`}
                    className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] hover:-translate-y-0.5 transition-all"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-900 text-[#FF6B5E]">#{idx + 1}</span>
                        <Badge className="bg-[#5B9BD5] text-white border-2 border-[#1E293B] text-[10px] font-bold">
                          {w.subject}
                        </Badge>
                        <span className="text-xs text-[#64748B] font-mono font-bold">{w.chapter}</span>
                      </div>
                      <h4 className="font-head text-sm sm:text-base font-800 text-[#1E293B] truncate">
                        {w.topic}
                      </h4>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right font-mono">
                        <div
                          className={`font-head text-xl font-900 ${
                            isSevere ? "text-[#FF6B5E]" : "text-[#1E293B]"
                          }`}
                        >
                          {w.class_avg}%
                        </div>
                        <span className="text-[10px] text-[#64748B] uppercase font-bold">Class Avg</span>
                      </div>

                      <Button
                        size="sm"
                        asChild
                        className="rounded-full bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs h-8 px-3.5 font-head font-bold"
                      >
                        <Link to="/dpp/new">
                          <Plus className="h-3.5 w-3.5 mr-1" /> + Practice Test
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pending Question Reviews Queue */}
        <PendingReviewsQueue
          onQueueChange={() => {
            if (onRefreshStats) onRefreshStats();
          }}
        />
      </div>
    </div>
  );
}
