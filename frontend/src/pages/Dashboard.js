import React from "react";
import { useAuth } from "../context/AuthContext";
import StudentDashboard from "./StudentDashboard";
import TeacherDashboard from "./TeacherDashboard";

export default function Dashboard() {
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  if (isTeacher) {
    return <TeacherDashboard />;
  }

  return <StudentDashboard />;
}
