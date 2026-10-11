import React, { useState } from "react";
import { api, formatApiErrorDetail } from "../../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { UploadCloud, CheckCircle2, AlertTriangle, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ImportQuestionsModal({ open, onOpenChange, onSuccess }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("active");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const reset = () => {
    setFile(null);
    setStatus("active");
    setBusy(false);
    setResult(null);
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      if (!f.name.endsWith(".csv")) {
        toast.error("Please upload a .csv file.");
        return;
      }
      setFile(f);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("status", status);

    try {
      const res = await api.post("/questions/import-csv", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
      toast.success(`Imported ${res.data.imported} questions successfully!`);
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Failed to import CSV");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="bg-white border-[3px] border-[#1E293B] text-[#1E293B] max-w-xl rounded-3xl p-6 sm:p-8 shadow-[6px_6px_0_#1E293B]">
        <DialogHeader>
          <DialogTitle className="font-head text-2xl font-bold flex items-center gap-2 text-[#1E293B]">
            <UploadCloud className="h-6 w-6 text-[#2F8A5F]" />
            Import Question Bank CSV
          </DialogTitle>
          <DialogDescription className="text-[#64748B] text-sm">
            Upload a CSV containing MCQs with headers: <code className="font-mono text-[#1E293B] bg-[#FFF9E8] px-1 py-0.5 rounded border border-[#1E293B] text-xs">ID, Class, Subject, Chapter, Topic, Question, Option A, Option B, Option C, Option D, Correct Option, Explanation, Difficulty</code>
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-colors ${
              file ? "border-[#2F8A5F] bg-[#2F8A5F]/10" : "border-[#1E293B] hover:border-[#F5C842] bg-[#FFF9E8]"
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
                  <FileText className="h-10 w-10 text-[#2F8A5F] mb-2" />
                  <span className="font-bold text-sm text-[#1E293B]">{file.name}</span>
                  <span className="text-xs text-[#64748B] mt-1">{(file.size / 1024).toFixed(1)} KB • Click to change</span>
                </>
              ) : (
                <>
                  <UploadCloud className="h-10 w-10 text-[#64748B] mb-2" />
                  <span className="font-bold text-sm text-[#1E293B]">Click or drag &amp; drop CSV file</span>
                  <span className="text-xs text-[#64748B] mt-1">UTF-8 encoded .csv files supported</span>
                </>
              )}
            </label>
          </div>

          <div className="flex items-center justify-between text-xs text-[#1E293B] bg-[#FFF9E8] p-3 rounded-xl border-2 border-[#1E293B]">
            <span className="font-bold">Import status mode:</span>
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

          {result && (
            <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-4 space-y-2 text-sm text-[#1E293B]">
              <div className="flex items-center gap-2 text-[#2F8A5F] font-bold">
                <CheckCircle2 className="h-5 w-5" /> Import completed!
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs mt-2 font-mono">
                <div className="p-2 rounded-xl bg-white border-2 border-[#1E293B]">
                  <div className="text-lg font-black text-[#2F8A5F]">{result.imported}</div>
                  <div className="text-[#64748B] font-bold">Imported</div>
                </div>
                <div className="p-2 rounded-xl bg-white border-2 border-[#1E293B]">
                  <div className="text-lg font-black text-[#F5C842]">{result.flagged}</div>
                  <div className="text-[#64748B] font-bold">Flagged Review</div>
                </div>
                <div className="p-2 rounded-xl bg-white border-2 border-[#1E293B]">
                  <div className="text-lg font-black text-[#64748B]">{result.duplicates}</div>
                  <div className="text-[#64748B] font-bold">Duplicates</div>
                </div>
              </div>

              {result.errors?.length > 0 && (
                <div className="mt-3 p-3 rounded-xl bg-[#E04A3C]/10 border-2 border-[#E04A3C]/40 text-[#E04A3C] text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1">
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
              className="rounded-full border-2 border-[#1E293B] bg-white text-[#1E293B] hover:bg-[#FFF9E8] font-bold shadow-[2px_2px_0_#1E293B]"
            >
              Close
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || busy}
              className="rounded-full bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] font-bold px-6 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
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
