import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { BarChart3, Loader2, TrendingDown, X, Users } from "lucide-react";
import { toast } from "sonner";

const BAND = {
  weak: { label: "Weak", cell: "bg-[#FF6B5E]/20 text-[#1E293B] border-2 border-[#1E293B]", badge: "bg-[#FF6B5E]/20 text-[#1E293B] border-2 border-[#1E293B] font-bold" },
  developing: { label: "Developing", cell: "bg-[#F5C842]/30 text-[#1E293B] border-2 border-[#1E293B]", badge: "bg-[#F5C842]/30 text-[#1E293B] border-2 border-[#1E293B] font-bold" },
  strong: { label: "Strong", cell: "bg-[#4CAF7D]/25 text-[#1E293B] border-2 border-[#1E293B]", badge: "bg-[#4CAF7D]/25 text-[#1E293B] border-2 border-[#1E293B] font-bold" },
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
      <div className="rounded-3xl bg-[#F5C842] border-[2.5px] border-[#1E293B] p-6 sm:p-8 shadow-[4px_4px_0_#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="inline-block px-3 py-1 rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] text-xs font-900 uppercase tracking-widest shadow-[2px_2px_0_#1E293B]">Teacher studio</span>
          <h1 className="font-head text-3xl sm:text-4xl font-900 tracking-tight text-[#1E293B] flex items-center gap-2 mt-2">
            <BarChart3 className="h-8 w-8 text-[#1E293B]" /> CLASS REPORTS
          </h1>
          <p className="text-[#1E293B]/80 font-medium mt-1">Mastery heatmap and weak-topic ranking for a batch.</p>
        </div>
        <div className="w-full sm:w-72">
          <Select value={batchId} onValueChange={setBatchId}>
            <SelectTrigger data-testid="report-batch" className="rounded-xl bg-[#FFF9E8] border-2 border-[#1E293B] text-[#1E293B] font-bold"><SelectValue placeholder="Choose a batch" /></SelectTrigger>
            <SelectContent>{batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Interactive Batch Selection Boxes */}
      {batches.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono text-[#1E293B] font-bold">
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-[#1E293B]" /> Select Batch:</span>
            <span className="text-[11px] text-[#1E293B]/70">Select from boxes or dropdown</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {batches.map((b) => {
              const isSelected = batchId === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  data-testid={`report-batch-box-${b.id}`}
                  onClick={() => setBatchId(b.id)}
                  className={`text-left rounded-2xl p-4 transition-all duration-150 border-[2.5px] border-[#1E293B] relative overflow-hidden flex flex-col justify-between ${
                    isSelected
                      ? "bg-[#F5C842] shadow-[4px_4px_0_#1E293B] translate-x-[-1px] translate-y-[-1px]"
                      : "bg-white hover:bg-[#FFF9E8] shadow-[2px_2px_0_#1E293B]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono font-900 px-2 py-0.5 rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B]">
                      Class {b.class_level}
                    </span>
                    {isSelected && (
                      <span className="h-2.5 w-2.5 rounded-full bg-[#1E293B]" />
                    )}
                  </div>
                  <div className="mt-2.5 font-head font-800 text-sm sm:text-base text-[#1E293B] truncate">
                    {b.name}
                  </div>
                  <div className="text-[11px] text-[#1E293B]/80 font-mono font-semibold mt-1 flex items-center justify-between">
                    <span>{b.student_count || 0} students</span>
                    <span className="text-[10px] text-[#1E293B]/60">#{b.code}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!batchId ? (
        <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-10 text-center font-bold text-[#1E293B]/70 shadow-[4px_4px_0_#1E293B]">Select a batch to see its mastery report.</div>
      ) : loading ? (
        <div className="text-[#1E293B] font-bold flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading report…</div>
      ) : !data || data.students.length === 0 ? (
        <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-10 text-center font-bold text-[#1E293B]/70 shadow-[4px_4px_0_#1E293B]">No students (or no submissions) in this batch yet.</div>
      ) : (
        <>
          <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-6 shadow-[4px_4px_0_#1E293B]">
            <h2 className="font-head font-800 text-lg text-[#1E293B] flex items-center gap-2"><TrendingDown className="h-5 w-5 text-[#FF6B5E]" /> Weakest topics (class average)</h2>
            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.weak_topics.map((w) => (
                <div key={key(w)} className="flex items-center justify-between rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] px-4 py-3">
                  <div>
                    <div className="text-sm font-800 text-[#1E293B]">{w.topic}</div>
                    <div className="text-xs text-[#1E293B]/70 font-semibold">{w.chapter}</div>
                  </div>
                  <span className={`font-head font-900 text-lg ${w.class_avg < 55 ? "text-[#FF6B5E]" : w.class_avg <= 75 ? "text-[#B4881B]" : "text-[#4CAF7D]"}`}>{w.class_avg}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-6 overflow-x-auto shadow-[4px_4px_0_#1E293B]">
            <h2 className="font-head font-800 text-lg text-[#1E293B] mb-4">Student × topic matrix</h2>
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[#1E293B] border-b-2 border-[#1E293B]">
                  <th className="py-2.5 pr-3 font-800">Student</th>
                  {columns.map((c) => (
                    <th key={key(c)} className="py-2.5 px-2 font-800 whitespace-nowrap" title={`${c.chapter} · ${c.topic}`}>{c.topic}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.id} data-testid="student-row" onClick={() => openDrill(s.id)}
                    className="border-b border-[#1E293B]/20 cursor-pointer hover:bg-[#FFF9E8]">
                    <td className="py-2.5 pr-3 font-800 text-[#1E293B] whitespace-nowrap">{s.name}</td>
                    {columns.map((c) => {
                      const t = studentMap[s.id]?.[key(c)];
                      return t
                        ? <td key={key(c)} className="py-2 px-1"><span className={`inline-block min-w-11 text-center rounded-lg px-2 py-1 font-bold ${BAND[t.band]?.cell}`}>{t.score}%</span></td>
                        : <td key={key(c)} className="py-2 px-2 text-[#1E293B]/30 font-bold text-center">—</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 text-xs font-semibold text-[#1E293B]/60">Click a student to drill down into their topics and recent attempts.</div>
          </div>
        </>
      )}

      {drill && (
        <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-6 shadow-[4px_4px_0_#1E293B]">
          <div className="flex items-center justify-between">
            <h2 className="font-head font-800 text-lg text-[#1E293B]">{(drill.student?.name || "Student")} — detail</h2>
            <button data-testid="close-drill" onClick={() => setDrill(null)} className="h-8 w-8 rounded-full border-2 border-[#1E293B] bg-[#FFF9E8] flex items-center justify-center text-[#1E293B] hover:bg-[#F5C842]"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs uppercase font-900 tracking-widest text-[#1E293B]/70 mb-2">Topics (weakest first)</div>
              {drill.topics.length === 0 ? <div className="text-[#1E293B]/70 text-sm font-semibold">No attempts yet.</div> : drill.topics.map((t) => (
                <div key={key(t)} className="flex items-center justify-between py-2 border-b border-[#1E293B]/20">
                  <div className="text-sm font-bold text-[#1E293B]">{t.topic} <span className="text-[#1E293B]/60 text-xs font-semibold">· {t.chapter}</span></div>
                  <Badge className={`border-2 ${BAND[t.band]?.badge}`}>{t.score}%</Badge>
                </div>
              ))}
            </div>
            <div>
              <div className="text-xs uppercase font-900 tracking-widest text-[#1E293B]/70 mb-2">Recent attempts</div>
              {drill.trend.length === 0 ? <div className="text-[#1E293B]/70 text-sm font-semibold">None yet.</div> : drill.trend.slice(0, 10).map((t, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-[#1E293B]/20">
                  <div className="text-sm font-bold text-[#1E293B] truncate">{t.title}</div>
                  <div className="text-sm font-800 text-[#1E293B]">{t.score ?? 0}% <span className="text-[#1E293B]/60 text-xs font-semibold">({t.correct}/{t.total})</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
