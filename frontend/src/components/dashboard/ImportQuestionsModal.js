import React, { useState, useEffect } from "react";
import { api, formatApiErrorDetail } from "../../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { UploadCloud, CheckCircle2, AlertTriangle, FileText, Loader2, Code2, Download, Bot, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export default function ImportQuestionsModal({ open, onOpenChange, onSuccess, onImportSuccess }) {
  const [tab, setTab] = useState("file"); // "file" | "json_paste" | "prompt_helper"
  const [file, setFile] = useState(null);
  const [jsonText, setJsonText] = useState("");
  const [status, setStatus] = useState("active");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  // Curriculum state for Prompt Helper
  const [curriculum, setCurriculum] = useState({});
  const [promptClass, setPromptClass] = useState("10");
  const [promptSubj, setPromptSubj] = useState("Maths");
  const [promptChap, setPromptChap] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      api.get("/curriculum")
        .then((r) => {
          setCurriculum(r.data || {});
          const chaps = Object.keys(r.data?.["10"]?.["Maths"] || {});
          if (chaps.length > 0 && !promptChap) {
            setPromptChap(chaps[0]);
          }
        })
        .catch(() => {});
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (promptClass && promptSubj && promptChap) {
      api.get("/curriculum/prompt", {
        params: { class_level: promptClass, subject: promptSubj, chapter: promptChap }
      }).then((r) => setGeneratedPrompt(r.data.prompt)).catch(() => {});
    }
  }, [promptClass, promptSubj, promptChap]);

  const notifySuccess = () => {
    if (onSuccess) onSuccess();
    if (onImportSuccess) onImportSuccess();
  };

  const reset = () => {
    setFile(null);
    setJsonText("");
    setStatus("active");
    setBusy(false);
    setResult(null);
    setCopied(false);
  };

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

  const handleCopyPrompt = () => {
    if (!generatedPrompt) return;
    navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    toast.success("Gemini prompt with canonical topics copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  };

  const availableChapters = Object.keys(curriculum?.[promptClass]?.[promptSubj] || {});
  const availableTopics = curriculum?.[promptClass]?.[promptSubj]?.[promptChap] || [];

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="bg-white border-[3px] border-[#1E293B] text-[#1E293B] max-w-2xl rounded-3xl p-6 sm:p-8 shadow-[6px_6px_0_#1E293B] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="font-head text-2xl font-bold flex items-center gap-2 text-[#1E293B]">
              <UploadCloud className="h-6 w-6 text-[#2F8A5F]" />
              Question Bank Ingestion Studio
            </DialogTitle>
          </div>
          <DialogDescription className="text-[#64748B] text-sm mt-1">
            Import question papers or generate strict NCERT prompts for the Gemini App.
          </DialogDescription>
        </DialogHeader>

        {/* 3-way Tab switcher */}
        <div className="flex gap-2 p-1.5 bg-[#FFF9E8] rounded-2xl border-2 border-[#1E293B] mt-3">
          <button
            type="button"
            onClick={() => { setTab("file"); setResult(null); }}
            className={`flex-1 py-2 text-xs font-head font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              tab === "file" ? "bg-[#F5C842] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]" : "text-[#64748B] hover:text-[#1E293B]"
            }`}
          >
            <UploadCloud className="h-4 w-4" /> Upload File
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
            <Bot className="h-4 w-4" /> Gemini Prompt
          </button>
        </div>

        <div className="mt-4 space-y-4">
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
                Select your chapter below to generate an instruction prompt pre-loaded with the official <strong>NCERT 2025–26 topic taxonomy</strong>. Paste this into the Gemini app with your question paper image/PDF so Gemini strictly uses these topics.
              </p>

              {/* Selectors */}
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
                      {availableChapters.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Approved Topics Preview */}
              {availableTopics.length > 0 && (
                <div className="p-3 bg-white rounded-xl border border-[#1E293B] space-y-1">
                  <span className="font-bold text-[11px] text-[#1E293B] block">
                    Approved Canonical Topics for this Chapter ({availableTopics.length}):
                  </span>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-[#64748B]">
                    {availableTopics.map((t, i) => (
                      <li key={i}><span className="text-[#1E293B] font-medium">{t}</span></li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Prompt box */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px] font-bold text-[#64748B]">
                  <span>Generated Gemini Prompt:</span>
                </div>
                <textarea
                  readOnly
                  value={generatedPrompt}
                  rows={6}
                  className="w-full font-mono text-[11px] bg-white border border-[#1E293B] rounded-xl p-2.5 text-[#1E293B]"
                />
              </div>
            </div>
          )}

          {/* Status Mode Toggle for Ingestion */}
          {tab !== "prompt_helper" && (
            <div className="flex items-center justify-between text-xs text-[#1E293B] bg-[#FFF9E8] p-3 rounded-xl border-2 border-[#1E293B]">
              <span className="font-bold">Import question status:</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStatus("active")}
                  className={`px-3 py-1 rounded-lg font-bold border-2 transition-all ${
                    status === "active" ? "bg-[#2F8A5F] text-white border-[#1E293B] shadow-[1px_1px_0_#1E293B]" : "bg-white text-[#1E293B] border-transparent"
                  }`}
                >
                  Active (Instant Live)
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
          )}

          {/* Result View */}
          {result && (
            <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-4 space-y-2 text-sm text-[#1E293B]">
              <div className="flex items-center gap-2 text-[#2F8A5F] font-bold">
                <CheckCircle2 className="h-5 w-5" /> Import completed!
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
                    <AlertTriangle className="h-4 w-4" /> {result.errors.length} items skipped with errors:
                  </div>
                  {result.errors.slice(0, 4).map((err, idx) => (
                    <div key={idx} className="truncate">
                      Item #{err.row} (ID: {err.source_id}): {err.problems?.join(", ")}
                    </div>
                  ))}
                  {result.errors.length > 4 && (
                    <div className="text-[11px] opacity-80">+ {result.errors.length - 4} more items</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-full border-2 border-[#1E293B] bg-white text-[#1E293B] hover:bg-[#FFF9E8] font-bold shadow-[2px_2px_0_#1E293B]"
            >
              Close
            </Button>
            {tab !== "prompt_helper" && (
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
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
