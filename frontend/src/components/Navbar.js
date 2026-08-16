import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { LogOut, BookOpen, FileQuestion, LayoutDashboard, Users, Sparkles, Orbit } from "lucide-react";

export default function Navbar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  if (!user) return null;

  const isTeacher = user.role === "teacher" || user.role === "admin";
  const links = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/notes", label: "Notes", icon: BookOpen },
    { to: "/tests", label: "Tests", icon: FileQuestion },
    { to: "/dpp", label: "DPP", icon: Sparkles },
    ...(isTeacher ? [{ to: "/batches", label: "Batches", icon: Users }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#0B0F19]/85 backdrop-blur-xl border-b border-[#1E293B]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link to="/dashboard" data-testid="navbar-logo" className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-[#3B82F6] flex items-center justify-center glow-blue">
            <Orbit className="h-5 w-5 text-white" />
          </div>
          <span className="font-head font-700 text-xl tracking-tight text-white">School of <span className="text-[#06B6D4]">Maths</span></span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => {
            const active = loc.pathname.startsWith(l.to);
            const Icon = l.icon;
            return (
              <Link key={l.to} to={l.to} data-testid={`nav-${l.label.toLowerCase()}`}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-500 transition-colors ${active ? "bg-[#3B82F6]/15 text-[#3B82F6]" : "text-[#94A3B8] hover:text-white hover:bg-white/5"}`}>
                <Icon className="h-4 w-4" /> {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="text-sm font-600 text-white">{user.name}</span>
            <span className="text-[11px] uppercase tracking-widest text-[#94A3B8]">{user.role}</span>
          </div>
          <Button data-testid="logout-btn" variant="outline" size="sm" className="rounded-full border-[#1E293B] bg-transparent hover:bg-white/5 text-[#94A3B8]"
            onClick={() => { logout(); nav("/auth"); }}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
