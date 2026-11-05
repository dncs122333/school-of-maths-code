import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import WaitingForConsent from "./WaitingForConsent";

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center cosmic-bg">
      <div className="h-12 w-12 rounded-full border-4 border-[#3B82F6] border-t-transparent animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/auth" replace />;
  if (user.role === "student" && ["pending", "withdrawn"].includes(user.parent_consent_status)) return <WaitingForConsent />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}
