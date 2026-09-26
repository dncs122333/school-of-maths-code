import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock3, Database, FileSearch, ShieldCheck, UserRound } from "lucide-react";
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
  const queue = data?.learning_queue || [];

  return (
    <div data-testid={DATA_SOURCE.page} className="space-y-6 pb-16">
      <header className="flex flex-col gap-4 rounded-3xl border border-[#1E293B] bg-[#111827]/90 p-6 shadow-xl sm:flex-row sm:items-start sm:justify-between sm:p-8">
        <div className="space-y-2">
          <div data-testid="data-source-restricted-label" className="flex items-center gap-2 text-xs font-700 uppercase tracking-[0.18em] text-[#06B6D4]">
            <ShieldCheck className="h-4 w-4" /> Restricted administrator view
          </div>
          <h1 data-testid={DATA_SOURCE.heading} className="font-head text-3xl font-800 tracking-tight text-white">Data-source status</h1>
          <p data-testid={DATA_SOURCE.description} className="max-w-2xl text-sm leading-6 text-[#94A3B8]">
            Atlas is the only approved data source. Learning Queue records are shown for investigation only and cannot be changed here.
          </p>
        </div>
        <div data-testid={DATA_SOURCE.source} className="inline-flex items-center gap-2 self-start rounded-full border border-[#1E293B] bg-[#0B0F19] px-3 py-2 text-xs font-700 text-[#CBD5E1]">
          <Database className="h-4 w-4 text-[#06B6D4]" /> MongoDB Atlas only
        </div>
      </header>

      {isLoading && <div data-testid={DATA_SOURCE.loading} className="rounded-2xl border border-[#1E293B] bg-[#111827] p-6 text-sm text-[#94A3B8]">Checking Atlas connection…</div>}
      {isError && <div role="alert" data-testid={DATA_SOURCE.error} className="rounded-2xl border border-[#F87171]/40 bg-[#F87171]/10 p-6 text-sm text-[#FECACA]">{DATABASE_UNAVAILABLE_MESSAGE}</div>}

      {data && (
        <>
          <section data-testid={DATA_SOURCE.connectionCard} className={`rounded-3xl border p-6 sm:p-7 ${connected ? "border-[#34D399]/35 bg-[#34D399]/[0.06]" : "border-[#F87171]/45 bg-[#F87171]/10"}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${connected ? "bg-[#34D399]/15 text-[#34D399]" : "bg-[#F87171]/15 text-[#F87171]"}`}>
                  {connected ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
                </div>
                <div>
                  <p data-testid={DATA_SOURCE.connectionLabel} className="text-xs font-700 uppercase tracking-[0.16em] text-[#94A3B8]">Connection state</p>
                  <h2 data-testid={DATA_SOURCE.connectionStatus} className={`mt-1 font-head text-xl font-800 ${connected ? "text-[#6EE7B7]" : "text-[#FCA5A5]"}`}>{connected ? "Atlas connected" : "Database unavailable"}</h2>
                  <p data-testid={DATA_SOURCE.connectionMessage} className="mt-2 text-sm text-[#CBD5E1]">{data.message}</p>
                </div>
              </div>
              <div data-testid={DATA_SOURCE.checkedAt} className="flex items-center gap-2 text-xs text-[#94A3B8]"><Clock3 className="h-4 w-4" /> Checked {displayTime(data.checked_at)}</div>
            </div>
          </section>

          {!connected ? (
            <section role="alert" data-testid={DATA_SOURCE.incidentNotice} className="rounded-3xl border border-[#F87171]/50 bg-[#111827] p-6 sm:p-7">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#F87171]" />
                <div>
                  <h2 data-testid={DATA_SOURCE.incidentHeading} className="font-head text-lg font-800 text-white">Administrator incident notice</h2>
                  <p data-testid={DATA_SOURCE.incidentMessage} className="mt-2 text-sm leading-6 text-[#FECACA]">{DATABASE_UNAVAILABLE_MESSAGE}</p>
                  <p data-testid={DATA_SOURCE.incidentExplanation} className="mt-2 text-sm leading-6 text-[#94A3B8]">Database-backed content is intentionally blocked until Atlas is reachable again. No Learning Queue records have been changed.</p>
                </div>
              </div>
            </section>
          ) : (
            <section data-testid={DATA_SOURCE.queueSection} className="overflow-hidden rounded-3xl border border-[#1E293B] bg-[#111827]">
              <div className="flex flex-col gap-2 border-b border-[#1E293B] p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#3B82F6]/15 text-[#60A5FA]"><FileSearch className="h-5 w-5" /></div>
                  <div>
                    <h2 data-testid={DATA_SOURCE.queueHeading} className="font-head text-xl font-800 text-white">Learning Queue inspection</h2>
                    <p data-testid={DATA_SOURCE.queueDescription} className="text-sm text-[#94A3B8]">Current note records served by Atlas. Read-only evidence for investigation.</p>
                  </div>
                </div>
                <span data-testid={DATA_SOURCE.queueCount} className="self-start rounded-full border border-[#1E293B] bg-[#0B0F19] px-3 py-1.5 text-xs font-700 text-[#CBD5E1]">{queue.length} record{queue.length === 1 ? "" : "s"}</span>
              </div>
              {queue.length === 0 ? <p data-testid={DATA_SOURCE.queueEmpty} className="p-6 text-sm text-[#94A3B8]">No Learning Queue records are currently stored in Atlas.</p> : (
                <div className="overflow-x-auto">
                  <table data-testid={DATA_SOURCE.queueTable} className="w-full min-w-[860px] text-left text-sm">
                    <thead className="bg-[#0B0F19] text-xs uppercase tracking-wider text-[#94A3B8]"><tr><th data-testid="data-source-queue-note-header" className="px-6 py-4">Note</th><th data-testid="data-source-queue-owner-header" className="px-6 py-4">Owner</th><th data-testid="data-source-queue-scope-header" className="px-6 py-4">Scope</th><th data-testid="data-source-queue-created-header" className="px-6 py-4">Created</th><th data-testid="data-source-queue-updated-header" className="px-6 py-4">Updated</th></tr></thead>
                    <tbody className="divide-y divide-[#1E293B]">
                      {queue.map((note) => <tr key={note.id} data-testid={`${DATA_SOURCE.queueRecord}-${note.id}`} className="align-top text-[#CBD5E1]">
                        <td className="px-6 py-4"><p data-testid={`${DATA_SOURCE.queueTitle}-${note.id}`} className="font-700 text-white">{note.title}</p><p data-testid={`${DATA_SOURCE.queueStatus}-${note.id}`} className="mt-1 text-xs text-[#94A3B8]">Status: {note.status}</p></td>
                        <td className="px-6 py-4"><div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-[#60A5FA]" /><span data-testid={`${DATA_SOURCE.queueOwner}-${note.id}`}>{note.owner_name}</span></div><p data-testid={`${DATA_SOURCE.queueOwnerId}-${note.id}`} className="mt-1 max-w-[180px] truncate font-mono text-[11px] text-[#64748B]">{note.owner_id || "No owner ID"}</p></td>
                        <td className="px-6 py-4"><p data-testid={`${DATA_SOURCE.queueScope}-${note.id}`}>{note.batch_name || "General"}</p><p data-testid={`${DATA_SOURCE.queueSubject}-${note.id}`} className="mt-1 text-xs text-[#94A3B8]">{[note.class_level && `Class ${note.class_level}`, note.subject, note.chapter].filter(Boolean).join(" · ") || "No subject metadata"}</p></td>
                        <td data-testid={`${DATA_SOURCE.queueCreated}-${note.id}`} className="px-6 py-4 text-[#94A3B8]">{displayTime(note.created_at)}</td>
                        <td data-testid={`${DATA_SOURCE.queueUpdated}-${note.id}`} className="px-6 py-4 text-[#94A3B8]">{displayTime(note.updated_at)}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}