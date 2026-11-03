import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "./ConfirmDialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import {
  LogOut, FileQuestion, LayoutDashboard, Users, Sparkles, FolderOpen, Brain, BarChart3, Database, Menu,
  Library, UserCheck
} from "lucide-react";

const LINKS = {
  dashboard: { to: "/dashboard", label: "Home", long: "Dashboard", icon: LayoutDashboard },
  notes: { to: "/materials", label: "Notes", long: "Class Notes", icon: FolderOpen },
  tests: { to: "/tests", label: "Tests", long: "Class Test", icon: FileQuestion },
  practice: { to: "/dpp", label: "Practice", long: "Practice Test", icon: Sparkles },
  mastery: { to: "/mastery", label: "Mastery", long: "Mastery", icon: Brain },
  reports: { to: "/reports", label: "Reports", long: "Reports", icon: BarChart3 },
  batches: { to: "/batches", label: "Batches", long: "Batches", icon: Users },
  bank: { to: "/question-bank", label: "Questions", long: "Question Bank", icon: Library },
  teachers: { to: "/admin/teachers", label: "Teachers", long: "Teachers", icon: UserCheck },
  dataSource: { to: "/admin/data-source", label: "Data", long: "Data Source", icon: Database },
};

function navFor(role) {
  const L = LINKS;
  if (role === "student") {
    return { desktop: [L.dashboard, L.notes, L.tests, L.practice, L.mastery], tabs: [L.dashboard, L.tests, L.practice, L.notes, L.mastery], more: [] };
  }
  const adminOnly = role === "admin" ? [L.teachers, L.dataSource] : [];
  return {
    desktop: [L.dashboard, L.notes, L.tests, L.practice, L.reports, L.batches, ...adminOnly],
    tabs: [L.dashboard, L.tests, L.practice, L.batches],
    more: [L.notes, L.reports, L.bank, ...adminOnly],
  };
}

const isActive = (pathname, to) => pathname === to || (to !== "/dashboard" && pathname.startsWith(to));

export default function Navbar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const confirm = useConfirm();
  const [moreOpen, setMoreOpen] = useState(false);
  if (!user) return null;

  const { desktop, tabs, more } = navFor(user.role);
  // Taking a test: no tab bar, so a stray tap can't leave the test
  const inTest = loc.pathname.startsWith("/quiz/");
  const moreActive = more.some((l) => isActive(loc.pathname, l.to));

  const doLogout = async () => {
    setMoreOpen(false);
    const ok = await confirm({
      title: "Log out?",
      description: inTest ? "You're in the middle of a test. Unsaved answers on this device may be lost." : "You'll need your email and password to log back in.",
      confirmLabel: "Log out",
      destructive: true,
    });
    if (!ok) return;
    logout();
    nav("/auth", { replace: true });
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-[#F5C842] border-b-[3px] border-[#1E293B] shadow-[0_4px_0_#1E293B] pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
          <Link to="/dashboard" data-testid="navbar-logo" aria-label="School of Maths home" className="flex items-center gap-2.5 group min-w-0">
            <div className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center group-hover:rotate-6 transition-transform">
              <span className="text-lg sm:text-xl" aria-hidden="true">📐</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-head font-900 text-base sm:text-xl tracking-tight text-[#1E293B] uppercase leading-none whitespace-nowrap">
                School of <span className="text-[#E04A3C]">Maths</span>
              </span>
              <span className="hidden sm:block text-[10px] font-head font-bold uppercase tracking-wider text-[#1E293B]/80 mt-0.5">
                Classroom Hub
              </span>
            </div>
          </Link>

          <nav aria-label="Main" className="hidden lg:flex items-center gap-1.5 py-1">
            {desktop.map((l) => {
              const active = isActive(loc.pathname, l.to);
              const Icon = l.icon;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  aria-current={active ? "page" : undefined}
                  data-testid={`nav-${l.long.toLowerCase().replace(/\s+/g, "-")}`}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-head font-bold border-2 border-[#1E293B] transition-all whitespace-nowrap ${
                    active
                      ? "bg-white text-[#1E293B] shadow-[2px_2px_0_#1E293B] -translate-y-0.5"
                      : "bg-white/35 text-[#1E293B] hover:bg-white hover:shadow-[2px_2px_0_#1E293B] hover:-translate-y-0.5"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 text-[#1E293B]" aria-hidden="true" /> {l.long}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-white rounded-full border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]">
              <span className="h-2 w-2 rounded-full bg-[#4CAF7D]" aria-hidden="true" />
              <span className="text-xs font-head font-bold text-[#1E293B] max-w-[120px] truncate">{user.name}</span>
              <span className="text-[10px] font-head font-extrabold uppercase px-1.5 bg-[#F5C842] border border-[#1E293B] rounded-full text-[#1E293B]">
                {user.role}
              </span>
            </div>
            <button
              type="button"
              data-testid="logout-btn"
              aria-label="Log out"
              onClick={doLogout}
              className="h-11 w-11 lg:h-9 lg:w-auto lg:px-3 inline-flex items-center justify-center gap-1 rounded-full text-xs font-bold bg-[#E04A3C] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] hover:bg-[#C93E31]"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden lg:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Phone & tablet tab bar */}
      {!inTest && (
        <nav
          aria-label="Main"
          data-testid="bottom-tab-bar"
          className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t-[3px] border-[#1E293B] pb-[env(safe-area-inset-bottom)]"
        >
          <ul className="flex">
            {tabs.map((l) => {
              const active = isActive(loc.pathname, l.to);
              const Icon = l.icon;
              return (
                <li key={l.to} className="flex-1">
                  <Link
                    to={l.to}
                    aria-current={active ? "page" : undefined}
                    data-testid={`tab-${l.label.toLowerCase()}`}
                    className={`flex flex-col items-center justify-center gap-0.5 min-h-14 text-[11px] font-head font-bold ${
                      active ? "text-[#1E293B]" : "text-[#64748B]"
                    }`}
                  >
                    <span className={`flex items-center justify-center h-7 w-12 rounded-full ${active ? "bg-[#F5C842] border-2 border-[#1E293B]" : ""}`}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    {l.label}
                  </Link>
                </li>
              );
            })}
            {more.length > 0 && (
              <li className="flex-1">
                <button
                  type="button"
                  data-testid="tab-more"
                  aria-haspopup="dialog"
                  onClick={() => setMoreOpen(true)}
                  className={`w-full flex flex-col items-center justify-center gap-0.5 min-h-14 text-[11px] font-head font-bold ${
                    moreActive ? "text-[#1E293B]" : "text-[#64748B]"
                  }`}
                >
                  <span className={`flex items-center justify-center h-7 w-12 rounded-full ${moreActive ? "bg-[#F5C842] border-2 border-[#1E293B]" : ""}`}>
                    <Menu className="h-5 w-5" aria-hidden="true" />
                  </span>
                  More
                </button>
              </li>
            )}
          </ul>
        </nav>
      )}

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl border-t-[3px] border-[#1E293B] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle className="font-head text-[#1E293B] text-left">{user.name}</SheetTitle>
          </SheetHeader>
          <ul className="mt-4 grid grid-cols-2 gap-3">
            {more.map((l) => {
              const Icon = l.icon;
              return (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    onClick={() => setMoreOpen(false)}
                    aria-current={isActive(loc.pathname, l.to) ? "page" : undefined}
                    className="flex items-center gap-3 min-h-14 px-4 rounded-2xl border-2 border-[#1E293B] bg-[#FFF9E8] font-head font-bold text-sm text-[#1E293B]"
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" /> {l.long}
                  </Link>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
