import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { isConfirmedWeak, isConfirmedStrong } from "../lib/mastery";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  BarChart3,
  Loader2,
  TrendingDown,
  TrendingUp,
  X,
  Users,
  FileText,
  Calendar,
  Award,
  Download,
  AlertTriangle,
  Clock,
  CheckCircle2,
  HelpCircle,
  ShieldAlert
} from "lucide-react";
import { toast } from "sonner";

const BAND = {
  weak: { label: "Weak", cell: "bg-[#FF6B5E]/20 text-[#1E293B] border-2 border-[#1E293B]", badge: "bg-[#FF6B5E]/20 text-[#1E293B] border-2 border-[#1E293B] font-bold" },
  developing: { label: "Developing", cell: "bg-[#F5C842]/30 text-[#1E293B] border-2 border-[#1E293B]", badge: "bg-[#F5C842]/30 text-[#1E293B] border-2 border-[#1E293B] font-bold" },
  strong: { label: "Strong", cell: "bg-[#4CAF7D]/25 text-[#1E293B] border-2 border-[#1E293B]", badge: "bg-[#4CAF7D]/25 text-[#1E293B] border-2 border-[#1E293B] font-bold" },
  not_attempted: { label: "Untested", cell: "bg-gray-100 text-[#1E293B]/40 border border-gray-300", badge: "bg-gray-100 text-[#1E293B]/50" },
  insufficient_data: { label: "Too few Qs", cell: "bg-gray-100 text-[#1E293B]/60 border border-dashed border-gray-400", badge: "bg-gray-100 text-[#1E293B]/60 border border-dashed border-[#1E293B]/40" }
};

const key = (t) => `${t.subject}|${t.chapter}|${t.topic}`;

export default function Reports() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "test");
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState(searchParams.get("batch_id") || "");

  // Per-Test Report States
  const [batchTests, setBatchTests] = useState([]);
  const [selectedTestId, setSelectedTestId] = useState(searchParams.get("test_id") || "");
  const [testReport, setTestReport] = useState(null);
  const [loadingTestReport, setLoadingTestReport] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Weekly Digest States
  const [weeklyDigest, setWeeklyDigest] = useState(null);
  const [loadingWeekly, setLoadingWeekly] = useState(false);

  // Term Report States
  const [termReport, setTermReport] = useState(null);
  const [loadingTerm, setLoadingTerm] = useState(false);

  // Legacy Matrix States
  const [matrixData, setMatrixData] = useState(null);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [drill, setDrill] = useState(null);

  // Load Batches
  useEffect(() => {
    api.get("/batches")
      .then((r) => {
        setBatches(r.data);
        setBatchId((curr) => curr || (r.data.length > 0 ? r.data[0].id : ""));
      })
      .catch(() => {});
  }, []);

  // When batchId changes, fetch tests for this batch
  useEffect(() => {
    if (!batchId) {
      setBatchTests([]);
      return;
    }
    api.get("/tests")
      .then((r) => {
        const tests = (r.data || []).filter((t) => t.batch_id === batchId || !t.batch_id);
        setBatchTests(tests);
        setSelectedTestId((curr) => curr || (tests.length > 0 ? tests[0].id : ""));
      })
      .catch(() => {});
  }, [batchId]);

  // Load Per-Test Report
  useEffect(() => {
    if (activeTab !== "test" || !selectedTestId) return;
    setLoadingTestReport(true);
    api.get(`/reports/test/${selectedTestId}`)
      .then((r) => setTestReport(r.data))
      .catch((e) => toast.error(formatApiErrorDetail(e.response?.data?.detail)))
      .finally(() => setLoadingTestReport(false));
  }, [activeTab, selectedTestId]);

  // Load Weekly Digest
  useEffect(() => {
    if (activeTab !== "weekly" || !batchId) return;
    setLoadingWeekly(true);
    api.get(`/reports/batch/${batchId}/weekly`)
      .then((r) => setWeeklyDigest(r.data))
      .catch((e) => toast.error(formatApiErrorDetail(e.response?.data?.detail)))
      .finally(() => setLoadingWeekly(false));
  }, [activeTab, batchId]);

  // Load Term Report
  useEffect(() => {
    if (activeTab !== "term" || !batchId) return;
    setLoadingTerm(true);
    api.get(`/reports/batch/${batchId}/term`)
      .then((r) => setTermReport(r.data))
      .catch((e) => toast.error(formatApiErrorDetail(e.response?.data?.detail)))
      .finally(() => setLoadingTerm(false));
  }, [activeTab, batchId]);

  // Load Matrix
  useEffect(() => {
    if (activeTab !== "matrix" || !batchId) return;
    setLoadingMatrix(true);
    setDrill(null);
    api.get("/mastery/teacher", { params: { batch_id: batchId } })
      .then((r) => setMatrixData(r.data))
      .catch((e) => toast.error(formatApiErrorDetail(e.response?.data?.detail)))
      .finally(() => setLoadingMatrix(false));
  }, [activeTab, batchId]);

  const handleDownloadPdf = async () => {
    if (!selectedTestId) return;
    setDownloadingPdf(true);
    try {
      const response = await api.get(`/reports/test/${selectedTestId}/pdf`, {
        responseType: "blob"
      });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `TestReport_${selectedTestId.slice(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success("Assessment PDF downloaded successfully!");
    } catch (e) {
      toast.error("Failed to generate report PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const openDrill = async (sid) => {
    try {
      const r = await api.get(`/mastery/teacher/student/${sid}`);
      setDrill(r.data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const columns = (matrixData?.weak_topics || []).slice(0, 8);
  const studentMap = {};
  (matrixData?.students || []).forEach((s) => {
    studentMap[s.id] = {};
    s.topics.forEach((t) => { studentMap[s.id][key(t)] = t; });
  });

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="rounded-3xl bg-[#F5C842] border-[2.5px] border-[#1E293B] p-6 sm:p-8 shadow-[4px_4px_0_#1E293B] flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <span className="inline-block px-3 py-1 rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] text-xs font-900 uppercase tracking-widest shadow-[2px_2px_0_#1E293B]">
            Institutional Intelligence
          </span>
          <h1 className="font-head text-3xl sm:text-4xl font-900 tracking-tight text-[#1E293B] flex items-center gap-2.5 mt-2">
            <BarChart3 className="h-8 w-8 text-[#1E293B]" /> ACADEMIC REPORTS
          </h1>
          <p className="text-[#1E293B]/80 font-medium mt-1">
            Psychometrics, discrimination analysis, weekly movement, and official PDF exports.
          </p>
        </div>

        {/* Global Batch Selector */}
        <div className="w-full lg:w-72">
          <label className="block text-xs font-mono font-bold text-[#1E293B] mb-1.5 uppercase">Select Active Batch</label>
          <Select value={batchId} onValueChange={(val) => { setBatchId(val); setSelectedTestId(""); }}>
            <SelectTrigger data-testid="report-batch" className="rounded-xl bg-[#FFF9E8] border-2 border-[#1E293B] text-[#1E293B] font-bold">
              <SelectValue placeholder="Choose a batch" />
            </SelectTrigger>
            <SelectContent>
              {batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} (Class {b.class_level})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b-2 border-[#1E293B]/20 font-head">
        <button
          onClick={() => setActiveTab("test")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-sm transition-all border-2 border-[#1E293B] ${
            activeTab === "test"
              ? "bg-[#1E293B] text-white shadow-[3px_3px_0_#F5C842]"
              : "bg-white text-[#1E293B] hover:bg-[#FFF9E8]"
          }`}
        >
          <FileText className="h-4 w-4" /> Per-Test Batch Analytics
        </button>

        <button
          onClick={() => setActiveTab("weekly")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-sm transition-all border-2 border-[#1E293B] ${
            activeTab === "weekly"
              ? "bg-[#1E293B] text-white shadow-[3px_3px_0_#F5C842]"
              : "bg-white text-[#1E293B] hover:bg-[#FFF9E8]"
          }`}
        >
          <Calendar className="h-4 w-4" /> Rolling Weekly Digest
        </button>

        <button
          onClick={() => setActiveTab("term")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-sm transition-all border-2 border-[#1E293B] ${
            activeTab === "term"
              ? "bg-[#1E293B] text-white shadow-[3px_3px_0_#F5C842]"
              : "bg-white text-[#1E293B] hover:bg-[#FFF9E8]"
          }`}
        >
          <Award className="h-4 w-4" /> Term & Coverage Overview
        </button>

        <button
          onClick={() => setActiveTab("matrix")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-sm transition-all border-2 border-[#1E293B] ${
            activeTab === "matrix"
              ? "bg-[#1E293B] text-white shadow-[3px_3px_0_#F5C842]"
              : "bg-white text-[#1E293B] hover:bg-[#FFF9E8]"
          }`}
        >
          <Users className="h-4 w-4" /> Student Mastery Matrix
        </button>
      </div>

      {/* TAB 1: PER-TEST BATCH REPORT */}
      {activeTab === "test" && (
        <div className="space-y-6">
          {/* Test Selection Ribbon */}
          <div className="rounded-2xl bg-white border-2 border-[#1E293B] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[3px_3px_0_#1E293B]">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-xs font-mono font-bold text-[#1E293B] shrink-0">Select Assessment:</span>
              <div className="w-full max-w-md">
                <Select value={selectedTestId} onValueChange={setSelectedTestId}>
                  <SelectTrigger className="rounded-xl bg-[#FFF9E8] border border-[#1E293B] font-bold text-xs truncate">
                    <SelectValue placeholder="Choose a test to inspect" />
                  </SelectTrigger>
                  <SelectContent>
                    {batchTests.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title} ({t.kind?.toUpperCase()} · {t.question_count || (t.questions || []).length} Qs)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {testReport && (
              <Button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="rounded-full bg-[#1E293B] hover:bg-[#334155] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-bold h-9 px-4 shrink-0 flex items-center gap-1.5"
              >
                {downloadingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Download Official PDF
              </Button>
            )}
          </div>

          {!selectedTestId ? (
            <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-12 text-center text-[#1E293B]/70 font-bold shadow-[4px_4px_0_#1E293B]">
              No assessments found for this batch. Create a test to view psychometric batch reports.
            </div>
          ) : loadingTestReport ? (
            <div className="p-12 text-center text-[#1E293B] font-bold flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-[#1E293B]" /> Crunching batch psychometrics…
            </div>
          ) : !testReport ? (
            <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-12 text-center text-[#1E293B]/70 font-bold">
              Unable to load report data.
            </div>
          ) : (
            <>
              {/* Ingestion Quality Signal Alert */}
              {testReport.ingestion_quality?.has_unknown && (
                <div data-testid="report-ingestion-quality" className="rounded-2xl bg-[#FFF9E8] border-2 border-[#D97706] p-4 flex items-start gap-3 shadow-[2px_2px_0_#D97706]">
                  <AlertTriangle className="h-5 w-5 text-[#D97706] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-head font-bold text-sm text-[#92400E]">
                      Ingestion Quality Signal: Unclassified Questions Detected
                    </div>
                    <p className="text-xs text-[#B45309] font-medium mt-0.5">
                      {testReport.ingestion_quality.signal} Questions failing subject inference are marked <strong>Unknown</strong> to prevent corrupting Maths mastery. Update tags in the Question Bank.
                    </p>
                  </div>
                </div>
              )}

              {/* Data Retrieval Cap Warning Banner */}
              {testReport.is_capped && (
                <div data-testid="report-cap-warning" className="rounded-2xl bg-[#FFF9E8] border-2 border-[#D97706] p-4 flex items-start gap-3 shadow-[2px_2px_0_#D97706]">
                  <AlertTriangle className="h-5 w-5 text-[#D97706] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-head font-bold text-sm text-[#92400E]">
                      Data Limit Reached
                    </div>
                    <p className="text-xs text-[#B45309] font-medium mt-0.5">
                      {testReport.cap_warning}
                    </p>
                  </div>
                </div>
              )}

              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] space-y-1">
                  <span className="text-[10px] uppercase font-mono font-bold text-[#64748B] block">Batch Average</span>
                  <div className="flex items-baseline gap-2">
                    <span className="font-head text-3xl font-900 text-[#1E293B]">{testReport.summary.avg_score}%</span>
                    <Badge className={BAND[testReport.summary.score_band]?.badge}>{testReport.summary.score_band}</Badge>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] space-y-1">
                  <span className="text-[10px] uppercase font-mono font-bold text-[#64748B] block">Median Score</span>
                  <span className="font-head text-3xl font-900 text-[#1E293B]">{testReport.summary.median_score}%</span>
                </div>

                <div className="p-5 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] space-y-1">
                  <span className="text-[10px] uppercase font-mono font-bold text-[#64748B] block">Batch Topper</span>
                  <span className="font-head text-3xl font-900 text-[#2F8A5F]">{testReport.summary.topper_score}%</span>
                </div>

                <div className="p-5 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] space-y-1">
                  <span className="text-[10px] uppercase font-mono font-bold text-[#64748B] block">Completion Rate</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-head text-3xl font-900 text-[#1E293B]">
                      {testReport.completion_rate !== null && testReport.completion_rate !== undefined
                        ? `${testReport.completion_rate}%`
                        : "N/A"}
                    </span>
                    <span className="text-xs font-mono text-[#64748B]">
                      {testReport.enrolled_count !== null && testReport.enrolled_count !== undefined
                        ? `(${testReport.submitted_count}/${testReport.enrolled_count})`
                        : `(${testReport.submitted_count} submitted)`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Score Distribution Visual Histogram */}
              <div className="p-6 rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-head text-lg font-900 text-[#1E293B]">Cohort Score Distribution</h3>
                  <span className="text-xs font-mono text-[#64748B]">{testReport.submitted_count} Submissions Analyzed</span>
                </div>

                <div className="grid grid-cols-5 gap-3 pt-2">
                  {[
                    { label: "0-39% (Critical)", count: testReport.score_distribution["0-39"], color: "bg-[#FF6B5E]" },
                    { label: "40-54% (Weak)", count: testReport.score_distribution["40-54"], color: "bg-[#FF8A7A]" },
                    { label: "55-74% (Developing)", count: testReport.score_distribution["55-74"], color: "bg-[#F5C842]" },
                    { label: "75-89% (Proficient)", count: testReport.score_distribution["75-89"], color: "bg-[#7CD0A2]" },
                    { label: "90-100% (Mastery)", count: testReport.score_distribution["90-100"], color: "bg-[#4CAF7D]" },
                  ].map((bucket, idx) => {
                    const maxCount = Math.max(...Object.values(testReport.score_distribution), 1);
                    const barHeightPct = Math.round((bucket.count / maxCount) * 100);
                    return (
                      <div key={idx} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-[#FFF9E8]/50 border border-[#1E293B]/20">
                        <div className="w-full h-24 bg-white/70 rounded-xl border border-[#1E293B]/10 flex items-end p-1">
                          <div
                            style={{ height: `${Math.max(12, barHeightPct)}%` }}
                            className={`w-full rounded-lg ${bucket.color} border border-[#1E293B]/30 transition-all flex items-center justify-center font-mono text-[11px] font-900 text-white shadow-sm`}
                          >
                            {bucket.count}
                          </div>
                        </div>
                        <span className="text-[10px] font-head font-bold text-[#1E293B] text-center">{bucket.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Psychometrics & Item Discrimination Table */}
              <div className="p-6 rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] space-y-4 overflow-x-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-head text-lg font-900 text-[#1E293B]">Question Discrimination & Psychometrics</h3>
                    <p className="text-xs text-[#64748B]">
                      Discrimination Index (D) contrasts top 33% vs bottom 33% students to pinpoint ambiguous questions.
                    </p>
                  </div>
                </div>

                <table className="w-full text-xs min-w-[700px] border-collapse">
                  <thead>
                    <tr className="border-b-2 border-[#1E293B] text-left text-[#1E293B]">
                      <th className="py-2.5 px-2 font-900">#</th>
                      <th className="py-2.5 px-3 font-900">Concept Topic</th>
                      <th className="py-2.5 px-2 font-900">Diff</th>
                      <th className="py-2.5 px-2 font-900">Accuracy</th>
                      <th className="py-2.5 px-3 font-900">Discrimination (D)</th>
                      <th className="py-2.5 px-3 font-900">Item Health</th>
                      <th className="py-2.5 px-2 font-900 text-right">Avg Pace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testReport.question_analysis.map((q) => (
                      <tr key={q.index} className="border-b border-[#1E293B]/10 hover:bg-[#FFF9E8]/40">
                        <td className="py-3 px-2 font-mono font-bold text-[#1E293B]">Q{q.index}</td>
                        <td className="py-3 px-3">
                          <span className="font-bold text-[#1E293B] block truncate max-w-[280px]">{q.topic}</span>
                          <span className="text-[10px] text-[#64748B] font-mono">{q.chapter}</span>
                        </td>
                        <td className="py-3 px-2 uppercase font-mono text-[10px] font-bold text-[#64748B]">{q.difficulty}</td>
                        <td className="py-3 px-2 font-mono font-900 text-[#1E293B]">{q.accuracy}%</td>
                        <td className="py-3 px-3 font-mono font-bold">
                          {q.discrimination_index !== null ? q.discrimination_index : "—"}
                        </td>
                        <td className="py-3 px-3">
                          {q.discrimination_rating === "Excellent" ? (
                            <span className="inline-flex items-center gap-1 text-[#2F8A5F] font-bold text-[11px]">
                              <CheckCircle2 className="h-3.5 w-3.5" /> High Discriminator
                            </span>
                          ) : q.discrimination_rating === "Good" ? (
                            <span className="text-[#3E7CB1] font-bold text-[11px]">● Good</span>
                          ) : q.discrimination_rating === "Fair" ? (
                            <span className="text-[#B4881B] font-bold text-[11px]">● Fair</span>
                          ) : q.discrimination_rating === "Poor / Ambiguous" ? (
                            <span className="inline-flex items-center gap-1 text-[#E04A3C] font-bold text-[11px]">
                              <AlertTriangle className="h-3.5 w-3.5" /> Review Distractors
                            </span>
                          ) : (
                            <span className="text-[#64748B]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-2 font-mono text-right">
                          <span className={`font-bold ${q.is_pace_outlier ? "text-[#E04A3C]" : "text-[#1E293B]"}`}>
                            {q.avg_time_s}s
                          </span>
                          {q.is_pace_outlier && (
                            <span className="block text-[9px] text-[#E04A3C] font-bold">Pace Outlier</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Topic Weakness Breakdown & Anomalies */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="p-6 rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] space-y-3">
                  <h3 className="font-head text-base font-900 text-[#1E293B] flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-[#FF6B5E]" /> Topic Weakness Priority
                  </h3>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {testReport.topic_breakdown.map((t, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-[#FFF9E8] border border-[#1E293B]/20 text-xs font-mono">
                        <div className="min-w-0 pr-2">
                          <span className="text-[#1E293B] font-bold truncate block">{t.topic}</span>
                          <span className="text-[10px] text-[#64748B]">{t.chapter} · {t.total_attempts} attempts</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-900 text-sm text-[#1E293B]">{t.accuracy}%</span>
                          <Badge className={BAND[t.band]?.badge}>{BAND[t.band]?.label || t.band}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Anomalies */}
                <div className="p-6 rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] space-y-3">
                  <h3 className="font-head text-base font-900 text-[#1E293B] flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-[#FF6B5E]" /> Exam Integrity & Pace Flags
                  </h3>
                  {testReport.anomalies.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[#64748B] space-y-1 bg-[#F8FAFC] rounded-2xl border border-dashed border-[#1E293B]/30">
                      <CheckCircle2 className="h-6 w-6 text-[#2F8A5F] mx-auto" />
                      <p className="font-bold text-[#1E293B]">Zero Irregularities</p>
                      <p>All student submissions adhered to pacing guidelines with no tab-switching alerts.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                      {testReport.anomalies.map((an, idx) => (
                        <div key={idx} className="p-3.5 rounded-2xl bg-[#FFF5F5] border-2 border-[#FF6B5E] text-xs">
                          <div className="flex items-center justify-between font-bold">
                            <span className="text-[#991B1B]">{an.student_name}</span>
                            <span className="font-mono text-[#1E293B]">Score: {an.score}%</span>
                          </div>
                          <ul className="mt-1 list-disc list-inside text-[11px] text-[#B91C1C] space-y-0.5">
                            {an.reasons.map((r, rIdx) => <li key={rIdx}>{r}</li>)}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: ROLLING WEEKLY DIGEST */}
      {activeTab === "weekly" && (
        <div className="space-y-6">
          {loadingWeekly ? (
            <div className="p-12 text-center text-[#1E293B] font-bold flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Compiling 7-day movement…
            </div>
          ) : !weeklyDigest ? (
            <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-12 text-center text-[#1E293B]/70 font-bold">
              No weekly activity records found for this batch.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] space-y-1">
                  <span className="text-[10px] uppercase font-mono font-bold text-[#64748B] block">Current Week Avg</span>
                  <div className="flex items-baseline gap-2">
                    <span className="font-head text-3xl font-900 text-[#1E293B]">{weeklyDigest.recent_avg}%</span>
                    {weeklyDigest.delta_avg !== null && weeklyDigest.delta_avg !== undefined && (
                      <span className={`text-xs font-bold ${weeklyDigest.delta_avg >= 0 ? "text-[#2F8A5F]" : "text-[#E04A3C]"}`}>
                        {weeklyDigest.delta_avg >= 0 ? `+${weeklyDigest.delta_avg}%` : `${weeklyDigest.delta_avg}%`}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] space-y-1">
                  <span className="text-[10px] uppercase font-mono font-bold text-[#64748B] block">Prior Week Avg</span>
                  <span className="font-head text-3xl font-900 text-[#1E293B]">
                    {weeklyDigest.prior_avg !== null && weeklyDigest.prior_avg !== undefined ? `${weeklyDigest.prior_avg}%` : "—"}
                  </span>
                </div>

                <div className="p-5 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] space-y-1">
                  <span className="text-[10px] uppercase font-mono font-bold text-[#64748B] block">Active Participation</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-head text-3xl font-900 text-[#1E293B]">{weeklyDigest.active_rate}%</span>
                    <span className="text-xs font-mono text-[#64748B]">({weeklyDigest.active_students}/{weeklyDigest.enrolled_count})</span>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] space-y-1">
                  <span className="text-[10px] uppercase font-mono font-bold text-[#64748B] block">Submissions This Week</span>
                  <span className="font-head text-3xl font-900 text-[#1E293B]">{weeklyDigest.submissions_count}</span>
                </div>
              </div>

              {/* Topic Trajectory Table */}
              <div className="p-6 rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] space-y-4 overflow-x-auto">
                <h3 className="font-head text-lg font-900 text-[#1E293B]">Mastery Trajectory & Concept Movement</h3>
                <table className="w-full text-xs min-w-[600px] border-collapse">
                  <thead>
                    <tr className="border-b-2 border-[#1E293B] text-left text-[#1E293B]">
                      <th className="py-2.5 px-3 font-900">Topic</th>
                      <th className="py-2.5 px-2 font-900">This Week</th>
                      <th className="py-2.5 px-2 font-900">Prior Week</th>
                      <th className="py-2.5 px-2 font-900">Net Delta</th>
                      <th className="py-2.5 px-3 font-900">Trajectory</th>
                      <th className="py-2.5 px-2 font-900">Current Band</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyDigest.topic_movement.map((t, idx) => (
                      <tr key={idx} className="border-b border-[#1E293B]/10 hover:bg-[#FFF9E8]/40">
                        <td className="py-3 px-3 font-bold text-[#1E293B]">
                          {t.topic}
                          {t.chapter && <span className="block text-[10px] font-semibold text-[#64748B]">{t.chapter}</span>}
                        </td>
                        <td className="py-3 px-2 font-mono font-bold text-[#1E293B]">
                          {t.current_accuracy !== null && t.current_accuracy !== undefined ? `${t.current_accuracy}%` : "—"}
                        </td>
                        <td className="py-3 px-2 font-mono text-[#64748B]">{t.prior_accuracy !== null ? `${t.prior_accuracy}%` : "—"}</td>
                        <td className="py-3 px-2 font-mono font-bold">
                          {t.delta !== null && t.delta !== undefined ? (
                            <span className={t.delta > 0 ? "text-[#2F8A5F]" : t.delta < 0 ? "text-[#E04A3C]" : "text-[#64748B]"}>
                              {t.delta > 0 ? `+${t.delta}%` : `${t.delta}%`}
                            </span>
                          ) : (
                            <span className="text-[#64748B]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {t.trajectory === "improving" ? (
                            <span className="inline-flex items-center gap-1 text-[#2F8A5F] font-bold">
                              <TrendingUp className="h-3.5 w-3.5" /> Improving
                            </span>
                          ) : t.trajectory === "slipping" ? (
                            <span className="inline-flex items-center gap-1 text-[#E04A3C] font-bold">
                              <TrendingDown className="h-3.5 w-3.5" /> Lagging
                            </span>
                          ) : t.trajectory === "not_practised" ? (
                            <span className="inline-flex items-center gap-1 text-[#B4881B] font-bold">
                              <Clock className="h-3.5 w-3.5" /> Not practised
                            </span>
                          ) : t.trajectory === "new" ? (
                            <span className="text-[#3E7CB1] font-bold">✦ New</span>
                          ) : t.trajectory === "insufficient_data" ? (
                            <span className="text-[#64748B] font-bold">Too few Qs</span>
                          ) : (
                            <span className="text-[#64748B] font-bold">● Steady</span>
                          )}
                        </td>
                        <td className="py-3 px-2">
                          <Badge className={BAND[t.band]?.badge}>{BAND[t.band]?.label || t.band}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: TERM & COVERAGE OVERVIEW */}
      {activeTab === "term" && (
        <div className="space-y-6">
          {loadingTerm ? (
            <div className="p-12 text-center text-[#1E293B] font-bold flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Aggregating term overview…
            </div>
          ) : !termReport ? (
            <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-12 text-center text-[#1E293B]/70 font-bold">
              No term records found for this batch.
            </div>
          ) : (
            <>
              {/* Coverage Progress Card */}
              <div className="p-6 sm:p-8 rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#5B9BD5]">NCERT Curriculum Delivery</span>
                    <h3 className="font-head text-2xl font-900 text-[#1E293B] mt-0.5">Syllabus Coverage Progress</h3>
                  </div>
                  <div className="text-right">
                    <span className="font-head text-4xl font-900 text-[#1E293B]">{termReport.syllabus_coverage_pct}%</span>
                    <span className="block text-xs font-mono text-[#64748B]">
                      {termReport.covered_topics_count} of {termReport.total_curriculum_topics} Official Topics Tested
                    </span>
                  </div>
                </div>

                <div className="w-full bg-[#FFF9E8] rounded-full h-4 border-2 border-[#1E293B] overflow-hidden p-0.5">
                  <div
                    style={{ width: `${Math.min(100, termReport.syllabus_coverage_pct)}%` }}
                    className="bg-[#4CAF7D] h-full rounded-full transition-all duration-500"
                  />
                </div>
              </div>

              {/* Student Term Summary Rankings */}
              <div className="p-6 rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] space-y-4 overflow-x-auto">
                <h3 className="font-head text-lg font-900 text-[#1E293B]">Student Cumulative Performance & Rank Matrix</h3>
                <table className="w-full text-xs min-w-[600px] border-collapse">
                  <thead>
                    <tr className="border-b-2 border-[#1E293B] text-left text-[#1E293B]">
                      <th className="py-2.5 px-3 font-900">Rank</th>
                      <th className="py-2.5 px-3 font-900">Student Name</th>
                      <th className="py-2.5 px-2 font-900">Assessments Taken</th>
                      <th className="py-2.5 px-2 font-900">Term Average</th>
                      <th className="py-2.5 px-2 font-900">Standing Band</th>
                      <th className="py-2.5 px-2 font-900 text-right">Flagged Weak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {termReport.student_summaries.map((st) => (
                      <tr key={st.student_id} className="border-b border-[#1E293B]/10 hover:bg-[#FFF9E8]/40">
                        <td className="py-3 px-3 font-mono font-bold text-[#1E293B]">#{st.rank}</td>
                        <td className="py-3 px-3 font-bold text-[#1E293B]">{st.name}</td>
                        <td className="py-3 px-2 font-mono text-[#64748B]">{st.tests_taken} Tests</td>
                        <td className="py-3 px-2 font-mono font-900 text-sm text-[#1E293B]">{st.avg_score}%</td>
                        <td className="py-3 px-2">
                          <Badge className={BAND[st.overall_band]?.badge}>{st.overall_band}</Badge>
                        </td>
                        <td className="py-3 px-2 font-mono text-right font-bold text-[#E04A3C]">
                          {st.weak_topics_count} Weak
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 4: LEGACY STUDENT MASTERY MATRIX */}
      {activeTab === "matrix" && (
        <div className="space-y-6">
          {loadingMatrix ? (
            <div className="text-[#1E293B] font-bold flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading mastery matrix…
            </div>
          ) : !matrixData || matrixData.students.length === 0 ? (
            <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-10 text-center font-bold text-[#1E293B]/70 shadow-[4px_4px_0_#1E293B]">
              No student attempts recorded for this batch yet.
            </div>
          ) : (
            <>
              {/* Ingestion Quality Signal Alert */}
              {matrixData.ingestion_quality?.has_unknown && (
                <div data-testid="matrix-ingestion-quality" className="rounded-2xl bg-[#FFF9E8] border-2 border-[#D97706] p-4 flex items-start gap-3 shadow-[2px_2px_0_#D97706]">
                  <AlertTriangle className="h-5 w-5 text-[#D97706] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-head font-bold text-sm text-[#92400E]">
                      Ingestion Quality Signal: {matrixData.ingestion_quality.unknown_topics_count || matrixData.ingestion_quality.unknown_count} Unclassified Topic(s)
                    </div>
                    <p className="text-xs text-[#B45309] font-medium mt-0.5">
                      {matrixData.ingestion_quality.signal}
                    </p>
                  </div>
                </div>
              )}

              <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-6 shadow-[4px_4px_0_#1E293B]">
                <h2 className="font-head font-800 text-lg text-[#1E293B] flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-[#FF6B5E]" /> Weakest concepts (class average)
                </h2>
                <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {matrixData.weak_topics.length === 0 ? (
                    <div className="col-span-full py-4 text-center text-xs font-bold text-[#64748B]">
                      No topic weakness identified in attempted tests yet.
                    </div>
                  ) : (
                    matrixData.weak_topics.map((w) => (
                      <div key={key(w)} className="flex items-center justify-between rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] px-4 py-3">
                        <div>
                          <div className="text-sm font-800 text-[#1E293B]">{w.topic}</div>
                          <div className="text-xs text-[#1E293B]/70 font-semibold">{w.chapter}</div>
                        </div>
                        <span className={`font-head font-900 text-lg ${
                          isConfirmedWeak(w)
                            ? "text-[#FF6B5E]"
                            : isConfirmedStrong(w)
                            ? "text-[#4CAF7D]"
                            : "text-[#B4881B]"
                        }`}>{w.class_avg}%</span>
                      </div>
                    ))
                  )}
                </div>
                {matrixData.not_attempted_topics?.length > 0 && (
                  <div className="mt-4 pt-3 border-t-2 border-[#1E293B]/10 flex items-center justify-between text-xs font-mono">
                    <span className="text-[#64748B] font-bold">Untested Syllabus Topics</span>
                    <span className="px-2 py-0.5 rounded-md bg-[#FFF9E8] border border-[#1E293B] font-bold text-[#1E293B]">
                      {matrixData.not_attempted_topics.length} untested
                    </span>
                  </div>
                )}
              </div>

              <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-6 overflow-x-auto shadow-[4px_4px_0_#1E293B]">
                <h2 className="font-head font-800 text-lg text-[#1E293B] mb-4">Student × Topic Matrix</h2>
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-[#1E293B] border-b-2 border-[#1E293B]">
                      <th className="py-2.5 pr-3 font-800">Student</th>
                      {columns.map((c) => (
                        <th key={key(c)} className="py-2.5 px-2 font-800 whitespace-nowrap" title={`${c.chapter} · ${c.topic}`}>
                          {c.topic}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixData.students.map((s) => (
                      <tr key={s.id} data-testid="student-row" onClick={() => openDrill(s.id)}
                        className="border-b border-[#1E293B]/20 cursor-pointer hover:bg-[#FFF9E8]">
                        <td className="py-2.5 pr-3 font-800 text-[#1E293B] whitespace-nowrap">{s.name}</td>
                        {columns.map((c) => {
                          const t = studentMap[s.id]?.[key(c)];
                          return t
                            ? <td key={key(c)} className="py-2 px-1"><span className={`inline-block min-w-11 text-center rounded-lg px-2 py-1 font-bold ${BAND[t.band]?.cell}`}>{t.score}%</span></td>
                            : <td key={key(c)} className="py-2 px-2 text-[#1E293B]/30 font-bold text-center">—</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 text-xs font-semibold text-[#1E293B]/60">
                  Click a student row to inspect detailed topic breakdowns.
                </div>
              </div>
            </>
          )}

          {drill && (
            <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-6 shadow-[4px_4px_0_#1E293B]">
              <div className="flex items-center justify-between">
                <h2 className="font-head font-800 text-lg text-[#1E293B]">{(drill.student?.name || "Student")} — Attempt Detail</h2>
                <button data-testid="close-drill" onClick={() => setDrill(null)} className="h-8 w-8 rounded-full border-2 border-[#1E293B] bg-[#FFF9E8] flex items-center justify-center text-[#1E293B] hover:bg-[#F5C842]">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 grid sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs uppercase font-900 tracking-widest text-[#1E293B]/70 mb-2">Topics (weakest first)</div>
                  {drill.topics.length === 0 ? <div className="text-[#1E293B]/70 text-sm font-semibold">No attempts yet.</div> : drill.topics.map((t) => (
                    <div key={key(t)} className="flex items-center justify-between py-2 border-b border-[#1E293B]/20">
                      <div className="text-sm font-bold text-[#1E293B]">{t.topic} <span className="text-[#1E293B]/60 text-xs font-semibold">· {t.chapter}</span></div>
                      <Badge className={`border-2 ${BAND[t.band]?.badge}`}>{t.score}%</Badge>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-xs uppercase font-900 tracking-widest text-[#1E293B]/70 mb-2">Recent attempts</div>
                  {drill.trend.length === 0 ? <div className="text-[#1E293B]/70 text-sm font-semibold">None yet.</div> : drill.trend.slice(0, 10).map((t, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-[#1E293B]/20">
                      <div className="text-sm font-bold text-[#1E293B] truncate">{t.title}</div>
                      <div className="text-sm font-800 text-[#1E293B]">{t.score ?? 0}% <span className="text-[#1E293B]/60 text-xs font-semibold">({t.correct}/{t.total})</span></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
