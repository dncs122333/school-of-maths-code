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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-5 text-[#1E293B]"
    >
      <div data-testid="database-unavailable-panel" className="w-full max-w-xl rounded-3xl border-[3px] border-[#1E293B] bg-white p-7 shadow-[6px_6px_0_#1E293B] sm:p-10">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-[#1E293B] bg-[#FFF9E8] shadow-[2px_2px_0_#1E293B]">
            <DatabaseZap className="h-6 w-6 text-[#E04A3C]" />
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#E04A3C]">
              <AlertTriangle className="h-3.5 w-3.5" /> Service incident
            </div>
            <h1 data-testid="database-unavailable-heading" className="font-head text-2xl font-extrabold tracking-tight text-[#1E293B]">Database unavailable</h1>
            <p data-testid="database-unavailable-message" className="text-sm leading-6 text-[#1E293B] font-medium">{DATABASE_UNAVAILABLE_MESSAGE}</p>
            <p data-testid="database-unavailable-explanation" className="text-sm leading-6 text-[#64748B]">
              Current notes, materials, tests, and progress are temporarily blocked so no stale data is presented as current.
            </p>
            {user?.role === "admin" && (
              <Link
                to="/admin/data-source"
                data-testid="database-unavailable-status-link"
                className="inline-flex items-center gap-2 rounded-xl border-2 border-[#1E293B] bg-[#FFF9E8] px-3.5 py-2 text-xs font-bold text-[#1E293B] shadow-[2px_2px_0_#1E293B] hover:bg-[#F5C842] transition-colors"
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