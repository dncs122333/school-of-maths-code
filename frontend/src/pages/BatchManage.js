import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { ArrowLeft, UserPlus, UserMinus, Check, X, TrendingDown, Users, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function BatchManage() {
  const { id } = useParams();
  const [batch, setBatch] = useState(null);
  const [students, setStudents] = useState([]);
  const [requests, setRequests] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [ident, setIdent] = useState("");

  const loadAll = async () => {
    const [b, s, r, a] = await Promise.all([
      api.get("/batches"), api.get(`/batches/${id}/students`),
      api.get(`/batches/${id}/requests`), api.get(`/batches/${id}/analytics`),
    ]);
    setBatch(b.data.find((x) => x.id === id) || null);
    setStudents(s.data); setRequests(r.data); setAnalytics(a.data);
  };
  useEffect(() => { loadAll().catch((e) => toast.error(formatApiErrorDetail(e.response?.data?.detail))); }, [id]);

  const addStudent = async () => {
    if (!ident.trim()) return;
    try { await api.post(`/batches/${id}/students`, { identifier: ident }); toast.success("Student added"); setIdent(""); loadAll(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };
  const removeStudent = async (sid) => {
    try { await api.delete(`/batches/${id}/students/${sid}`); toast.success("Removed"); loadAll(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };
  const act = async (reqId, action) => {
    try { await api.post(`/batches/${id}/requests/${reqId}/${action}`); toast.success(action === "approve" ? "Approved" : "Rejected"); loadAll(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" className="rounded-full -ml-2 text-[#94A3B8] hover:text-white hover:bg-white/5"><Link to="/batches"><ArrowLeft className="h-4 w-4 mr-1" /> Batches</Link></Button>
      <div>
        <span className="text-xs uppercase tracking-widest text-[#06B6D4] font-600">Manage batch</span>
        <h1 className="font-head text-3xl font-700 tracking-tight text-white">{batch?.name || "Batch"}</h1>
        {batch && <p className="text-[#94A3B8] mt-1 font-mono text-sm">Class {batch.class_level} • Code <span className="text-[#3B82F6]">{batch.code}</span></p>}
      </div>

      <Tabs defaultValue="students">
        <TabsList className="bg-[#111827] border border-[#1E293B] rounded-full p-1">
          <TabsTrigger value="students" data-testid="tab-students" className="rounded-full data-[state=active]:bg-[#3B82F6] data-[state=active]:text-white"><Users className="h-4 w-4 mr-1" /> Students</TabsTrigger>
          <TabsTrigger value="requests" data-testid="tab-requests" className="rounded-full data-[state=active]:bg-[#3B82F6] data-[state=active]:text-white"><Clock className="h-4 w-4 mr-1" /> Requests {requests.length > 0 && <span className="ml-1 text-xs bg-[#FBBF24] text-[#0B0F19] rounded-full px-1.5">{requests.length}</span>}</TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics" className="rounded-full data-[state=active]:bg-[#3B82F6] data-[state=active]:text-white"><TrendingDown className="h-4 w-4 mr-1" /> Weak spots</TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="mt-5 space-y-4">
          <div className="flex gap-2 max-w-lg">
            <Input data-testid="add-student-input" value={ident} onChange={(e) => setIdent(e.target.value)} placeholder="Add by email or full name" className="rounded-full bg-[#0B0F19] border-[#1E293B]" />
            <Button data-testid="add-student-btn" onClick={addStudent} className="rounded-full bg-[#3B82F6] text-white font-600 hover:bg-[#60A5FA]"><UserPlus className="h-4 w-4 mr-1" /> Add</Button>
          </div>
          {students.length === 0 ? <p className="text-[#94A3B8]">No students enrolled yet.</p> : (
            <div className="grid sm:grid-cols-2 gap-3">
              {students.map((s) => (
                <div key={s.id} data-testid={`student-${s.id}`} className="rounded-2xl bg-[#111827] border border-[#1E293B] p-4 flex items-center justify-between">
                  <div><div className="font-600 text-white">{s.name}</div><div className="text-xs text-[#94A3B8] font-mono">{s.email}</div></div>
                  <Button data-testid={`remove-student-${s.id}`} onClick={() => removeStudent(s.id)} variant="outline" size="sm" className="rounded-full border-[#1E293B] bg-transparent text-[#F87171] hover:bg-[#F87171]/10"><UserMinus className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="requests" className="mt-5 space-y-3">
          {requests.length === 0 ? <p className="text-[#94A3B8]">No pending join requests.</p> : requests.map((r) => (
            <div key={r.id} data-testid={`request-${r.id}`} className="rounded-2xl bg-[#111827] border border-[#1E293B] p-4 flex items-center justify-between">
              <div><div className="font-600 text-white">{r.student_name}</div><div className="text-xs text-[#94A3B8] font-mono">{r.student_email}</div></div>
              <div className="flex gap-2">
                <Button data-testid={`approve-${r.id}`} onClick={() => act(r.id, "approve")} size="sm" className="rounded-full bg-[#34D399] text-[#0B0F19] font-600 hover:bg-[#6EE7B7]"><Check className="h-4 w-4 mr-1" /> Approve</Button>
                <Button data-testid={`reject-${r.id}`} onClick={() => act(r.id, "reject")} size="sm" variant="outline" className="rounded-full border-[#1E293B] bg-transparent text-[#F87171] hover:bg-[#F87171]/10"><X className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="analytics" className="mt-5 space-y-3">
          {analytics.length === 0 ? <p className="text-[#94A3B8]">No students to analyse yet.</p> : analytics.map((a) => (
            <div key={a.student_id} data-testid={`analytics-${a.student_id}`} className="rounded-2xl bg-[#111827] border border-[#1E293B] p-5">
              <div className="flex items-center justify-between">
                <div><div className="font-600 text-white">{a.name}</div><div className="text-xs text-[#94A3B8] font-mono">{a.tests_taken} tests taken</div></div>
                {a.weak_subjects.length === 0 && a.weak_topics.length === 0 && <span className="text-xs text-[#34D399] font-600">On track ✦</span>}
              </div>
              {a.weak_subjects.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {a.weak_subjects.map((w, i) => (
                    <span key={i} className="text-xs font-600 px-2.5 py-1 rounded-full border border-[#F87171]/40 bg-[#F87171]/10 text-[#F87171] flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {w.subject} · {w.accuracy}%</span>
                  ))}
                </div>
              )}
              {a.weak_topics.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {a.weak_topics.map((w, i) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-[#0B0F19] border border-[#1E293B] text-[#94A3B8]">{w.chapter} → {w.topic} <span className="text-[#FBBF24] font-mono">{w.accuracy}%</span></span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
