import "@/App.css";
import React, { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { DatabaseAvailabilityProvider } from "./context/DatabaseAvailabilityContext";
import { ConfirmProvider } from "./components/ConfirmDialog";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";

// A page already open can ask for a code file that a newer release has replaced, so when one fails to load,
// reload once to pick up the current release. The flag stops a reload loop when the device is simply offline.
const lazyPage = (load) => lazy(() => load().then((m) => {
  sessionStorage.removeItem("som_chunk_reload");
  return m;
}, (err) => {
  if (navigator.onLine && !sessionStorage.getItem("som_chunk_reload")) {
    sessionStorage.setItem("som_chunk_reload", "1");
    window.location.reload();
    return new Promise(() => {});
  }
  throw err;
}));

// Pages load on demand: the public landing page and login no longer download the whole app
// (PDF viewer, charts, test builder) before showing anything
const Dashboard = lazyPage(() => import("./pages/Dashboard"));
const QuizList = lazyPage(() => import("./pages/QuizList"));
const QuizRunner = lazyPage(() => import("./pages/QuizRunner"));
const CreateQuiz = lazyPage(() => import("./pages/CreateQuiz"));
const Batches = lazyPage(() => import("./pages/Batches"));
const Materials = lazyPage(() => import("./pages/Materials"));
const Mastery = lazyPage(() => import("./pages/Mastery"));
const Reports = lazyPage(() => import("./pages/Reports"));
const DataSourceStatus = lazyPage(() => import("./pages/DataSourceStatus"));
const AdminTeachers = lazyPage(() => import("./pages/AdminTeachers"));
const TeacherDashboard = lazyPage(() => import("./pages/TeacherDashboard"));
const QuestionBank = lazyPage(() => import("./pages/QuestionBank"));
const ResetPassword = lazyPage(() => import("./pages/ResetPassword"));
const Privacy = lazyPage(() => import("./pages/Legal").then((m) => ({ default: m.Privacy })));
const Terms = lazyPage(() => import("./pages/Legal").then((m) => ({ default: m.Terms })));

function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" data-testid="offline-banner" className="sticky top-0 z-50 bg-[#1E293B] text-white text-center text-xs font-bold px-4 py-2">
      You're offline. We'll pick up again when your connection is back.
    </div>
  );
}

const standalone = (el) => <Suspense fallback={<PageLoading />}>{el}</Suspense>;

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
      <OfflineBanner />
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
                <Route path="/reset-password" element={standalone(<ResetPassword />)} />
                <Route path="/privacy" element={standalone(<Privacy />)} />
                <Route path="/terms" element={standalone(<Terms />)} />
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
