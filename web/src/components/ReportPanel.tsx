"use client";

import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Download, AlertTriangle } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import { fetchStats, fetchConfig, fetchPipelineProgress } from "@/lib/api";

/**
 * Read-only pipeline report: what came in, what was filtered, and how.
 * Draws entirely from data already exposed by the API (stats funnel, config
 * filters, and the last run's transparency warnings) — no backend changes.
 */
export default function ReportPanel() {
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: fetchStats, staleTime: 30_000 });
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: fetchConfig, staleTime: 30_000 });
  const { data: progress } = useQuery({
    queryKey: ["pipeline-progress-report"],
    queryFn: fetchPipelineProgress,
    staleTime: 30_000,
  });

  const s: any = stats ?? {};
  const hasData = s && !s.error && s.search && Object.keys(s.search).length > 0;

  const search: Record<string, number> = s.search ?? {};
  const dedup: Record<string, number> = s.dedup ?? {};
  const screen: Record<string, number> = s.screen ?? {};
  const eligibility: Record<string, number> = s.eligibility ?? {};

  const perSource = Object.entries(search).filter(([k]) => k !== "total");
  const totalFound = search.total ?? perSource.reduce((acc, [, v]) => acc + (v || 0), 0);

  const dupRemoved = dedup.duplicates_removed ?? 0;
  const afterDedup = dedup.remaining ?? 0;

  const included = screen.included ?? 0;
  const maybe = screen.maybe ?? 0;
  const excluded = screen.excluded ?? 0;
  const excludedGate = screen.excluded_no_required_keyword ?? 0;
  const excludedByKeyword = Math.max(0, excluded - excludedGate);

  const filters = config?.search?.filters ?? {};
  const dateRange = config?.search?.date_range ?? {};
  const minHits = config?.screening?.rules?.min_include_hits ?? 2;
  const warnings: string[] = progress?.warnings ?? [];

  const fmt = (n: number) => (n ?? 0).toLocaleString();
  const valueOf = (v: any): string => {
    if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
    if (typeof v === "boolean") return v ? "on" : "off";
    return v ? String(v) : "—";
  };

  const filterRows: [string, string][] = [
    ["Date range", `${dateRange.start ?? "?"} → ${dateRange.end ?? "?"}`],
    ["Document types", valueOf(filters.document_types)],
    ["Require abstract", valueOf(filters.require_abstract)],
    ["Open access", valueOf(filters.open_access)],
    ["Venues / ISSN", valueOf(filters.venues)],
  ];

  const buildMarkdown = (): string => {
    const project = config?.project?.name ?? "PRISMA Review";
    const L: string[] = [];
    L.push(`# Search report — ${project}`, "");
    L.push("## Funnel", "", "| Stage | Count |", "| --- | ---: |");
    L.push(`| Records found (search) | ${fmt(totalFound)} |`);
    perSource.forEach(([src, n]) => L.push(`| · ${src} | ${fmt(n)} |`));
    L.push(`| After deduplication | ${fmt(afterDedup)} (− ${fmt(dupRemoved)} duplicates) |`);
    L.push(`| Screened → Included | ${fmt(included)} |`);
    L.push(`| Screened → Maybe | ${fmt(maybe)} |`);
    L.push(`| Screened → Excluded | ${fmt(excluded)} |`);
    if (eligibility && Object.keys(eligibility).length) {
      L.push(`| Eligibility → Included | ${fmt(eligibility.included ?? 0)} |`);
    }
    L.push("", "## Source filters", "", "| Filter | Value |", "| --- | --- |");
    filterRows.forEach(([k, v]) => L.push(`| ${k} | ${v} |`));
    L.push("", "## Screening breakdown", "", "| Outcome | Count |", "| --- | ---: |");
    L.push(`| Excluded by exclude keyword | ${fmt(excludedByKeyword)} |`);
    L.push(`| Excluded by required-keyword gate | ${fmt(excludedGate)} |`);
    L.push(`| Included (≥ ${minHits} keyword hits) | ${fmt(included)} |`);
    L.push(`| Maybe (< ${minHits} hits, needs review) | ${fmt(maybe)} |`);
    if (warnings.length) {
      L.push("", "## Transparency warnings (last run)", "");
      warnings.forEach((w) => L.push(`- ${w}`));
    }
    return L.join("\n");
  };

  const handleExport = () => {
    const md = buildMarkdown();
    const project = (config?.project?.name ?? "report").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `search-report-${project}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <GlassCard data-tutorial="report-panel" className="!p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardList size={18} className="text-primary" />
          <span className="text-sm font-semibold text-text-primary">Pipeline report</span>
        </div>
        <button
          onClick={handleExport}
          disabled={!hasData}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25 disabled:opacity-40 transition-colors cursor-pointer"
        >
          <Download size={14} />
          Export search report
        </button>
      </div>

      {!hasData ? (
        <p className="text-sm text-text-muted">
          No pipeline data yet. Run a search to populate the report.
        </p>
      ) : (
        <div className="space-y-6">
          {/* 1) Funnel */}
          <section>
            <h3 className="text-xs uppercase tracking-wide text-text-muted mb-2">
              Funnel — what came in, what survived each stage
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-muted">
                    <th className="font-medium py-1.5 px-2 border-b border-border-glass">Stage</th>
                    <th className="font-medium py-1.5 px-2 border-b border-border-glass text-right">Count</th>
                    <th className="font-medium py-1.5 px-2 border-b border-border-glass text-right">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  <Row label="Records found (search)" count={fmt(totalFound)} strong />
                  {perSource.map(([src, n]) => (
                    <Row key={src} label={`· ${src}`} count={fmt(n)} muted indent />
                  ))}
                  <Row label="After deduplication" count={fmt(afterDedup)} delta={`− ${fmt(dupRemoved)} dup`} />
                  <Row label="Screened → Included" count={fmt(included)} accent="green" />
                  <Row label="Screened → Maybe" count={fmt(maybe)} accent="amber" />
                  <Row label="Screened → Excluded" count={fmt(excluded)} accent="red" />
                  {eligibility && eligibility.included !== undefined && (
                    <Row label="Eligibility → Included" count={fmt(eligibility.included)} accent="green" />
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* 2) Source filters */}
          <section>
            <h3 className="text-xs uppercase tracking-wide text-text-muted mb-2">
              Source filters — how the request was narrowed
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-muted">
                    <th className="font-medium py-1.5 px-2 border-b border-border-glass">Filter</th>
                    <th className="font-medium py-1.5 px-2 border-b border-border-glass">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {filterRows.map(([k, v]) => (
                    <tr key={k}>
                      <td className="py-1.5 px-2 border-b border-border-glass/40 text-text-secondary">{k}</td>
                      <td className="py-1.5 px-2 border-b border-border-glass/40 text-text-primary font-mono text-xs">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-text-muted mt-2">
              See “Transparency warnings” below for where each filter is applied server-side vs locally.
            </p>
          </section>

          {/* 3) Screening breakdown */}
          <section>
            <h3 className="text-xs uppercase tracking-wide text-text-muted mb-2">
              Screening — how records were classified
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  <Row label="Excluded by exclude keyword" count={fmt(excludedByKeyword)} accent="red" />
                  <Row label="Excluded by required-keyword gate" count={fmt(excludedGate)} accent="red" />
                  <Row label={`Included (≥ ${minHits} keyword hits)`} count={fmt(included)} accent="green" />
                  <Row label={`Maybe (< ${minHits} hits, needs review)`} count={fmt(maybe)} accent="amber" />
                </tbody>
              </table>
            </div>
          </section>

          {/* 4) Transparency warnings */}
          {warnings.length > 0 && (
            <section>
              <h3 className="text-xs uppercase tracking-wide text-text-muted mb-2 flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-accent-amber" />
                Transparency warnings (last run)
              </h3>
              <ul className="space-y-1.5">
                {warnings.map((w, i) => (
                  <li key={i} className="text-xs text-text-secondary leading-relaxed pl-3 border-l-2 border-accent-amber/30">
                    {w}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </GlassCard>
  );
}

function Row({
  label,
  count,
  delta,
  strong,
  muted,
  indent,
  accent,
}: {
  label: string;
  count: string;
  delta?: string;
  strong?: boolean;
  muted?: boolean;
  indent?: boolean;
  accent?: "green" | "amber" | "red";
}) {
  const accentClass =
    accent === "green" ? "text-accent-green"
    : accent === "amber" ? "text-accent-amber"
    : accent === "red" ? "text-accent-red"
    : strong ? "text-text-primary font-semibold"
    : "text-text-primary";
  return (
    <tr>
      <td className={`py-1.5 px-2 border-b border-border-glass/40 ${muted ? "text-text-muted" : "text-text-secondary"} ${indent ? "pl-5" : ""}`}>
        {label}
      </td>
      <td className={`py-1.5 px-2 border-b border-border-glass/40 text-right tabular-nums ${accentClass}`}>
        {count}
      </td>
      {delta !== undefined ? (
        <td className="py-1.5 px-2 border-b border-border-glass/40 text-right text-xs text-text-muted">{delta}</td>
      ) : (
        <td className="py-1.5 px-2 border-b border-border-glass/40" />
      )}
    </tr>
  );
}
