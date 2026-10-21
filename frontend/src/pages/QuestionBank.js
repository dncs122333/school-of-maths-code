import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  BookOpen,
  Sparkles,
  UploadCloud,
  FileQuestion,
  CheckCircle2,
  Database,
  ArrowLeft,
} from "lucide-react";
import QuestionBankExplorer from "../components/dashboard/QuestionBankExplorer";
import ImportQuestionsModal from "../components/dashboard/ImportQuestionsModal";

export default function QuestionBank() {
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importInitialTab, setImportInitialTab] = useState("ai_vision");
  const [refreshKey, setRefreshKey] = useState(0);

  const openImportModal = (initialTab = "ai_vision") => {
    setImportInitialTab(initialTab);
    setImportModalOpen(true);
  };

  const handleQuestionsUpdated = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* 1. HERO BANNER */}
      <div className="rounded-3xl bg-[#F5C842] border-[3px] border-[#1E293B] shadow-[6px_6px_0_#1E293B] p-6 sm:p-8 lg:p-10 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-900 uppercase hover:bg-[#FFF9E8] transition-all"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
              </Link>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#5B9BD5] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-bold">
                <Database className="h-3.5 w-3.5" /> QUESTION VAULT
              </span>
              <Badge className="bg-[#4CAF7D] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs px-3 py-0.5 rounded-full">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> CBSE & NCERT Calibrated
              </Badge>
            </div>

            <h1 className="font-head text-3xl sm:text-4xl lg:text-5xl font-900 tracking-tight text-[#1E293B] uppercase">
              Curriculum Question Bank 📚
            </h1>

            <p className="text-[#1E293B] font-medium text-sm sm:text-base max-w-2xl leading-relaxed">
              Explore, filter, and inspect verified question items categorized by class, subject, chapter, and NCERT topic.
              Hand-pick questions to assemble timed tests, or scan papers using AI vision.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 bg-white p-3.5 rounded-3xl border-2 border-[#1E293B] shadow-[4px_4px_0_#1E293B]">
            <Button
              type="button"
              onClick={() => openImportModal("ai_vision")}
              className="rounded-full bg-[#8E44AD] hover:bg-[#7D3C98] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs h-10 px-4"
            >
              <Sparkles className="h-4 w-4 mr-1.5" /> Scan Paper (AI)
            </Button>
            <Button
              type="button"
              onClick={() => openImportModal("file")}
              className="rounded-full bg-[#4CAF7D] hover:bg-[#429E6F] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs h-10 px-4"
            >
              <UploadCloud className="h-4 w-4 mr-1.5" /> Import Questions
            </Button>
            <Button
              asChild
              className="rounded-full bg-[#FF6B5E] hover:bg-[#EE594B] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs h-10 px-4"
            >
              <Link to="/tests/new" className="flex items-center gap-1.5">
                <FileQuestion className="h-4 w-4" /> + Create Test
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* 2. MAIN CHAPTERWISE QUESTION EXPLORER */}
      <QuestionBankExplorer
        key={refreshKey}
        onQuestionsChange={handleQuestionsUpdated}
      />

      {/* 3. QUESTION IMPORT / SCAN MODAL */}
      <ImportQuestionsModal
        open={importModalOpen}
        initialTab={importInitialTab}
        onOpenChange={setImportModalOpen}
        onImportSuccess={handleQuestionsUpdated}
      />
    </div>
  );
}
