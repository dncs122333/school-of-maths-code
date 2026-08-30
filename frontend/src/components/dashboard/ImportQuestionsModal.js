import React, { useState } from "react";
import { api, formatApiErrorDetail } from "../../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { UploadCloud, CheckCircle2, AlertCircle, FileText, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function ImportQuestionsModal({ open, onOpenChange, onImportSuccess }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("active");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a CSV file first.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("status", status);
      const res = await api.post("/questions/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
      toast.success(`Imported ${res.data.imported} questions successfully!`);
      if (onImportSuccess) onImportSuccess();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="bg-[#111827] border border-[#1E293B] text-white max-w-xl rounded-3xl p-6 sm:p-8">
        <DialogHeader>
          <DialogTitle className="font-head text-2xl font-700 flex items-center gap-2">
            <UploadCloud className="h-6 w-6 text-[#06B6D4]" />
            Import Question Bank CSV
          </DialogTitle>
          <DialogDescription className="text-[#94A3B8] text-sm">
            Upload a CSV containing MCQs with headers: <code className="font-mono text-[#06B6D4] text-xs">ID, Class, Subject, Chapter, Topic, Question, Option A, Option B, Option C, Option D, Correct Option, Explanation, Difficulty</code>
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-colors ${
              file ? "border-[#3B82F6] bg-[#3B82F6]/5" : "border-[#1E293B] hover:border-[#3B82F6]/40 bg-[#0B0F19]"
            }`}
          >
            <input
              type="file"
              accept=".csv"
              id="csv-file-input"
              className="hidden"
              onChange={handleFileChange}
            />
            <label htmlFor="csv-file-input" className="cursor-pointer flex flex-col items-center">
              {file ? (
                <>
                  <FileText className="h-10 w-10 text-[#3B82F6] mb-2" />
                  <span className="font-600 text-sm text-white">{file.name}</span>
                  <span className="text-xs text-[#94A3B8] mt-1">{(file.size / 1024).toFixed(1)} KB • Click to change</span>
                </>
              ) : (
                <>
                  <UploadCloud className="h-10 w-10 text-[#94A3B8] mb-2" />
                  <span className="font-600 text-sm text-white">Click or drag & drop CSV file</span>
                  <span className="text-xs text-[#94A3B8] mt-1">UTF-8 encoded .csv files supported</span>
                </>
              )}
            </label>
          </div>

          <div className="flex items-center justify-between text-xs text-[#94A3B8] bg-[#0B0F19] p-3 rounded-xl border border-[#1E293B]">
            <span>Import status mode:</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStatus("active")}
                className={`px-3 py-1 rounded-lg font-600 transition-all ${
                  status === "active" ? "bg-[#34D399]/20 text-[#34D399] border border-[#34D399]/40" : "text-[#94A3B8]"
                }`}
              >
                Active (Instant Live)
              </button>
              <button
                type="button"
                onClick={() => setStatus("pending_review")}
                className={`px-3 py-1 rounded-lg font-600 transition-all ${
                  status === "pending_review" ? "bg-[#FBBF24]/20 text-[#FBBF24] border border-[#FBBF24]/40" : "text-[#94A3B8]"
                }`}
              >
                Pending Review
              </button>
            </div>
          </div>

          {result && (
            <div className="rounded-2xl bg-[#0B0F19] border border-[#1E293B] p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-[#34D399] font-600">
                <CheckCircle2 className="h-5 w-5" /> Import completed!
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs mt-2 font-mono">
                <div className="p-2 rounded-xl bg-[#111827] border border-[#1E293B]">
                  <div className="text-lg font-700 text-[#34D399]">{result.imported}</div>
                  <div className="text-[#94A3B8]">Imported</div>
                </div>
                <div className="p-2 rounded-xl bg-[#111827] border border-[#1E293B]">
                  <div className="text-lg font-700 text-[#FBBF24]">{result.flagged}</div>
                  <div className="text-[#94A3B8]">Flagged Review</div>
                </div>
                <div className="p-2 rounded-xl bg-[#111827] border border-[#1E293B]">
                  <div className="text-lg font-700 text-[#94A3B8]">{result.duplicates}</div>
                  <div className="text-[#94A3B8]">Duplicates</div>
                </div>
              </div>

              {result.errors?.length > 0 && (
                <div className="mt-3 p-3 rounded-xl bg-[#F87171]/10 border border-[#F87171]/20 text-[#F87171] text-xs space-y-1">
                  <div className="font-600 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" /> {result.errors.length} rows skipped with errors:
                  </div>
                  {result.errors.slice(0, 3).map((err, idx) => (
                    <div key={idx} className="truncate">
                      Row {err.row} (ID: {err.source_id}): {err.problems?.join(", ")}
                    </div>
                  ))}
                  {result.errors.length > 3 && (
                    <div className="text-[11px] opacity-80">+ {result.errors.length - 3} more rows</div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-full border-[#1E293B] text-[#94A3B8] hover:text-white hover:bg-white/5"
            >
              Close
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || busy}
              className="rounded-full bg-[#3B82F6] hover:bg-[#60A5FA] text-white font-700 glow-blue px-6"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing…
                </>
              ) : (
                "Import to Bank"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
