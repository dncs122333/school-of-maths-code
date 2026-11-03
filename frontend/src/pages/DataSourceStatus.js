import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock3, Database, ShieldCheck } from "lucide-react";
import { api, DATABASE_UNAVAILABLE_MESSAGE } from "../lib/api";
import { useDatabaseAvailability } from "../context/DatabaseAvailabilityContext";
import { DATA_SOURCE } from "../constants/testIds/dataSource";

function displayTime(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Not recorded" : date.toLocaleString();
}

export default function DataSourceStatus() {
  const { markDatabaseAvailable, markDatabaseUnavailable } = useDatabaseAvailability();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "data-source-status"],
    queryFn: async () => (await api.get("/admin/data-source-status")).data,
    retry: false,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!data) return;
    if (data.available) markDatabaseAvailable();
    else markDatabaseUnavailable();
  }, [data, markDatabaseAvailable, markDatabaseUnavailable]);

  const connected = data?.available === true;

  return (
    <div data-testid={DATA_SOURCE.page} className="space-y-6 pb-16">
      <header className="flex flex-col gap-4 rounded-3xl border-[2.5px] border-[#1E293B] bg-[#F5C842] p-6 shadow-[4px_4px_0_#1E293B] sm:flex-row sm:items-start sm:justify-between sm:p-8">
        <div className="space-y-2">
          <div data-testid="data-source-restricted-label" className="inline-flex items-center gap-2 rounded-full border-2 border-[#1E293B] bg-white px-3 py-1 text-xs font-900 uppercase tracking-widest text-[#1E293B] shadow-[2px_2px_0_#1E293B]">
            <ShieldCheck className="h-4 w-4 text-[#1E293B]" /> Restricted administrator view
          </div>
          <h1 data-testid={DATA_SOURCE.heading} className="font-head text-3xl sm:text-4xl font-900 tracking-tight text-[#1E293B]">DATA-SOURCE STATUS</h1>
          <p data-testid={DATA_SOURCE.description} className="max-w-2xl text-sm leading-6 font-medium text-[#1E293B]/80">
            Atlas is the only approved data source. This page checks the connection every 30 seconds.
          </p>
        </div>
        <div data-testid={DATA_SOURCE.source} className="inline-flex items-center gap-2 self-start rounded-full border-2 border-[#1E293B] bg-white px-4 py-2 text-xs font-800 text-[#1E293B] shadow-[2px_2px_0_#1E293B]">
          <Database className="h-4 w-4 text-[#1E293B]" /> MongoDB Atlas only
        </div>
      </header>

      {isLoading && <div data-testid={DATA_SOURCE.loading} className="rounded-2xl border-2 border-[#1E293B] bg-white p-6 text-sm font-bold text-[#1E293B] shadow-[3px_3px_0_#1E293B]">Checking Atlas connection…</div>}
      {isError && <div role="alert" data-testid={DATA_SOURCE.error} className="rounded-2xl border-2 border-[#1E293B] bg-[#FF6B5E]/20 p-6 text-sm font-bold text-[#1E293B] shadow-[3px_3px_0_#1E293B]">{DATABASE_UNAVAILABLE_MESSAGE}</div>}

      {data && (
        <>
          <section data-testid={DATA_SOURCE.connectionCard} className={`rounded-3xl border-[2.5px] border-[#1E293B] p-6 sm:p-7 shadow-[4px_4px_0_#1E293B] ${connected ? "bg-white" : "bg-[#FF6B5E]/20"}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] ${connected ? "bg-[#4CAF7D] text-white" : "bg-[#FF6B5E] text-white"}`}>
                  {connected ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
                </div>
                <div>
                  <p data-testid={DATA_SOURCE.connectionLabel} className="text-xs font-900 uppercase tracking-widest text-[#1E293B]/70">Connection state</p>
                  <h2 data-testid={DATA_SOURCE.connectionStatus} className="mt-1 font-head text-2xl font-900 text-[#1E293B]">{connected ? "Atlas connected" : "Database unavailable"}</h2>
                  <p data-testid={DATA_SOURCE.connectionMessage} className="mt-1 text-sm font-medium text-[#1E293B]/80">{data.message}</p>
                </div>
              </div>
              <div data-testid={DATA_SOURCE.checkedAt} className="flex items-center gap-2 text-xs font-bold text-[#1E293B]/70"><Clock3 className="h-4 w-4" /> Checked {displayTime(data.checked_at)}</div>
            </div>
          </section>

          {!connected && (
            <section role="alert" data-testid={DATA_SOURCE.incidentNotice} className="rounded-3xl border-[2.5px] border-[#1E293B] bg-[#FF6B5E]/20 p-6 sm:p-7 shadow-[4px_4px_0_#1E293B]">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-[#1E293B]" />
                <div>
                  <h2 data-testid={DATA_SOURCE.incidentHeading} className="font-head text-xl font-900 text-[#1E293B]">Administrator incident notice</h2>
                  <p data-testid={DATA_SOURCE.incidentMessage} className="mt-2 text-sm leading-6 font-bold text-[#1E293B]">{DATABASE_UNAVAILABLE_MESSAGE}</p>
                  <p data-testid={DATA_SOURCE.incidentExplanation} className="mt-2 text-sm leading-6 font-medium text-[#1E293B]/80">Database-backed content is intentionally blocked until Atlas is reachable again.</p>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}