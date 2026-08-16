import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { BookOpen, FileQuestion, Sparkles, Users, Plus, TrendingUp, Trophy, GraduationCap } from "lucide-react";
import { toast } from "sonner";

const Stat = ({ icon: Icon, label, value, color }) => (
  <div className="rounded-3xl bg-white border-2 border-brand-ink p-6">
    <div className={`h-11 w-11 rounded-2xl ${color} border-2 border-brand-ink flex items-center justify-center mb-4`}>
      <Icon className="h-5 w-5 text-brand-ink" />
    </div>
    <div className="font-head text-3xl font-700">{value}</div>
    <div className="text-sm text-brand-ink/60 font-500">{label}</div>
  </div>
);

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
      <div className="rounded-3xl bg-brand-ink text-white p-8 sm:p-10 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-brand-blue/30" />
        <div className="absolute right-24 bottom-0 h-24 w-24 rounded-full bg-brand-purple/30" />
        <span className="text-xs uppercase tracking-widest text-brand-blue font-700">{user.role} dashboard</span>
        <h1 className="font-head text-3xl sm:text-4xl font-700 mt-2 tracking-tight">Hey {user.name.split(" ")[0]}! 👋</h1>
        <p className="text-white/70 mt-2 max-w-lg">
          {isTeacher ? "Create beautiful notes, launch timed tests and manage your batches." : "Keep the streak going — read notes, crush DPPs and top the leaderboards."}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isTeacher ? (
          <>
            <Stat icon={BookOpen} label="Notes created" value={stats.notes ?? 0} color="bg-brand-blue" />
            <Stat icon={FileQuestion} label="Tests" value={stats.tests ?? 0} color="bg-brand-purple" />
            <Stat icon={Sparkles} label="DPPs" value={stats.dpps ?? 0} color="bg-brand-mint" />
            <Stat icon={Users} label="Batches" value={stats.batches ?? 0} color="bg-brand-yellow" />
          </>
        ) : (
          <>
            <Stat icon={Trophy} label="Tests taken" value={stats.tests_taken ?? 0} color="bg-brand-blue" />
            <Stat icon={TrendingUp} label="Avg score" value={`${stats.avg_score ?? 0}%`} color="bg-brand-mint" />
            <Stat icon={Users} label="My batches" value={stats.batches ?? 0} color="bg-brand-purple" />
            <Stat icon={BookOpen} label="Notes available" value={stats.notes ?? 0} color="bg-brand-yellow" />
          </>
        )}
      </div>

      <div>
        <h2 className="font-head text-xl font-600 mb-4">Quick actions</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isTeacher ? (
            <>
              <ActionCard to="/notes/new" icon={BookOpen} title="Create beautiful notes" desc="Upload or paste rough notes → AI magic" color="bg-brand-blue" testid="qa-create-note" />
              <ActionCard to="/tests/new" icon={FileQuestion} title="Launch a timed test" desc="Turn a sheet into a live MCQ test" color="bg-brand-purple" testid="qa-create-test" />
              <ActionCard to="/dpp/new" icon={Sparkles} title="New DPP" desc="Daily practice problems for a chapter" color="bg-brand-mint" testid="qa-create-dpp" />
            </>
          ) : (
            <>
              <ActionCard to="/notes" icon={BookOpen} title="Read notes" desc="Beautiful notes with visuals" color="bg-brand-blue" testid="qa-notes" />
              <ActionCard to="/tests" icon={FileQuestion} title="Take a test" desc="Live timed competitive tests" color="bg-brand-purple" testid="qa-tests" />
              <ActionCard to="/dpp" icon={Sparkles} title="Practice DPP" desc="Sharpen concepts daily" color="bg-brand-mint" testid="qa-dpp" />
            </>
          )}
        </div>
      </div>

      {user.role === "student" && (
        <div className="rounded-3xl bg-brand-cream border-2 border-brand-ink p-6 flex flex-col sm:flex-row items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-8 w-8" />
            <div>
              <div className="font-head font-600 text-lg">Join a batch</div>
              <div className="text-sm text-brand-ink/60">Enter the code your teacher gave you to unlock their tests.</div>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Input data-testid="join-code-input" placeholder="BATCH CODE" value={code} onChange={(e) => setCode(e.target.value)} className="rounded-full uppercase" />
            <Button data-testid="join-batch-btn" onClick={join} className="rounded-full bg-brand-ink text-white font-600">Join</Button>
          </div>
        </div>
      )}
    </div>
  );
}

const ActionCard = ({ to, icon: Icon, title, desc, color, testid }) => (
  <Link to={to} data-testid={testid} className="group rounded-3xl bg-white border-2 border-brand-ink p-6 hover:-translate-y-1 transition-transform flex items-start gap-4">
    <div className={`h-12 w-12 rounded-2xl ${color} border-2 border-brand-ink flex items-center justify-center shrink-0`}>
      <Icon className="h-6 w-6 text-brand-ink" />
    </div>
    <div>
      <div className="font-head font-600 text-lg flex items-center gap-1">{title}<Plus className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" /></div>
      <div className="text-sm text-brand-ink/60">{desc}</div>
    </div>
  </Link>
);
