import React, { useState, useEffect } from "react";
import { api, formatApiErrorDetail } from "../../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  UploadCloud, CheckCircle2, AlertTriangle, FileText, Loader2, Code2,
  Bot, Copy, Check, Sparkles, Eye, EyeOff, Trash2, ArrowLeft,
  ShieldCheck, CheckSquare, Square, Image as ImageIcon, ExternalLink, X
} from "lucide-react";
import { toast } from "sonner";

export default function ImportQuestionsModal({ open, onOpenChange, onSuccess, onImportSuccess, initialTab = "ai_vision" }) {
  // Tabs: "ai_vision" | "file" | "json_paste" | "prompt_helper"
  const [tab, setTab] = useState(initialTab || "ai_vision");
  const [file, setFile] = useState(null);
  const [jsonText, setJsonText] = useState("");
  const [status, setStatus] = useState("active");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  // Curriculum state
  const [curriculum, setCurriculum] = useState({});

  // Prompt Helper state
  const [promptClass, setPromptClass] = useState("10");
  const [promptSubj, setPromptSubj] = useState("Maths");
  const [promptChap, setPromptChap] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [copied, setCopied] = useState(false);

  // AI Vision state
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("vidya_gemini_api_key") || "");
  const [showKey, setShowKey] = useState(false);
  const [rememberKey, setRememberKey] = useState(true);
  const [aiClass, setAiClass] = useState("10");
  const [aiSubj, setAiSubj] = useState("Maths");
  const [aiChap, setAiChap] = useState("");
  const [mediaFile, setMediaFile] = useState(null);
  const [extracting, setExtracting] = useState(false);

  // Review Mode state (Option A)
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewedQuestions, setReviewedQuestions] = useState([]);
  const [allowedTopics, setAllowedTopics] = useState([]);

  useEffect(() => {
    if (open) {
      if (initialTab) setTab(initialTab);
      api.get("/curriculum")
        .then((r) => {
          const cur = r.data || {};
          setCurriculum(cur);

          // Default prompt chapter
          const pChaps = Object.keys(cur?.["10"]?.["Maths"] || {});
          if (pChaps.length > 0 && !promptChap) setPromptChap(pChaps[0]);

          // Default AI chapter
          const aiChaps = Object.keys(cur?.[aiClass]?.[aiSubj] || {});
          if (aiChaps.length > 0 && !aiChap) setAiChap(aiChaps[0]);
        })
        .catch(() => {});
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update prompt helper when selections change
  useEffect(() => {
    if (promptClass && promptSubj && promptChap) {
      api.get("/curriculum/prompt", {
        params: { class_level: promptClass, subject: promptSubj, chapter: promptChap }
      }).then((r) => setGeneratedPrompt(r.data.prompt)).catch(() => {});
    }
  }, [promptClass, promptSubj, promptChap]);

  // Update AI chapter default when AI class or subject changes
  useEffect(() => {
    const chaps = Object.keys(curriculum?.[aiClass]?.[aiSubj] || {});
    if (chaps.length > 0 && !chaps.includes(aiChap)) {
      setAiChap(chaps[0]);
    }
  }, [aiClass, aiSubj, curriculum]); // eslint-disable-line react-hooks/exhaustive-deps

  const notifySuccess = () => {
    if (onSuccess) onSuccess();
    if (onImportSuccess) onImportSuccess();
  };

  const reset = () => {
    setFile(null);
    setMediaFile(null);
    setJsonText("");
    setStatus("active");
    setBusy(false);
    setExtracting(false);
    setResult(null);
    setReviewMode(false);
    setReviewedQuestions([]);
    setAllowedTopics([]);
    setCopied(false);
  };

  /* ---- Tab 1: AI Vision Extraction & Review ---- */
  const handleMediaFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      const name = f.name.toLowerCase();
      const validExts = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
      if (!validExts.some((ext) => name.endsWith(ext))) {
        toast.error("Please upload a PDF or image file (.pdf, .png, .jpg, .jpeg, .webp)");
        return;
      }
      setMediaFile(f);
      setResult(null);
    }
  };

  const handleExtractMedia = async () => {
    if (!apiKey.trim()) {
      toast.error("Please enter your Gemini API key.");
      return;
    }
    if (!mediaFile) {
      toast.error("Please upload a question paper image or PDF.");
      return;
    }
    if (!aiChap) {
      toast.error("Please select the chapter for this question paper.");
      return;
    }

    if (rememberKey) {
      localStorage.setItem("vidya_gemini_api_key", apiKey.trim());
    } else {
      localStorage.removeItem("vidya_gemini_api_key");
    }

    setExtracting(true);
    const formData = new FormData();
    formData.append("file", mediaFile);
    formData.append("api_key", apiKey.trim());
    formData.append("class_level", aiClass);
    formData.append("subject", aiSubj);
    formData.append("chapter", aiChap);
    formData.append("model", "gemini-3.8-flash");

    try {
      const res = await api.post("/questions/ai-extract", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = res.data;
      const questionsWithState = (data.questions || []).map((q, idx) => ({
        ...q,
        _id: idx + 1,
        _included: true,
      }));

      setReviewedQuestions(questionsWithState);
      setAllowedTopics(data.allowed_topics || []);
      setReviewMode(true);
      toast.success(`Extracted ${questionsWithState.length} questions! Review and edit them below before saving.`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to extract questions from document");
    } finally {
      setExtracting(false);
    }
  };

  const handleToggleInclude = (id) => {
    setReviewedQuestions((prev) =>
      prev.map((q) => (q._id === id ? { ...q, _included: !q._included } : q))
    );
  };

  const handleToggleSelectAll = () => {
    const allSelected = reviewedQuestions.every((q) => q._included);
    setReviewedQuestions((prev) => prev.map((q) => ({ ...q, _included: !allSelected })));
  };

  const handleUpdateQuestion = (id, field, value) => {
    setReviewedQuestions((prev) =>
      prev.map((q) => (q._id === id ? { ...q, [field]: value } : q))
    );
  };

  const handleUpdateOption = (id, optIndex, value) => {
    setReviewedQuestions((prev) =>
      prev.map((q) => {
        if (q._id !== id) return q;
        const newOpts = [...q.options];
        newOpts[optIndex] = value;
        return { ...q, options: newOpts };
      })
    );
  };

  const handleDeleteQuestion = (id) => {
    setReviewedQuestions((prev) => prev.filter((q) => q._id !== id));
  };

  const handleCancelReview = () => {
    setReviewMode(false);
    setReviewedQuestions([]);
    toast.info("Question import cancelled. No questions were added.");
  };

  const handleSaveReviewedQuestions = async () => {
    const selected = reviewedQuestions.filter((q) => q._included);
    if (selected.length === 0) {
      toast.error("Please select at least 1 question to import.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        class_level: aiClass,
        subject: aiSubj,
        chapter: aiChap,
        status: status,
        questions: selected.map(({ _id, _included, ...rest }) => rest),
      };

      const res = await api.post("/questions/import-json", payload);
      setResult(res.data);
      setReviewMode(false);
      toast.success(`Successfully imported ${res.data.imported} questions to question bank!`);
      notifySuccess();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to save questions");
    } finally {
      setBusy(false);
    }
  };

  /* ---- Tab 2: Standard CSV / JSON File Upload ---- */
  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      const name = f.name.toLowerCase();
      if (!name.endsWith(".json") && !name.endsWith(".csv")) {
        toast.error("Please upload a .json or .csv file.");
        return;
      }
      setFile(f);
      setResult(null);
    }
  };

  const handleUploadFile = async () => {
    if (!file) return;
    setBusy(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("status", status);

    try {
      const res = await api.post("/questions/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
      toast.success(`Imported ${res.data.imported} questions successfully!`);
      notifySuccess();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to import file");
    } finally {
      setBusy(false);
    }
  };

  /* ---- Tab 3: JSON Paste ---- */
  const handlePasteSubmit = async () => {
    if (!jsonText.trim()) {
      toast.error("Please paste JSON content first.");
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      toast.error(`Invalid JSON: ${e.message}`);
      return;
    }

    setBusy(true);
    try {
      if (typeof parsed === "object" && !Array.isArray(parsed)) {
        parsed.status = parsed.status || status;
      }
      const res = await api.post("/questions/import-json", parsed);
      setResult(res.data);
      toast.success(`Imported ${res.data.imported} questions successfully!`);
      notifySuccess();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to import JSON");
    } finally {
      setBusy(false);
    }
  };

  /* ---- Tab 4: Gemini Prompt Helper ---- */
  const handleCopyPrompt = () => {
    if (!generatedPrompt) return;
    navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    toast.success("Gemini prompt copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  };

  const aiChapters = Object.keys(curriculum?.[aiClass]?.[aiSubj] || {});
  const aiChapterTopics = curriculum?.[aiClass]?.[aiSubj]?.[aiChap] || [];
  const promptChapters = Object.keys(curriculum?.[promptClass]?.[promptSubj] || {});
  const promptTopics = curriculum?.[promptClass]?.[promptSubj]?.[promptChap] || [];
  const selectedCount = reviewedQuestions.filter((q) => q._included).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className={`bg-white border-[3px] border-[#1E293B] text-[#1E293B] ${reviewMode ? "max-w-4xl" : "max-w-2xl"} rounded-3xl p-6 sm:p-8 shadow-[6px_6px_0_#1E293B] max-h-[90vh] overflow-y-auto transition-all`}>
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="font-head text-2xl font-bold flex items-center gap-2 text-[#1E293B]">
              <Sparkles className="h-6 w-6 text-[#9333EA]" />
              Question Bank Ingestion Studio
            </DialogTitle>
          </div>
          <DialogDescription className="text-[#64748B] text-sm mt-1">
            {reviewMode
              ? `Review & calibrate extracted questions before adding them to your verified question bank.`
              : `Extract question papers directly from PDF/images using Gemini 3.8 Flash, or import JSON/CSV.`}
          </DialogDescription>
        </DialogHeader>

        {/* Tab switcher (Hidden when in Review Mode) */}
        {!reviewMode && (
          <div className="flex flex-wrap gap-2 p-1.5 bg-[#FFF9E8] rounded-2xl border-2 border-[#1E293B] mt-3">
            <button
              type="button"
              onClick={() => { setTab("ai_vision"); setResult(null); }}
              className={`flex-1 py-2 text-xs font-head font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                tab === "ai_vision" ? "bg-[#9333EA] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]" : "text-[#64748B] hover:text-[#1E293B]"
              }`}
            >
              <Sparkles className="h-4 w-4" /> AI Vision (PDF / Image)
            </button>
            <button
              type="button"
              onClick={() => { setTab("file"); setResult(null); }}
              className={`flex-1 py-2 text-xs font-head font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                tab === "file" ? "bg-[#F5C842] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]" : "text-[#64748B] hover:text-[#1E293B]"
              }`}
            >
              <UploadCloud className="h-4 w-4" /> File (CSV / JSON)
            </button>
            <button
              type="button"
              onClick={() => { setTab("json_paste"); setResult(null); }}
              className={`flex-1 py-2 text-xs font-head font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                tab === "json_paste" ? "bg-[#F5C842] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]" : "text-[#64748B] hover:text-[#1E293B]"
              }`}
            >
              <Code2 className="h-4 w-4" /> Paste JSON
            </button>
            <button
              type="button"
              onClick={() => { setTab("prompt_helper"); setResult(null); }}
              className={`flex-1 py-2 text-xs font-head font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                tab === "prompt_helper" ? "bg-[#2F8A5F] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]" : "text-[#64748B] hover:text-[#1E293B]"
              }`}
            >
              <Bot className="h-4 w-4" /> Prompt Helper
            </button>
          </div>
        )}

        <div className="mt-4 space-y-4">
          {/* TAB 1: AI Vision (PDF / Image) */}
          {tab === "ai_vision" && !reviewMode && (
            <div className="space-y-4">
              {/* Gemini API Key Section */}
              <div className="p-4 rounded-2xl bg-[#F3E8FF]/60 border-2 border-[#9333EA]/30 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-head font-bold text-xs text-[#7E22CE] flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-[#9333EA]" /> Your Gemini API Key
                  </Label>
                  <a
                    href="https://aistudio.google.com/api-keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-bold text-[#9333EA] hover:underline flex items-center gap-1"
                  >
                    Get Free Key <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="pr-10 bg-white font-mono text-xs border border-[#1E293B] rounded-xl text-[#1E293B]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#1E293B]"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-[#64748B] font-medium">
                    <input
                      type="checkbox"
                      checked={rememberKey}
                      onChange={(e) => setRememberKey(e.target.checked)}
                      className="rounded border-[#1E293B] text-[#9333EA] focus:ring-[#9333EA]"
                    />
                    Remember API key on this browser
                  </label>
                  <span className="text-[11px] font-bold text-[#7E22CE]">
                    Powered by Gemini 3.8 Flash
                  </span>
                </div>
              </div>

              {/* Class, Subject, Chapter Picker */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <Label className="font-bold text-xs text-[#1E293B]">Class</Label>
                  <Select value={aiClass} onValueChange={(v) => { setAiClass(v); setAiChap(""); }}>
                    <SelectTrigger className="mt-1 h-9 text-xs bg-white border-2 border-[#1E293B] rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="9">Class 9</SelectItem>
                      <SelectItem value="10">Class 10</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="font-bold text-xs text-[#1E293B]">Subject</Label>
                  <Select value={aiSubj} onValueChange={(v) => { setAiSubj(v); setAiChap(""); }}>
                    <SelectTrigger className="mt-1 h-9 text-xs bg-white border-2 border-[#1E293B] rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Maths">Maths</SelectItem>
                      <SelectItem value="Science">Science</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="font-bold text-xs text-[#1E293B]">Chapter</Label>
                  <Select value={aiChap} onValueChange={(v) => setAiChap(v)}>
                    <SelectTrigger className="mt-1 h-9 text-xs bg-white border-2 border-[#1E293B] rounded-xl truncate"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {aiChapters.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Strict Topic Restriction Notice */}
              {aiChapterTopics.length > 0 && (
                <div className="p-3 bg-[#FFF9E8] rounded-xl border border-[#1E293B] space-y-1 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-[#2F8A5F]">
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    <span>Strict NCERT Topic Restriction Active ({aiChapterTopics.length} approved topics)</span>
                  </div>
                  <p className="text-[11px] text-[#64748B]">
                    Gemini will categorize every extracted question strictly into one of the {aiChapterTopics.length} official topics defined for <strong>{aiChap}</strong>.
                  </p>
                </div>
              )}

              {/* Upload Dropzone */}
              <div
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-colors ${
                  mediaFile ? "border-[#9333EA] bg-[#F3E8FF]/20" : "border-[#1E293B] hover:border-[#9333EA] bg-[#FFF9E8]"
                }`}
              >
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  id="media-upload-input"
                  className="hidden"
                  onChange={handleMediaFileChange}
                />
                <label htmlFor="media-upload-input" className="cursor-pointer flex flex-col items-center">
                  {mediaFile ? (
                    <>
                      {mediaFile.name.toLowerCase().endsWith(".pdf") ? (
                        <FileText className="h-10 w-10 text-[#9333EA] mb-2" />
                      ) : (
                        <ImageIcon className="h-10 w-10 text-[#9333EA] mb-2" />
                      )}
                      <span className="font-bold text-sm text-[#1E293B]">{mediaFile.name}</span>
                      <span className="text-xs text-[#64748B] mt-1">{(mediaFile.size / 1024).toFixed(1)} KB • Click to replace document</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="h-10 w-10 text-[#9333EA] mb-2" />
                      <span className="font-bold text-sm text-[#1E293B]">Upload Question Paper (PDF or Image)</span>
                      <span className="text-xs text-[#64748B] mt-1">Accepts test papers, worksheets, phone scans (.pdf, .png, .jpg, .webp)</span>
                    </>
                  )}
                </label>
              </div>

              {/* Status Mode Toggle */}
              <div className="flex items-center justify-between text-xs text-[#1E293B] bg-[#FFF9E8] p-3 rounded-xl border-2 border-[#1E293B]">
                <span className="font-bold">Initial question bank status:</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus("active")}
                    className={`px-3 py-1 rounded-lg font-bold border-2 transition-all ${
                      status === "active" ? "bg-[#2F8A5F] text-white border-[#1E293B] shadow-[1px_1px_0_#1E293B]" : "bg-white text-[#1E293B] border-transparent"
                    }`}
                  >
                    Active (Live in Tests)
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus("pending_review")}
                    className={`px-3 py-1 rounded-lg font-bold border-2 transition-all ${
                      status === "pending_review" ? "bg-[#F5C842] text-[#1E293B] border-[#1E293B] shadow-[1px_1px_0_#1E293B]" : "bg-white text-[#1E293B] border-transparent"
                    }`}
                  >
                    Pending Review
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="rounded-full border-2 border-[#1E293B] bg-white text-[#1E293B] hover:bg-[#FFF9E8] font-bold shadow-[2px_2px_0_#1E293B]"
                >
                  Close
                </Button>
                <Button
                  onClick={handleExtractMedia}
                  disabled={extracting || !mediaFile || !apiKey.trim() || !aiChap}
                  className="rounded-full bg-[#9333EA] hover:bg-[#7E22CE] text-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] font-head font-bold px-6 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  {extracting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing with Gemini 3.8 Flash…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-1 text-[#F5C842]" /> Extract &amp; Review Questions
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* OPTION A: INTERACTIVE REVIEW & EDIT SCREEN */}
          {tab === "ai_vision" && reviewMode && (
            <div className="space-y-4">
              {/* Review Header Controls */}
              <div className="p-3 bg-[#FFF9E8] rounded-2xl border-2 border-[#1E293B] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCancelReview}
                    className="rounded-xl border border-[#E04A3C]/40 text-[#E04A3C] hover:bg-[#E04A3C]/10 bg-white text-xs font-bold h-8 flex items-center gap-1"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel Adding
                  </Button>
                  <span className="font-head font-bold text-sm text-[#1E293B]">
                    Review Extracted Questions ({reviewedQuestions.length})
                  </span>
                  <span className="text-xs text-[#2F8A5F] font-bold bg-[#EAF7EE] px-2.5 py-0.5 rounded-full border border-[#2F8A5F]/40">
                    {aiChap} • Class {aiClass} {aiSubj}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleToggleSelectAll}
                    className="rounded-xl border border-[#1E293B] bg-white text-xs font-bold h-8"
                  >
                    {reviewedQuestions.every((q) => q._included) ? "Deselect All" : "Select All"}
                  </Button>
                  <span className="text-xs font-bold text-[#64748B]">
                    {selectedCount} of {reviewedQuestions.length} selected
                  </span>
                </div>
              </div>

              {/* Mandatory Review Notice Banner */}
              <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-[#FFFDF5] border-2 border-[#F5C842] text-xs text-[#1E293B] shadow-[2px_2px_0_#F5C842]">
                <Sparkles className="h-4 w-4 text-[#B45309] shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">
                  <span className="font-bold">Mandatory Verification Step:</span> Review each question below. Confirm the correct answer radio button, verify mathematical symbols, and ensure the approved NCERT topic is accurate. Unchecked questions will be excluded from the question bank.
                </div>
              </div>

              {/* Scrollable Questions List */}
              <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                {reviewedQuestions.map((q, idx) => (
                  <div
                    key={q._id}
                    className={`rounded-2xl border-2 p-4 transition-all ${
                      q._included
                        ? "bg-white border-[#1E293B] shadow-[3px_3px_0_#1E293B]"
                        : "bg-gray-50 border-gray-300 opacity-60"
                    }`}
                  >
                    {/* Top Row: Select, Number, Difficulty, Marks, Delete */}
                    <div className="flex items-center justify-between gap-2 border-b border-[#1E293B]/10 pb-2 mb-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleInclude(q._id)}
                          className="flex items-center gap-1.5 font-head font-bold text-xs text-[#1E293B]"
                        >
                          {q._included ? (
                            <CheckSquare className="h-4 w-4 text-[#2F8A5F]" />
                          ) : (
                            <Square className="h-4 w-4 text-[#64748B]" />
                          )}
                          Question {idx + 1}
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Label className="text-[10px] text-[#64748B] font-bold">Marks:</Label>
                          <input
                            type="number"
                            min="1"
                            value={q.marks || 1}
                            onChange={(e) => handleUpdateQuestion(q._id, "marks", Number(e.target.value) || 1)}
                            className="w-12 h-6 px-1.5 text-xs text-center border border-[#1E293B] rounded-lg font-mono font-bold"
                          />
                        </div>

                        <select
                          value={q.difficulty || "medium"}
                          onChange={(e) => handleUpdateQuestion(q._id, "difficulty", e.target.value)}
                          className="h-6 text-[11px] font-bold bg-white border border-[#1E293B] rounded-lg px-2"
                        >
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(q._id)}
                          className="h-6 w-6 rounded-lg text-[#E04A3C] hover:bg-[#E04A3C]/10 flex items-center justify-center transition-colors"
                          title="Discard question"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Question Statement */}
                    <div className="space-y-1 mb-3">
                      <Label className="text-[11px] font-bold text-[#64748B]">Question Statement:</Label>
                      <textarea
                        value={q.question}
                        onChange={(e) => handleUpdateQuestion(q._id, "question", e.target.value)}
                        rows={2}
                        className="w-full text-xs font-medium p-2 bg-[#FFF9E8]/60 border border-[#1E293B] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#9333EA]"
                      />
                    </div>

                    {/* Options Grid */}
                    <div className="space-y-1.5 mb-3">
                      <Label className="text-[11px] font-bold text-[#64748B]">
                        Options (Click radio to select correct answer):
                      </Label>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {(q.options || []).map((opt, optIdx) => {
                          const isCorrect = q.correct_index === optIdx;
                          const optLetters = ["A", "B", "C", "D"];
                          return (
                            <div
                              key={optIdx}
                              onClick={() => handleUpdateQuestion(q._id, "correct_index", optIdx)}
                              className={`flex items-center gap-2 p-1.5 rounded-xl border transition-all cursor-pointer ${
                                isCorrect
                                  ? "bg-[#EAF7EE] border-[#2F8A5F] ring-1 ring-[#2F8A5F]"
                                  : "bg-white border-[#1E293B]/30 hover:border-[#1E293B]"
                              }`}
                            >
                              <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                isCorrect ? "bg-[#2F8A5F] text-white" : "bg-gray-100 text-[#1E293B]"
                              }`}>
                                {optLetters[optIdx]}
                              </div>
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleUpdateOption(q._id, optIdx, e.target.value);
                                }}
                                className="flex-1 text-xs bg-transparent border-0 focus:outline-none focus:ring-0 text-[#1E293B]"
                              />
                              {isCorrect && (
                                <span className="text-[10px] text-[#2F8A5F] font-bold shrink-0 pr-1">✓ Correct</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Topic Restriction Dropdown */}
                    <div className="space-y-1 mb-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] font-bold text-[#64748B] flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3 text-[#2F8A5F]" /> Approved Chapter Topic:
                        </Label>
                        <span className="text-[10px] text-[#2F8A5F] font-bold">Strict NCERT Taxonomy</span>
                      </div>
                      <select
                        value={q.topic}
                        onChange={(e) => handleUpdateQuestion(q._id, "topic", e.target.value)}
                        className="w-full text-xs font-bold p-1.5 bg-white border border-[#1E293B] rounded-xl text-[#1E293B]"
                      >
                        {allowedTopics.map((top, tIdx) => (
                          <option key={tIdx} value={top}>{top}</option>
                        ))}
                      </select>
                    </div>

                    {/* Explanation */}
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-[#64748B]">Solution Explanation:</Label>
                      <input
                        type="text"
                        value={q.explanation || ""}
                        onChange={(e) => handleUpdateQuestion(q._id, "explanation", e.target.value)}
                        placeholder="Step-by-step reasoning..."
                        className="w-full text-xs p-1.5 bg-white border border-[#1E293B]/40 rounded-lg text-[#64748B]"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Actions for Review Mode */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#1E293B]/10">
                <Button
                  variant="outline"
                  onClick={handleCancelReview}
                  className="rounded-full border-2 border-[#E04A3C]/40 text-[#E04A3C] hover:bg-[#E04A3C]/10 bg-white text-xs font-bold px-4"
                >
                  ✕ Cancel & Discard Questions
                </Button>

                <div className="flex items-center gap-3">
                  <div className="text-xs font-bold text-[#64748B]">
                    Target Status: <span className="text-[#2F8A5F] font-black">Active (Live in Bank)</span>
                  </div>
                  <Button
                    onClick={handleSaveReviewedQuestions}
                    disabled={busy || selectedCount === 0}
                    className="rounded-full bg-[#2F8A5F] hover:bg-[#26734E] text-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] font-head font-bold px-6 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving to Bank…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-1 text-[#F5C842]" /> Add {selectedCount} Approved Question{selectedCount === 1 ? "" : "s"} to Question Bank
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: File Upload (CSV / JSON) */}
          {tab === "file" && (
            <div
              className={`border-2 border-dashed rounded-2xl p-6 text-center transition-colors ${
                file ? "border-[#2F8A5F] bg-[#2F8A5F]/10" : "border-[#1E293B] hover:border-[#F5C842] bg-[#FFF9E8]"
              }`}
            >
              <input
                type="file"
                accept=".json,.csv"
                id="file-upload-input"
                className="hidden"
                onChange={handleFileChange}
              />
              <label htmlFor="file-upload-input" className="cursor-pointer flex flex-col items-center">
                {file ? (
                  <>
                    <FileText className="h-10 w-10 text-[#2F8A5F] mb-2" />
                    <span className="font-bold text-sm text-[#1E293B]">{file.name}</span>
                    <span className="text-xs text-[#64748B] mt-1">{(file.size / 1024).toFixed(1)} KB • Click to change file</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-10 w-10 text-[#64748B] mb-2" />
                    <span className="font-bold text-sm text-[#1E293B]">Click or drag &amp; drop file</span>
                    <span className="text-xs text-[#64748B] mt-1">Accepts standard .json or .csv question banks</span>
                  </>
                )}
              </label>
            </div>
          )}

          {/* TAB 3: JSON Paste */}
          {tab === "json_paste" && (
            <div className="space-y-2">
              <Label className="text-xs font-bold text-[#64748B]">Paste Question Bank JSON payload:</Label>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                placeholder='{\n  "class_level": "10",\n  "subject": "Mathematics",\n  "chapter": "Quadratic Equations",\n  "questions": [...]\n}'
                rows={9}
                className="w-full font-mono text-xs bg-[#FFF9E8] border-2 border-[#1E293B] rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-[#F5C842] text-[#1E293B]"
              />
            </div>
          )}

          {/* TAB 4: Gemini Prompt Helper */}
          {tab === "prompt_helper" && (
            <div className="space-y-4 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-head font-bold text-sm text-[#1E293B] flex items-center gap-1.5">
                  <Bot className="h-4 w-4 text-[#2F8A5F]" />
                  Gemini Prompt Generator (Restricted Topics)
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCopyPrompt}
                  className="rounded-full bg-[#2F8A5F] hover:bg-[#26734E] text-white border-2 border-[#1E293B] font-head font-bold shadow-[2px_2px_0_#1E293B] h-8 px-3"
                >
                  {copied ? <><Check className="h-3.5 w-3.5 mr-1" /> Copied!</> : <><Copy className="h-3.5 w-3.5 mr-1" /> Copy Prompt</>}
                </Button>
              </div>
              <p className="text-[#64748B] text-[11px] leading-relaxed">
                Select your chapter below to generate an instruction prompt pre-loaded with the official <strong>NCERT 2025–26 topic taxonomy</strong>.
              </p>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="font-bold text-[11px] text-[#1E293B]">Class</Label>
                  <Select value={promptClass} onValueChange={(v) => { setPromptClass(v); setPromptChap(""); }}>
                    <SelectTrigger className="mt-1 h-8 text-xs bg-white border border-[#1E293B] rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="9">Class 9</SelectItem>
                      <SelectItem value="10">Class 10</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="font-bold text-[11px] text-[#1E293B]">Subject</Label>
                  <Select value={promptSubj} onValueChange={(v) => { setPromptSubj(v); setPromptChap(""); }}>
                    <SelectTrigger className="mt-1 h-8 text-xs bg-white border border-[#1E293B] rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Maths">Maths</SelectItem>
                      <SelectItem value="Science">Science</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="font-bold text-[11px] text-[#1E293B]">Chapter</Label>
                  <Select value={promptChap} onValueChange={(v) => setPromptChap(v)}>
                    <SelectTrigger className="mt-1 h-8 text-xs bg-white border border-[#1E293B] rounded-xl truncate"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {promptChapters.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {promptTopics.length > 0 && (
                <div className="p-3 bg-white rounded-xl border border-[#1E293B] space-y-1">
                  <span className="font-bold text-[11px] text-[#1E293B] block">
                    Approved Canonical Topics ({promptTopics.length}):
                  </span>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-[#64748B]">
                    {promptTopics.map((t, i) => (
                      <li key={i}><span className="text-[#1E293B] font-medium">{t}</span></li>
                    ))}
                  </ul>
                </div>
              )}

              <textarea
                readOnly
                value={generatedPrompt}
                rows={6}
                className="w-full font-mono text-[11px] bg-white border border-[#1E293B] rounded-xl p-2.5 text-[#1E293B]"
              />
            </div>
          )}

          {/* Results Display */}
          {result && !reviewMode && (
            <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-4 space-y-2 text-sm text-[#1E293B]">
              <div className="flex items-center gap-2 text-[#2F8A5F] font-bold">
                <CheckCircle2 className="h-5 w-5" /> Ingestion completed!
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs mt-2 font-mono">
                <div className="p-2.5 rounded-xl bg-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]">
                  <div className="text-xl font-black text-[#2F8A5F]">{result.imported}</div>
                  <div className="text-[#64748B] font-bold">Imported</div>
                </div>
                <div className="p-2.5 rounded-xl bg-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]">
                  <div className="text-xl font-black text-[#F5C842]">{result.flagged}</div>
                  <div className="text-[#64748B] font-bold">Flagged Review</div>
                </div>
                <div className="p-2.5 rounded-xl bg-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]">
                  <div className="text-xl font-black text-[#64748B]">{result.duplicates}</div>
                  <div className="text-[#64748B] font-bold">Duplicates</div>
                </div>
              </div>

              {result.errors?.length > 0 && (
                <div className="mt-3 p-3 rounded-xl bg-[#E04A3C]/10 border-2 border-[#E04A3C]/40 text-[#E04A3C] text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" /> {result.errors.length} items skipped:
                  </div>
                  {result.errors.slice(0, 4).map((err, idx) => (
                    <div key={idx} className="truncate">
                      Item #{err.row}: {err.problems?.join(", ")}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Action buttons for File & Paste tabs */}
          {!reviewMode && (tab === "file" || tab === "json_paste") && (
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-full border-2 border-[#1E293B] bg-white text-[#1E293B] hover:bg-[#FFF9E8] font-bold shadow-[2px_2px_0_#1E293B]"
              >
                Close
              </Button>
              <Button
                onClick={tab === "file" ? handleUploadFile : handlePasteSubmit}
                disabled={busy || (tab === "file" ? !file : !jsonText.trim())}
                className="rounded-full bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] font-head font-bold px-6 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Ingesting…
                  </>
                ) : (
                  "Import to Bank"
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
