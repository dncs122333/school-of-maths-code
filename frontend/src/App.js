import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";

import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import NotesLibrary from "./pages/NotesLibrary";
import NoteReader from "./pages/NoteReader";
import QuizList from "./pages/QuizList";
import QuizRunner from "./pages/QuizRunner";
import CreateNote from "./pages/CreateNote";
import CreateQuiz from "./pages/CreateQuiz";
import Batches from "./pages/Batches";

function Shell({ children }) {
  return (
    <div className="min-h-screen grain-bg">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<ProtectedRoute><Shell><Dashboard /></Shell></ProtectedRoute>} />
            <Route path="/notes" element={<ProtectedRoute><Shell><NotesLibrary /></Shell></ProtectedRoute>} />
            <Route path="/notes/new" element={<ProtectedRoute roles={["teacher","admin"]}><Shell><CreateNote /></Shell></ProtectedRoute>} />
            <Route path="/notes/:id" element={<ProtectedRoute><Shell><NoteReader /></Shell></ProtectedRoute>} />
            <Route path="/tests" element={<ProtectedRoute><Shell><QuizList kind="test" /></Shell></ProtectedRoute>} />
            <Route path="/dpp" element={<ProtectedRoute><Shell><QuizList kind="dpp" /></Shell></ProtectedRoute>} />
            <Route path="/tests/new" element={<ProtectedRoute roles={["teacher","admin"]}><Shell><CreateQuiz kind="test" /></Shell></ProtectedRoute>} />
            <Route path="/dpp/new" element={<ProtectedRoute roles={["teacher","admin"]}><Shell><CreateQuiz kind="dpp" /></Shell></ProtectedRoute>} />
            <Route path="/quiz/:id" element={<ProtectedRoute><Shell><QuizRunner /></Shell></ProtectedRoute>} />
            <Route path="/batches" element={<ProtectedRoute roles={["teacher","admin"]}><Shell><Batches /></Shell></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
        <Toaster position="bottom-right" richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
