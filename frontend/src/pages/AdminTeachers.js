import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { useConfirm } from "../components/ConfirmDialog";

const TABS = [
  { key: "pending", label: "Waiting" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function displayDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.valueOf()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Teacher sign-ups stay locked until the admin approves them here
export default function AdminTeachers() {
  const [status, setStatus] = useState("pending");
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "teachers", status],
    queryFn: async () => (await api.get("/admin/teachers", { params: { status } })).data,
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }) => api.post(`/admin/teachers/${id}/${decision}`),
    onSuccess: (_, { decision, name }) => {
      toast.success(decision === "approve" ? `${name} can now log in as a teacher` : `${name}'s request was rejected`);
      qc.invalidateQueries({ queryKey: ["admin", "teachers"] });
    },
    onError: (e) => toast.error(formatApiErrorDetail(e.response?.data?.detail)),
  });

  const rows = data || [];
  return (
    <div className="space-y-6 pb-16">
      <header className="rounded-3xl border-[2.5px] border-[#1E293B] bg-[#F5C842] p-6 shadow-[4px_4px_0_#1E293B] sm:p-8">
        <span className="inline-flex items-center gap-2 rounded-full border-2 border-[#1E293B] bg-white px-3 py-1 text-xs font-900 uppercase tracking-widest text-[#1E293B]">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Admin
        </span>
        <h1 className="mt-2 font-head text-3xl sm:text-4xl font-900 tracking-tight text-[#1E293B]">TEACHER ACCOUNTS</h1>
        <p className="mt-1 text-sm font-medium text-[#1E293B]/80">
          New teacher sign-ups can't log in until you approve them.
        </p>
      </header>

      <div role="tablist" aria-label="Account status" className="flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={status === t.key}
            onClick={() => setStatus(t.key)}
            className={`min-h-11 px-4 rounded-full text-sm font-head font-bold border-2 border-[#1E293B] whitespace-nowrap ${
              status === t.key ? "bg-[#1E293B] text-white" : "bg-white text-[#1E293B]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 font-bold text-[#1E293B]"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
      ) : isError ? (
        <div role="alert" className="rounded-2xl border-2 border-[#E04A3C] bg-[#FFF5F5] p-6 text-center space-y-3">
          <p className="font-bold text-[#991B1B]">Couldn't load teacher accounts.</p>
          <Button onClick={() => refetch()} className="rounded-full bg-[#1E293B] text-white">Retry</Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-[#1E293B]/40 bg-white p-10 text-center font-bold text-[#64748B]">
          {status === "pending" ? "No teacher sign-ups waiting." : `No ${status} teachers.`}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((t) => (
            <li key={t.id} data-testid="teacher-request" className="rounded-2xl border-2 border-[#1E293B] bg-white p-4 shadow-[3px_3px_0_#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-head font-bold text-[#1E293B] truncate">{t.name}</p>
                <p className="text-sm text-[#64748B] break-all">{t.email}</p>
                <p className="text-xs text-[#64748B] mt-0.5">Signed up {displayDate(t.created_at)}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                {t.status !== "approved" && (
                  <Button
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: t.id, decision: "approve", name: t.name })}
                    className="min-h-11 rounded-full bg-[#2F8A5F] hover:bg-[#25714D] text-white border-2 border-[#1E293B]"
                  >
                    <Check className="h-4 w-4 mr-1" aria-hidden="true" /> Approve
                  </Button>
                )}
                {t.status !== "rejected" && (
                  <Button
                    variant="outline"
                    disabled={decide.isPending}
                    onClick={async () => {
                      if (t.status === "approved" && !(await confirm({
                        title: `Revoke ${t.name}?`,
                        description: "They will be logged out and can't use their teacher account until you approve it again.",
                        confirmLabel: "Revoke", destructive: true,
                      }))) return;
                      decide.mutate({ id: t.id, decision: "reject", name: t.name });
                    }}
                    className="min-h-11 rounded-full border-2 border-[#1E293B] text-[#E04A3C]"
                  >
                    <X className="h-4 w-4 mr-1" aria-hidden="true" /> {t.status === "approved" ? "Revoke" : "Reject"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
