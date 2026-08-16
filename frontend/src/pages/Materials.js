import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { FolderOpen, Upload, FileText, Image as ImageIcon, Download, Trash2, Eye, User, Folder, X, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const iconFor = (ct) => (ct?.startsWith("image/") ? ImageIcon : FileText);

export default function Materials() {
  const { user } = useAuth();
  const isTeacher = user.role === "teacher" || user.role === "admin";
  const [items, setItems] = useState([]);
  const [catalog, setCatalog] = useState({});
  const [batches, setBatches] = useState([]);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: "", class_level: "9", subject: "", chapter: "", topic: "", batch_id: "" });
  const [file, setFile] = useState(null);
  const [viewer, setViewer] = useState({ open: false, url: "", type: "", name: "", loading: false });
  const [busyId, setBusyId] = useState(null);
  const fileRef = useRef();

  const load = () => api.get("/resources").then((r) => setItems(r.data));
  useEffect(() => {
    load();
    api.get("/catalog").then((r) => setCatalog(r.data));
    if (isTeacher) api.get("/batches").then((r) => setBatches(r.data));
  }, []);

  const subjects = catalog[f.class_level] ? Object.keys(catalog[f.class_level]) : [];
  const chapters = catalog[f.class_level]?.[f.subject] || [];
  const inp = "rounded-xl mt-1.5 bg-[#0B0F19] border-[#1E293B]";

  const upload = async () => {
    if (!f.title || !f.subject || !f.batch_id || !file) { toast.error("Add a title, subject, batch and a file"); return; }
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

  const fetchBlob = async (r) => {
    const res = await api.get(`/resources/${r.id}/file`, { responseType: "blob" });
    return res.data;
  };

  const openView = async (r) => {
    const ct = r.content_type || "";
    setViewer({ open: true, url: "", type: ct, name: r.filename, loading: true });
    try {
      const blob = await fetchBlob(r);
      const url = URL.createObjectURL(blob);
      setViewer({ open: true, url, type: ct, name: r.filename, loading: false });
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not open the file");
      setViewer({ open: false, url: "", type: "", name: "", loading: false });
    }
  };

  const download = async (r) => {
    setBusyId(r.id);
    try {
      const blob = await fetchBlob(r);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = r.filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Download failed"); }
    finally { setBusyId(null); }
  };

  const closeViewer = () => {
    if (viewer.url) URL.revokeObjectURL(viewer.url);
    setViewer({ open: false, url: "", type: "", name: "", loading: false });
  };

  const remove = async (id) => {
    try { await api.delete(`/resources/${id}`); toast.success("Removed"); load(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  // group by chapter (folders)
  const groups = items.reduce((acc, r) => {
    const key = r.chapter?.trim() || "General";
    (acc[key] = acc[key] || []).push(r);
    return acc;
  }, {});
  const groupKeys = Object.keys(groups).sort((a, b) => (a === "General" ? 1 : b === "General" ? -1 : a.localeCompare(b)));

  return (
    <div className="space-y-8">
      <div>
        <span className="text-xs uppercase tracking-widest text-[#06B6D4] font-600">Class materials</span>
        <h1 className="font-head text-3xl font-700 tracking-tight text-white">Shared Files</h1>
        <p className="text-[#94A3B8] mt-1">Original notes & documents shared with a batch — exactly as uploaded, no changes.</p>
      </div>

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
          <div className="space-y-8">
            {groupKeys.map((gk) => (
              <div key={gk} data-testid={`folder-${gk}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Folder className="h-4 w-4 text-[#FBBF24]" />
                  <h3 className="font-head font-600 text-white">{gk}</h3>
                  <span className="text-xs text-[#94A3B8] font-mono">{groups[gk].length}</span>
                  <div className="flex-1 h-px bg-[#1E293B] ml-2" />
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {groups[gk].map((r, i) => {
                    const Icon = iconFor(r.content_type);
                    return (
                      <motion.div key={r.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                        className="rounded-3xl bg-[#111827] border border-[#1E293B] p-6 flex flex-col hover:border-[#3B82F6]/40 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="h-11 w-11 rounded-2xl bg-[#0B0F19] border border-[#06B6D4]/30 flex items-center justify-center shrink-0"><Icon className="h-5 w-5 text-[#06B6D4]" /></div>
                          <span className="text-[11px] font-600 uppercase tracking-wide px-2.5 py-1 rounded-full border border-[#3B82F6]/40 bg-[#3B82F6]/10 text-[#3B82F6]">{r.subject}</span>
                        </div>
                        <h4 className="font-head text-lg font-600 mt-4 leading-snug text-white">{r.title}</h4>
                        <div className="text-xs text-[#94A3B8] mt-1 font-500 truncate">{r.filename} • {fmtSize(r.size)}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[#94A3B8]/80 font-mono">
                          <span className="px-2 py-0.5 rounded-full bg-[#0B0F19] border border-[#1E293B]">Class {r.class_level}</span>
                          <span className="px-2 py-0.5 rounded-full bg-[#0B0F19] border border-[#1E293B]">{r.batch_name}</span>
                        </div>
                        <div className="mt-auto pt-5 flex items-center gap-2">
                          <Button data-testid={`view-material-${r.id}`} onClick={() => openView(r)} variant="outline" className="flex-1 rounded-full border-[#1E293B] bg-transparent text-white hover:bg-white/5 font-600">
                            <Eye className="h-4 w-4 mr-1" /> View
                          </Button>
                          <Button data-testid={`download-material-${r.id}`} onClick={() => download(r)} disabled={busyId === r.id} className="rounded-full bg-[#3B82F6] text-white font-600 hover:bg-[#60A5FA]">
                            {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          </Button>
                          {isTeacher && (
                            <Button data-testid={`delete-material-${r.id}`} onClick={() => remove(r.id)} variant="outline" className="rounded-full border-[#1E293B] bg-transparent text-[#F87171] hover:bg-[#F87171]/10">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="mt-3 flex items-center gap-1 text-xs text-[#94A3B8]/60"><User className="h-3 w-3" /> {r.teacher_name}</div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={viewer.open} onOpenChange={(o) => { if (!o) closeViewer(); }}>
        <DialogContent data-testid="material-viewer" className="max-w-4xl w-[92vw] bg-[#111827] border-[#1E293B] p-0 overflow-hidden">
          <DialogHeader className="px-5 py-3 border-b border-[#1E293B]">
            <DialogTitle className="font-head text-white text-base truncate pr-8">{viewer.name}</DialogTitle>
          </DialogHeader>
          <div className="p-4 bg-[#0B0F19] max-h-[78vh] overflow-auto flex items-center justify-center">
            {viewer.loading ? (
              <div className="py-24 flex flex-col items-center gap-3 text-[#94A3B8]"><Loader2 className="h-8 w-8 animate-spin text-[#3B82F6]" /> Loading file…</div>
            ) : viewer.type?.startsWith("image/") ? (
              <img src={viewer.url} alt={viewer.name} className="max-w-full rounded-xl border border-[#1E293B]" />
            ) : viewer.type === "application/pdf" ? (
              <iframe title={viewer.name} src={viewer.url} className="w-full h-[75vh] rounded-xl bg-white" />
            ) : viewer.type === "text/plain" ? (
              <iframe title={viewer.name} src={viewer.url} className="w-full h-[70vh] rounded-xl bg-white" />
            ) : (
              <div className="py-20 text-center text-[#94A3B8]">
                <FileText className="h-10 w-10 mx-auto text-[#94A3B8]/40" />
                <p className="mt-3">This file type can't be previewed here.</p>
                <a href={viewer.url} download={viewer.name} className="inline-block mt-4 rounded-full bg-[#3B82F6] text-white font-600 px-5 py-2">Download to open</a>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
