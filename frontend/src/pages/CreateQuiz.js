import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { formatExpiry } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  Sparkles, Wand2, Database, Tag, CheckSquare, Clock,
  Check, ChevronDown, ChevronUp, ChevronRight, Search, SlidersHorizontal,
  Layers, CheckCircle2, AlertCircle, BookOpen, ArrowUpDown, Bookmark, Loader2
} from "lucide-react";
import { toast } from "sonner";

export default function CreateQuiz({ kind }) {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const initClass = searchParams.get("class_level") || "9";
  const initSubject = searchParams.get("subject") || "";
  const initChapter = searchParams.get("chapter") || "";

  const isDpp = kind === "dpp";
  const [catalog, setCatalog] = useState({});
  const [bankHierarchy, setBankHierarchy] = useState({});
  const [curriculum, setCurriculum] = useState({});
  const [batches, setBatches] = useState([]);

  // Mode: "auto" (one-click generate) vs "manual" (teacher hand-picks questions)
  const [creationMode, setCreationMode] = useState("auto");

  // Chapter Scope: "single" vs "multi" (combination of chapters)
  const [chapterScope, setChapterScope] = useState("single");
  const [selectedChapters, setSelectedChapters] = useState(new Set());

  // Timing: "untimed" vs "timed"
  const [timingMode, setTimingMode] = useState(isDpp ? "untimed" : "timed");

  // Manual questions list & selection
  const [bankQuestions, setBankQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState(new Set());
  const [expandedQId, setExpandedQId] = useState(null);
  const [questionSearch, setQuestionSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("all");

  // Multi-chapter grouping, accordion collapse & sorting
  const [collapsedChapters, setCollapsedChapters] = useState(new Set());
  const [activeChapterTab, setActiveChapterTab] = useState("all");
  const [sortInsideChapter, setSortInsideChapter] = useState("topic");

  const [f, setF] = useState({
    title: initChapter ? `${initChapter} Practice Test` : "",
    class_level: initClass,
    subject: initSubject,
    chapter: initChapter,
    topic: "",
    batch_id: "",
    question_count: 10,
    duration_minutes: 20,
    valid_hours: 24,
    activate_now: true
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/catalog").catch(() => ({ data: {} })),
      api.get("/questions/hierarchy").catch(() => ({ data: {} })),
      api.get("/curriculum").catch(() => ({ data: {} })),
      api.get("/batches").catch(() => ({ data: [] }))
    ]).then(([catRes, hierRes, curRes, batchRes]) => {
      setCatalog(catRes.data || {});
      setBankHierarchy(hierRes.data || {});
      setCurriculum(curRes.data || {});
      setBatches(batchRes.data || []);
    });
  }, []);

  const availableBatches = useMemo(() => {
    const matched = batches.filter((b) => !b.class_level || String(b.class_level) === String(f.class_level));
    return matched.length > 0 ? matched : batches;
  }, [batches, f.class_level]);

  // Combine subjects from static catalog and imported question bank
  const subjects = useMemo(() => {
    const fromCat = catalog[f.class_level] ? Object.keys(catalog[f.class_level]) : [];
    const fromBank = bankHierarchy[f.class_level] ? Object.keys(bankHierarchy[f.class_level]) : [];
    const fromCur = curriculum[f.class_level] ? Object.keys(curriculum[f.class_level]) : [];
    return Array.from(new Set([...fromCat, ...fromBank, ...fromCur])).sort();
  }, [catalog, bankHierarchy, curriculum, f.class_level]);

  // Combine chapters from static catalog and imported question bank
  const chapterEntries = useMemo(() => {
    const list = [];
    const seen = new Set();
    const fromBank = bankHierarchy[f.class_level]?.[f.subject] || [];
    fromBank.forEach((item) => {
      seen.add(item.chapter);
      list.push(item);
    });
    const fromCat = catalog[f.class_level]?.[f.subject] || [];
    fromCat.forEach((chap) => {
      if (!seen.has(chap)) {
        seen.add(chap);
        list.push({ chapter: chap, topics: [], count: 0 });
      }
    });
    const fromCur = curriculum[f.class_level]?.[f.subject] ? Object.keys(curriculum[f.class_level][f.subject]) : [];
    fromCur.forEach((chap) => {
      if (!seen.has(chap)) {
        seen.add(chap);
        list.push({ chapter: chap, topics: curriculum[f.class_level][f.subject][chap] || [], count: 0 });
      }
    });
    return list;
  }, [catalog, bankHierarchy, curriculum, f.class_level, f.subject]);

  const selectedChapterInfo = useMemo(() => {
    return chapterEntries.find((c) => c.chapter === f.chapter);
  }, [chapterEntries, f.chapter]);

  const chapterTopics = useMemo(() => {
    const fromCur = curriculum[f.class_level]?.[f.subject]?.[f.chapter] || [];
    if (fromCur.length > 0) return fromCur;
    const fromBank = selectedChapterInfo?.topics || [];
    return fromBank;
  }, [curriculum, f.class_level, f.subject, f.chapter, selectedChapterInfo]);

  // Fetch available questions when entering manual selection or switching chapter/topic/chapters
  useEffect(() => {
    if (creationMode !== "manual") return;
    setLoadingQuestions(true);

    let params = {
      class_level: f.class_level,
      subject: f.subject,
      status: "active"
    };

    if (chapterScope === "multi") {
      const chapsArray = Array.from(selectedChapters);
      if (chapsArray.length === 0) {
        setBankQuestions([]);
        setLoadingQuestions(false);
        return;
      }
      params.chapters = chapsArray.join(",");
    } else {
      if (!f.chapter) {
        setBankQuestions([]);
        setLoadingQuestions(false);
        return;
      }
      params.chapter = f.chapter;
      if (f.topic) params.topic = f.topic;
    }

    api.get("/questions", { params })
      .then((r) => {
        const qList = r.data || [];
        setBankQuestions(qList);
        setSelectedQuestionIds(new Set()); // all questions deselected by default
        setCollapsedChapters(new Set()); // all chapters expanded by default
      })
      .catch(() => setBankQuestions([]))
      .finally(() => setLoadingQuestions(false));
  }, [creationMode, chapterScope, f.class_level, f.subject, f.chapter, f.topic, selectedChapters]);

  // Filtered manual questions
  const filteredBankQuestions = useMemo(() => {
    return bankQuestions.filter((q) => {
      if (difficultyFilter !== "all" && q.difficulty?.toLowerCase() !== difficultyFilter) {
        return false;
      }
      if (questionSearch.trim()) {
        const query = questionSearch.toLowerCase();
        const matchesQ = q.question.toLowerCase().includes(query);
        const matchesTopic = q.topic?.toLowerCase().includes(query) || (q.topics && q.topics.some((t) => t.toLowerCase().includes(query)));
        const matchesChapter = q.chapter?.toLowerCase().includes(query);
        return matchesQ || matchesTopic || matchesChapter;
      }
      return true;
    });
  }, [bankQuestions, difficultyFilter, questionSearch]);

  // Group filteredBankQuestions by chapter and sort questions within each chapter
  const groupedQuestions = useMemo(() => {
    const groups = {};
    filteredBankQuestions.forEach((q) => {
      const chap = q.chapter || "Other Questions";
      if (!groups[chap]) groups[chap] = [];
      groups[chap].push(q);
    });

    Object.keys(groups).forEach((chap) => {
      groups[chap].sort((a, b) => {
        if (sortInsideChapter === "diff_asc") {
          const rank = { easy: 1, medium: 2, hard: 3 };
          return (rank[a.difficulty?.toLowerCase()] || 2) - (rank[b.difficulty?.toLowerCase()] || 2);
        }
        if (sortInsideChapter === "marks_desc") {
          return Number(b.marks || 1) - Number(a.marks || 1);
        }
        // default: topic-wise then question text
        const topicA = (a.topic || "").toLowerCase();
        const topicB = (b.topic || "").toLowerCase();
        if (topicA !== topicB) return topicA.localeCompare(topicB);
        return (a.question || "").localeCompare(b.question || "");
      });
    });

    return groups;
  }, [filteredBankQuestions, sortInsideChapter]);

  // Order chapter sections matching official syllabus sequence
  const orderedChapterKeys = useMemo(() => {
    const keys = Object.keys(groupedQuestions);
    const orderMap = new Map();
    chapterEntries.forEach((c, idx) => orderMap.set(c.chapter, idx));
    return keys.sort((a, b) => {
      const idxA = orderMap.has(a) ? orderMap.get(a) : 999;
      const idxB = orderMap.has(b) ? orderMap.get(b) : 999;
      return idxA - idxB;
    });
  }, [groupedQuestions, chapterEntries]);

  // Filtered chapter sections if a specific chapter tab is active
  const visibleChapterKeys = useMemo(() => {
    if (activeChapterTab !== "all" && groupedQuestions[activeChapterTab]) {
      return [activeChapterTab];
    }
    return orderedChapterKeys;
  }, [orderedChapterKeys, activeChapterTab, groupedQuestions]);

  // Live per-chapter weightage telemetry
  const chapterStats = useMemo(() => {
    const stats = {};
    orderedChapterKeys.forEach((chap) => {
      const qList = groupedQuestions[chap] || [];
      const selected = qList.filter((q) => selectedQuestionIds.has(q.id));
      const totalMarks = selected.reduce((sum, q) => sum + Number(q.marks || 1), 0);
      stats[chap] = {
        total: qList.length,
        selectedCount: selected.length,
        selectedMarks: totalMarks
      };
    });
    return stats;
  }, [orderedChapterKeys, groupedQuestions, selectedQuestionIds]);

  const toggleChapterCollapse = (chap) => {
    setCollapsedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chap)) next.delete(chap);
      else next.add(chap);
      return next;
    });
  };

  const expandAllChapters = () => setCollapsedChapters(new Set());
  const collapseAllChapters = () => setCollapsedChapters(new Set(orderedChapterKeys));

  const selectAllInChapter = (chap) => {
    const qList = groupedQuestions[chap] || [];
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      qList.forEach((q) => next.add(q.id));
      return next;
    });
  };

  const deselectAllInChapter = (chap) => {
    const qList = groupedQuestions[chap] || [];
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      qList.forEach((q) => next.delete(q.id));
      return next;
    });
  };

  const toggleQuestionSelection = (qid) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      filteredBankQuestions.forEach((q) => next.add(q.id));
      return next;
    });
  };

  const deselectAllFiltered = () => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      filteredBankQuestions.forEach((q) => next.delete(q.id));
      return next;
    });
  };

  // Total marks computation
  const totalSelectedMarks = useMemo(() => {
    let sum = 0;
    bankQuestions.forEach((q) => {
      if (selectedQuestionIds.has(q.id)) {
        sum += Number(q.marks || 1);
      }
    });
    return sum;
  }, [bankQuestions, selectedQuestionIds]);

  const submit = async (options = {}) => {
    if (!f.title || !f.subject) {
      toast.error("Fill title and subject");
      return;
    }

    let finalChapter = f.chapter;
    let finalChapters = null;

    if (chapterScope === "multi") {
      const chapsArray = Array.from(selectedChapters);
      if (chapsArray.length === 0) {
        toast.error("Please select at least 1 chapter for this test");
        return;
      }
      finalChapters = chapsArray;
      finalChapter = chapsArray.join(", ");
    } else {
      if (!f.chapter) {
        toast.error("Please select a chapter");
        return;
      }
      finalChapters = [f.chapter];
    }

    const isTemplateSelection = f.batch_id === "template";
    const saveOnly = options?.saveOnly === true || isTemplateSelection;

    if (!saveOnly && !isDpp && (!f.batch_id || f.batch_id === "template")) {
      toast.error("Please select a target batch or 'All Students' to activate, or choose 'Master Template' to save to your library");
      return;
    }

    const targetBatchId = (!f.batch_id || f.batch_id === "template") ? null : f.batch_id;

    const payload = {
      ...f,
      kind,
      chapter: finalChapter,
      chapters: finalChapters,
      batch_id: targetBatchId,
      duration_minutes: timingMode === "timed" ? Number(f.duration_minutes || 20) : 0,
      valid_hours: Number(f.valid_hours || 24),
      is_active: !saveOnly,
      activate_now: !saveOnly,
      is_draft: saveOnly,
    };

    if (creationMode === "manual") {
      const selectedList = Array.from(selectedQuestionIds);
      if (selectedList.length === 0) {
        toast.error("Please select at least 1 question from the question bank");
        return;
      }
      payload.question_ids = selectedList;
      payload.question_count = selectedList.length;
    } else {
      payload.question_count = Number(f.question_count);
      payload.question_ids = null;
    }

    setBusy(true);
    try {
      await api.post("/tests", payload);
      toast.success(
        saveOnly
          ? `Master Template saved under Class ${f.class_level} → Master Templates!`
          : isDpp
          ? "Chapterwise Test published and live!"
          : "Test created and live for students!"
      );
      nav(isDpp ? "/dpp" : "/tests");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const inp = "rounded-xl mt-1.5 bg-[#FFF9E8] border-2 border-[#1E293B] text-[#1E293B] font-semibold focus:ring-2 focus:ring-[#F5C842]";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="rounded-3xl bg-[#F5C842] border-[3px] border-[#1E293B] p-6 sm:p-8 shadow-[5px_5px_0_#1E293B]">
        <span className="inline-block px-3 py-1 rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] text-xs font-900 uppercase tracking-widest shadow-[2px_2px_0_#1E293B]">
          Teacher Studio
        </span>
        <h1 className="font-head text-3xl sm:text-4xl font-900 tracking-tight flex items-center gap-2 text-[#1E293B] mt-2">
          {isDpp ? "NEW CHAPTERWISE TEST (DPP)" : "LAUNCH A TIMED TEST"} <Wand2 className="h-7 w-7 text-[#1E293B]" />
        </h1>
        <p className="text-[#1E293B]/80 font-medium mt-2">
          {isDpp
            ? "Create one-click auto-generated DPPs or hand-pick specific questions from your verified question bank."
            : "Pick single or combination of chapters, select batch, decide question set, and configure timer window."}
        </p>
      </div>

      <div className="space-y-6 rounded-3xl bg-white border-[3px] border-[#1E293B] p-6 sm:p-8 shadow-[5px_5px_0_#1E293B]">
        {/* Title */}
        <div>
          <Label className="font-800 text-[#1E293B]">Test Title</Label>
          <Input
            data-testid="quiz-title"
            className={inp}
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
            placeholder={isDpp ? "e.g. Quadratic Equations — Chapterwise DPP" : "e.g. Unit Test 1 — Real Numbers & Polynomials"}
          />
        </div>

        {/* Class & Subject */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="font-800 text-[#1E293B]">Class</Label>
            <Select
              value={f.class_level}
              onValueChange={(v) => {
                setF({ ...f, class_level: v, subject: "", chapter: "", topic: "" });
                setSelectedChapters(new Set());
              }}
            >
              <SelectTrigger data-testid="quiz-class" className={inp}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="9">Class 9</SelectItem>
                <SelectItem value="10">Class 10</SelectItem>
                <SelectItem value="11">Class 11</SelectItem>
                <SelectItem value="12">Class 12</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="font-800 text-[#1E293B]">Subject</Label>
            <Select
              value={f.subject}
              onValueChange={(v) => {
                setF({ ...f, subject: v, chapter: "", topic: "" });
                setSelectedChapters(new Set());
              }}
            >
              <SelectTrigger data-testid="quiz-subject" className={inp}><SelectValue placeholder="Select Subject" /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Syllabus Scope: Single Chapter vs Multi-Chapter Combination */}
        <div className="pt-1">
          <Label className="font-800 text-[#1E293B] block mb-2">Syllabus Scope</Label>
          <div className="grid grid-cols-2 gap-3 p-1.5 bg-[#FFF9E8] rounded-2xl border-2 border-[#1E293B]">
            <button
              type="button"
              onClick={() => {
                setChapterScope("single");
                setSelectedChapters(new Set());
                setSelectedQuestionIds(new Set());
                setCollapsedChapters(new Set());
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-head font-bold text-xs transition-all border-2 ${
                chapterScope === "single"
                  ? "bg-[#F5C842] text-[#1E293B] border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                  : "bg-transparent text-[#1E293B]/70 border-transparent hover:bg-white"
              }`}
            >
              Single Chapter Test
            </button>
            <button
              type="button"
              onClick={() => {
                setChapterScope("multi");
                setSelectedChapters(new Set()); // no chapter selected by default
                setBankQuestions([]);
                setSelectedQuestionIds(new Set());
                setCollapsedChapters(new Set());
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-head font-bold text-xs transition-all border-2 ${
                chapterScope === "multi"
                  ? "bg-[#F5C842] text-[#1E293B] border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                  : "bg-transparent text-[#1E293B]/70 border-transparent hover:bg-white"
              }`}
            >
              <Layers className="h-4 w-4" /> Combination of Chapters (Unit / Term Test)
            </button>
          </div>
        </div>

        {/* Scope 1: Multi-Chapter Checklist */}
        {chapterScope === "multi" && (
          <div className="p-4 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B]/20 pb-2">
              <span className="text-xs font-head font-bold text-[#1E293B] flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-[#5B9BD5]" />
                Select Chapters to Combine ({selectedChapters.size} of {chapterEntries.length} selected)
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const allChaps = new Set(chapterEntries.map((c) => c.chapter));
                    setSelectedChapters(allChaps);
                    if (!f.title) setF({ ...f, title: `Full Syllabus ${f.subject || ""} Test` });
                  }}
                  className="text-xs h-7 px-2.5 rounded-lg border-2 border-[#1E293B] bg-white font-bold hover:bg-[#FFF9E8]"
                >
                  Select All (Full Syllabus)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedChapters(new Set())}
                  className="text-xs h-7 px-2.5 rounded-lg border-2 border-[#1E293B] bg-white font-bold hover:bg-[#FFF9E8]"
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {chapterEntries.map((c) => {
                const checked = selectedChapters.has(c.chapter);
                return (
                  <label
                    key={c.chapter}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border-2 transition-all cursor-pointer ${
                      checked
                        ? "bg-white border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                        : "bg-white/60 border-[#1E293B]/30 hover:bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedChapters((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.chapter)) next.delete(c.chapter);
                          else next.add(c.chapter);
                          return next;
                        });
                      }}
                      className="h-4 w-4 rounded border-[#1E293B] text-[#2F8A5F] focus:ring-[#2F8A5F]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-[#1E293B] truncate">{c.chapter}</div>
                      {c.count > 0 && (
                        <div className="text-[10px] text-[#2F8A5F] font-bold font-mono">
                          {c.count} in question bank
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Scope 2: Single Chapter Selector & Topic Filter */}
        {chapterScope === "single" && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label className="font-800 text-[#1E293B]">Chapter</Label>
                <Select
                  value={f.chapter}
                  onValueChange={(v) => {
                    const defaultTitle = f.title || (v ? `${v} — ${isDpp ? "Chapterwise Test" : "Class Test"}` : "");
                    setF({ ...f, chapter: v, topic: "", title: defaultTitle });
                  }}
                >
                  <SelectTrigger data-testid="quiz-chapter" className={inp}><SelectValue placeholder="Select Chapter" /></SelectTrigger>
                  <SelectContent>
                    {chapterEntries.map((c) => (
                      <SelectItem key={c.chapter} value={c.chapter}>
                        {c.chapter} {c.count > 0 ? `(${c.count} in bank)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="font-800 text-[#1E293B]">
                  Topic Filter <span className="text-[#1E293B]/50 font-normal">(optional — leave empty for whole chapter)</span>
                </Label>
                <Input
                  data-testid="quiz-topic"
                  className={inp}
                  value={f.topic}
                  onChange={(e) => setF({ ...f, topic: e.target.value })}
                  placeholder="e.g. Discriminant & Nature of Roots"
                />
              </div>
            </div>

            {/* Bank Telemetry & Topic Suggestions */}
            {f.chapter && (
              <div className="p-4 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#1E293B]">
                  <Database className="h-4 w-4 text-[#2F8A5F]" />
                  <span>
                    {selectedChapterInfo?.count
                      ? `${selectedChapterInfo.count} verified questions available in question bank for this chapter.`
                      : "Questions available in question bank will be sampled or selected."}
                  </span>
                </div>

                {chapterTopics?.length > 0 && (
                  <div className="pt-2 border-t border-[#1E293B]/20">
                    <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider block mb-1.5">
                      Available Topics in this Chapter ({chapterTopics.length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                      <button
                        type="button"
                        onClick={() => setF({ ...f, topic: "" })}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-bold transition-all ${
                          !f.topic
                            ? "bg-[#2F8A5F] text-white border-[#1E293B] shadow-[1px_1px_0_#1E293B]"
                            : "bg-white text-[#1E293B] border-[#1E293B] hover:bg-[#FFF9E8]"
                        }`}
                      >
                        All Topics (Full Chapter)
                      </button>
                      {chapterTopics.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setF({ ...f, topic: t })}
                          className={`text-xs px-2.5 py-1 rounded-lg border font-bold transition-all text-left flex items-center gap-1 ${
                            f.topic === t
                              ? "bg-[#F5C842] text-[#1E293B] border-[#1E293B] shadow-[1px_1px_0_#1E293B]"
                              : "bg-white text-[#1E293B] border-[#1E293B] hover:bg-[#FFF9E8]"
                          }`}
                        >
                          <Tag className="h-3 w-3 shrink-0" /> <span className="line-clamp-1">{t}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Question Creation Mode Selector */}
        <div className="pt-2">
          <Label className="font-800 text-[#1E293B] block mb-2">Question Selection Mode</Label>
          <div className="grid grid-cols-2 gap-3 p-1.5 bg-[#FFF9E8] rounded-2xl border-2 border-[#1E293B]">
            <button
              type="button"
              onClick={() => setCreationMode("auto")}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-head font-bold text-sm transition-all border-2 ${
                creationMode === "auto"
                  ? "bg-[#F5C842] text-[#1E293B] border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                  : "bg-transparent text-[#1E293B]/70 border-transparent hover:bg-white"
              }`}
            >
              <Sparkles className="h-4 w-4" /> 1-Click Auto Generate
            </button>
            <button
              type="button"
              onClick={() => {
                setCreationMode("manual");
                setSelectedQuestionIds(new Set()); // all questions deselected by default
                setCollapsedChapters(new Set()); // all chapters expanded by default
              }}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-head font-bold text-sm transition-all border-2 ${
                creationMode === "manual"
                  ? "bg-[#F5C842] text-[#1E293B] border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                  : "bg-transparent text-[#1E293B]/70 border-transparent hover:bg-white"
              }`}
            >
              <CheckSquare className="h-4 w-4" /> Manually Pick Questions
            </button>
          </div>
        </div>

        {/* Mode 1: Auto Generate Question Count */}
        {creationMode === "auto" && (
          <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B] space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-800 text-[#1E293B]">Number of Questions to Auto-Sample</Label>
              <div className="flex gap-1.5">
                {[5, 10, 15, 20].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setF({ ...f, question_count: num })}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-mono font-bold transition-all ${
                      Number(f.question_count) === num
                        ? "bg-[#2F8A5F] text-white border-[#1E293B]"
                        : "bg-[#FFF9E8] text-[#1E293B] border-[#1E293B]/40 hover:bg-[#FFF9E8]"
                    }`}
                  >
                    {num} Qs
                  </button>
                ))}
              </div>
            </div>
            <Input
              data-testid="quiz-count"
              type="number"
              min={1}
              max={100}
              className={inp + " font-mono"}
              value={f.question_count}
              onChange={(e) => setF({ ...f, question_count: e.target.value })}
            />
            <p className="text-xs text-[#64748B] font-medium">
              Questions will be randomly sampled from verified question bank questions matching your chapter and topic.
            </p>
          </div>
        )}

        {/* Mode 2: Manual Question Picker */}
        {creationMode === "manual" && (
          <div className="space-y-4 p-4 sm:p-5 rounded-2xl bg-white border-2 border-[#1E293B]">
            {/* Top Stats and Global Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B]/20 pb-3">
              <div>
                <span className="font-head font-bold text-sm text-[#1E293B] flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-[#2F8A5F]" />
                  Select Questions ({selectedQuestionIds.size} of {filteredBankQuestions.length} selected)
                </span>
                <span className="text-xs font-mono font-bold text-[#64748B]">
                  Total Marks: <span className="text-[#2F8A5F]">{totalSelectedMarks}</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={selectAllFiltered}
                  className="rounded-xl border-2 border-[#1E293B] font-bold text-xs h-8 bg-white hover:bg-[#FFF9E8]"
                >
                  Select All ({filteredBankQuestions.length})
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={deselectAllFiltered}
                  className="rounded-xl border-2 border-[#1E293B] font-bold text-xs h-8 bg-white hover:bg-[#FFF9E8]"
                >
                  Clear All
                </Button>
                {orderedChapterKeys.length > 1 && (
                  <div className="flex items-center gap-1 border-l border-[#1E293B]/20 pl-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={expandAllChapters}
                      className="text-[11px] h-7 px-2 font-bold text-[#1E293B] hover:bg-[#FFF9E8]"
                    >
                      Expand All
                    </Button>
                    <span className="text-[#64748B]/40">|</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={collapseAllChapters}
                      className="text-[11px] h-7 px-2 font-bold text-[#1E293B] hover:bg-[#FFF9E8]"
                    >
                      Collapse All
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Chapter Quick-Filter Tabs */}
            {orderedChapterKeys.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveChapterTab("all")}
                  className={`px-3 py-1.5 rounded-xl border font-head font-bold whitespace-nowrap transition-all ${
                    activeChapterTab === "all"
                      ? "bg-[#1E293B] text-white border-[#1E293B]"
                      : "bg-white text-[#1E293B] border-[#1E293B]/30 hover:bg-[#FFF9E8]"
                  }`}
                >
                  All Chapters ({filteredBankQuestions.length})
                </button>
                {orderedChapterKeys.map((chap) => {
                  const stat = chapterStats[chap] || { total: 0, selectedCount: 0 };
                  const isActive = activeChapterTab === chap;
                  return (
                    <button
                      key={chap}
                      type="button"
                      onClick={() => setActiveChapterTab(chap)}
                      className={`px-3 py-1.5 rounded-xl border font-head font-bold whitespace-nowrap flex items-center gap-1.5 transition-all ${
                        isActive
                          ? "bg-[#F5C842] text-[#1E293B] border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                          : "bg-white text-[#1E293B] border-[#1E293B]/30 hover:bg-[#FFF9E8]"
                      }`}
                    >
                      <span className="truncate max-w-[150px]">{chap}</span>
                      <span className="font-mono text-[10px] bg-black/10 px-1 py-0.2 rounded">
                        {stat.selectedCount}/{stat.total}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Search, Difficulty and Inside-Chapter Sorting Controls */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-3 top-3 text-[#64748B]" />
                <Input
                  className="pl-9 rounded-xl bg-[#FFF9E8] border-2 border-[#1E293B] text-xs font-medium text-[#1E293B]"
                  placeholder="Search question text or topic across chapters..."
                  value={questionSearch}
                  onChange={(e) => setQuestionSearch(e.target.value)}
                />
              </div>

              {/* Difficulty chips */}
              <div className="flex gap-1.5 items-center">
                {["all", "easy", "medium", "hard"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficultyFilter(d)}
                    className={`text-xs px-2.5 py-1.5 rounded-xl border font-bold capitalize transition-all ${
                      difficultyFilter === d
                        ? "bg-[#1E293B] text-white border-[#1E293B]"
                        : "bg-white text-[#1E293B] border-[#1E293B] hover:bg-[#FFF9E8]"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              {/* Inside-Chapter Sort Select */}
              <div className="w-full sm:w-44">
                <Select value={sortInsideChapter} onValueChange={setSortInsideChapter}>
                  <SelectTrigger className="h-9 text-xs rounded-xl bg-white border-2 border-[#1E293B] font-bold text-[#1E293B]">
                    <div className="flex items-center gap-1.5 truncate">
                      <ArrowUpDown className="h-3.5 w-3.5 text-[#64748B] shrink-0" />
                      <SelectValue placeholder="Sort Questions" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="topic">Sort: Topic-wise</SelectItem>
                    <SelectItem value="diff_asc">Difficulty: Easy → Hard</SelectItem>
                    <SelectItem value="marks_desc">Marks: High → Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Questions List Grouped by Chapter in Expandable / Collapsible Sections */}
            {loadingQuestions ? (
              <div className="py-12 text-center text-xs font-bold text-[#64748B]">
                Loading available questions from question bank…
              </div>
            ) : filteredBankQuestions.length === 0 ? (
              <div className="py-8 px-4 text-center rounded-2xl bg-[#FFF9E8] border border-[#1E293B]/20 text-[#64748B] text-xs">
                No active questions found in the question bank for this chapter/filter. You can import questions via the Teacher Dashboard or choose "1-Click Auto Generate".
              </div>
            ) : (
              <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1">
                {visibleChapterKeys.map((chap) => {
                  const qList = groupedQuestions[chap] || [];
                  const isCollapsed = collapsedChapters.has(chap);
                  const stat = chapterStats[chap] || { total: qList.length, selectedCount: 0, selectedMarks: 0 };
                  const allInChapSelected = stat.selectedCount === qList.length && qList.length > 0;
                  const noneInChapSelected = stat.selectedCount === 0;

                  return (
                    <div
                      key={chap}
                      className="rounded-2xl border-2 border-[#1E293B] bg-white overflow-hidden shadow-[2px_2px_0_#1E293B] transition-all"
                    >
                      {/* Chapter Header (Collapsible Accordion Header) */}
                      <div
                        className="p-3 bg-[#FFF9E8] border-b-2 border-[#1E293B] flex flex-wrap items-center justify-between gap-2 cursor-pointer select-none hover:bg-[#FFF3CC] transition-colors"
                        onClick={() => toggleChapterCollapse(chap)}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="p-1 rounded-lg bg-white border border-[#1E293B] text-[#1E293B]">
                            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <BookOpen className="h-4 w-4 text-[#5B9BD5]" />
                            <span className="font-head font-bold text-sm text-[#1E293B]">{chap}</span>
                            <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border border-[#1E293B] font-bold ${
                              allInChapSelected
                                ? "bg-[#2F8A5F] text-white"
                                : stat.selectedCount > 0
                                ? "bg-[#F5C842] text-[#1E293B]"
                                : "bg-white text-[#64748B]"
                            }`}>
                              {stat.selectedCount} of {stat.total} selected
                            </span>
                            {stat.selectedMarks > 0 && (
                              <span className="text-[11px] font-mono font-bold text-[#2F8A5F]">
                                +{stat.selectedMarks} Marks
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Chapter Quick Actions */}
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => selectAllInChapter(chap)}
                            disabled={allInChapSelected}
                            className="text-[11px] h-7 px-2.5 rounded-lg border border-[#1E293B] font-bold bg-white hover:bg-[#FFF9E8] disabled:opacity-40"
                          >
                            Select Chapter
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => deselectAllInChapter(chap)}
                            disabled={noneInChapSelected}
                            className="text-[11px] h-7 px-2.5 rounded-lg border border-[#1E293B] font-bold bg-white hover:bg-[#FFF9E8] disabled:opacity-40"
                          >
                            Clear
                          </Button>
                        </div>
                      </div>

                      {/* Chapter Questions List */}
                      {!isCollapsed && (
                        <div className="p-3 space-y-2.5 bg-white">
                          {qList.map((q, idx) => {
                            const isSelected = selectedQuestionIds.has(q.id);
                            const isExpanded = expandedQId === q.id;
                            const diffColor =
                              q.difficulty === "easy"
                                ? "bg-[#2F8A5F] text-white"
                                : q.difficulty === "hard"
                                ? "bg-[#E04A3C] text-white"
                                : "bg-[#F5C842] text-[#1E293B]";

                            return (
                              <div
                                key={q.id}
                                className={`p-3 rounded-xl border-2 transition-all ${
                                  isSelected
                                    ? "bg-[#FFF9E8] border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                                    : "bg-white border-[#1E293B]/30 opacity-70 hover:opacity-100"
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleQuestionSelection(q.id)}
                                    className="mt-1 h-4 w-4 rounded border-[#1E293B] text-[#2F8A5F] focus:ring-[#2F8A5F] cursor-pointer"
                                  />
                                  <div
                                    className="flex-1 space-y-1.5 cursor-pointer"
                                    onClick={() => toggleQuestionSelection(q.id)}
                                  >
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-mono font-bold text-[#64748B]">Q{idx + 1}</span>
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border border-[#1E293B] uppercase ${diffColor}`}>
                                        {q.difficulty || "medium"}
                                      </span>
                                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white border border-[#1E293B] text-[#1E293B]">
                                        +{q.marks || 1} / -{q.negative_marks || 0}
                                      </span>
                                      {q.topic && (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-[#1E293B] text-[#1E293B] flex items-center gap-1">
                                          <Tag className="h-2.5 w-2.5" /> {q.topic}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs font-semibold text-[#1E293B] leading-relaxed">
                                      {q.question}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedQId(isExpanded ? null : q.id)}
                                    className="p-1 rounded-lg border border-[#1E293B]/20 text-[#64748B] hover:text-[#1E293B]"
                                    title="Preview options"
                                  >
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  </button>
                                </div>

                                {/* Expandable Options Preview */}
                                {isExpanded && (
                                  <div className="mt-3 pt-3 border-t border-[#1E293B]/20 space-y-1.5 pl-7">
                                    {q.options?.map((opt, oIdx) => (
                                      <div
                                        key={oIdx}
                                        className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium ${
                                          oIdx === q.correct_index
                                            ? "bg-[#2F8A5F] text-white border-[#1E293B] font-bold"
                                            : "bg-white text-[#1E293B] border-[#1E293B]/20"
                                        }`}
                                      >
                                        <span className="font-mono font-bold mr-1.5">
                                          {String.fromCharCode(65 + oIdx)}.
                                        </span>{" "}
                                        {opt}
                                      </div>
                                    ))}
                                    {q.explanation && (
                                      <p className="text-[11px] text-[#1E293B] mt-1 bg-white p-2 rounded-lg border border-[#1E293B]/20">
                                        <span className="font-bold text-[#2F8A5F]">Explanation: </span> {q.explanation}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Timings & Batch Decider */}
        <div className="pt-2 border-t border-[#1E293B]/20 space-y-4">
          <div>
            <Label className="font-800 text-[#1E293B] block mb-2">Timing & Test Duration</Label>
            <div className="grid grid-cols-2 gap-3 p-1.5 bg-[#FFF9E8] rounded-2xl border-2 border-[#1E293B]">
              <button
                type="button"
                onClick={() => setTimingMode("untimed")}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-head font-bold text-xs transition-all border-2 ${
                  timingMode === "untimed"
                    ? "bg-[#2F8A5F] text-white border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                    : "bg-transparent text-[#1E293B]/70 border-transparent hover:bg-white"
                }`}
              >
                Untimed (Self-Paced Practice)
              </button>
              <button
                type="button"
                onClick={() => setTimingMode("timed")}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-head font-bold text-xs transition-all border-2 ${
                  timingMode === "timed"
                    ? "bg-[#F5C842] text-[#1E293B] border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                    : "bg-transparent text-[#1E293B]/70 border-transparent hover:bg-white"
                }`}
              >
                <Clock className="h-4 w-4" /> Timed Sprint / Test
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {/* Batch (Optional for DPP, Mandatory for Test) */}
            <div>
              <Label className="font-800 text-[#1E293B]">
                Target Batch {!isDpp ? "" : <span className="text-[#64748B] font-normal">(Optional)</span>}
              </Label>
              <Select
                value={f.batch_id || (isDpp ? "all" : "")}
                onValueChange={(v) => setF({ ...f, batch_id: v })}
              >
                <SelectTrigger data-testid="quiz-batch" className={inp}>
                  <SelectValue placeholder={isDpp ? "All Students / Open" : "Choose target batch or Master Template"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="template">
                    📁 None (Save as Master Template in Library)
                  </SelectItem>
                  <SelectItem value="all">
                    {isDpp ? "All Students / Open (Classwide)" : "👥 All Students (Classwide)"}
                  </SelectItem>
                  {availableBatches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} {b.class_level ? `(Class ${b.class_level})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {f.batch_id === "template" && (
                <div className="mt-1.5 p-2 rounded-xl bg-[#F3E8FF] border border-[#9333EA]/30 text-[11px] font-bold text-[#7E22CE] flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#9333EA]" />
                  <span>Stored in Class {f.class_level} → Master Templates. Won&apos;t go live until assigned.</span>
                </div>
              )}
            </div>

            {/* Duration Input (if timed) */}
            {timingMode === "timed" ? (
              <div>
                <div className="flex items-center justify-between">
                  <Label className="font-800 text-[#1E293B]">Duration (min)</Label>
                  <div className="flex gap-1">
                    {[15, 20, 30].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setF({ ...f, duration_minutes: mins })}
                        className={`text-[10px] px-1.5 py-0.5 rounded border font-mono font-bold ${
                          Number(f.duration_minutes) === mins ? "bg-[#1E293B] text-white border-[#1E293B]" : "bg-[#FFF9E8] text-[#1E293B] border-[#1E293B]/30"
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  data-testid="quiz-duration"
                  type="number"
                  min={1}
                  className={inp + " font-mono"}
                  value={f.duration_minutes}
                  onChange={(e) => setF({ ...f, duration_minutes: e.target.value })}
                />
              </div>
            ) : (
              <div className="flex flex-col justify-end pb-2">
                <span className="text-xs font-semibold text-[#2F8A5F] flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> No time limit applied
                </span>
              </div>
            )}

            {/* Validity Hours */}
            <div>
              <Label className="font-800 text-[#1E293B]">Valid for (hours)</Label>
              <Input
                data-testid="quiz-validity"
                type="number"
                min={1}
                className={inp + " font-mono"}
                value={f.valid_hours}
                onChange={(e) => setF({ ...f, valid_hours: e.target.value })}
              />
              {f.valid_hours && (
                <div className="text-[11px] text-[#5B9BD5] font-bold font-mono mt-1">
                  Expires: {formatExpiry(new Date(Date.now() + (Number(f.valid_hours) || 24) * 3600000))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons: Save for Future vs Publish & Activate */}
        <div className="mt-4">
          {f.batch_id === "template" ? (
            <Button
              type="button"
              data-testid="generate-quiz-btn"
              onClick={() => submit({ saveOnly: true })}
              disabled={busy}
              className="w-full rounded-full bg-[#9333EA] hover:bg-[#7E22CE] text-white font-900 border-[2.5px] border-[#1E293B] shadow-[3px_3px_0_#1E293B] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none h-12 text-sm flex items-center justify-center gap-2"
            >
              {busy ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Saving template…</>
              ) : (
                <><Bookmark className="h-4 w-4 text-[#F5C842]" /> Save as Master Template in Library</>
              )}
            </Button>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              <Button
                type="button"
                data-testid="save-test-later-btn"
                onClick={() => submit({ saveOnly: true })}
                disabled={busy}
                variant="outline"
                className="rounded-full bg-white hover:bg-[#FFF9E8] text-[#1E293B] font-head font-bold border-[2.5px] border-[#1E293B] shadow-[3px_3px_0_#1E293B] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none h-12 text-sm flex items-center justify-center gap-2"
              >
                {busy ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                ) : (
                  <><Bookmark className="h-4 w-4 text-[#9333EA]" /> Save as Master Template</>
                )}
              </Button>

              <Button
                type="button"
                data-testid="generate-quiz-btn"
                onClick={() => submit({ saveOnly: false })}
                disabled={busy}
                className="rounded-full bg-[#F5C842] hover:bg-[#ebd438] text-[#1E293B] font-900 border-[2.5px] border-[#1E293B] shadow-[3px_3px_0_#1E293B] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none h-12 text-sm flex items-center justify-center gap-2"
              >
                {busy ? (
                  <><Sparkles className="h-5 w-5 mr-2 animate-spin" /> Assembling questions…</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-1" /> {isDpp ? "Publish & Activate" : "Create & Activate Test"}</>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
