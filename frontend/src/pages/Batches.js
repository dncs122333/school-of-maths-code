import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { Users, Plus, Copy, GraduationCap } from "lucide-react";
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs uppercase tracking-widest text-brand-purple font-700">Manage</span>
          <h1 className="font-head text-3xl font-700 tracking-tight">Batches</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-batch-btn" className="rounded-full bg-brand-blue text-brand-ink border-2 border-brand-ink font-700"><Plus className="h-4 w-4 mr-1" /> New batch</Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl border-2 border-brand-ink">
            <DialogHeader><DialogTitle className="font-head">Create a batch</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="font-600">Batch name</Label>
                <Input data-testid="batch-name" className="rounded-xl mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Morning Batch — Class 10" />
              </div>
              <div>
                <Label className="font-600">Class</Label>
                <Select value={form.class_level} onValueChange={(v) => setForm({ ...form, class_level: v })}>
                  <SelectTrigger data-testid="batch-class" className="rounded-xl mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="9">Class 9</SelectItem><SelectItem value="10">Class 10</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button data-testid="save-batch-btn" onClick={create} className="rounded-full bg-brand-ink text-white font-700 w-full">Create batch</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {batches.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-brand-ink/20 p-16 text-center">
          <Users className="h-10 w-10 mx-auto text-brand-ink/30" />
          <p className="mt-3 text-brand-ink/50">No batches yet. Create one and share the code with students.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {batches.map((b) => (
            <div key={b.id} className="rounded-3xl bg-white border-2 border-brand-ink p-6">
              <div className="flex items-center justify-between">
                <div className="h-11 w-11 rounded-2xl bg-brand-mint border-2 border-brand-ink flex items-center justify-center"><GraduationCap className="h-5 w-5" /></div>
                <span className="text-xs font-600 text-brand-ink/50">Class {b.class_level}</span>
              </div>
              <h3 className="font-head text-lg font-600 mt-4">{b.name}</h3>
              <div className="text-sm text-brand-ink/50 flex items-center gap-1 mt-1"><Users className="h-3.5 w-3.5" /> {b.student_count} students</div>
              <button data-testid={`copy-code-${b.id}`} onClick={() => copy(b.code)} className="mt-4 w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-brand-cream border-2 border-brand-ink font-head font-700 tracking-widest hover:bg-brand-yellow transition-colors">
                {b.code} <Copy className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
