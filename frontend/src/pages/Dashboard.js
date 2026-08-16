import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { BookOpen, FileQuestion, Sparkles, Users, Plus, TrendingUp, Trophy, Orbit } from "lucide-react";
import { toast } from "sonner";

const Stat = ({ icon: Icon, label, value, color }) => (
  <div className="relative rounded-3xl bg-[#111827] border border-[#1E293B] p-6 overflow-hidden">
    <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full border border-dashed border-white/10" />
    <div className={`h-11 w-11 rounded-2xl bg-[#0B0F19] border ${color.ring} flex items-center justify-center mb-4 relative`}>
      <Icon className={`h-5 w-5 ${color.text}`} />
    </div>
    <div className="font-head text-3xl font-700 text-white relative">{value}</div>
    <div className="text-sm text-[#94A3B8] font-500 relative">{label}</div>
  </div>
);

const C = {
  blue: { text: "text-[#3B82F6]", ring: "border-[#3B82F6]/30" },
  cyan: { text: "text-[#06B6D4]", ring: "border-[#06B6D4]/30" },
  amber: { text: "text-[#FBBF24]", ring: "border-[#FBBF24]/30" },
  green: { text: "text-[#34D399]", ring: "border-[#34D399]/30" },
};

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const [stats, setStats] = useState({});
  const [code, setCode] = useState("");
  const isTeacher = user.role === "teacher" || user.role === "admin";

  useEffect(() => { api.get("/stats").then((r) => setStats(r.data)).catch(() => {}); }, []);

  const join = async () => {
    try {
      const r = await api.post("/batches/join", { code });
      await refreshUser();
      toast.success(`Joined ${r.data.name}!`);
      setCode("");
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-3xl bg-[#111827] border border-[#1E293B] p-8 sm:p-10 relative overflow-hidden">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full border border-dashed border-white/10 animate-spin-slow" />
        <div className="absolute right-24 -bottom-10 h-32 w-32 rounded-full bg-[#3B82F6]/10 blur-2xl" />
        <span className="text-xs uppercase tracking-widest text-[#06B6D4] font-600 relative">{user.role} console</span>
        <h1 className="font-head text-3xl sm:text-4xl font-700 mt-2 tracking-tight text-white relative">Hey {user.name.split(" ")[0]} 🛰️</h1>
        <p className="text-[#94A3B8] mt-2 max-w-lg relative">
          {isTeacher ? "Create accurate beautiful notes, launch timed tests and manage your batches." : "Keep the streak going — read notes, crush DPPs and top the leaderboards."}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isTeacher ? (
          <>
            <Stat icon={BookOpen} label="Notes created" value={stats.notes ?? 0} color={C.blue} />
            <Stat icon={FileQuestion} label="Tests" value={stats.tests ?? 0} color={C.cyan} />
            <Stat icon={Sparkles} label="DPPs" value={stats.dpps ?? 0} color={C.amber} />
            <Stat icon={Users} label="Batches" value={stats.batches ?? 0} color={C.green} />
          </>
        ) : (
          <>
            <Stat icon={Trophy} label="Tests taken" value={stats.tests_taken ?? 0} color={C.blue} />
            <Stat icon={TrendingUp} label="Avg score" value={`${stats.avg_score ?? 0}%`} color={C.green} />
            <Stat icon={Users} label="My batches" value={stats.batches ?? 0} color={C.cyan} />
            <Stat icon={BookOpen} label="Notes available" value={stats.notes ?? 0} color={C.amber} />
          </>
        )}
      </div>

      <div>
        <h2 className="font-head text-xl font-600 mb-4 text-white">Quick actions</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isTeacher ? (
            <>
              <ActionCard to="/notes/new" icon={BookOpen} title="Create beautiful notes" desc="Upload or paste → accurate AI notes" color={C.blue} testid="qa-create-note" />
              <ActionCard to="/tests/new" icon={FileQuestion} title="Launch a timed test" desc="Turn a sheet into a live MCQ test" color={C.cyan} testid="qa-create-test" />
              <ActionCard to="/dpp/new" icon={Sparkles} title="New DPP" desc="Daily practice problems for a chapter" color={C.amber} testid="qa-create-dpp" />
            </>
          ) : (
            <>
              <ActionCard to="/notes" icon={BookOpen} title="Read notes" desc="Beautiful notes with visuals" color={C.blue} testid="qa-notes" />
              <ActionCard to="/tests" icon={FileQuestion} title="Take a test" desc="Live timed competitive tests" color={C.cyan} testid="qa-tests" />
              <ActionCard to="/dpp" icon={Sparkles} title="Practice DPP" desc="Sharpen concepts daily" color={C.amber} testid="qa-dpp" />
            </>
          )}
        </div>
      </div>

      {user.role === "student" && (
        <div className="rounded-3xl bg-[#172033] border border-[#1E293B] p-6 flex flex-col sm:flex-row items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-[#0B0F19] border border-[#06B6D4]/30 flex items-center justify-center"><Orbit className="h-6 w-6 text-[#06B6D4]" /></div>
            <div>
              <div className="font-head font-600 text-lg text-white">Join a batch</div>
              <div className="text-sm text-[#94A3B8]">Enter the code your teacher gave you to unlock their tests.</div>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Input data-testid="join-code-input" placeholder="BATCH CODE" value={code} onChange={(e) => setCode(e.target.value)} className="rounded-full uppercase bg-[#0B0F19] border-[#1E293B] font-mono" />
            <Button data-testid="join-batch-btn" onClick={join} className="rounded-full bg-[#3B82F6] text-white font-600 hover:bg-[#60A5FA]">Join</Button>
          </div>
        </div>
      )}
    </div>
  );
}

const ActionCard = ({ to, icon: Icon, title, desc, color, testid }) => (
  <Link to={to} data-testid={testid} className="group rounded-3xl bg-[#111827] border border-[#1E293B] p-6 hover:border-[#3B82F6]/40 hover:-translate-y-0.5 transition-transform flex items-start gap-4">
    <div className={`h-12 w-12 rounded-2xl bg-[#0B0F19] border ${color.ring} flex items-center justify-center shrink-0`}>
      <Icon className={`h-6 w-6 ${color.text}`} />
    </div>
    <div>
      <div className="font-head font-600 text-lg text-white flex items-center gap-1">{title}<Plus className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-[#94A3B8]" /></div>
      <div className="text-sm text-[#94A3B8]">{desc}</div>
    </div>
  </Link>
);
