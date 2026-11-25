import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  ClipboardList,
  Download,
  FileCheck2,
  FolderSync,
} from 'lucide-react';
import type {
  ActivityLog,
  CycleType,
  InspectionReport,
  LibraryItem,
  ProjectTask,
  TaskBlocker,
  TourPageKey,
  User,
} from '../types.ts';
import {
  exportReportsToCsv,
  formatConditionLabel,
  formatCycleLabel,
  formatDateTime,
  formatReportStatusLabel,
  formatShortDate,
} from '../utils/export.ts';
import { isReportNeedingUserAction } from './InspectionWorkspace.tsx';
import { ResizableTh, useResizableColumns } from './ResizableTable.tsx';

interface AdminDashboardProps {
  libraryItems: LibraryItem[];
  reports: InspectionReport[];
  tasks: ProjectTask[];
  blockers: TaskBlocker[];
  activityLogs: ActivityLog[];
  currentUser: User;
  lastSyncAt: string;
  onOpenReport: (reportId: string) => void;
  onNavigateTab: (tab: TourPageKey) => void;
}

export function AdminDashboard({
  libraryItems,
  reports,
  tasks,
  blockers,
  activityLogs,
  currentUser,
  lastSyncAt,
  onOpenReport,
  onNavigateTab,
}: AdminDashboardProps) {
  const [cycleFilter, setCycleFilter] = useState<'all' | CycleType>('all');
  const { widths: reportCols, startResize: resizeReportCol } = useResizableColumns({
    reportNo: 120,
    titleArea: 260,
    cycle: 120,
    progress: 90,
    condition: 125,
    status: 145,
  });

  const needMyActionReports = useMemo(
    () => reports.filter((rep) => isReportNeedingUserAction(rep, currentUser)),
    [reports, currentUser]
  );

  const filteredReports = useMemo(
    () => (cycleFilter === 'all' ? reports : reports.filter((r) => r.cycleType === cycleFilter)),
    [reports, cycleFilter]
  );

  const filteredLibrary = useMemo(
    () => libraryItems.filter((item) => item.isActive),
    [libraryItems]
  );

  const stats = useMemo(() => {
    const allEntries = filteredReports.flatMap((r) => r.entries);
    const evaluatedEntries = allEntries.filter((e) => e.condition !== 'na');
    const passingEntries = evaluatedEntries.filter(
      (e) => e.condition === 'good' || e.condition === 'fair'
    );
    const complianceRate =
      evaluatedEntries.length > 0
        ? Math.round((passingEntries.length / evaluatedEntries.length) * 100)
        : 100;

    const attentionEntries = allEntries.filter(
      (e) => e.condition === 'needs_attention' || e.condition === 'critical'
    );
    const submittedCount = filteredReports.filter(
      (r) =>
        r.status === 'pending_approval' ||
        r.status === 'approved' ||
        r.status === 'submitted' ||
        r.status === 'reviewed'
    ).length;
    const draftCount = filteredReports.filter(
      (r) => r.status === 'draft' || r.status === 'sent_back'
    ).length;

    const activeBlockers = blockers.filter((b) => !b.isResolved);
    const blockedTaskIds = new Set(activeBlockers.map((b) => b.blockedTaskId));

    return {
      complianceRate,
      evaluatedCount: evaluatedEntries.length,
      totalEntryCount: allEntries.length,
      attentionCount: attentionEntries.length,
      criticalCount: allEntries.filter((e) => e.condition === 'critical').length,
      submittedCount,
      draftCount,
      blockedTaskCount: blockedTaskIds.size,
      activeBlockerLinks: activeBlockers.length,
    };
  }, [filteredReports, blockers]);

  const categoryProgress = useMemo(() => {
    const map = new Map<
      string,
      {
        category: string;
        libraryCount: number;
        evaluatedCount: number;
        totalSlots: number;
        flaggedCount: number;
      }
    >();

    for (const item of filteredLibrary) {
      const existing = map.get(item.category) ?? {
        category: item.category,
        libraryCount: 0,
        evaluatedCount: 0,
        totalSlots: 0,
        flaggedCount: 0,
      };
      existing.libraryCount += 1;
      map.set(item.category, existing);
    }

    for (const rep of filteredReports) {
      for (const ent of rep.entries) {
        const bucket = map.get(ent.category) ?? {
          category: ent.category,
          libraryCount: 0,
          evaluatedCount: 0,
          totalSlots: 0,
          flaggedCount: 0,
        };
        bucket.totalSlots += 1;
        if (ent.condition !== 'na') bucket.evaluatedCount += 1;
        if (ent.condition === 'needs_attention' || ent.condition === 'critical') {
          bucket.flaggedCount += 1;
        }
        map.set(ent.category, bucket);
      }
    }

    return Array.from(map.values());
  }, [filteredLibrary, filteredReports]);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const activeBlockerChains = useMemo(
    () =>
      blockers
        .filter((b) => !b.isResolved)
        .map((b) => ({
          blocker: b,
          upstream: taskById.get(b.blockerTaskId),
          downstream: taskById.get(b.blockedTaskId),
        }))
        .filter((item) => item.upstream && item.downstream),
    [blockers, taskById]
  );

  return (
    <div className="space-y-6">
      {/* Toolbar Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto min-w-0">
          <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] dark:bg-[#0F172A] rounded-md border border-[#E2E8F0] dark:border-[#1E293B] overflow-x-auto max-w-full">
            {(
              [
                { key: 'all', label: 'All Cycles' },
                { key: 'routine', label: 'Routine Inspection' },
                { key: 'yearly', label: 'Yearly Maintenance' },
                { key: 'eventual', label: 'Eventual Inspection' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setCycleFilter(opt.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  cycleFilter === opt.key
                    ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                    : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-[#64748B] dark:text-[#94A3B8]">
            <FolderSync className="w-3.5 h-3.5 text-[#16A34A] dark:text-[#4ADE80]" />
            <span>Asset library auto-synced</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{formatDateTime(lastSyncAt)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => exportReportsToCsv(filteredReports)}
          className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] bg-white dark:bg-[#111827] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-[#475569] dark:text-[#94A3B8]" />
          <span>Export Reports CSV</span>
        </button>
      </div>

      {/* Need My Action Queue Card */}
      <div
        className={`rounded-lg border p-4 sm:p-5 transition-colors ${
          needMyActionReports.length > 0
            ? 'bg-[#FFFBEB]/80 dark:bg-[#78350F]/20 border-[#FDE68A] dark:border-[#B45309]'
            : 'bg-white dark:bg-[#111827] border-[#E2E8F0] dark:border-[#1E293B]'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`inline-flex items-center justify-center w-6 h-6 rounded-md font-mono text-xs font-bold tabular-nums ${
                needMyActionReports.length > 0
                  ? 'bg-[#DC2626] text-white'
                  : 'bg-[#F1F5F9] dark:bg-[#1E293B] text-[#64748B] dark:text-[#94A3B8]'
              }`}
            >
              {needMyActionReports.length}
            </span>
            <div>
              <h2 className="font-display text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                Need My Action
              </h2>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                {needMyActionReports.length > 0
                  ? 'Pending sequential approval steps or sent-back inspection reports waiting on your response.'
                  : 'No inspection approvals or revisions currently waiting on your account.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('inspections')}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] dark:text-[#60A5FA] hover:underline whitespace-nowrap shrink-0"
          >
            <span>Open Inspections Queue</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {needMyActionReports.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {needMyActionReports.slice(0, 6).map((rep) => {
              const isSendBack = rep.status === 'sent_back';
              const activeStep = (rep.approvalSteps ?? []).find((s) => s.status === 'pending');
              return (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => onOpenReport(rep.id)}
                  className="text-left p-3.5 rounded-md border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#111827] hover:border-[#1D4ED8] dark:hover:border-[#60A5FA] transition-colors flex flex-col justify-between gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA]">
                      {rep.reportNumber}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${
                        isSendBack
                          ? 'bg-[#FEF2F2] dark:bg-[#7F1D1D]/40 text-[#B91C1C] dark:text-[#FCA5A5] border-[#FECACA] dark:border-[#B91C1C]'
                          : 'bg-[#FFFBEB] dark:bg-[#78350F]/40 text-[#B45309] dark:text-[#FBBF24] border-[#FDE68A] dark:border-[#D97706]'
                      }`}
                    >
                      {isSendBack
                        ? 'Revision Needed'
                        : `Approve Step #${activeStep?.stepOrder ?? ''}`}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                    {rep.title}
                  </div>
                  <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                    {rep.facilityArea} · {rep.inspectorName} · {formatShortDate(rep.updatedAt)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 4-Column KPI Strip (2-col compact on mobile) */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-3.5 sm:p-5">
          <div className="flex items-center justify-between text-[11px] sm:text-xs font-medium text-[#64748B] dark:text-[#94A3B8] gap-1">
            <span className="truncate">Inspection Compliance</span>
            <CheckCircle2 className="w-4 h-4 text-[#16A34A] dark:text-[#4ADE80] shrink-0" />
          </div>
          <div className="mt-1.5 sm:mt-2 font-mono text-2xl sm:text-3xl font-semibold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
            {stats.complianceRate}%
          </div>
          <div className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-[#64748B] dark:text-[#94A3B8]">
            <span className="font-mono tabular-nums">{stats.evaluatedCount}</span> of{' '}
            <span className="font-mono tabular-nums">{stats.totalEntryCount}</span> evaluated
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-3.5 sm:p-5">
          <div className="flex items-center justify-between text-[11px] sm:text-xs font-medium text-[#64748B] dark:text-[#94A3B8] gap-1">
            <span className="truncate">Inspection Reports</span>
            <FileCheck2 className="w-4 h-4 text-[#1D4ED8] dark:text-[#60A5FA] shrink-0" />
          </div>
          <div className="mt-1.5 sm:mt-2 font-mono text-2xl sm:text-3xl font-semibold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
            {filteredReports.length}
          </div>
          <div className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-[#64748B] dark:text-[#94A3B8]">
            <span className="font-mono tabular-nums">{stats.submittedCount}</span> routed
            <span aria-hidden="true"> · </span>
            <span className="font-mono tabular-nums">{stats.draftCount}</span> open
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-3.5 sm:p-5">
          <div className="flex items-center justify-between text-[11px] sm:text-xs font-medium text-[#64748B] dark:text-[#94A3B8] gap-1">
            <span className="truncate">Flagged Conditions</span>
            <AlertTriangle className="w-4 h-4 text-[#D97706] dark:text-[#FBBF24] shrink-0" />
          </div>
          <div className="mt-1.5 sm:mt-2 font-mono text-2xl sm:text-3xl font-semibold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
            {stats.attentionCount}
          </div>
          <div className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-[#64748B] dark:text-[#94A3B8]">
            <span className="text-[#DC2626] dark:text-[#F87171] font-medium font-mono tabular-nums">
              {stats.criticalCount} critical
            </span>
            <span aria-hidden="true"> · </span>
            <span className="hidden sm:inline">Requires corrective follow-up</span>
            <span className="sm:hidden">follow-up</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-3.5 sm:p-5">
          <div className="flex items-center justify-between text-[11px] sm:text-xs font-medium text-[#64748B] dark:text-[#94A3B8] gap-1">
            <span className="truncate">Blocked Activities</span>
            <Ban className="w-4 h-4 text-[#DC2626] dark:text-[#F87171] shrink-0" />
          </div>
          <div className="mt-1.5 sm:mt-2 font-mono text-2xl sm:text-3xl font-semibold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
            {stats.blockedTaskCount}
          </div>
          <div className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-[#64748B] dark:text-[#94A3B8]">
            <span className="font-mono tabular-nums">{stats.activeBlockerLinks}</span> active blockers
          </div>
        </div>
      </div>

      {/* Main Content Grid: Asset Sync Progress + Blocker Alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Asset Library Real-Time Sync Progress
              </h2>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                Live coverage across {filteredLibrary.length} active assets
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('library')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] dark:text-[#60A5FA] hover:text-[#1E40AF] whitespace-nowrap shrink-0"
            >
              <span>Manage Assets</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B]">
            {categoryProgress.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-[#64748B] dark:text-[#94A3B8]">
                No assets match the current cycle filter.
              </div>
            ) : (
              categoryProgress.map((cat) => {
                const pct =
                  cat.totalSlots > 0 ? Math.round((cat.evaluatedCount / cat.totalSlots) * 100) : 0;
                return (
                  <div key={cat.category} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                          {cat.category}
                        </div>
                        <div className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                          <span className="font-mono tabular-nums">{cat.libraryCount}</span> active
                          assets
                          <span aria-hidden="true"> · </span>
                          <span className="font-mono tabular-nums">
                            {cat.evaluatedCount}/{cat.totalSlots}
                          </span>{' '}
                          field entries evaluated
                          {cat.flaggedCount > 0 && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="text-[#D97706] dark:text-[#FBBF24] font-medium font-mono tabular-nums">
                                {cat.flaggedCount} flagged
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="font-mono text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums shrink-0">
                        {pct}%
                      </div>
                    </div>
                    <div className="w-full h-2 bg-[#F1F5F9] dark:bg-[#1E293B] rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-[#1D4ED8] dark:bg-[#3B82F6] transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Active Project Blocker Alerts */}
        <div className="xl:col-span-5 bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Active Project Blockers
              </h2>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                Activities waiting on unfinished predecessor work
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('gantt')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] dark:text-[#60A5FA] hover:text-[#1E40AF] whitespace-nowrap shrink-0"
            >
              <span>Open Projects</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B] flex-1">
            {activeBlockerChains.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-[#64748B] dark:text-[#94A3B8]">
                All scheduled project dependencies are currently clear.
              </div>
            ) : (
              activeBlockerChains.slice(0, 5).map(({ blocker, upstream, downstream }) => (
                <div key={blocker.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#DC2626] dark:text-[#F87171] flex items-center gap-1.5">
                      <Ban className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {downstream!.wbsCode} {downstream!.title}
                      </span>
                    </span>
                    <span className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8] shrink-0">
                      {blocker.dependencyType}
                    </span>
                  </div>
                  <div className="text-xs text-[#334155] dark:text-[#CBD5E1] mt-1">
                    Blocked by:{' '}
                    <span className="font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                      {upstream!.wbsCode} {upstream!.title}
                    </span>{' '}
                    <span className="font-mono text-[#64748B] dark:text-[#94A3B8]">
                      ({upstream!.progress}%)
                    </span>
                  </div>
                  <div className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1 line-clamp-2">
                    {blocker.blockerReason}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Recent Reports Table + Real-Time Activity Stream */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Inspection &amp; Maintenance Reports
              </h2>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                Click any report to inspect photo evidence, visual pins, or print audit PDF
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('inspections')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] dark:text-[#60A5FA] hover:text-[#1E40AF] whitespace-nowrap shrink-0"
            >
              <span>All Reports</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile Compact Report Cards */}
          <div className="md:hidden divide-y divide-[#E2E8F0] dark:divide-[#1E293B]">
            {filteredReports.length === 0 ? (
              <div className="py-8 px-4 text-center text-sm text-[#64748B] dark:text-[#94A3B8]">
                No inspection reports found for this filter.
              </div>
            ) : (
              filteredReports.slice(0, 6).map((rep) => {
                const done = rep.entries.filter((e) => e.condition !== 'na').length;
                const total = rep.entries.length;
                const photosCount = rep.entries.reduce((acc, e) => acc + e.photos.length, 0);

                return (
                  <button
                    key={rep.id}
                    type="button"
                    onClick={() => onOpenReport(rep.id)}
                    className="w-full text-left p-3.5 hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/60 transition-colors space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-semibold text-[#1D4ED8] dark:text-[#60A5FA] truncate">
                        {rep.reportNumber}
                      </span>
                      <span
                        className={`font-semibold shrink-0 ${
                          rep.overallCondition === 'critical'
                            ? 'text-[#DC2626] dark:text-[#F87171]'
                            : rep.overallCondition === 'needs_attention'
                            ? 'text-[#D97706] dark:text-[#FBBF24]'
                            : 'text-[#16A34A] dark:text-[#4ADE80]'
                        }`}
                      >
                        {formatConditionLabel(rep.overallCondition)}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                      {rep.title}
                    </div>
                    <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                      {rep.facilityArea} · {formatCycleLabel(rep.cycleType, true)} · {rep.inspectorName}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-[#475569] dark:text-[#94A3B8]">
                      <span className="font-mono tabular-nums">
                        {done}/{total} assets · {photosCount} photos
                      </span>
                      <span className="font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                        {formatReportStatusLabel(rep.status)} ·{' '}
                        {formatShortDate(rep.submittedAt ?? rep.updatedAt)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full table-fixed text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0F172A] text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                  <ResizableTh
                    width={reportCols.reportNo}
                    onStartResize={(e) => resizeReportCol('reportNo', e)}
                    className="py-2.5 px-4"
                  >
                    Report ID
                  </ResizableTh>
                  <ResizableTh
                    width={reportCols.titleArea}
                    onStartResize={(e) => resizeReportCol('titleArea', e)}
                    className="py-2.5 px-4"
                  >
                    Title &amp; Area
                  </ResizableTh>
                  <ResizableTh
                    width={reportCols.cycle}
                    onStartResize={(e) => resizeReportCol('cycle', e)}
                    className="py-2.5 px-4"
                  >
                    Cycle
                  </ResizableTh>
                  <ResizableTh
                    width={reportCols.progress}
                    onStartResize={(e) => resizeReportCol('progress', e)}
                    className="py-2.5 px-4"
                  >
                    Progress
                  </ResizableTh>
                  <ResizableTh
                    width={reportCols.condition}
                    onStartResize={(e) => resizeReportCol('condition', e)}
                    className="py-2.5 px-4"
                  >
                    Condition
                  </ResizableTh>
                  <ResizableTh
                    width={reportCols.status}
                    onStartResize={(e) => resizeReportCol('status', e)}
                    className="py-2.5 px-4"
                  >
                    Status
                  </ResizableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B] text-sm">
                {filteredReports.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 px-4 text-center text-sm text-[#64748B] dark:text-[#94A3B8]"
                    >
                      No inspection reports found for this filter.
                    </td>
                  </tr>
                ) : (
                  filteredReports.slice(0, 6).map((rep) => {
                    const done = rep.entries.filter((e) => e.condition !== 'na').length;
                    const total = rep.entries.length;
                    const photosCount = rep.entries.reduce((acc, e) => acc + e.photos.length, 0);

                    return (
                      <tr
                        key={rep.id}
                        onClick={() => onOpenReport(rep.id)}
                        className="hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/60 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 font-mono text-xs font-medium text-[#1D4ED8] dark:text-[#60A5FA] truncate">
                          {rep.reportNumber}
                        </td>
                        <td className="py-3 px-4 min-w-0">
                          <div className="font-medium text-[#0F172A] dark:text-[#F8FAFC] text-xs sm:text-sm truncate">
                            {rep.title}
                          </div>
                          <div className="text-xs text-[#64748B] dark:text-[#94A3B8] truncate">
                            {rep.facilityArea}
                            <span aria-hidden="true"> · </span>
                            {rep.inspectorName}
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono tabular-nums">{photosCount} photos</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-[#334155] dark:text-[#CBD5E1] truncate">
                          {formatCycleLabel(rep.cycleType, true)}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-[#0F172A] dark:text-[#F8FAFC] tabular-nums whitespace-nowrap">
                          {done}/{total}
                        </td>
                        <td className="py-3 px-4 text-xs whitespace-nowrap">
                          <span
                            className={`font-medium ${
                              rep.overallCondition === 'critical'
                                ? 'text-[#DC2626] dark:text-[#F87171]'
                                : rep.overallCondition === 'needs_attention'
                                ? 'text-[#D97706] dark:text-[#FBBF24]'
                                : 'text-[#16A34A] dark:text-[#4ADE80]'
                            }`}
                          >
                            {formatConditionLabel(rep.overallCondition)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs whitespace-nowrap">
                          <span className="text-[#334155] dark:text-[#CBD5E1] font-medium">
                            {formatReportStatusLabel(rep.status)}
                          </span>
                          <span aria-hidden="true" className="text-[#CBD5E1] dark:text-[#475569]"> · </span>
                          <span className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                            {formatShortDate(rep.submittedAt ?? rep.updatedAt)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Real-Time Activity Stream */}
        <div className="xl:col-span-4 bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-[#1D4ED8] dark:text-[#60A5FA]" />
              <h2 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Real-Time Sync Feed
              </h2>
            </div>
            <span className="font-mono text-[11px] text-[#16A34A] dark:text-[#4ADE80]">Live</span>
          </div>

          <div className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B] max-h-80 overflow-y-auto">
            {activityLogs.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-[#64748B] dark:text-[#94A3B8]">
                Live updates from field inspectors and schedulers appear here.
              </div>
            ) : (
              activityLogs.slice(0, 10).map((log) => (
                <div key={log.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                      {log.actorName}
                    </span>
                    <span className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8] shrink-0">
                      {formatDateTime(log.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-1 leading-relaxed">
                    {log.summary}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
