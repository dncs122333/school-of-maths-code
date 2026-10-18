import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { LogOut, FileQuestion, LayoutDashboard, Users, Sparkles, FolderOpen, Brain, BarChart3, Database } from "lucide-react";

export default function Navbar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  if (!user) return null;

  const isTeacher = user.role === "teacher" || user.role === "admin";
  const links = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/materials", label: "Class Notes", icon: FolderOpen },
    { to: "/tests", label: "Class Test", icon: FileQuestion },
    { to: "/dpp", label: "Chapterwise Test", icon: Sparkles },
    ...(isTeacher ? [{ to: "/reports", label: "Reports", icon: BarChart3 }, { to: "/batches", label: "Batches", icon: Users }] : [{ to: "/mastery", label: "Mastery", icon: Brain }]),
    ...(user.role === "admin" ? [{ to: "/admin/data-source", label: "Data Source", icon: Database }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#F5C842] border-b-[3px] border-[#1E293B] shadow-[0_4px_0_#1E293B]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/dashboard" data-testid="navbar-logo" className="flex items-center gap-2.5 group">
          <div className="h-10 w-10 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center group-hover:rotate-6 transition-transform">
            <span className="text-xl">📐</span>
          </div>
          <div className="flex flex-col">
            <span className="font-head font-900 text-lg sm:text-xl tracking-tight text-[#1E293B] uppercase leading-none">
              School of <span className="text-[#FF6B5E]">Maths</span>
            </span>
            <span className="text-[10px] font-head font-bold uppercase tracking-wider text-[#1E293B]/80 mt-0.5">
              Classroom Hub
            </span>
          </div>
        </Link>

        {/* Chunky Nav Links */}
        <nav className="hidden md:flex items-center gap-1.5 overflow-x-auto py-1">
          {links.map((l) => {
            const active = loc.pathname === l.to || (l.to !== "/dashboard" && loc.pathname.startsWith(l.to));
            const Icon = l.icon;
            return (
              <Link
                key={l.to}
                to={l.to}
                data-testid={`nav-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-head font-bold border-2 border-[#1E293B] transition-all whitespace-nowrap ${
                  active
                    ? "bg-white text-[#1E293B] shadow-[2px_2px_0_#1E293B] -translate-y-0.5"
                    : "bg-white/35 text-[#1E293B] hover:bg-white hover:shadow-[2px_2px_0_#1E293B] hover:-translate-y-0.5"
                }`}
              >
                <Icon className="h-3.5 w-3.5 text-[#1E293B]" /> {l.label}
              </Link>
            );
          })}
        </nav>

        {/* Right User & Logout Capsule */}
        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-white rounded-full border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]">
            <span className="h-2 w-2 rounded-full bg-[#4CAF7D]" />
            <span className="text-xs font-head font-bold text-[#1E293B] max-w-[120px] truncate">{user.name}</span>
            <span className="text-[10px] font-head font-extrabold uppercase px-1.5 py-0.2 bg-[#F5C842] border border-[#1E293B] rounded-full text-[#1E293B]">
              {user.role}
            </span>
          </div>

          <Button
            data-testid="logout-btn"
            variant="destructive"
            size="sm"
            className="rounded-full h-8 px-3 text-xs bg-[#FF6B5E] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] hover:bg-[#EE594B]"
            onClick={() => { logout(); nav("/auth"); }}
            title="Log out"
          >
            <LogOut className="h-3.5 w-3.5 mr-1" />
            <span className="hidden xs:inline">Exit</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
