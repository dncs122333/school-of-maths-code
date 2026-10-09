import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import PdfCanvasViewer from "../components/PdfCanvasViewer";
import { FolderOpen, Upload, FileText, Image as ImageIcon, Download, Trash2, Eye, User, Folder, Loader2, Info, ShieldCheck, AlertTriangle, RotateCw, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const iconFor = (ct) => (ct?.startsWith("image/") ? ImageIcon : FileText);

const extOf = (filename) => (filename && filename.includes(".") ? filename.split(".").pop().toLowerCase() : "");
// Formats the in-app viewer can render. Word/PowerPoint are download-only in phase 1.
const PREVIEWABLE = new Set(["pdf", "png", "jpg", "jpeg", "webp", "gif", "txt"]);
const ENABLE_WATERMARKING = process.env.REACT_APP_ENABLE_WATERMARKING === "true";
const WATERMARKED = new Set(["pdf", "png", "jpg", "jpeg", "webp", "gif"]);
const canPreview = (r) => PREVIEWABLE.has(extOf(r.filename));
const isWatermarked = (r) => ENABLE_WATERMARKING && WATERMARKED.has(extOf(r.filename));
const NO_MARK_EXTS = new Set(["docx", "pptx"]);

export default function Materials() {
  const { user } = useAuth();
  const isTeacher = user.role === "teacher" || user.role === "admin";
  const [items, setItems] = useState([]);
  const [catalog, setCatalog] = useState({});
  const [batches, setBatches] = useState([]);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: "", class_level: "9", subject: "", chapter: "", topic: "", batch_id: "" });
  const [file, setFile] = useState(null);
  const [viewer, setViewer] = useState({ open: false, kind: "", url: "", data: null, text: "", name: "", loading: false, error: "" });
  const [busyId, setBusyId] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();
  const viewSeqRef = useRef(0); // bumped on open AND close; in-flight fetches only commit if it still matches
  const viewerUrlRef = useRef("");
  const lastViewedRef = useRef(null);

  const load = () => api.get("/resources").then((r) => setItems(r.data));
  useEffect(() => {
    load();
    api.get("/catalog").then((r) => setCatalog(r.data));
    if (isTeacher) api.get("/batches").then((r) => setBatches(r.data));
  }, []);

  const releaseViewerUrl = () => {
    if (viewerUrlRef.current) { URL.revokeObjectURL(viewerUrlRef.current); viewerUrlRef.current = ""; }
  };

  useEffect(() => () => { // revoke the viewer's object URL when the page unmounts
    viewSeqRef.current++;
    releaseViewerUrl();
  }, []);

  const subjects = catalog[f.class_level] ? Object.keys(catalog[f.class_level]) : [];
  const chapters = catalog[f.class_level]?.[f.subject] || [];
  const inp = "rounded-xl mt-1.5 bg-[#0B0F19] border-[#1E293B]";
  const pickedExt = extOf(file?.name);

  const upload = async () => {
    if (!f.title || !f.subject || !f.batch_id || !file) { toast.error("Add a title, subject, batch and a file"); return; }
    if (file.size === 0) { toast.error("That file is empty (0 bytes) — pick a file with content"); return; }
    if (file.size > MAX_UPLOAD_BYTES) { toast.error("File is larger than 25 MB — please choose a smaller file"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      Object.entries(f).forEach(([k, v]) => fd.append(k, v));
      await api.post("/resources", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Material shared with the batch!");
      setF({ title: "", class_level: "9", subject: "", chapter: "", topic: "", batch_id: "" });
      setFile(null); if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); } finally { setBusy(false); }
  };

  // Clean original file served directly from server without watermarking overhead
  const fetchBlob = async (r) => {
    const res = await api.get(`/resources/${r.id}/file`, { responseType: "blob" });
    return res.data;
  };

  const openView = async (r) => {
    const ext = extOf(r.filename);
    const seq = ++viewSeqRef.current;
    lastViewedRef.current = r;
    releaseViewerUrl();
    const kind = ext === "pdf" ? "pdf" : ext === "txt" ? "text" : "image";
    setViewer({ open: true, kind, url: "", data: null, text: "", name: r.filename, loading: true, error: "" });
    try {
      const blob = await fetchBlob(r);
      if (seq !== viewSeqRef.current) return; // viewer closed/reopened while loading — never re-open it
      if (kind === "pdf") {
        const buf = await blob.arrayBuffer();
        if (seq !== viewSeqRef.current) return;
        setViewer({ open: true, kind, url: "", data: buf, text: "", name: r.filename, loading: false, error: "" });
      } else if (kind === "text") {
        const text = await blob.text();
        if (seq !== viewSeqRef.current) return;
        setViewer({ open: true, kind, url: "", data: null, text, name: r.filename, loading: false, error: "" });
      } else {
        const url = URL.createObjectURL(blob);
        if (seq !== viewSeqRef.current) { URL.revokeObjectURL(url); return; }
        viewerUrlRef.current = url;
        setViewer({ open: true, kind, url, data: null, text: "", name: r.filename, loading: false, error: "" });
      }
    } catch (e) {
      if (seq !== viewSeqRef.current) return;
      const msg = formatApiErrorDetail(e.response?.data?.detail) || "Could not open the file";
      setViewer((v) => ({ ...v, open: true, loading: false, error: msg }));
    }
  };

  const retryView = () => { if (lastViewedRef.current) openView(lastViewedRef.current); };

  const download = async (r) => {
    setBusyId(r.id);
    try {
      const res = await api.get(`/resources/${r.id}/file`, { responseType: "blob" });
      const blob = res.data;
      // Re-wrap with the server's content-type so the browser treats it correctly
      const ct = res.headers["content-type"] || blob.type || "application/octet-stream";
      const typedBlob = new Blob([blob], { type: ct });
      const url = URL.createObjectURL(typedBlob);
      const a = document.createElement("a");
      a.href = url;
      // Ensure filename has the right extension
      let fname = r.filename || "download";
      if (!fname.includes(".") && r.content_type) {
        const extMap = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg" };
        fname += extMap[r.content_type] || "";
      }
      a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success("Download started");
    } catch (e) {
      const msg = formatApiErrorDetail(e.response?.data?.detail) || "Download failed — please try again";
      toast.error(msg);
    } finally { setBusyId(null); }
  };

  const closeViewer = () => {
    viewSeqRef.current++;
    releaseViewerUrl();
    setViewer({ open: false, kind: "", url: "", data: null, text: "", name: "", loading: false, error: "" });
  };

  const remove = async (id) => {
    try { await api.delete(`/resources/${id}`); toast.success("Removed"); load(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  /* ---- Edit Material ---- */
  const openEdit = (item) => {
    setEditItem(item);
    setEditForm({
      title: item.title || "",
      class_level: item.class_level || "9",
      subject: item.subject || "",
      chapter: item.chapter || "",
      topic: item.topic || "",
      batch_id: item.batch_id || "",
    });
  };

  const saveEdit = async () => {
    if (!editItem) return;
    if (!editForm.title?.trim()) {
      toast.error("Please enter a title");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...editForm, title: editForm.title.trim() };
      if (!payload.batch_id) payload.batch_id = null;
      const res = await api.patch(`/resources/${editItem.id}`, payload);
      toast.success("Material updated");
      setItems((prev) => prev.map((item) => (item.id === editItem.id ? { ...item, ...res.data } : item)));
      setEditItem(null);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to update material");
    } finally {
      setSaving(false);
    }
  };

  const editSubjects = editForm.class_level && catalog[editForm.class_level]
    ? Object.keys(catalog[editForm.class_level])
    : ["Science", "Maths", "Social Science", "English", "Hindi"];

  // Group by Class → Batch → Chapter
  const classGroups = items.reduce((acc, r) => {
    const cl = `Class ${r.class_level || "?"}`;
    const batch = r.batch_name?.trim() || "General";
    const chapter = r.chapter?.trim() || "General";
    if (!acc[cl]) acc[cl] = {};
    if (!acc[cl][batch]) acc[cl][batch] = {};
    if (!acc[cl][batch][chapter]) acc[cl][batch][chapter] = [];
    acc[cl][batch][chapter].push(r);
    return acc;
  }, {});
  const sortedClasses = Object.keys(classGroups).sort();

  return (
    <div className="space-y-8">
      <div>
        <span className="text-xs uppercase tracking-widest text-[#06B6D4] font-600">Class materials</span>
        <h1 className="font-head text-3xl font-700 tracking-tight text-white">Shared Files</h1>
        <p className="text-[#94A3B8] mt-1">Original notes &amp; documents shared with a batch — exactly as uploaded, no changes.</p>
      </div>

      {!isTeacher && ENABLE_WATERMARKING && (
        <div data-testid="watermark-notice" className="flex items-start gap-2.5 rounded-2xl border border-[#3B82F6]/25 bg-[#3B82F6]/5 px-4 py-3">
          <ShieldCheck className="h-4 w-4 text-[#3B82F6] mt-0.5 shrink-0" />
          <p className="text-sm text-[#94A3B8]">
            PDFs and images you open or download carry your name and email across every page.
            Your copy is traceable to you — please don't share it on.
          </p>
        </div>
      )}

      {isTeacher && (
        <div className="rounded-3xl bg-[#111827] border border-[#1E293B] p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-10 w-10 rounded-2xl bg-[#0B0F19] border border-[#3B82F6]/30 flex items-center justify-center"><Upload className="h-5 w-5 text-[#3B82F6]" /></div>
            <div>
              <div className="font-head font-600 text-lg text-white">Upload a file to a batch</div>
              <div className="text-sm text-[#94A3B8]">PDF, image, DOCX or PPTX — shared as-is with the batch.</div>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label className="font-600 text-[#94A3B8]">Title</Label>
              <Input data-testid="material-title" className={inp} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Chapter 3 — Handwritten Notes" />
            </div>
            <div>
              <Label className="font-600 text-[#94A3B8]">Batch</Label>
              <Select value={f.batch_id} onValueChange={(v) => setF({ ...f, batch_id: v })}>
                <SelectTrigger data-testid="material-batch" className={inp}><SelectValue placeholder="Choose batch" /></SelectTrigger>
                <SelectContent>{batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-600 text-[#94A3B8]">Class</Label>
              <Select value={f.class_level} onValueChange={(v) => setF({ ...f, class_level: v, subject: "", chapter: "" })}>
                <SelectTrigger data-testid="material-class" className={inp}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="9">Class 9</SelectItem><SelectItem value="10">Class 10</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-600 text-[#94A3B8]">Subject</Label>
              <Select value={f.subject} onValueChange={(v) => setF({ ...f, subject: v, chapter: "" })}>
                <SelectTrigger data-testid="material-subject" className={inp}><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-600 text-[#94A3B8]">Chapter <span className="text-[#94A3B8]/50 font-400">(optional)</span></Label>
              <Select value={f.chapter || undefined} onValueChange={(v) => setF({ ...f, chapter: v })}>
                <SelectTrigger data-testid="material-chapter" className={inp}><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{chapters.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="font-600 text-[#94A3B8]">File</Label>
              <input ref={fileRef} data-testid="material-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.pptx,.txt"
                onChange={(e) => setFile(e.target.files[0])}
                className="mt-1.5 block w-full text-sm text-[#94A3B8] file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:bg-[#3B82F6] file:text-white file:font-600 file:cursor-pointer bg-[#0B0F19] border border-[#1E293B] rounded-xl py-1.5 px-2" />
              {ENABLE_WATERMARKING && NO_MARK_EXTS.has(pickedExt) && (
                <div data-testid="no-watermark-hint" className="mt-2.5 flex items-start gap-2 rounded-xl border border-[#FBBF24]/30 bg-[#FBBF24]/5 px-3 py-2.5">
                  <Info className="h-4 w-4 text-[#FBBF24] mt-0.5 shrink-0" />
                  <p className="text-xs text-[#94A3B8]">
                    Word and PowerPoint files can&apos;t carry a student watermark and won&apos;t preview in the app —
                    students will download them as-is. <span className="text-white font-600">Export to PDF</span> if you want the
                    file marked with each student&apos;s name.
                  </p>
                </div>
              )}
            </div>
          </div>
          <Button data-testid="upload-material-btn" onClick={upload} disabled={busy} className="mt-5 w-full sm:w-auto rounded-full bg-[#3B82F6] text-white font-700 hover:bg-[#60A5FA] glow-blue">
            {busy ? "Uploading…" : <><Upload className="h-4 w-4 mr-1" /> Share with batch</>}
          </Button>
        </div>
      )}

      <div>
        <h2 className="font-head text-xl font-600 mb-4 text-white">{isTeacher ? "Your shared files" : "Available materials"}</h2>
        {items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#1E293B] p-16 text-center">
            <FolderOpen className="h-10 w-10 mx-auto text-[#94A3B8]/40" />
            <p className="mt-3 text-[#94A3B8]">No materials yet{!isTeacher && ". Join a batch to see files your teacher shares."}</p>
          </div>
        ) : (
          <div className="space-y-10">
            {sortedClasses.map((cl) => {
              const batchMap = classGroups[cl];
              const sortedBatches = Object.keys(batchMap).sort((a, b) => a === "General" ? 1 : b === "General" ? -1 : a.localeCompare(b));
              return (
                <div key={cl}>
                  {/* Class header */}
                  <div className="flex items-center gap-3 mb-5">
                    <div className="h-7 w-7 rounded-xl bg-[#3B82F6]/15 border border-[#3B82F6]/30 flex items-center justify-center">
                      <Folder className="h-4 w-4 text-[#3B82F6]" />
                    </div>
                    <h2 className="font-head text-xl font-700 text-white">{cl}</h2>
                    <div className="flex-1 h-px bg-[#1E293B]" />
                  </div>

                  <div className="space-y-6 pl-2 border-l-2 border-[#1E293B]">
                    {sortedBatches.map((batch) => {
                      const chapterMap = batchMap[batch];
                      const sortedChapters = Object.keys(chapterMap).sort((a, b) => a === "General" ? 1 : b === "General" ? -1 : a.localeCompare(b));
                      return (
                        <div key={batch}>
                          {/* Batch sub-header */}
                          <div className="flex items-center gap-2 mb-3 ml-4">
                            <Folder className="h-3.5 w-3.5 text-[#FBBF24]" />
                            <h3 className="font-head font-600 text-[#FBBF24] text-sm tracking-wide">{batch}</h3>
                            <div className="flex-1 h-px bg-[#1E293B] ml-1" />
                          </div>

                          <div className="space-y-6 pl-4">
                            {sortedChapters.map((chapter) => {
                              const chapterItems = chapterMap[chapter];
                              return (
                                <div key={chapter} data-testid={`folder-${cl}-${batch}-${chapter}`}>
                                  {/* Chapter label */}
                                  <div className="flex items-center gap-2 mb-3">
                                    <span className="text-xs font-600 text-[#94A3B8] uppercase tracking-wider">{chapter}</span>
                                    <span className="text-xs text-[#94A3B8]/50 font-mono">{chapterItems.length}</span>
                                    <div className="flex-1 h-px bg-[#1E293B]/60 ml-1" />
                                  </div>
                                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {chapterItems.map((r, i) => {
                                      const Icon = iconFor(r.content_type);
                                      const previewable = canPreview(r);
                                      return (
                                        <motion.div key={r.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                                          className="relative group rounded-3xl bg-[#111827] border border-[#1E293B] p-6 flex flex-col hover:border-[#3B82F6]/40 transition-colors">
                                          {/* Teacher quick action buttons */}
                                          {isTeacher && (
                                            <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                              <button
                                                data-testid={`edit-material-top-${r.id}`}
                                                onClick={(e) => { e.preventDefault(); openEdit(r); }}
                                                className="h-7 w-7 rounded-full bg-[#1E293B] hover:bg-[#3B82F6]/20 border border-[#3B82F6]/30 flex items-center justify-center text-[#3B82F6] transition-colors"
                                                title="Edit material">
                                                <Pencil className="h-3.5 w-3.5" />
                                              </button>
                                            </div>
                                          )}
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="h-11 w-11 rounded-2xl bg-[#0B0F19] border border-[#06B6D4]/30 flex items-center justify-center shrink-0"><Icon className="h-5 w-5 text-[#06B6D4]" /></div>
                                            <span className="text-[11px] font-600 uppercase tracking-wide px-2.5 py-1 rounded-full border border-[#3B82F6]/40 bg-[#3B82F6]/10 text-[#3B82F6]">{r.subject}</span>
                                          </div>
                                          <h4 className="font-head text-lg font-600 mt-4 leading-snug text-white">{r.title}</h4>
                                          <div className="text-xs text-[#94A3B8] mt-1 font-500 truncate">{r.filename} • {fmtSize(r.size)}</div>
                                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[#94A3B8]/80 font-mono">
                                            {!isTeacher && isWatermarked(r) && (
                                              <span data-testid={`watermark-badge-${r.id}`} className="px-2 py-0.5 rounded-full bg-[#3B82F6]/10 border border-[#3B82F6]/30 text-[#3B82F6] inline-flex items-center gap-1">
                                                <ShieldCheck className="h-3 w-3" /> watermarked
                                              </span>
                                            )}
                                          </div>
                                          {!previewable && (
                                            <div data-testid={`download-only-${r.id}`} className="mt-3 flex items-start gap-1.5 text-xs text-[#94A3B8]/80">
                                              <Info className="h-3.5 w-3.5 text-[#FBBF24] mt-0.5 shrink-0" />
                                              <span>Download only — {extOf(r.filename).toUpperCase()} files can&apos;t be previewed{!isTeacher && ENABLE_WATERMARKING && " or watermarked"}.</span>
                                            </div>
                                          )}
                                          <div className="mt-auto pt-5 flex items-center gap-2">
                                            {previewable && (
                                              <Button data-testid={`view-material-${r.id}`} onClick={() => openView(r)} variant="outline" className="flex-1 rounded-full border-[#1E293B] bg-transparent text-white hover:bg-white/5 font-600">
                                                <Eye className="h-4 w-4 mr-1" /> View
                                              </Button>
                                            )}
                                            <Button data-testid={`download-material-${r.id}`} onClick={() => download(r)} disabled={busyId === r.id}
                                              className={`rounded-full bg-[#3B82F6] text-white font-600 hover:bg-[#60A5FA] ${previewable ? "" : "flex-1"}`}>
                                              {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Download className="h-4 w-4" />{!previewable && <span className="ml-1">Download</span>}</>}
                                            </Button>
                                            {isTeacher && (
                                              <>
                                                <Button data-testid={`edit-material-${r.id}`} onClick={() => openEdit(r)} variant="outline" className="rounded-full border-[#1E293B] bg-transparent text-[#3B82F6] hover:bg-[#3B82F6]/10" title="Edit material">
                                                  <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button data-testid={`delete-material-${r.id}`} onClick={() => remove(r.id)} variant="outline" className="rounded-full border-[#1E293B] bg-transparent text-[#F87171] hover:bg-[#F87171]/10" title="Delete material">
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
                                              </>
                                            )}
                                          </div>
                                          <div className="mt-3 flex items-center gap-1 text-xs text-[#94A3B8]/60"><User className="h-3 w-3" /> {r.teacher_name}</div>
                                        </motion.div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>


      <Dialog open={viewer.open} onOpenChange={(o) => { if (!o) closeViewer(); }}>
        <DialogContent data-testid="material-viewer" className="max-w-4xl w-[92vw] bg-[#111827] border-[#1E293B] p-0 overflow-hidden">
          <DialogHeader className="px-5 py-3 border-b border-[#1E293B]">
            <DialogTitle className="font-head text-white text-base truncate pr-8">{viewer.name}</DialogTitle>
          </DialogHeader>
          {/* items-start, not items-center: centering inside an overflow-auto container clips
              the top of tall content (the PDF toolbar) out of the scrollable area entirely */}
          <div className="p-4 bg-[#0B0F19] max-h-[78vh] overflow-auto flex items-start justify-center">
            {viewer.error ? (
              <div data-testid="material-viewer-error" className="py-20 text-center text-[#94A3B8]">
                <AlertTriangle className="h-10 w-10 mx-auto text-[#FBBF24]" />
                <p className="mt-3 font-600 text-white">{viewer.error}</p>
                <Button data-testid="material-viewer-retry" onClick={retryView} variant="outline"
                  className="mt-4 rounded-full border-[#1E293B] bg-transparent text-white hover:bg-white/5 font-600">
                  <RotateCw className="h-4 w-4 mr-1" /> Try again
                </Button>
              </div>
            ) : viewer.loading ? (
              <div data-testid="material-viewer-skeleton" className="w-full flex flex-col items-center gap-3 py-6">
                <div className="w-[min(100%,620px)] h-[64vh] rounded-xl bg-[#1E293B]/60 animate-pulse" />
                <span className="text-xs text-[#94A3B8]">Preparing your copy…</span>
              </div>
            ) : viewer.kind === "pdf" ? (
              <PdfCanvasViewer data={viewer.data} onRetry={retryView} />
            ) : viewer.kind === "image" ? (
              <img src={viewer.url} alt={viewer.name} data-testid="material-viewer-image" className="max-w-full rounded-xl border border-[#1E293B]" />
            ) : viewer.kind === "text" ? (
              <pre data-testid="material-viewer-text" className="w-full max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[#111827] border border-[#1E293B] p-4 text-sm text-[#E2E8F0] font-mono">
                {viewer.text}
              </pre>
            ) : (
              <div className="py-20 text-center text-[#94A3B8]">
                <FileText className="h-10 w-10 mx-auto text-[#94A3B8]/40" />
                <p className="mt-3">This file type can&apos;t be previewed here.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {/* ---- Edit Dialog ---- */}
      <Dialog open={!!editItem} onOpenChange={(o) => { if (!o) setEditItem(null); }}>
        <DialogContent data-testid="edit-material-modal" className="bg-[#111827] border-[#1E293B] max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white font-head text-xl">Edit shared material</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="font-600 text-[#94A3B8]">Title / Name</Label>
              <Input
                data-testid="edit-material-title"
                className={inp}
                value={editForm.title || ""}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                placeholder="Material title"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="font-600 text-[#94A3B8]">Class</Label>
                <Select value={editForm.class_level} onValueChange={(v) => setEditForm({ ...editForm, class_level: v, subject: "" })}>
                  <SelectTrigger className={inp}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9">Class 9</SelectItem>
                    <SelectItem value="10">Class 10</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="font-600 text-[#94A3B8]">Subject</Label>
                <Select value={editForm.subject} onValueChange={(v) => setEditForm({ ...editForm, subject: v })}>
                  <SelectTrigger className={inp}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{editSubjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="font-600 text-[#94A3B8]">Chapter <span className="text-[#94A3B8]/50 font-400">(optional)</span></Label>
                <Input className={inp} value={editForm.chapter || ""} onChange={(e) => setEditForm({ ...editForm, chapter: e.target.value })} />
              </div>
              <div>
                <Label className="font-600 text-[#94A3B8]">Topic <span className="text-[#94A3B8]/50 font-400">(optional)</span></Label>
                <Input className={inp} value={editForm.topic || ""} onChange={(e) => setEditForm({ ...editForm, topic: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="font-600 text-[#94A3B8]">Batch</Label>
              <Select value={editForm.batch_id || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, batch_id: v === "__none__" ? "" : v })}>
                <SelectTrigger className={inp}><SelectValue placeholder="Select batch" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">General / All students</SelectItem>
                  {batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-full border-[#1E293B] text-[#94A3B8]"
              onClick={() => setEditItem(null)}>Cancel</Button>
            <Button data-testid="save-material-btn" className="rounded-full bg-[#3B82F6] hover:bg-[#60A5FA] text-white font-700"
              disabled={saving} onClick={saveEdit}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
