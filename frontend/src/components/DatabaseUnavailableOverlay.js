import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, DatabaseZap, ShieldAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { DATABASE_UNAVAILABLE_MESSAGE } from "../lib/api";

export default function DatabaseUnavailableOverlay() {
  const { user } = useAuth();
  return (
    <section
      role="alert"
      aria-live="assertive"
      data-testid="database-unavailable-overlay"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#070B14] px-5 text-white"
    >
      <div data-testid="database-unavailable-panel" className="w-full max-w-xl rounded-3xl border border-[#F87171]/50 bg-[#111827] p-7 shadow-2xl shadow-black/50 sm:p-10">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#F87171]/40 bg-[#F87171]/15">
            <DatabaseZap className="h-6 w-6 text-[#F87171]" />
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-700 uppercase tracking-[0.18em] text-[#FCA5A5]">
              <AlertTriangle className="h-3.5 w-3.5" /> Service incident
            </div>
            <h1 data-testid="database-unavailable-heading" className="font-head text-2xl font-800 tracking-tight">Database unavailable</h1>
            <p data-testid="database-unavailable-message" className="text-sm leading-6 text-[#CBD5E1]">{DATABASE_UNAVAILABLE_MESSAGE}</p>
            <p data-testid="database-unavailable-explanation" className="text-sm leading-6 text-[#94A3B8]">
              Current notes, materials, tests, and progress are temporarily blocked so no stale data is presented as current.
            </p>
            {user?.role === "admin" && (
              <Link
                to="/admin/data-source"
                data-testid="database-unavailable-status-link"
                className="inline-flex items-center gap-2 rounded-xl border border-[#F87171]/40 bg-[#F87171]/10 px-3 py-2 text-xs font-700 text-[#FECACA] transition-colors hover:bg-[#F87171]/20"
              >
                <ShieldAlert className="h-4 w-4" /> Open data-source status
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}