import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { Users, Plus, Copy, Orbit } from "lucide-react";
import { toast } from "sonner";

export default function Batches() {
  const [batches, setBatches] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", class_level: "9" });

  const load = () => api.get("/batches").then((r) => setBatches(r.data));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim()) { toast.error("Enter a batch name"); return; }
    try {
      await api.post("/batches", form);
      toast.success("Batch created!");
      setOpen(false); setForm({ name: "", class_level: "9" }); load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const copy = (code) => { navigator.clipboard.writeText(code); toast.success("Code copied!"); };
  const inp = "rounded-xl mt-1.5 bg-[#0B0F19] border-[#1E293B]";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs uppercase tracking-widest text-[#06B6D4] font-600">Manage</span>
          <h1 className="font-head text-3xl font-700 tracking-tight text-white">Batches</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-batch-btn" className="rounded-full bg-[#3B82F6] text-white font-700 hover:bg-[#60A5FA]"><Plus className="h-4 w-4 mr-1" /> New batch</Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl border-[#1E293B] bg-[#111827]">
            <DialogHeader><DialogTitle className="font-head text-white">Create a batch</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="font-600 text-[#94A3B8]">Batch name</Label>
                <Input data-testid="batch-name" className={inp} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Morning Batch — Class 10" />
              </div>
              <div>
                <Label className="font-600 text-[#94A3B8]">Class</Label>
                <Select value={form.class_level} onValueChange={(v) => setForm({ ...form, class_level: v })}>
                  <SelectTrigger data-testid="batch-class" className={inp}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="9">Class 9</SelectItem><SelectItem value="10">Class 10</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button data-testid="save-batch-btn" onClick={create} className="rounded-full bg-[#3B82F6] text-white font-700 w-full hover:bg-[#60A5FA]">Create batch</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {batches.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#1E293B] p-16 text-center">
          <Users className="h-10 w-10 mx-auto text-[#94A3B8]/40" />
          <p className="mt-3 text-[#94A3B8]">No batches yet. Create one and share the code with students.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {batches.map((b) => (
            <div key={b.id} className="rounded-3xl bg-[#111827] border border-[#1E293B] p-6 relative overflow-hidden">
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full border border-dashed border-white/10" />
              <div className="flex items-center justify-between relative">
                <div className="h-11 w-11 rounded-2xl bg-[#0B0F19] border border-[#06B6D4]/30 flex items-center justify-center"><Orbit className="h-5 w-5 text-[#06B6D4]" /></div>
                <span className="text-xs font-600 text-[#94A3B8] font-mono">Class {b.class_level}</span>
              </div>
              <h3 className="font-head text-lg font-600 mt-4 text-white">{b.name}</h3>
              <div className="text-sm text-[#94A3B8] flex items-center gap-1 mt-1"><Users className="h-3.5 w-3.5" /> {b.student_count} students</div>
              <button data-testid={`copy-code-${b.id}`} onClick={() => copy(b.code)} className="mt-4 w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#0B0F19] border border-[#1E293B] font-mono font-700 tracking-widest text-[#3B82F6] hover:border-[#3B82F6]/50 transition-colors">
                {b.code} <Copy className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
