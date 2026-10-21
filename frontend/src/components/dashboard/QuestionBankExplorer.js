import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "../../lib/api";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Check,
  Search,
  Filter,
  Sparkles,
  Layers,
  FileQuestion,
  Loader2,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

export default function QuestionBankExplorer({ onQuestionsChange }) {
  const [hierarchy, setHierarchy] = useState({});
  const [loadingHierarchy, setLoadingHierarchy] = useState(true);
  const [selectedClass, setSelectedClass] = useState("all");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Chapter expansion & loaded questions cache
  const [expandedChapters, setExpandedChapters] = useState(new Set());
  const [chapterQuestions, setChapterQuestions] = useState({});
  const [loadingChapters, setLoadingChapters] = useState({});

  // Topic expansion state: Set of "chapterKey|topic"
  const [expandedTopics, setExpandedTopics] = useState(new Set());

  // Inline delete confirmation: question id
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Fetch question bank hierarchy
  const fetchHierarchy = async () => {
    setLoadingHierarchy(true);
    try {
      const res = await api.get("/questions/hierarchy");
      setHierarchy(res.data || {});
    } catch (err) {
      toast.error("Failed to load question bank hierarchy: " + formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setLoadingHierarchy(false);
    }
  };

  useEffect(() => {
    fetchHierarchy();
  }, []);

  // Flatten hierarchy into chapter cards
  const allChapters = useMemo(() => {
    const list = [];
    Object.entries(hierarchy).forEach(([classLevel, subjects]) => {
      Object.entries(subjects || {}).forEach(([subject, chapters]) => {
        (chapters || []).forEach((ch) => {
          list.push({
            key: `${classLevel}|${subject}|${ch.chapter}`,
            classLevel,
            subject,
            chapter: ch.chapter,
            topics: ch.topics || [],
            count: ch.count || 0,
          });
        });
      });
    });
    // Sort primarily by classLevel, then subject, then chapter name
    return list.sort((a, b) => {
      if (a.classLevel !== b.classLevel) {
        return a.classLevel.localeCompare(b.classLevel, undefined, { numeric: true });
      }
      if (a.subject !== b.subject) {
        return a.subject.localeCompare(b.subject);
      }
      return a.chapter.localeCompare(b.chapter);
    });
  }, [hierarchy]);

  // Unique classes and subjects for filter pills
  const availableClasses = useMemo(() => {
    const set = new Set(allChapters.map((c) => c.classLevel));
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [allChapters]);

  const availableSubjects = useMemo(() => {
    const set = new Set(allChapters.map((c) => c.subject));
    return Array.from(set).sort();
  }, [allChapters]);

  // Filtered chapters
  const filteredChapters = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allChapters.filter((c) => {
      if (selectedClass !== "all" && c.classLevel !== selectedClass) return false;
      if (selectedSubject !== "all" && c.subject !== selectedSubject) return false;
      if (query) {
        const matchChap = c.chapter.toLowerCase().includes(query);
        const matchSubj = c.subject.toLowerCase().includes(query);
        const matchTopic = (c.topics || []).some((t) => t.toLowerCase().includes(query));
        if (!matchChap && !matchSubj && !matchTopic) return false;
      }
      return true;
    });
  }, [allChapters, selectedClass, selectedSubject, searchQuery]);

  // Total questions in question bank
  const totalQuestionsCount = useMemo(() => {
    return allChapters.reduce((acc, c) => acc + (c.count || 0), 0);
  }, [allChapters]);

  // Lazy-load questions for a chapter
  const loadChapterQuestions = async (chap) => {
    const key = chap.key;
    if (chapterQuestions[key] || loadingChapters[key]) return;

    setLoadingChapters((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await api.get("/questions", {
        params: {
          class_level: chap.classLevel,
          subject: chap.subject,
          chapter: chap.chapter,
          status: "active",
        },
      });
      const qList = res.data || [];
      setChapterQuestions((prev) => ({ ...prev, [key]: qList }));

      // Expand topics inside this chapter by default
      setExpandedTopics((prev) => {
        const next = new Set(prev);
        qList.forEach((q) => {
          const tName = q.topic || (q.topics && q.topics[0]) || "General Topics";
          next.add(`${key}|${tName}`);
        });
        return next;
      });
    } catch (err) {
      toast.error("Failed to fetch questions for chapter: " + formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setLoadingChapters((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Toggle chapter expansion
  const toggleChapter = (chap) => {
    const key = chap.key;
    const isCurrentlyExpanded = expandedChapters.has(key);

    if (isCurrentlyExpanded) {
      setExpandedChapters((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } else {
      setExpandedChapters((prev) => new Set(prev).add(key));
      loadChapterQuestions(chap);
    }
  };

  // Toggle single topic inside chapter
  const toggleTopic = (chapKey, topicName) => {
    const topicKey = `${chapKey}|${topicName}`;
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topicKey)) {
        next.delete(topicKey);
      } else {
        next.add(topicKey);
      }
      return next;
    });
  };

  // Delete question
  const handleDeleteQuestion = async (chapKey, questionId) => {
    setDeletingId(questionId);
    try {
      await api.delete(`/questions/${questionId}`);
      toast.success("Question deleted from question bank.");

      // Optimistically remove from state
      setChapterQuestions((prev) => {
        const currentList = prev[chapKey] || [];
        return {
          ...prev,
          [chapKey]: currentList.filter((q) => q.id !== questionId),
        };
      });

      // Update hierarchy count
      setHierarchy((prev) => {
        const [cl, subj, chapName] = chapKey.split("|");
        const next = { ...prev };
        if (next[cl] && next[cl][subj]) {
          next[cl][subj] = next[cl][subj].map((c) => {
            if (c.chapter === chapName) {
              return { ...c, count: Math.max(0, (c.count || 1) - 1) };
            }
            return c;
          });
        }
        return next;
      });

      if (onQuestionsChange) onQuestionsChange();
    } catch (err) {
      toast.error("Failed to delete question: " + formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  // Expand all / Collapse all chapters
  const handleExpandAll = () => {
    const allKeys = new Set(filteredChapters.map((c) => c.key));
    setExpandedChapters(allKeys);
    filteredChapters.forEach((c) => {
      loadChapterQuestions(c);
    });
  };

  const handleCollapseAll = () => {
    setExpandedChapters(new Set());
  };

  return (
    <div
      id="question-bank-explorer"
      className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] p-6 sm:p-8 space-y-6 scroll-mt-6"
    >
      {/* 1. SECTION HEADER & TELEMETRY */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-[#1E293B]/10 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="h-8 w-8 rounded-xl bg-[#F5C842] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center">
              <BookOpen className="h-4 w-4 text-[#1E293B]" />
            </div>
            <h2 className="font-head text-2xl font-900 text-[#1E293B] uppercase tracking-tight">
              Curriculum Question Bank
            </h2>
            <Badge className="bg-[#4CAF7D] text-white border-2 border-[#1E293B] font-mono font-bold text-xs px-2.5 py-0.5">
              Verified NCERT
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] font-medium">
            Browse verified question items organized chapterwise. Expand any chapter and topic to inspect questions or launch tests.
          </p>
        </div>

        {/* Badges & Refresh */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <Badge className="bg-[#FFF9E8] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs py-1 px-3">
            <span className="font-mono text-[#5B9BD5] mr-1.5 font-900">{totalQuestionsCount}</span> Questions
          </Badge>
          <Badge className="bg-[#FFF9E8] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs py-1 px-3">
            <span className="font-mono text-[#9333EA] mr-1.5 font-900">{allChapters.length}</span> Chapters
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchHierarchy}
            disabled={loadingHierarchy}
            className="rounded-full border-2 border-[#1E293B] bg-white hover:bg-[#FFF9E8] text-[#1E293B] h-8 px-3 text-xs font-head font-bold shadow-[2px_2px_0_#1E293B]"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingHierarchy ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* 2. FILTER & SEARCH CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#FFF9E8] p-4 rounded-2xl border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]">
        {/* Class & Subject Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-head font-bold text-[#1E293B] flex items-center gap-1 mr-1">
            <Filter className="h-3.5 w-3.5 text-[#5B9BD5]" /> Class:
          </span>
          <button
            type="button"
            onClick={() => setSelectedClass("all")}
            className={`px-3 py-1 rounded-full text-xs font-head font-bold transition-all border-2 border-[#1E293B] ${
              selectedClass === "all"
                ? "bg-[#1E293B] text-white shadow-[2px_2px_0_#1E293B]"
                : "bg-white text-[#1E293B] hover:bg-[#F5C842]"
            }`}
          >
            All Classes
          </button>
          {availableClasses.map((cl) => (
            <button
              key={cl}
              type="button"
              onClick={() => setSelectedClass(cl)}
              className={`px-3 py-1 rounded-full text-xs font-head font-bold transition-all border-2 border-[#1E293B] ${
                selectedClass === cl
                  ? "bg-[#5B9BD5] text-white shadow-[2px_2px_0_#1E293B]"
                  : "bg-white text-[#1E293B] hover:bg-[#F5C842]"
              }`}
            >
              Class {cl}
            </button>
          ))}

          {availableSubjects.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-0.5">
              <span className="text-xs font-head font-bold text-[#1E293B] flex items-center gap-1 ml-2 mr-1 shrink-0">
                Subject:
              </span>
              <button
                type="button"
                onClick={() => setSelectedSubject("all")}
                className={`px-3 py-1 rounded-full text-xs font-head font-bold transition-all border-2 border-[#1E293B] shrink-0 ${
                  selectedSubject === "all"
                    ? "bg-[#1E293B] text-white shadow-[2px_2px_0_#1E293B]"
                    : "bg-white text-[#1E293B] hover:bg-[#F5C842]"
                }`}
              >
                All
              </button>
              {availableSubjects.map((subj) => (
                <button
                  key={subj}
                  type="button"
                  onClick={() => setSelectedSubject(subj)}
                  className={`px-3 py-1 rounded-full text-xs font-head font-bold transition-all border-2 border-[#1E293B] shrink-0 ${
                    selectedSubject === subj
                      ? "bg-[#4CAF7D] text-white shadow-[2px_2px_0_#1E293B]"
                      : "bg-white text-[#1E293B] hover:bg-[#F5C842]"
                  }`}
                >
                  {subj}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search Bar & Collapse Toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-[#64748B]" />
            <Input
              type="text"
              placeholder="Filter chapters or topics…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs rounded-full border-2 border-[#1E293B] bg-white shadow-[2px_2px_0_#1E293B]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-xs text-[#64748B] hover:text-[#1E293B] font-bold"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="expand-all-btn"
              onClick={handleExpandAll}
              className="rounded-full border-2 border-[#1E293B] bg-white text-[#1E293B] h-8 px-2.5 text-[11px] font-head font-bold hover:bg-[#F5C842]"
            >
              Expand All
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="collapse-all-btn"
              onClick={handleCollapseAll}
              className="rounded-full border-2 border-[#1E293B] bg-white text-[#1E293B] h-8 px-2.5 text-[11px] font-head font-bold hover:bg-[#F5C842]"
            >
              Collapse
            </Button>
          </div>
        </div>
      </div>

      {/* 3. CHAPTER ACCORDION LIST */}
      {loadingHierarchy ? (
        <div className="py-16 text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#5B9BD5] mx-auto" />
          <p className="text-sm font-head font-bold text-[#1E293B]">Loading question bank hierarchy…</p>
        </div>
      ) : filteredChapters.length === 0 ? (
        <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-10 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-[#FF6B5E] mx-auto" />
          <p className="font-head font-bold text-base text-[#1E293B]">No Chapters Found</p>
          <p className="text-xs text-[#64748B] max-w-md mx-auto">
            {searchQuery
              ? `No chapters matched "${searchQuery}". Try clearing the search query or changing filters.`
              : "No questions currently exist for the selected class/subject filter."}
          </p>
          {searchQuery && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSearchQuery("")}
              className="rounded-full border-2 border-[#1E293B] font-head font-bold text-xs"
            >
              Clear Search
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredChapters.map((chap) => {
            const isExpanded = expandedChapters.has(chap.key);
            const questions = chapterQuestions[chap.key] || [];
            const isLoadingQ = loadingChapters[chap.key];

            // Group questions by topic inside this chapter
            const topicGroups = {};
            questions.forEach((q) => {
              const t = q.topic || (q.topics && q.topics[0]) || "General Topics";
              if (!topicGroups[t]) topicGroups[t] = [];
              topicGroups[t].push(q);
            });

            // If question list loaded is empty but hierarchy shows count or vice versa
            const topicNames = Object.keys(topicGroups);

            return (
              <div
                key={chap.key}
                data-testid={`chapter-card-${chap.key}`}
                className={`rounded-2xl border-[2.5px] border-[#1E293B] transition-all overflow-hidden ${
                  isExpanded
                    ? "bg-white shadow-[4px_4px_0_#1E293B]"
                    : "bg-[#FFF9E8] hover:bg-white shadow-[2px_2px_0_#1E293B]"
                }`}
              >
                {/* LEVEL 1: CHAPTER ACCORDION HEADER */}
                <div
                  data-testid={`chapter-header-${chap.key}`}
                  onClick={() => toggleChapter(chap)}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-7 w-7 rounded-lg border-2 border-[#1E293B] flex items-center justify-center shrink-0 transition-transform ${
                        isExpanded ? "bg-[#1E293B] text-white rotate-90" : "bg-white text-[#1E293B]"
                      }`}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-[#5B9BD5] text-white border-2 border-[#1E293B] font-mono text-[10px] font-bold">
                          Class {chap.classLevel}
                        </Badge>
                        <Badge className="bg-[#4CAF7D] text-white border-2 border-[#1E293B] font-head text-[10px] font-bold">
                          {chap.subject}
                        </Badge>
                        <span className="text-[11px] text-[#64748B] font-mono font-medium">
                          {chap.topics.length} NCERT Topics
                        </span>
                      </div>
                      <h3 className="font-head text-base sm:text-lg font-900 text-[#1E293B] truncate">
                        {chap.chapter}
                      </h3>
                    </div>
                  </div>

                  {/* Right Header Actions */}
                  <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
                    <Badge className="bg-[#F5C842] text-[#1E293B] border-2 border-[#1E293B] font-mono font-900 text-xs px-3 py-1">
                      {chap.count} {chap.count === 1 ? "Question" : "Questions"}
                    </Badge>

                    {/* Quick + Create Test button */}
                    <Button
                      asChild
                      size="sm"
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-full bg-[#5B9BD5] hover:bg-[#4D8BC4] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs h-8 px-3 font-head font-bold"
                    >
                      <Link
                        to={`/tests/new?class_level=${chap.classLevel}&subject=${encodeURIComponent(
                          chap.subject
                        )}&chapter=${encodeURIComponent(chap.chapter)}`}
                        className="flex items-center gap-1"
                      >
                        <Plus className="h-3.5 w-3.5" /> Create Test
                      </Link>
                    </Button>
                  </div>
                </div>

                {/* EXPANDED CONTENT: LEVEL 2 (TOPIC ACCORDIONS & QUESTIONS) */}
                {isExpanded && (
                  <div className="border-t-2 border-[#1E293B] bg-[#FFF9E8]/60 p-4 sm:p-6 space-y-4">
                    {isLoadingQ ? (
                      <div className="p-8 text-center space-y-2">
                        <Loader2 className="h-5 w-5 animate-spin text-[#5B9BD5] mx-auto" />
                        <p className="text-xs font-head font-bold text-[#1E293B]">Loading questions for {chap.chapter}…</p>
                      </div>
                    ) : questions.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#64748B] bg-white rounded-xl border-2 border-[#1E293B]">
                        No active questions found in this chapter.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {topicNames.map((topicName) => {
                          const topicKey = `${chap.key}|${topicName}`;
                          const isTopicExpanded = expandedTopics.has(topicKey);
                          const tQuestions = topicGroups[topicName] || [];

                          return (
                            <div
                              key={topicKey}
                              className="rounded-xl border-2 border-[#1E293B] bg-white overflow-hidden shadow-[2px_2px_0_#1E293B]"
                            >
                              {/* LEVEL 2: TOPIC HEADER */}
                              <div
                                onClick={() => toggleTopic(chap.key, topicName)}
                                className="px-4 py-2.5 bg-[#FFF9E8] hover:bg-[#F5C842]/30 flex items-center justify-between cursor-pointer select-none transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <ChevronDown
                                    className={`h-4 w-4 text-[#1E293B] shrink-0 transition-transform ${
                                      isTopicExpanded ? "" : "-rotate-90"
                                    }`}
                                  />
                                  <span className="font-head text-xs sm:text-sm font-bold text-[#1E293B] truncate">
                                    {topicName}
                                  </span>
                                </div>
                                <Badge className="bg-white text-[#1E293B] border border-[#1E293B] font-mono font-bold text-[10px] px-2 py-0.5 shrink-0">
                                  {tQuestions.length} {tQuestions.length === 1 ? "MCQ" : "MCQs"}
                                </Badge>
                              </div>

                              {/* LEVEL 2 QUESTIONS LIST */}
                              {isTopicExpanded && (
                                <div className="p-3 sm:p-4 space-y-3 border-t-2 border-[#1E293B] bg-white divide-y divide-[#1E293B]/10">
                                  {tQuestions.map((q, qIdx) => (
                                    <div
                                      key={q.id || qIdx}
                                      className={`pt-3 first:pt-0 space-y-3 ${
                                        confirmDeleteId === q.id ? "bg-red-50/60 p-3 rounded-xl border border-red-300" : ""
                                      }`}
                                    >
                                      {/* Question Prompt & Metadata */}
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-mono text-xs font-900 text-[#5B9BD5]">
                                              Q{qIdx + 1}.
                                            </span>
                                            <Badge
                                              className={`border font-mono text-[9px] px-1.5 py-0.2 uppercase font-bold ${
                                                q.difficulty === "easy"
                                                  ? "bg-[#E8F5E9] text-[#2E7D32] border-[#4CAF7D]"
                                                  : q.difficulty === "hard"
                                                  ? "bg-[#FFEBEE] text-[#C62828] border-[#FF6B5E]"
                                                  : "bg-[#FFF9E8] text-[#856404] border-[#F5C842]"
                                              }`}
                                            >
                                              {q.difficulty || "medium"}
                                            </Badge>
                                            <span className="text-[10px] font-mono text-[#64748B]">
                                              {q.marks || 1.0} Marks
                                            </span>
                                          </div>
                                          <p className="font-head text-sm font-800 text-[#1E293B] leading-relaxed">
                                            {q.question}
                                          </p>
                                        </div>

                                        {/* Delete Action with Inline Confirmation */}
                                        <div className="shrink-0">
                                          {confirmDeleteId === q.id ? (
                                            <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-lg border-2 border-red-500 shadow-[2px_2px_0_red]">
                                              <span className="text-[10px] font-head font-bold text-red-600">
                                                Delete?
                                              </span>
                                              <Button
                                                size="sm"
                                                variant="destructive"
                                                disabled={deletingId === q.id}
                                                onClick={() => handleDeleteQuestion(chap.key, q.id)}
                                                className="h-6 px-2 text-[10px] rounded font-head font-bold"
                                              >
                                                {deletingId === q.id ? (
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                  "Yes"
                                                )}
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setConfirmDeleteId(null)}
                                                className="h-6 px-2 text-[10px] rounded font-head font-bold"
                                              >
                                                No
                                              </Button>
                                            </div>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => setConfirmDeleteId(q.id)}
                                              title="Delete question from bank"
                                              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#FF6B5E] hover:bg-red-50 border border-transparent hover:border-[#FF6B5E] transition-all"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      {/* Options 2x2 Grid */}
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                        {(q.options || []).map((opt, optIdx) => {
                                          const isCorrect = optIdx === q.correct_index;
                                          return (
                                            <div
                                              key={optIdx}
                                              className={`p-2.5 rounded-xl border-2 text-[11px] flex items-center justify-between gap-2 transition-all ${
                                                isCorrect
                                                  ? "bg-[#E8F5E9] text-[#1E293B] border-[#4CAF7D] font-bold shadow-[1px_1px_0_#4CAF7D]"
                                                  : "bg-[#FFF9E8]/50 text-[#1E293B] border-[#1E293B]/20"
                                              }`}
                                            >
                                              <div className="flex items-center gap-2 min-w-0">
                                                <span
                                                  className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                                    isCorrect
                                                      ? "bg-[#4CAF7D] text-white border-[#4CAF7D]"
                                                      : "bg-white text-[#1E293B] border-[#1E293B]/30"
                                                  }`}
                                                >
                                                  {String.fromCharCode(65 + optIdx)}
                                                </span>
                                                <span className="truncate">{opt}</span>
                                              </div>
                                              {isCorrect && (
                                                <span className="inline-flex items-center gap-1 text-[10px] text-[#2E7D32] font-mono font-bold shrink-0">
                                                  <Check className="h-3 w-3 stroke-[3]" /> Correct
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>

                                      {/* Explanation Box */}
                                      {q.explanation && (
                                        <div className="p-2.5 rounded-xl bg-[#FFF9E8] border border-[#1E293B]/30 text-[11px] text-[#1E293B] flex items-start gap-2">
                                          <HelpCircle className="h-3.5 w-3.5 text-[#5B9BD5] shrink-0 mt-0.5" />
                                          <div>
                                            <span className="font-bold text-[#1E293B] mr-1">Explanation:</span>
                                            <span className="text-[#64748B]">{q.explanation}</span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
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
}
