import "@/App.css";
import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { DatabaseAvailabilityProvider } from "./context/DatabaseAvailabilityContext";
import { ConfirmProvider } from "./components/ConfirmDialog";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";

// Pages load on demand: the public landing page and login no longer download the whole app
// (PDF viewer, charts, test builder) before showing anything
const Dashboard = lazy(() => import("./pages/Dashboard"));
const QuizList = lazy(() => import("./pages/QuizList"));
const QuizRunner = lazy(() => import("./pages/QuizRunner"));
const CreateQuiz = lazy(() => import("./pages/CreateQuiz"));
const Batches = lazy(() => import("./pages/Batches"));
const Materials = lazy(() => import("./pages/Materials"));
const Mastery = lazy(() => import("./pages/Mastery"));
const Reports = lazy(() => import("./pages/Reports"));
const DataSourceStatus = lazy(() => import("./pages/DataSourceStatus"));
const AdminTeachers = lazy(() => import("./pages/AdminTeachers"));
const TeacherDashboard = lazy(() => import("./pages/TeacherDashboard"));
const QuestionBank = lazy(() => import("./pages/QuestionBank"));

function PageLoading() {
  return (
    <div role="status" aria-label="Loading" className="py-24 flex justify-center">
      <div className="h-10 w-10 rounded-full border-4 border-[#1E293B] border-t-transparent animate-spin" />
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen classroom-bg text-[#1E293B]">
      <Navbar />
      {/* Bottom padding clears the phone tab bar and the home indicator */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-28 lg:pb-10">
        <Suspense fallback={<PageLoading />}>{children}</Suspense>
      </main>
    </div>
  );
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoading />;
  return user ? <Navigate to="/dashboard" replace /> : <Landing />;
}

function NotFound() {
  return (
    <div className="min-h-screen classroom-bg flex items-center justify-center p-6">
      <div className="max-w-sm w-full rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] p-8 text-center space-y-4">
        <p className="font-head text-5xl font-900 text-[#1E293B]">404</p>
        <p className="font-bold text-[#1E293B]">This page doesn't exist.</p>
        <Link to="/" className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#1E293B] text-white px-6 font-bold">
          Go home
        </Link>
      </div>
    </div>
  );
}

const page = (el, roles) => <ProtectedRoute roles={roles}><Shell>{el}</Shell></ProtectedRoute>;
const STAFF = ["teacher", "admin"];

function App() {
  return (
    <div className="App bg-[#FFF9E8] text-[#1E293B]">
      <AuthProvider>
        <BrowserRouter>
          <DatabaseAvailabilityProvider>
            <ConfirmProvider>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/dashboard" element={page(<Dashboard />)} />
                <Route path="/teacher/dashboard" element={page(<TeacherDashboard />, STAFF)} />
                <Route path="/materials" element={page(<Materials />)} />
                <Route path="/question-bank" element={page(<QuestionBank />, STAFF)} />
                <Route path="/tests" element={page(<QuizList kind="test" />)} />
                <Route path="/dpp" element={page(<QuizList kind="dpp" />)} />
                <Route path="/tests/new" element={page(<CreateQuiz kind="test" />, STAFF)} />
                <Route path="/dpp/new" element={page(<CreateQuiz kind="dpp" />, STAFF)} />
                <Route path="/quiz/:id" element={page(<QuizRunner />)} />
                <Route path="/batches" element={page(<Batches />, STAFF)} />
                <Route path="/mastery" element={page(<Mastery />, ["student"])} />
                <Route path="/reports" element={page(<Reports />, STAFF)} />
                <Route path="/admin/teachers" element={page(<AdminTeachers />, ["admin"])} />
                <Route path="/admin/data-source" element={page(<DataSourceStatus />, ["admin"])} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              {/* Top-centre: bottom-right sat on top of the phone tab bar and the test's Next button */}
              <Toaster position="top-center" theme="light" richColors closeButton />
            </ConfirmProvider>
          </DatabaseAvailabilityProvider>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
