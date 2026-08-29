import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { BarChart3, Loader2, TrendingDown, X } from "lucide-react";
import { toast } from "sonner";

const BAND = {
  weak: { label: "Weak", cell: "bg-[#F87171]/20 text-[#F87171]", badge: "bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30" },
  developing: { label: "Developing", cell: "bg-[#FBBF24]/15 text-[#FBBF24]", badge: "bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/30" },
  strong: { label: "Strong", cell: "bg-[#34D399]/15 text-[#34D399]", badge: "bg-[#34D399]/15 text-[#34D399] border-[#34D399]/30" },
};

const key = (t) => `${t.subject}|${t.chapter}|${t.topic}`;

export default function Reports() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [drill, setDrill] = useState(null);

  useEffect(() => {
    api.get("/batches").then((r) => setBatches(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!batchId) { setData(null); setDrill(null); return; }
    setLoading(true);
    setDrill(null);
    api.get("/mastery/teacher", { params: { batch_id: batchId } })
      .then((r) => setData(r.data))
      .catch((e) => toast.error(formatApiErrorDetail(e.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, [batchId]);

  const openDrill = async (sid) => {
    try {
      const r = await api.get(`/mastery/teacher/student/${sid}`);
      setDrill(r.data);
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const columns = (data?.weak_topics || []).slice(0, 8);
  const studentMap = {};
  (data?.students || []).forEach((s) => {
    studentMap[s.id] = {};
    s.topics.forEach((t) => { studentMap[s.id][key(t)] = t; });
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="text-xs uppercase tracking-widest text-[#06B6D4] font-600">Teacher studio</span>
          <h1 className="font-head text-3xl font-700 tracking-tight text-white flex items-center gap-2"><BarChart3 className="h-7 w-7 text-[#06B6D4]" /> Class reports</h1>
          <p className="text-[#94A3B8] mt-2">Mastery heatmap and weak-topic ranking for a batch.</p>
        </div>
        <div className="w-full sm:w-72">
          <Select value={batchId} onValueChange={setBatchId}>
            <SelectTrigger data-testid="report-batch" className="rounded-xl bg-[#0B0F19] border-[#1E293B]"><SelectValue placeholder="Choose a batch" /></SelectTrigger>
            <SelectContent>{batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {!batchId ? (
        <div className="rounded-3xl bg-[#111827] border border-[#1E293B] p-10 text-center text-[#94A3B8]">Select a batch to see its mastery report.</div>
      ) : loading ? (
        <div className="text-[#94A3B8] flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading report…</div>
      ) : !data || data.students.length === 0 ? (
        <div className="rounded-3xl bg-[#111827] border border-[#1E293B] p-10 text-center text-[#94A3B8]">No students (or no submissions) in this batch yet.</div>
      ) : (
        <>
          <div className="rounded-3xl bg-[#111827] border border-[#1E293B] p-6">
            <h2 className="font-head font-600 text-lg text-white flex items-center gap-2"><TrendingDown className="h-5 w-5 text-[#F87171]" /> Weakest topics (class average)</h2>
            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.weak_topics.map((w) => (
                <div key={key(w)} className="flex items-center justify-between rounded-2xl bg-[#0B0F19] border border-[#1E293B] px-4 py-3">
                  <div>
                    <div className="text-sm font-600 text-white">{w.topic}</div>
                    <div className="text-xs text-[#94A3B8]">{w.chapter}</div>
                  </div>
                  <span className={`font-head font-700 text-lg ${w.class_avg < 55 ? "text-[#F87171]" : w.class_avg <= 75 ? "text-[#FBBF24]" : "text-[#34D399]"}`}>{w.class_avg}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-[#111827] border border-[#1E293B] p-6 overflow-x-auto">
            <h2 className="font-head font-600 text-lg text-white mb-4">Student × topic matrix</h2>
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[#94A3B8] border-b border-[#1E293B]">
                  <th className="py-2 pr-3 font-500">Student</th>
                  {columns.map((c) => (
                    <th key={key(c)} className="py-2 px-2 font-500 whitespace-nowrap" title={`${c.chapter} · ${c.topic}`}>{c.topic}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.id} data-testid="student-row" onClick={() => openDrill(s.id)}
                    className="border-b border-[#1E293B]/50 cursor-pointer hover:bg-white/5">
                    <td className="py-2 pr-3 font-600 text-white whitespace-nowrap">{s.name}</td>
                    {columns.map((c) => {
                      const t = studentMap[s.id]?.[key(c)];
                      return t
                        ? <td key={key(c)} className="py-2 px-1"><span className={`inline-block min-w-11 text-center rounded-lg px-2 py-1 font-600 ${BAND[t.band]?.cell}`}>{t.score}%</span></td>
                        : <td key={key(c)} className="py-2 px-2 text-[#94A3B8]/40 text-center">—</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 text-xs text-[#94A3B8]">Click a student to drill down into their topics and recent attempts.</div>
          </div>
        </>
      )}

      {drill && (
        <div className="rounded-3xl bg-[#172033] border border-[#3B82F6]/40 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-head font-600 text-lg text-white">{(drill.student?.name || "Student")} — detail</h2>
            <button data-testid="close-drill" onClick={() => setDrill(null)} className="text-[#94A3B8] hover:text-white"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-[#94A3B8] mb-2">Topics (weakest first)</div>
              {drill.topics.length === 0 ? <div className="text-[#94A3B8] text-sm">No attempts yet.</div> : drill.topics.map((t) => (
                <div key={key(t)} className="flex items-center justify-between py-1.5 border-b border-[#1E293B]/50">
                  <div className="text-sm text-white">{t.topic} <span className="text-[#94A3B8] text-xs">· {t.chapter}</span></div>
                  <Badge className={`border ${BAND[t.band]?.badge}`}>{t.score}%</Badge>
                </div>
              ))}
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-[#94A3B8] mb-2">Recent attempts</div>
              {drill.trend.length === 0 ? <div className="text-[#94A3B8] text-sm">None yet.</div> : drill.trend.slice(0, 10).map((t, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-[#1E293B]/50">
                  <div className="text-sm text-white truncate">{t.title}</div>
                  <div className="text-sm font-600">{t.score ?? 0}% <span className="text-[#94A3B8] text-xs">({t.correct}/{t.total})</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
