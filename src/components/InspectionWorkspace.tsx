import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FilePlus2,
  Fingerprint,
  FolderSync,
  History,
  Image as ImageIcon,
  MapPin,
  MessageSquare,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  ConditionStatus,
  CycleType,
  FacilityArea,
  InspectionEntry,
  InspectionParameterValue,
  InspectionPhoto,
  InspectionReport,
  LibraryItem,
  ReportApprovalStep,
  ReportStatus,
  User,
  WorkspaceDefaults,
} from '../types.ts';
import { formatRoleLabel, hasAnyRole } from '../types.ts';
import {
  ACCEPTED_IMAGE_ACCEPT,
  parseApiResponse,
  prepareImageForUpload,
} from '../utils/imageUpload.ts';
import {
  exportReportsToCsv,
  formatAuditTimestamp,
  formatConditionLabel,
  formatCycleLabel,
  formatDateTime,
  formatReportStatusLabel,
  formatShortDate,
} from '../utils/export.ts';
import { AssetVisualModal } from './AssetVisualModal.tsx';
import { ResizableTh, useResizableColumns } from './ResizableTable.tsx';

interface InspectionWorkspaceProps {
  reports: InspectionReport[];
  libraryItems: LibraryItem[];
  facilityAreas: FacilityArea[];
  users: User[];
  selectedReportId: string | null;
  onSelectReport: (reportId: string | null) => void;
  currentUser: User;
  token: string;
  onSyncComplete: () => Promise<void>;
  onNotify: (message: string, kind?: 'info' | 'error') => void;
  onNavigateToTask?: (projectId: string, taskId: string) => void;
  workspaceDefaults?: WorkspaceDefaults;
}

type StatusFilterKey = 'all' | 'need_my_action' | ReportStatus;

const CONDITION_OPTIONS: { value: ConditionStatus; label: string; tone: string }[] = [
  {
    value: 'good',
    label: 'Good',
    tone: 'text-[#16A34A] dark:text-[#4ADE80] border-[#16A34A] bg-[#F0FDF4] dark:bg-[#14532D]/40',
  },
  {
    value: 'fair',
    label: 'Fair',
    tone: 'text-[#0369A1] dark:text-[#38BDF8] border-[#0284C7] bg-[#F0F9FF] dark:bg-[#0C4A6E]/40',
  },
  {
    value: 'needs_attention',
    label: 'Needs Attention',
    tone: 'text-[#B45309] dark:text-[#FBBF24] border-[#D97706] bg-[#FFFBEB] dark:bg-[#78350F]/40',
  },
  {
    value: 'critical',
    label: 'Critical',
    tone: 'text-[#B91C1C] dark:text-[#F87171] border-[#DC2626] bg-[#FEF2F2] dark:bg-[#7F1D1D]/40',
  },
  {
    value: 'na',
    label: 'N/A',
    tone: 'text-[#475569] dark:text-[#CBD5E1] border-[#94A3B8] dark:border-[#475569] bg-[#F8FAFC] dark:bg-[#1E293B]',
  },
];

export function isReportNeedingUserAction(report: InspectionReport, user: User): boolean {
  if (report.status === 'pending_approval') {
    const activeStep = (report.approvalSteps ?? []).find((s) => s.status === 'pending');
    return Boolean(activeStep && activeStep.approverId === user.id && hasAnyRole(user, 'approver'));
  }
  if (report.status === 'sent_back') {
    return report.inspectorId === user.id;
  }
  return false;
}

function getApprovalProgressSummary(report: InspectionReport): {
  label: string;
  tone: string;
} {
  const steps = report.approvalSteps ?? [];
  if (report.status === 'draft') {
    return {
      label: 'Draft — Not Routed',
      tone: 'text-[#64748B] dark:text-[#94A3B8]',
    };
  }
  if (report.status === 'sent_back') {
    const sentStep = steps.find((s) => s.status === 'sent_back');
    return {
      label: sentStep ? `Sent Back · Step ${sentStep.stepOrder}` : 'Sent Back',
      tone: 'text-[#DC2626] dark:text-[#F87171] font-medium',
    };
  }
  if (report.status === 'approved' || report.status === 'reviewed') {
    return {
      label: steps.length > 0 ? `${steps.length}/${steps.length} Approved` : 'Approved',
      tone: 'text-[#16A34A] dark:text-[#4ADE80] font-medium',
    };
  }
  const activeStep = steps.find((s) => s.status === 'pending');
  if (activeStep) {
    return {
      label: `Step ${activeStep.stepOrder}/${steps.length} · ${activeStep.approverName}`,
      tone: 'text-[#1D4ED8] dark:text-[#60A5FA] font-medium',
    };
  }
  return {
    label: formatReportStatusLabel(report.status),
    tone: 'text-[#475569] dark:text-[#94A3B8]',
  };
}

export function InspectionWorkspace({
  reports,
  libraryItems,
  facilityAreas,
  users,
  selectedReportId,
  onSelectReport,
  currentUser,
  token,
  onSyncComplete,
  onNotify,
  onNavigateToTask,
  workspaceDefaults,
}: InspectionWorkspaceProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all');
  const [cycleFilter, setCycleFilter] = useState<'all' | CycleType>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCycle, setNewCycle] = useState<CycleType>(
    workspaceDefaults?.defaultCycleType ?? 'routine'
  );
  const [newArea, setNewArea] = useState('');
  const [facilityDropdownOpen, setFacilityDropdownOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [itemFacilityFilter, setItemFacilityFilter] = useState<string>('all');
  const [selectedLibIds, setSelectedLibIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<InspectionPhoto | null>(null);
  const facilityBoxRef = useRef<HTMLDivElement | null>(null);

  const { widths: reportCols, startResize: resizeReportCol } = useResizableColumns({
    reportNo: 120,
    titleArea: 255,
    cycle: 135,
    inspector: 125,
    checklist: 85,
    photos: 70,
    approval: 175,
    status: 145,
    actions: 125,
  });

  const selectedReport = useMemo(
    () => reports.find((r) => r.id === selectedReportId) ?? null,
    [reports, selectedReportId]
  );

  // Sync default asset selection when opening modal or changing facility filter
  useEffect(() => {
    if (!showCreateModal) return;
    const matching = libraryItems
      .filter((item) => {
        if (!item.isActive) return false;
        if (itemFacilityFilter !== 'all') {
          if (itemFacilityFilter === 'unassigned') return !item.facilityAreaId;
          return item.facilityAreaId === itemFacilityFilter;
        }
        return true;
      })
      .map((item) => item.id);
    setSelectedLibIds(matching);
  }, [itemFacilityFilter, libraryItems, showCreateModal]);

  useEffect(() => {
    if (!showCreateModal) {
      setItemSearch('');
      setItemFacilityFilter('all');
      setFacilityDropdownOpen(false);
    }
  }, [showCreateModal]);

  useEffect(() => {
    function handleOutsideClick(ev: MouseEvent) {
      if (facilityBoxRef.current && !facilityBoxRef.current.contains(ev.target as Node)) {
        setFacilityDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const activeFacilities = useMemo(
    () => facilityAreas.filter((f) => f.isActive),
    [facilityAreas]
  );

  const filteredFacilities = useMemo(() => {
    const q = newArea.trim().toLowerCase();
    if (!q) return activeFacilities;
    return activeFacilities.filter(
      (f) =>
        f.code.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        f.building.toLowerCase().includes(q)
    );
  }, [activeFacilities, newArea]);

  const activeLibraryItems = useMemo(
    () => libraryItems.filter((i) => i.isActive),
    [libraryItems]
  );

  const filteredModalLibraryItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    return activeLibraryItems.filter((item) => {
      if (itemFacilityFilter !== 'all') {
        if (itemFacilityFilter === 'unassigned') {
          if (item.facilityAreaId) return false;
        } else if (item.facilityAreaId !== itemFacilityFilter) {
          return false;
        }
      }
      if (!q) return true;
      return (
        item.code.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.facilityAreaName || '').toLowerCase().includes(q) ||
        item.criteria.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });
  }, [activeLibraryItems, itemSearch, itemFacilityFilter]);

  const allVisibleSelected =
    filteredModalLibraryItems.length > 0 &&
    filteredModalLibraryItems.every((item) => selectedLibIds.includes(item.id));

  const needMyActionCount = useMemo(
    () => reports.filter((r) => isReportNeedingUserAction(r, currentUser)).length,
    [reports, currentUser]
  );

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (statusFilter === 'need_my_action') {
        if (!isReportNeedingUserAction(r, currentUser)) return false;
      } else if (statusFilter !== 'all' && r.status !== statusFilter) {
        return false;
      }
      if (cycleFilter !== 'all' && r.cycleType !== cycleFilter) return false;
      return true;
    });
  }, [reports, statusFilter, cycleFilter, currentUser]);

  async function handleCreateReport(e: React.FormEvent) {
    e.preventDefault();
    if (selectedLibIds.length === 0) {
      onNotify('Select at least one asset from Asset Library.', 'error');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newTitle,
          cycleType: newCycle,
          facilityArea: newArea,
          libraryItemIds: selectedLibIds,
        }),
      });
      const data = (await res.json()) as { report?: InspectionReport; error?: string };
      if (!res.ok || !data.report) {
        onNotify(data.error ?? 'Unable to create report.', 'error');
        return;
      }
      setShowCreateModal(false);
      setNewTitle('');
      setNewArea('');
      await onSyncComplete();
      onSelectReport(data.report.id);
      onNotify(`Created ${data.report.reportNumber} synced from Asset Library.`);
    } catch {
      onNotify('Network error creating inspection report.', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteReport(rep: InspectionReport) {
    try {
      const res = await fetch(`/api/reports/${rep.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify(data.error ?? 'Could not delete report.', 'error');
        return;
      }
      if (selectedReportId === rep.id) onSelectReport(null);
      await onSyncComplete();
      onNotify(`Deleted report ${rep.reportNumber}.`);
    } catch {
      onNotify('Network error deleting report.', 'error');
    }
  }

  if (selectedReport) {
    return (
      <>
        <ReportDetailEditor
          report={selectedReport}
          users={users}
          libraryItems={libraryItems}
          currentUser={currentUser}
          token={token}
          onBack={() => onSelectReport(null)}
          onSyncComplete={onSyncComplete}
          onNotify={onNotify}
          onOpenLightbox={setLightboxPhoto}
          onNavigateToTask={onNavigateToTask}
        />
        {lightboxPhoto && (
          <PhotoLightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
        )}
      </>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-3.5 sm:p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] dark:bg-[#0F172A] rounded-md border border-[#E2E8F0] dark:border-[#1E293B] overflow-x-auto max-w-full">
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'need_my_action', label: 'Need My Action', count: needMyActionCount },
                { key: 'draft', label: 'Draft' },
                { key: 'pending_approval', label: 'Pending Approval' },
                { key: 'sent_back', label: 'Sent Back' },
                { key: 'approved', label: 'Approved' },
              ] as { key: StatusFilterKey; label: string; count?: number }[]
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setStatusFilter(opt.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 sm:py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === opt.key
                    ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                    : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                }`}
              >
                <span>{opt.label}</span>
                {typeof opt.count === 'number' && opt.count > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-[#DC2626] text-white font-mono text-[10px] font-bold tabular-nums">
                    {opt.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] dark:bg-[#0F172A] rounded-md border border-[#E2E8F0] dark:border-[#1E293B] overflow-x-auto max-w-full">
            {(
              [
                { key: 'all', label: 'All Cycles' },
                { key: 'routine', label: 'Routine' },
                { key: 'yearly', label: 'Yearly' },
                { key: 'eventual', label: 'Eventual' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setCycleFilter(opt.key)}
                className={`px-3 py-1.5 sm:py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  cycleFilter === opt.key
                    ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                    : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={() => exportReportsToCsv(filteredReports)}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] bg-white dark:bg-[#0F172A] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-[#475569] dark:text-[#94A3B8]" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setNewCycle(workspaceDefaults?.defaultCycleType ?? 'routine');
              setShowCreateModal(true);
            }}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md whitespace-nowrap shrink-0"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>Start Inspection Report</span>
          </button>
        </div>
      </div>

      {/* Reports Grid / Table */}
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden">
        {/* Compact Mobile Cards */}
        <div className="md:hidden divide-y divide-[#E2E8F0] dark:divide-[#1E293B]">
          {filteredReports.length === 0 ? (
            <div className="py-10 px-4 text-center text-sm text-[#64748B] dark:text-[#94A3B8]">
              No inspection reports match your filters. Start a new report to begin field capture.
            </div>
          ) : (
            filteredReports.map((rep) => {
              const doneCount = rep.entries.filter((e) => e.condition !== 'na').length;
              const photoCount = rep.entries.reduce((acc, e) => acc + e.photos.length, 0);
              const canDelete = rep.status === 'draft' || hasAnyRole(currentUser, 'admin');
              const needsAction = isReportNeedingUserAction(rep, currentUser);
              const approvalInfo = getApprovalProgressSummary(rep);

              return (
                <div
                  key={rep.id}
                  onClick={() => onSelectReport(rep.id)}
                  className={`p-3.5 space-y-2.5 cursor-pointer active:bg-[#F8FAFC] dark:active:bg-[#1E293B]/60 ${
                    needsAction ? 'bg-[#EFF6FF]/40 dark:bg-[#1E3A8A]/10' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA]">
                          {rep.reportNumber}
                        </span>
                        {needsAction && (
                          <span
                            title="Needs your action"
                            className="w-2 h-2 rounded-full bg-[#DC2626] shrink-0"
                          />
                        )}
                        <span aria-hidden="true" className="text-[#CBD5E1] dark:text-[#475569]">·</span>
                        <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                          {formatCycleLabel(rep.cycleType)}
                        </span>
                      </div>
                      <div className="font-medium text-sm text-[#0F172A] dark:text-[#F8FAFC] truncate mt-0.5">
                        {rep.title}
                      </div>
                      <div className="text-xs text-[#64748B] dark:text-[#94A3B8] truncate">
                        {rep.facilityArea} · {rep.inspectorName}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-semibold shrink-0 ${
                        rep.status === 'approved' || rep.status === 'reviewed'
                          ? 'text-[#16A34A] dark:text-[#4ADE80]'
                          : rep.status === 'pending_approval' || rep.status === 'submitted'
                          ? 'text-[#1D4ED8] dark:text-[#60A5FA]'
                          : rep.status === 'sent_back'
                          ? 'text-[#DC2626] dark:text-[#F87171]'
                          : 'text-[#D97706] dark:text-[#FBBF24]'
                      }`}
                    >
                      {formatReportStatusLabel(rep.status)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-3 text-[11px] text-[#475569] dark:text-[#94A3B8] font-mono tabular-nums">
                      <span>{doneCount}/{rep.entries.length} assets</span>
                      <span>{photoCount} photos</span>
                      <span className={`font-sans truncate max-w-[140px] ${approvalInfo.tone}`}>
                        {approvalInfo.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onSelectReport(rep.id)}
                        className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-[#1D4ED8] dark:text-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 rounded-md"
                      >
                        {rep.status === 'draft' || rep.status === 'sent_back'
                          ? 'Execute'
                          : needsAction
                          ? 'Review Now'
                          : 'Audit View'}
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDeleteReport(rep)}
                          title="Delete report"
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-[#64748B] dark:text-[#94A3B8] hover:text-[#DC2626] dark:hover:text-[#F87171] border border-[#E2E8F0] dark:border-[#334155] rounded-md"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full table-fixed text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0F172A] text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                <ResizableTh
                  width={reportCols.reportNo}
                  onStartResize={(e) => resizeReportCol('reportNo', e)}
                  className="py-3 px-4"
                >
                  Report No.
                </ResizableTh>
                <ResizableTh
                  width={reportCols.titleArea}
                  onStartResize={(e) => resizeReportCol('titleArea', e)}
                  className="py-3 px-4"
                >
                  Title &amp; Facility Area
                </ResizableTh>
                <ResizableTh
                  width={reportCols.cycle}
                  onStartResize={(e) => resizeReportCol('cycle', e)}
                  className="py-3 px-4"
                >
                  Cycle
                </ResizableTh>
                <ResizableTh
                  width={reportCols.inspector}
                  onStartResize={(e) => resizeReportCol('inspector', e)}
                  className="py-3 px-4"
                >
                  Executor
                </ResizableTh>
                <ResizableTh
                  width={reportCols.checklist}
                  onStartResize={(e) => resizeReportCol('checklist', e)}
                  className="py-3 px-4"
                >
                  Assets
                </ResizableTh>
                <ResizableTh
                  width={reportCols.photos}
                  onStartResize={(e) => resizeReportCol('photos', e)}
                  className="py-3 px-4"
                >
                  Photos
                </ResizableTh>
                <ResizableTh
                  width={reportCols.approval}
                  onStartResize={(e) => resizeReportCol('approval', e)}
                  className="py-3 px-4"
                >
                  Approval Progress
                </ResizableTh>
                <ResizableTh
                  width={reportCols.status}
                  onStartResize={(e) => resizeReportCol('status', e)}
                  className="py-3 px-4"
                >
                  Status
                </ResizableTh>
                <ResizableTh
                  width={reportCols.actions}
                  onStartResize={(e) => resizeReportCol('actions', e)}
                  align="right"
                  className="py-3 px-4"
                >
                  Actions
                </ResizableTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B] text-sm">
              {filteredReports.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-12 px-4 text-center text-sm text-[#64748B] dark:text-[#94A3B8]"
                  >
                    No inspection reports match your filters. Start a new report to begin field capture.
                  </td>
                </tr>
              ) : (
                filteredReports.map((rep) => {
                  const doneCount = rep.entries.filter((e) => e.condition !== 'na').length;
                  const photoCount = rep.entries.reduce((acc, e) => acc + e.photos.length, 0);
                  const canDelete = rep.status === 'draft' || hasAnyRole(currentUser, 'admin');
                  const needsAction = isReportNeedingUserAction(rep, currentUser);
                  const approvalInfo = getApprovalProgressSummary(rep);

                  return (
                    <tr
                      key={rep.id}
                      onClick={() => onSelectReport(rep.id)}
                      className={`hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/60 cursor-pointer transition-colors ${
                        needsAction ? 'bg-[#EFF6FF]/40 dark:bg-[#1E3A8A]/10' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA] truncate">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{rep.reportNumber}</span>
                          {needsAction && (
                            <span
                              title="Needs your action"
                              className="w-2 h-2 rounded-full bg-[#DC2626] shrink-0"
                            />
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 min-w-0">
                        <div className="font-medium text-[#0F172A] dark:text-[#F8FAFC] text-sm truncate">
                          {rep.title}
                        </div>
                        <div className="text-xs text-[#64748B] dark:text-[#94A3B8] truncate">
                          {rep.facilityArea}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-[#334155] dark:text-[#CBD5E1] truncate">
                        {formatCycleLabel(rep.cycleType)}
                      </td>
                      <td className="py-3 px-4 text-xs text-[#334155] dark:text-[#CBD5E1] truncate">
                        {rep.inspectorName}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-[#0F172A] dark:text-[#F8FAFC] tabular-nums whitespace-nowrap">
                        {doneCount}/{rep.entries.length}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-[#334155] dark:text-[#CBD5E1] tabular-nums whitespace-nowrap">
                        {photoCount}
                      </td>
                      <td className={`py-3 px-4 text-xs truncate ${approvalInfo.tone}`}>
                        {approvalInfo.label}
                      </td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">
                        <span
                          className={`font-medium ${
                            rep.status === 'approved' || rep.status === 'reviewed'
                              ? 'text-[#16A34A] dark:text-[#4ADE80]'
                              : rep.status === 'pending_approval' || rep.status === 'submitted'
                              ? 'text-[#1D4ED8] dark:text-[#60A5FA]'
                              : rep.status === 'sent_back'
                              ? 'text-[#DC2626] dark:text-[#F87171]'
                              : 'text-[#D97706] dark:text-[#FBBF24]'
                          }`}
                        >
                          {formatReportStatusLabel(rep.status)}
                        </span>
                        <span aria-hidden="true" className="text-[#CBD5E1] dark:text-[#475569]"> · </span>
                        <span className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                          {formatShortDate(rep.submittedAt ?? rep.updatedAt)}
                        </span>
                      </td>
                      <td
                        className="py-3 px-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectReport(rep.id)}
                            className="px-2.5 py-1 text-xs font-medium text-[#1D4ED8] dark:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#1E3A8A]/40 rounded transition-colors"
                          >
                            {rep.status === 'draft' || rep.status === 'sent_back'
                              ? 'Execute'
                              : needsAction
                              ? 'Review Now'
                              : 'Audit View'}
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteReport(rep)}
                              title="Delete report"
                              className="p-1.5 text-[#64748B] dark:text-[#94A3B8] hover:text-[#DC2626] dark:hover:text-[#F87171] hover:bg-[#FEF2F2] dark:hover:bg-[#7F1D1D]/30 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Report Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/45 dark:bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded-lg max-w-2xl w-full shadow-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between shrink-0">
              <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                Start New Inspection / Maintenance Report
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateReport} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Maintenance Cycle
                  </label>
                  <select
                    value={newCycle}
                    onChange={(e) => setNewCycle(e.target.value as CycleType)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                  >
                    <option value="routine">Routine Inspection</option>
                    <option value="yearly">Yearly Maintenance</option>
                    <option value="eventual">Eventual Inspection</option>
                  </select>
                </div>

                <div ref={facilityBoxRef} className="relative">
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Facility / Zone / Asset Area
                  </label>
                  <div className="relative">
                    <Building2 className="w-3.5 h-3.5 text-[#64748B] dark:text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={newArea}
                      onFocus={() => setFacilityDropdownOpen(true)}
                      onChange={(e) => {
                        setNewArea(e.target.value);
                        setFacilityDropdownOpen(true);
                      }}
                      placeholder="Select from library or type area..."
                      className="w-full pl-8 pr-8 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                    />
                    <button
                      type="button"
                      onClick={() => setFacilityDropdownOpen((v) => !v)}
                      title="Browse facility zones"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {facilityDropdownOpen && (
                    <div className="absolute z-30 left-0 right-0 mt-1 bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md shadow-lg max-h-52 overflow-y-auto divide-y divide-[#F1F5F9] dark:divide-[#1E293B]">
                      {filteredFacilities.length === 0 ? (
                        <div className="px-3 py-2.5 text-xs text-[#64748B] dark:text-[#94A3B8]">
                          No matching library zone — press Create to use &ldquo;{newArea}&rdquo;
                        </div>
                      ) : (
                        filteredFacilities.map((fac) => {
                          const displayValue = `${fac.code} — ${fac.name}`;
                          return (
                            <button
                              key={fac.id}
                              type="button"
                              onClick={() => {
                                setNewArea(displayValue);
                                setItemFacilityFilter(fac.id);
                                setFacilityDropdownOpen(false);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-[#EFF6FF] dark:hover:bg-[#1E293B] transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                                  <span className="font-mono text-[#1D4ED8] dark:text-[#60A5FA]">
                                    {fac.code}
                                  </span>
                                  <span aria-hidden="true"> · </span>
                                  {fac.name}
                                </span>
                                <span
                                  className={`text-[10px] font-medium capitalize shrink-0 ${
                                    fac.riskLevel === 'high'
                                      ? 'text-[#DC2626] dark:text-[#F87171]'
                                      : fac.riskLevel === 'medium'
                                      ? 'text-[#D97706] dark:text-[#FBBF24]'
                                      : 'text-[#64748B] dark:text-[#94A3B8]'
                                  }`}
                                >
                                  {fac.riskLevel}
                                </span>
                              </div>
                              {fac.building && (
                                <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                                  {fac.building}
                                </div>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Report Title (Editable anytime while drafting)
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={
                    newCycle === 'yearly'
                      ? 'e.g. 2026 Annual Maintenance & Safety Audit'
                      : newCycle === 'eventual'
                      ? 'e.g. Post-Incident Dryer Verification'
                      : 'e.g. Weekly Routine Asset Walkthrough'
                  }
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                    Assets Synced from Asset Library ({selectedLibIds.length} selected)
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const visibleIds = filteredModalLibraryItems.map((i) => i.id);
                        if (allVisibleSelected) {
                          const visibleSet = new Set(visibleIds);
                          setSelectedLibIds((prev) => prev.filter((id) => !visibleSet.has(id)));
                        } else {
                          setSelectedLibIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
                        }
                      }}
                      className="text-xs font-medium text-[#1D4ED8] dark:text-[#60A5FA] hover:underline"
                    >
                      {allVisibleSelected ? 'Clear Visible' : 'Select Visible'}
                    </button>
                    {selectedLibIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedLibIds([])}
                        className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter Assets by Facility/Zone Area + Search */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-[#64748B] dark:text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      placeholder="Search by code, asset title, category, or criteria..."
                      className="w-full pl-8 pr-7 py-1.5 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                    />
                    {itemSearch && (
                      <button
                        type="button"
                        onClick={() => setItemSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <select
                    value={itemFacilityFilter}
                    onChange={(e) => setItemFacilityFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md text-[#334155] dark:text-[#CBD5E1] focus:outline-none focus:border-[#1D4ED8]"
                  >
                    <option value="all">All Facility Zones</option>
                    {facilityAreas.map((fac) => (
                      <option key={fac.id} value={fac.id}>
                        {fac.code} — {fac.name}
                      </option>
                    ))}
                    <option value="unassigned">Unassigned Zone</option>
                  </select>
                </div>

                <div className="border border-[#E2E8F0] dark:border-[#334155] rounded-md divide-y divide-[#E2E8F0] dark:divide-[#1E293B] max-h-56 overflow-y-auto">
                  {filteredModalLibraryItems.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-[#64748B] dark:text-[#94A3B8]">
                      No active assets match your Facility / Search filter.
                    </div>
                  ) : (
                    filteredModalLibraryItems.map((item) => {
                      const checked = selectedLibIds.includes(item.id);
                      return (
                        <label
                          key={item.id}
                          className="flex items-start gap-3 px-3.5 py-2.5 hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/60 cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedLibIds((prev) => [...prev, item.id]);
                              } else {
                                setSelectedLibIds((prev) => prev.filter((id) => id !== item.id));
                              }
                            }}
                            className="mt-0.5 rounded border-[#CBD5E1] text-[#1D4ED8]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                              <span className="font-mono text-[#1D4ED8] dark:text-[#60A5FA]">
                                {item.code}
                              </span>
                              <span aria-hidden="true"> · </span>
                              {item.title}
                            </div>
                            <div className="text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                              {item.category}
                              {item.facilityAreaName && (
                                <>
                                  <span aria-hidden="true"> · </span>
                                  <span>{item.facilityAreaName}</span>
                                </>
                              )}
                              {(item.parameters?.length ?? 0) > 0 && (
                                <>
                                  <span aria-hidden="true"> · </span>
                                  <span>{item.parameters.length} param(s)</span>
                                </>
                              )}
                              {item.drawingUrl && (
                                <>
                                  <span aria-hidden="true"> · </span>
                                  <span className="text-[#1D4ED8] dark:text-[#60A5FA]">
                                    Visual Map ({item.pins?.length ?? 0} pins)
                                  </span>
                                </>
                              )}
                              {item.requirePhoto && (
                                <>
                                  <span aria-hidden="true"> · </span>
                                  <span>Photo Required</span>
                                </>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-[#475569] dark:text-[#CBD5E1] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md"
                >
                  {creating ? 'Creating...' : 'Create & Start Execution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface ReportDetailEditorProps {
  report: InspectionReport;
  users: User[];
  libraryItems: LibraryItem[];
  currentUser: User;
  token: string;
  onBack: () => void;
  onSyncComplete: () => Promise<void>;
  onNotify: (message: string, kind?: 'info' | 'error') => void;
  onOpenLightbox: (photo: InspectionPhoto) => void;
  onNavigateToTask?: (projectId: string, taskId: string) => void;
}

function ReportDetailEditor({
  report,
  users,
  libraryItems,
  currentUser,
  token,
  onBack,
  onSyncComplete,
  onNotify,
  onOpenLightbox,
  onNavigateToTask,
}: ReportDetailEditorProps) {
  const [title, setTitle] = useState(report.title);
  const [summaryNotes, setSummaryNotes] = useState(report.summaryNotes);
  const [overallCondition, setOverallCondition] = useState<ConditionStatus>(report.overallCondition);
  const [submitting, setSubmitting] = useState(false);
  const [syncingLib, setSyncingLib] = useState(false);
  const [visualEntryId, setVisualEntryId] = useState<string | null>(null);

  // Sequential Approver Configuration (1 to 6 approvers)
  const approverPool = useMemo(
    () => users.filter((u) => hasAnyRole(u, 'approver')),
    [users]
  );

  const [approverCount, setApproverCount] = useState<number>(() =>
    report.approvalSteps && report.approvalSteps.length > 0
      ? Math.min(6, Math.max(1, report.approvalSteps.length))
      : 1
  );
  const [selectedApproverIds, setSelectedApproverIds] = useState<string[]>(() => {
    if (report.approvalSteps && report.approvalSteps.length > 0) {
      return report.approvalSteps.map((s) => s.approverId);
    }
    return approverPool[0] ? [approverPool[0].id] : [''];
  });

  // Approver decision & report comments
  const [decisionNote, setDecisionNote] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [reportCommentBody, setReportCommentBody] = useState('');
  const [postingReportComment, setPostingReportComment] = useState(false);

  useEffect(() => {
    setTitle(report.title);
    setSummaryNotes(report.summaryNotes);
    setOverallCondition(report.overallCondition);
    if (report.approvalSteps && report.approvalSteps.length > 0) {
      setApproverCount(Math.min(6, Math.max(1, report.approvalSteps.length)));
      setSelectedApproverIds(report.approvalSteps.map((s) => s.approverId));
    }
  }, [report.id, report.title, report.summaryNotes, report.overallCondition, report.approvalSteps]);

  useEffect(() => {
    setSelectedApproverIds((prev) => {
      const next = prev.slice(0, approverCount);
      while (next.length < approverCount) {
        const used = new Set(next.filter(Boolean));
        const available = approverPool.find((u) => !used.has(u.id));
        next.push(available?.id ?? '');
      }
      return next;
    });
  }, [approverCount, approverPool]);

  const isAdmin = hasAnyRole(currentUser, 'admin');
  const isDraftOrSentBack = report.status === 'draft' || report.status === 'sent_back';
  const isLocked = !(isDraftOrSentBack || isAdmin);

  const activeApprovalStep = useMemo(
    () =>
      report.status === 'pending_approval'
        ? (report.approvalSteps ?? []).find((s) => s.status === 'pending') ?? null
        : null,
    [report.status, report.approvalSteps]
  );

  const isCurrentUserActiveApprover = Boolean(
    activeApprovalStep &&
      activeApprovalStep.approverId === currentUser.id &&
      hasAnyRole(currentUser, 'approver')
  );

  const sentBackStep = useMemo(
    () =>
      report.status === 'sent_back'
        ? (report.approvalSteps ?? []).find((s) => s.status === 'sent_back') ?? null
        : null,
    [report.status, report.approvalSteps]
  );

  const visualEntry = useMemo(
    () => (visualEntryId ? report.entries.find((e) => e.id === visualEntryId) ?? null : null),
    [report.entries, visualEntryId]
  );

  const libraryItemById = useMemo(
    () => new Map(libraryItems.map((i) => [i.id, i])),
    [libraryItems]
  );

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, InspectionEntry[]>();
    for (const ent of report.entries) {
      const list = groups.get(ent.category) ?? [];
      list.push(ent);
      groups.set(ent.category, list);
    }
    return Array.from(groups.entries());
  }, [report.entries]);

  async function saveReportMeta(silent = false): Promise<boolean> {
    if (isLocked) return true;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim() || report.title,
          summaryNotes,
          overallCondition,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify(data.error ?? 'Failed to save report details.', 'error');
        return false;
      }
      await onSyncComplete();
      if (!silent) onNotify('Saved inspection report draft.');
      return true;
    } catch {
      onNotify('Network error saving report.', 'error');
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitForApproval() {
    const cleanApproverIds = selectedApproverIds.slice(0, approverCount).filter(Boolean);
    if (cleanApproverIds.length !== approverCount) {
      onNotify(`Select all ${approverCount} sequential approver(s) before submitting.`, 'error');
      return;
    }
    if (new Set(cleanApproverIds).size !== cleanApproverIds.length) {
      onNotify('Each step must be assigned to a distinct approver.', 'error');
      return;
    }

    const metaSaved = await saveReportMeta(true);
    if (!metaSaved) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ approverIds: cleanApproverIds }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify(data.error ?? 'Unable to submit report for approval.', 'error');
        return;
      }
      await onSyncComplete();
      onNotify(`Report ${report.reportNumber} submitted for ${cleanApproverIds.length}-step sequential approval.`);
    } catch {
      onNotify('Network error submitting report.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApproveStep() {
    setDeciding(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/approve-step`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ note: decisionNote }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify(data.error ?? 'Failed to approve step.', 'error');
        return;
      }
      setDecisionNote('');
      await onSyncComplete();
      onNotify(`Approved Step ${activeApprovalStep?.stepOrder ?? ''} on ${report.reportNumber}.`);
    } catch {
      onNotify('Network error approving step.', 'error');
    } finally {
      setDeciding(false);
    }
  }

  async function handleSendBack() {
    if (!decisionNote.trim()) {
      onNotify('Please enter a revision reason before sending the report back.', 'error');
      return;
    }
    setDeciding(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/send-back`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ note: decisionNote.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify(data.error ?? 'Failed to send back report.', 'error');
        return;
      }
      setDecisionNote('');
      await onSyncComplete();
      onNotify(`Sent ${report.reportNumber} back to ${report.inspectorName} for revision.`);
    } catch {
      onNotify('Network error sending back report.', 'error');
    } finally {
      setDeciding(false);
    }
  }

  async function handlePostComment(entryId: string | null, body: string, onSuccess?: () => void) {
    const clean = body.trim();
    if (!clean) return;
    setPostingReportComment(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ entryId, body: clean }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify(data.error ?? 'Failed to post comment.', 'error');
        return;
      }
      onSuccess?.();
      await onSyncComplete();
    } catch {
      onNotify('Network error posting comment.', 'error');
    } finally {
      setPostingReportComment(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    try {
      const res = await fetch(`/api/reports/${report.id}/comments/${commentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      await onSyncComplete();
    } catch {
      onNotify('Network error removing comment.', 'error');
    }
  }

  async function handleSyncLibrary() {
    setSyncingLib(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/sync-library`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { added?: number; error?: string };
      if (!res.ok) {
        onNotify(data.error ?? 'Unable to sync Asset Library.', 'error');
        return;
      }
      await onSyncComplete();
      onNotify(
        data.added && data.added > 0
          ? `Pulled ${data.added} new asset(s) from Asset Library.`
          : 'Report is already up to date with Asset Library.'
      );
    } catch {
      onNotify('Network error syncing Asset Library.', 'error');
    } finally {
      setSyncingLib(false);
    }
  }

  const evaluatedCount = report.entries.filter((e) => e.condition !== 'na').length;

  return (
    <div className="space-y-6">
      {/* Top Action Bar (Hidden in Print) */}
      <div className="no-print bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Reports</span>
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#64748B] dark:text-[#94A3B8]">
              <span className="font-mono font-semibold text-[#1D4ED8] dark:text-[#60A5FA]">
                {report.reportNumber}
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatCycleLabel(report.cycleType)}</span>
              <span aria-hidden="true">·</span>
              <span
                className={`font-semibold ${
                  report.status === 'approved'
                    ? 'text-[#16A34A] dark:text-[#4ADE80]'
                    : report.status === 'sent_back'
                    ? 'text-[#DC2626] dark:text-[#F87171]'
                    : 'text-[#0F172A] dark:text-[#F8FAFC]'
                }`}
              >
                {formatReportStatusLabel(report.status)}
              </span>
            </div>
            <h2 className="font-display text-sm sm:text-base font-bold text-[#0F172A] dark:text-[#F8FAFC] truncate">
              {title}
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {!isLocked && (
            <button
              type="button"
              onClick={handleSyncLibrary}
              disabled={syncingLib}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] bg-white dark:bg-[#0F172A] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingLib ? 'animate-spin' : ''}`} />
              <span>Sync Assets</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => exportReportsToCsv([report])}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] bg-white dark:bg-[#0F172A] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] bg-white dark:bg-[#0F172A] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / Save PDF</span>
          </button>

          {!isLocked && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => saveReportMeta(false)}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md whitespace-nowrap shrink-0"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{submitting ? 'Saving...' : 'Save Changes'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Admin Override Banner on Non-Draft Reports */}
      {isAdmin && !isDraftOrSentBack && (
        <div className="no-print px-4 py-3 bg-[#FFFBEB] dark:bg-[#78350F]/25 border border-[#FDE68A] dark:border-[#B45309] rounded-lg flex items-center gap-3 text-xs text-[#92400E] dark:text-[#FDE68A]">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>
            <strong>Admin Edit Privilege Active:</strong> You can edit fields on this{' '}
            {formatReportStatusLabel(report.status)} report. All edits are logged in the Digital
            Footprint and Entry Edit History.
          </span>
        </div>
      )}

      {/* Sent Back Revision Banner */}
      {report.status === 'sent_back' && (
        <div className="no-print px-5 py-4 bg-[#FEF2F2] dark:bg-[#7F1D1D]/25 border border-[#FECACA] dark:border-[#B91C1C] rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#DC2626] dark:text-[#F87171] shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-semibold text-[#991B1B] dark:text-[#FCA5A5]">
              Report Sent Back for Revision
              {sentBackStep ? ` · Step ${sentBackStep.stepOrder} (${sentBackStep.approverName})` : ''}
            </div>
            {sentBackStep?.decisionNote && (
              <p className="text-[#7F1D1D] dark:text-[#FECACA] leading-relaxed">
                Reason: &ldquo;{sentBackStep.decisionNote}&rdquo;
              </p>
            )}
            <p className="text-[#64748B] dark:text-[#94A3B8]">
              Update the report title, asset findings, or parameters below, then resubmit for approval.
            </p>
          </div>
        </div>
      )}

      {/* Active Approver Action Banner */}
      {isCurrentUserActiveApprover && activeApprovalStep && (
        <div className="no-print bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 border border-[#93C5FD] dark:border-[#1D4ED8] rounded-lg p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#1D4ED8] dark:text-[#60A5FA]" />
              <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                Action Required: Sequential Approval Step {activeApprovalStep.stepOrder} of{' '}
                {report.approvalSteps.length}
              </h3>
            </div>
            <span className="font-mono text-[11px] text-[#1D4ED8] dark:text-[#93C5FD]">
              Approver: {currentUser.name}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-7">
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Approval Note / Send-Back Revision Reason (required when sending back)
              </label>
              <input
                type="text"
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="Optional note on approve, or specific revision instructions if sending back..."
                className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
              />
            </div>

            <div className="lg:col-span-5 flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={deciding}
                onClick={handleSendBack}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#DC2626] dark:text-[#FCA5A5] bg-white dark:bg-[#0F172A] hover:bg-[#FEF2F2] dark:hover:bg-[#7F1D1D]/40 border border-[#FECACA] dark:border-[#B91C1C] disabled:opacity-60 rounded-md"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Send Back</span>
              </button>
              <button
                type="button"
                disabled={deciding}
                onClick={handleApproveStep}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-60 rounded-md"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {deciding
                    ? 'Submitting...'
                    : `Approve Step ${activeApprovalStep.stepOrder}/${report.approvalSteps.length}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Document Header (Editable Title when !isLocked) */}
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-4 sm:p-6 print-break-inside-avoid">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#E2E8F0] dark:border-[#1E293B] pb-4 mb-4">
          <div className="flex-1 min-w-0 sm:min-w-[260px]">
            <div className="font-mono text-xs text-[#1D4ED8] dark:text-[#60A5FA] font-semibold">
              AUDIT RECORD · {report.reportNumber}
            </div>
            {isLocked ? (
              <h1 className="font-display text-lg sm:text-xl font-bold text-[#0F172A] dark:text-[#F8FAFC] mt-1">
                {title}
              </h1>
            ) : (
              <div className="mt-1.5">
                <label className="no-print block text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                  Report Title (Editable)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => {
                    if (title.trim() && title.trim() !== report.title) {
                      saveReportMeta(true);
                    }
                  }}
                  className="w-full max-w-2xl px-3 py-1.5 font-display text-base sm:text-lg font-bold bg-[#F8FAFC] dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>
            )}
            <div className="text-xs text-[#475569] dark:text-[#94A3B8] mt-1.5">
              {report.facilityArea}
              <span aria-hidden="true"> · </span>
              {formatCycleLabel(report.cycleType)}
            </div>
          </div>

          <div className="text-left sm:text-right text-xs text-[#475569] dark:text-[#94A3B8] space-y-1 shrink-0">
            <div>
              Executor:{' '}
              <span className="font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                {report.inspectorName}
              </span>{' '}
              ({report.inspectorTitle || 'User'})
            </div>
            <div className="font-mono tabular-nums">
              Evaluated: {evaluatedCount}/{report.entries.length} assets
            </div>
            <div className="font-mono tabular-nums">
              {report.submittedAt
                ? `Submitted: ${formatDateTime(report.submittedAt)}`
                : `Updated: ${formatDateTime(report.updatedAt)}`}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#475569] dark:text-[#94A3B8] mb-1.5">
              Overall Assessment Condition
            </label>
            {isLocked ? (
              <div className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                {formatConditionLabel(overallCondition)}
              </div>
            ) : (
              <select
                value={overallCondition}
                onChange={(e) => setOverallCondition(e.target.value as ConditionStatus)}
                onBlur={() => saveReportMeta(true)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
              >
                {CONDITION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-[#475569] dark:text-[#94A3B8] mb-1.5">
              Executive Summary &amp; General Findings
            </label>
            {isLocked ? (
              <p className="text-sm text-[#334155] dark:text-[#CBD5E1] leading-relaxed">
                {summaryNotes || 'No executive summary recorded.'}
              </p>
            ) : (
              <textarea
                rows={2}
                value={summaryNotes}
                onChange={(e) => setSummaryNotes(e.target.value)}
                onBlur={() => saveReportMeta(true)}
                placeholder="Summarize overall asset health, immediate follow-ups, or turnaround recommendations..."
                className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
              />
            )}
          </div>
        </div>
      </div>

      {/* Checklist Entries Grouped by Category */}
      {groupedEntries.map(([category, entries]) => (
        <div
          key={category}
          className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden"
        >
          <div className="px-5 py-3 bg-[#F8FAFC] dark:bg-[#0F172A] border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
              {category}
            </h3>
            <span className="font-mono text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums">
              {entries.length} asset(s)
            </span>
          </div>

          <div className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B]">
            {entries.map((entry) => (
              <EntryRowEditor
                key={entry.id}
                entry={entry}
                assetDef={libraryItemById.get(entry.libraryItemId)}
                currentUser={currentUser}
                isLocked={isLocked}
                token={token}
                onSyncComplete={onSyncComplete}
                onNotify={onNotify}
                onOpenLightbox={onOpenLightbox}
                onOpenVisualMap={() => setVisualEntryId(entry.id)}
                onPostComment={(body, onDone) => handlePostComment(entry.id, body, onDone)}
                onDeleteComment={handleDeleteComment}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Sequential Approval Routing & Progress (Replaces Digital Sign-Off) */}
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-6 print-break-inside-avoid space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
              Sequential Multi-Approver Workflow
            </h3>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
              Select 1 to 6 Approvers in sequential order (Step 1 → Step N). Approvers are notified
              one step at a time.
            </p>
          </div>
          <span className="px-2.5 py-1 text-xs font-mono font-semibold rounded bg-[#F1F5F9] dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#E2E8F0] dark:border-[#334155]">
            {formatReportStatusLabel(report.status)}
          </span>
        </div>

        {/* Existing Approval Chain Progress */}
        {(report.approvalSteps ?? []).length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {report.approvalSteps.map((step: ReportApprovalStep) => (
              <div
                key={step.id}
                className={`p-3.5 border rounded-md ${
                  step.status === 'approved'
                    ? 'bg-[#F0FDF4] dark:bg-[#14532D]/25 border-[#BBF7D0] dark:border-[#15803D]'
                    : step.status === 'pending'
                    ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 border-[#93C5FD] dark:border-[#1D4ED8]'
                    : step.status === 'sent_back'
                    ? 'bg-[#FEF2F2] dark:bg-[#7F1D1D]/25 border-[#FECACA] dark:border-[#B91C1C]'
                    : 'bg-[#F8FAFC] dark:bg-[#0F172A] border-[#E2E8F0] dark:border-[#334155]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                    Step {step.stepOrder}
                  </span>
                  <span
                    className={`font-semibold capitalize text-[11px] ${
                      step.status === 'approved'
                        ? 'text-[#16A34A] dark:text-[#4ADE80]'
                        : step.status === 'pending'
                        ? 'text-[#1D4ED8] dark:text-[#60A5FA]'
                        : step.status === 'sent_back'
                        ? 'text-[#DC2626] dark:text-[#F87171]'
                        : 'text-[#64748B] dark:text-[#94A3B8]'
                    }`}
                  >
                    {step.status === 'pending'
                      ? 'Pending Review'
                      : step.status === 'sent_back'
                      ? 'Sent Back'
                      : step.status}
                  </span>
                </div>
                <div className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] mt-1">
                  {step.approverName}
                </div>
                <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  {step.approverTitle || 'Approver'}
                </div>
                {step.decisionNote && (
                  <div className="text-xs text-[#334155] dark:text-[#CBD5E1] mt-2 pt-2 border-t border-black/10 dark:border-white/10">
                    &ldquo;{step.decisionNote}&rdquo;
                  </div>
                )}
                {step.actedAt && (
                  <div className="font-mono text-[10px] text-[#64748B] dark:text-[#94A3B8] mt-1.5 tabular-nums">
                    {formatAuditTimestamp(step.actedAt)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Routing Picker for Draft or Sent Back */}
        {isDraftOrSentBack && (
          <div className="no-print p-4 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-md space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  {report.status === 'sent_back'
                    ? 'Confirm / Update Sequential Approvers for Resubmission'
                    : 'Configure Sequential Approver Chain'}
                </label>
                <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Only users assigned the Approver role in User Management appear below.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                  Approver Steps:
                </label>
                <select
                  value={approverCount}
                  onChange={(e) => setApproverCount(Number(e.target.value))}
                  className="px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} Approver{n > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {approverPool.length === 0 ? (
              <div className="text-xs text-[#DC2626] dark:text-[#F87171]">
                No users currently hold the Approver role. Ask an Administrator to assign Approver
                privileges in User Management.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: approverCount }).map((_, idx) => {
                  const chosenElsewhere = new Set(
                    selectedApproverIds.filter((id, i) => i !== idx && Boolean(id))
                  );
                  return (
                    <div key={idx}>
                      <label className="block text-[11px] font-mono font-medium text-[#475569] dark:text-[#94A3B8] mb-1">
                        Step {idx + 1} Approver
                      </label>
                      <select
                        value={selectedApproverIds[idx] ?? ''}
                        onChange={(e) => {
                          const nextVal = e.target.value;
                          setSelectedApproverIds((prev) => {
                            const copy = [...prev];
                            copy[idx] = nextVal;
                            return copy;
                          });
                        }}
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                      >
                        <option value="">— Select Approver —</option>
                        {approverPool.map((u) => (
                          <option
                            key={u.id}
                            value={u.id}
                            disabled={chosenElsewhere.has(u.id)}
                          >
                            {u.name} {u.title ? `(${u.title})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E2E8F0] dark:border-[#1E293B]">
              <div className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                <FolderSync className="w-3.5 h-3.5 inline mr-1.5 text-[#1D4ED8] dark:text-[#60A5FA]" />
                All changes record an immutable Digital Footprint.
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => saveReportMeta(false)}
                  className="px-4 py-2 text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] bg-white dark:bg-[#111827] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  disabled={submitting || approverPool.length === 0}
                  onClick={handleSubmitForApproval}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {submitting
                      ? 'Submitting...'
                      : report.status === 'sent_back'
                      ? 'Resubmit for Approval'
                      : 'Submit for Sequential Approval'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Overall Report Comments & Immutable Digital Footprint */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Overall Report Comments */}
        <div className="lg:col-span-6 bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#E2E8F0] dark:border-[#1E293B] pb-3">
            <MessageSquare className="w-4 h-4 text-[#1D4ED8] dark:text-[#60A5FA]" />
            <div>
              <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                Overall Report Comments ({(report.comments ?? []).length})
              </h3>
              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                Discussion between Executor and Approvers across the entire report.
              </p>
            </div>
          </div>

          <div className="space-y-2.5 max-h-64 overflow-y-auto">
            {(report.comments ?? []).length === 0 ? (
              <div className="text-xs text-[#64748B] dark:text-[#94A3B8] py-4 text-center">
                No overall report comments yet.
              </div>
            ) : (
              report.comments.map((cmt) => {
                const canDeleteComment = isAdmin || cmt.authorId === currentUser.id;
                return (
                  <div
                    key={cmt.id}
                    className="p-3 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-md text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                          {cmt.authorName}
                        </span>
                        <span className="font-mono text-[10px] text-[#1D4ED8] dark:text-[#60A5FA]">
                          {cmt.authorRoles.map((r) => formatRoleLabel(r)).join(', ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[10px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                          {formatAuditTimestamp(cmt.createdAt)}
                        </span>
                        {canDeleteComment && (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(cmt.id)}
                            title="Delete comment"
                            className="no-print text-[#94A3B8] hover:text-[#DC2626]"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[#334155] dark:text-[#CBD5E1] leading-relaxed">{cmt.body}</p>
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handlePostComment(null, reportCommentBody, () => setReportCommentBody(''));
            }}
            className="no-print flex items-center gap-2 pt-2 border-t border-[#E2E8F0] dark:border-[#1E293B]"
          >
            <input
              type="text"
              value={reportCommentBody}
              onChange={(e) => setReportCommentBody(e.target.value)}
              placeholder="Add an overall review note or report-wide comment..."
              className="flex-1 px-3 py-1.5 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
            />
            <button
              type="submit"
              disabled={postingReportComment || !reportCommentBody.trim()}
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 rounded-md shrink-0"
            >
              Comment
            </button>
          </form>
        </div>

        {/* Immutable Digital Footprint Timeline */}
        <div className="lg:col-span-6 bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#E2E8F0] dark:border-[#1E293B] pb-3">
            <Fingerprint className="w-4 h-4 text-[#16A34A] dark:text-[#4ADE80]" />
            <div>
              <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                Digital Footprint &amp; Audit Trail ({(report.footprints ?? []).length})
              </h3>
              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                Chronological tamper-evident log of creation, edits, submissions, and approvals.
              </p>
            </div>
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto">
            {(report.footprints ?? []).length === 0 ? (
              <div className="text-xs text-[#64748B] dark:text-[#94A3B8] py-4 text-center">
                No audit footprint events recorded yet.
              </div>
            ) : (
              report.footprints.map((fp) => (
                <div
                  key={fp.id}
                  className="p-3 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-md text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                        {fp.actorName}
                      </span>
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] text-[#475569] dark:text-[#94A3B8]">
                        {fp.action}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-[#64748B] dark:text-[#94A3B8] tabular-nums shrink-0">
                      {formatAuditTimestamp(fp.createdAt)}
                    </span>
                  </div>
                  <p className="text-[#334155] dark:text-[#CBD5E1] leading-relaxed">{fp.summary}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Interactive Visual Asset Inspection Modal */}
      {visualEntry && (
        <AssetVisualModal
          mode="inspect"
          entry={visualEntry}
          isLocked={isLocked}
          token={token}
          onClose={() => setVisualEntryId(null)}
          onSyncComplete={onSyncComplete}
          onNotify={onNotify}
          onOpenLightbox={onOpenLightbox}
          onNavigateToTask={onNavigateToTask}
        />
      )}
    </div>
  );
}

interface EntryRowEditorProps {
  entry: InspectionEntry;
  assetDef?: LibraryItem;
  currentUser: User;
  isLocked: boolean;
  token: string;
  onSyncComplete: () => Promise<void>;
  onNotify: (message: string, kind?: 'info' | 'error') => void;
  onOpenLightbox: (photo: InspectionPhoto) => void;
  onOpenVisualMap: () => void;
  onPostComment: (body: string, onDone: () => void) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
}

function EntryRowEditor({
  entry,
  assetDef,
  currentUser,
  isLocked,
  token,
  onSyncComplete,
  onNotify,
  onOpenLightbox,
  onOpenVisualMap,
  onPostComment,
  onDeleteComment,
}: EntryRowEditorProps) {
  const [condition, setCondition] = useState<ConditionStatus>(entry.condition);
  const [conditionNote, setConditionNote] = useState(entry.conditionNote);
  const [itemRemarks, setItemRemarks] = useState(entry.itemRemarks);
  const [paramDrafts, setParamDrafts] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [entryCommentText, setEntryCommentText] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const isAdmin = hasAnyRole(currentUser, 'admin');

  useEffect(() => {
    setCondition(entry.condition);
    setConditionNote(entry.conditionNote);
    setItemRemarks(entry.itemRemarks);
  }, [entry.id, entry.condition, entry.conditionNote, entry.itemRemarks]);

  useEffect(() => {
    const map: Record<string, string> = {};
    for (const pv of entry.parameterValues ?? []) {
      map[pv.parameterId] = pv.valueText ?? '';
    }
    setParamDrafts(map);
  }, [entry.id, entry.parameterValues]);

  const requiredParamIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of assetDef?.parameters ?? []) {
      if (p.isRequired) set.add(p.id);
    }
    return set;
  }, [assetDef]);

  async function patchEntry(
    next: Partial<{ condition: ConditionStatus; conditionNote: string; itemRemarks: string }>
  ) {
    try {
      const res = await fetch(`/api/entries/${entry.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        onNotify('Failed to save asset assessment.', 'error');
        return;
      }
      await onSyncComplete();
    } catch {
      onNotify('Network error saving entry.', 'error');
    }
  }

  async function saveParameterValue(parameterId: string, nextValue: string) {
    try {
      const res = await fetch(`/api/entries/${entry.id}/values`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ values: [{ parameterId, valueText: nextValue }] }),
      });
      if (!res.ok) {
        onNotify('Failed to save custom inspection parameter.', 'error');
        return;
      }
      await onSyncComplete();
    } catch {
      onNotify('Network error saving custom inspection parameter.', 'error');
    }
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const preparedList = await Promise.all(
        Array.from(files).map((file) => prepareImageForUpload(file, 'photo'))
      );
      const formData = new FormData();
      preparedList.forEach((p) => {
        formData.append('photos', p.file);
      });
      const res = await fetch(`/api/entries/${entry.id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const parsed = await parseApiResponse<{ error?: string }>(res);
      if (!parsed.ok) {
        onNotify(parsed.errorMessage ?? 'Photo upload failed.', 'error');
        return;
      }
      await onSyncComplete();
      const optimizedCount = preparedList.filter((p) => p.wasOptimized).length;
      onNotify(
        optimizedCount > 0
          ? `Uploaded ${preparedList.length} photo(s) for ${entry.itemCode} (${optimizedCount} auto-optimized).`
          : `Uploaded ${preparedList.length} photo(s) for ${entry.itemCode}.`
      );
    } catch (err) {
      onNotify(
        err instanceof Error && err.message ? err.message : 'Network error uploading photo.',
        'error'
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleUpdateCaption(photoId: string, caption: string) {
    try {
      const res = await fetch(`/api/photos/${photoId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ caption }),
      });
      if (!res.ok) {
        onNotify('Failed to save photo caption.', 'error');
        return;
      }
      await onSyncComplete();
    } catch {
      onNotify('Network error updating photo caption.', 'error');
    }
  }

  async function handleDeletePhoto(photoId: string) {
    try {
      const res = await fetch(`/api/photos/${photoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      await onSyncComplete();
      onNotify('Removed photo evidence.');
    } catch {
      onNotify('Network error removing photo.', 'error');
    }
  }

  const visualPins = entry.visualPins ?? [];
  const evaluatedPinsCount = visualPins.filter(
    (vp) => vp.result && vp.result.condition !== 'na'
  ).length;
  const recordedPinFindings = visualPins.filter(
    (vp) => (vp.result && (vp.result.condition !== 'na' || vp.result.notes)) || (vp.photos?.length ?? 0) > 0
  );
  const paramValues = entry.parameterValues ?? [];
  const entryHistory = entry.editHistory ?? [];
  const entryComments = entry.comments ?? [];

  return (
    <div className="p-4 sm:p-5 space-y-4 print-break-inside-avoid">
      {/* Asset Header & Condition Selector */}
      <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
            <span className="font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
              {entry.itemCode}
            </span>
            {entry.facilityAreaName && (
              <>
                <span aria-hidden="true">·</span>
                <span>{entry.facilityAreaName}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="capitalize">{entry.criticality} criticality</span>
            {entry.requirePhoto && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#1D4ED8] dark:text-[#60A5FA] font-medium inline-flex items-center gap-1">
                  <Camera className="w-3 h-3" />
                  Photo Required
                </span>
              </>
            )}
          </div>
          <h4 className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] mt-1">
            {entry.itemTitle}
          </h4>
          {entry.criteria && (
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
              Criteria: {entry.criteria}
            </p>
          )}
        </div>

        {/* Condition Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          {CONDITION_OPTIONS.map((opt) => {
            const active = condition === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={isLocked}
                onClick={() => {
                  setCondition(opt.value);
                  patchEntry({ condition: opt.value });
                }}
                className={`min-h-[38px] px-3 py-1.5 text-xs font-medium border rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? opt.tone
                    : 'text-[#475569] dark:text-[#CBD5E1] border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#0F172A] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]'
                } ${isLocked && !active ? 'opacity-45' : ''}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Inspection Parameters Section */}
      {paramValues.length > 0 && (
        <div className="border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0F172A] rounded-md p-3.5 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-[#60A5FA]" />
            <span>Custom Inspection Parameters ({paramValues.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {paramValues.map((pv: InspectionParameterValue) => {
              const draftVal = paramDrafts[pv.parameterId] ?? pv.valueText ?? '';
              const isRequired = requiredParamIds.has(pv.parameterId);

              return (
                <div
                  key={pv.parameterId}
                  className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded p-2.5"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-[11px] font-medium text-[#334155] dark:text-[#CBD5E1] truncate">
                      {pv.label}
                      {isRequired && <span className="text-[#DC2626] ml-0.5">*</span>}
                    </label>
                    {pv.paramType === 'number' && pv.unit && (
                      <span className="font-mono text-[10px] text-[#64748B] dark:text-[#94A3B8] shrink-0">
                        {pv.unit}
                      </span>
                    )}
                  </div>

                  {pv.paramType === 'boolean' ? (
                    <div className="flex items-center gap-1.5">
                      {(['Yes', 'No'] as const).map((choice) => {
                        const selected = draftVal === choice;
                        return (
                          <button
                            key={choice}
                            type="button"
                            disabled={isLocked}
                            onClick={() => {
                              setParamDrafts((prev) => ({
                                ...prev,
                                [pv.parameterId]: choice,
                              }));
                              saveParameterValue(pv.parameterId, choice);
                            }}
                            className={`flex-1 py-1 text-xs font-medium border rounded transition-colors ${
                              selected
                                ? choice === 'Yes'
                                  ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 border-[#1D4ED8] text-[#1D4ED8] dark:text-[#93C5FD]'
                                  : 'bg-[#FEF2F2] dark:bg-[#7F1D1D]/30 border-[#DC2626] text-[#DC2626] dark:text-[#FCA5A5]'
                                : 'bg-[#F8FAFC] dark:bg-[#0F172A] border-[#CBD5E1] dark:border-[#334155] text-[#475569] dark:text-[#CBD5E1]'
                            } disabled:opacity-50`}
                          >
                            {choice}
                          </button>
                        );
                      })}
                    </div>
                  ) : isLocked ? (
                    <div className="font-mono text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] py-1">
                      {draftVal ? (
                        <>
                          {draftVal}
                          {pv.paramType === 'number' && pv.unit ? ` ${pv.unit}` : ''}
                        </>
                      ) : (
                        <span className="text-[#94A3B8]">—</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        type={pv.paramType === 'number' ? 'number' : 'text'}
                        step="any"
                        value={draftVal}
                        onChange={(e) =>
                          setParamDrafts((prev) => ({
                            ...prev,
                            [pv.parameterId]: e.target.value,
                          }))
                        }
                        onBlur={() => {
                          if (draftVal !== (pv.valueText ?? '')) {
                            saveParameterValue(pv.parameterId, draftVal);
                          }
                        }}
                        placeholder={pv.paramType === 'number' ? '0.00' : 'Enter reading/note...'}
                        className="w-full px-2.5 py-1 text-xs font-mono bg-[#F8FAFC] dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded focus:outline-none focus:border-[#1D4ED8]"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Visual Drawing & Inspection Pin Strip */}
      {(entry.drawingUrl || visualPins.length > 0) && (
        <div className="border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0F172A] rounded-md p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <MapPin className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-[#60A5FA] shrink-0" />
              <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Visual Inspection Drawing
              </span>
              <span aria-hidden="true" className="text-[#CBD5E1] dark:text-[#475569]">·</span>
              <span className="font-mono text-[11px] text-[#475569] dark:text-[#94A3B8] tabular-nums">
                {evaluatedPinsCount}/{visualPins.length} checkpoints inspected
              </span>
            </div>

            <button
              type="button"
              onClick={onOpenVisualMap}
              className="no-print inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-[#1D4ED8] dark:text-[#93C5FD] bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 hover:bg-[#DBEAFE] border border-[#BFDBFE] dark:border-[#1D4ED8] rounded transition-colors whitespace-nowrap shrink-0"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>{isLocked ? 'View Visual Pin Map' : 'Inspect on Visual Map'}</span>
            </button>
          </div>

          {recordedPinFindings.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
              {recordedPinFindings.map((vp) => (
                <button
                  key={vp.id}
                  type="button"
                  onClick={onOpenVisualMap}
                  className="text-left p-2 bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded text-xs hover:border-[#1D4ED8] transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                      <span className="font-mono text-[#1D4ED8] dark:text-[#60A5FA]">
                        #{vp.pinNumber}
                      </span>{' '}
                      {vp.label}
                    </span>
                    <span
                      className={`text-[10px] font-semibold shrink-0 ${
                        vp.result?.condition === 'critical'
                          ? 'text-[#DC2626] dark:text-[#F87171]'
                          : vp.result?.condition === 'needs_attention'
                          ? 'text-[#D97706] dark:text-[#FBBF24]'
                          : vp.result?.condition === 'good'
                          ? 'text-[#16A34A] dark:text-[#4ADE80]'
                          : 'text-[#64748B] dark:text-[#94A3B8]'
                      }`}
                    >
                      {formatConditionLabel(vp.result?.condition ?? 'na')}
                    </span>
                  </div>
                  {vp.result?.notes && (
                    <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-1 line-clamp-2">
                      {vp.result.notes}
                    </div>
                  )}
                  {(vp.photos?.length ?? 0) > 0 && (
                    <div className="text-[10px] font-mono text-[#1D4ED8] dark:text-[#60A5FA] mt-1">
                      {vp.photos.length} pin photo(s) attached
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Per-Condition Note & Per-Item Remarks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8] mb-1">
            Condition Observation Note
          </label>
          {isLocked ? (
            <div className="text-xs text-[#334155] dark:text-[#CBD5E1] bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded px-3 py-2 min-h-[36px]">
              {conditionNote || '—'}
            </div>
          ) : (
            <input
              type="text"
              value={conditionNote}
              onChange={(e) => setConditionNote(e.target.value)}
              onBlur={() => {
                if (conditionNote !== entry.conditionNote) patchEntry({ conditionNote });
              }}
              placeholder="Measurement, visual state, or condition justification..."
              className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
            />
          )}
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8] mb-1">
            Asset Remarks &amp; Corrective Action
          </label>
          {isLocked ? (
            <div className="text-xs text-[#334155] dark:text-[#CBD5E1] bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded px-3 py-2 min-h-[36px]">
              {itemRemarks || '—'}
            </div>
          ) : (
            <input
              type="text"
              value={itemRemarks}
              onChange={(e) => setItemRemarks(e.target.value)}
              onBlur={() => {
                if (itemRemarks !== entry.itemRemarks) patchEntry({ itemRemarks });
              }}
              placeholder="Follow-up task, spare part needed, or maintenance remark..."
              className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
            />
          )}
        </div>
      </div>

      {/* Photo Evidence Upload & Per-Photo Captions */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
            <ImageIcon className="w-3.5 h-3.5 text-[#64748B] dark:text-[#94A3B8]" />
            <span>Photo Evidence ({entry.photos.length})</span>
            {entry.requirePhoto && entry.photos.length === 0 && (
              <span className="text-[#DC2626] dark:text-[#F87171] font-normal">
                · Required before approval submission
              </span>
            )}
          </div>

          {!isLocked && (
            <label className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1D4ED8] dark:text-[#93C5FD] bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 hover:bg-[#DBEAFE] border border-[#BFDBFE] dark:border-[#1D4ED8] rounded-md cursor-pointer transition-colors whitespace-nowrap shrink-0">
              <Upload className="w-3.5 h-3.5" />
              <span>{uploading ? 'Uploading...' : 'Upload Photo(s)'}</span>
              <input
                type="file"
                accept={ACCEPTED_IMAGE_ACCEPT}
                multiple
                disabled={uploading}
                onChange={(e) => {
                  handleFileUpload(e.target.files);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>
          )}
        </div>

        {entry.photos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {entry.photos.map((photo) => {
              const linkedPin = photo.pinId
                ? visualPins.find((vp) => vp.id === photo.pinId)
                : null;
              return (
                <PhotoCaptionCard
                  key={photo.id}
                  photo={photo}
                  pinBadge={linkedPin ? `#${linkedPin.pinNumber} ${linkedPin.label}` : null}
                  isLocked={isLocked}
                  onSaveCaption={(caption) => handleUpdateCaption(photo.id, caption)}
                  onDelete={() => handleDeletePhoto(photo.id)}
                  onPreview={() => onOpenLightbox(photo)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Per-Asset Comments & Edit History */}
      <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-medium text-[#475569] dark:text-[#94A3B8] flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Asset Comments ({entryComments.length})</span>
          </div>

          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="no-print inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] dark:text-[#94A3B8] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA]"
          >
            <History className="w-3.5 h-3.5" />
            <span>Edit History ({entryHistory.length})</span>
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {entryComments.length > 0 && (
          <div className="space-y-1.5">
            {entryComments.map((cmt) => (
              <div
                key={cmt.id}
                className="px-3 py-2 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded text-xs flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    {cmt.authorName}
                  </span>{' '}
                  <span className="font-mono text-[10px] text-[#1D4ED8] dark:text-[#60A5FA]">
                    ({cmt.authorRoles.map((r) => formatRoleLabel(r)).join(', ')})
                  </span>
                  : <span className="text-[#334155] dark:text-[#CBD5E1]">{cmt.body}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-[10px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                    {formatAuditTimestamp(cmt.createdAt)}
                  </span>
                  {(isAdmin || cmt.authorId === currentUser.id) && (
                    <button
                      type="button"
                      onClick={() => onDeleteComment(cmt.id)}
                      className="no-print text-[#94A3B8] hover:text-[#DC2626]"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onPostComment(entryCommentText, () => setEntryCommentText(''));
          }}
          className="no-print flex items-center gap-2"
        >
          <input
            type="text"
            value={entryCommentText}
            onChange={(e) => setEntryCommentText(e.target.value)}
            placeholder={`Add approver or team comment on ${entry.itemCode}...`}
            className="flex-1 px-3 py-1.5 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#E2E8F0] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
          />
          <button
            type="submit"
            disabled={!entryCommentText.trim()}
            className="px-3 py-1.5 text-xs font-medium text-[#1D4ED8] dark:text-[#93C5FD] bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 border border-[#BFDBFE] dark:border-[#1E40AF] disabled:opacity-45 rounded-md shrink-0"
          >
            Add Comment
          </button>
        </form>

        {showHistory && (
          <div className="no-print p-3 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-md space-y-1.5 max-h-48 overflow-y-auto">
            {entryHistory.length === 0 ? (
              <div className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                No edits logged on this asset entry yet.
              </div>
            ) : (
              entryHistory.map((h) => (
                <div
                  key={h.id}
                  className="text-xs flex flex-wrap items-center justify-between gap-2 py-1 border-b last:border-b-0 border-[#E2E8F0] dark:border-[#1E293B]"
                >
                  <div className="text-[#334155] dark:text-[#CBD5E1]">
                    <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                      {h.actorName}
                    </span>{' '}
                    — {h.summary}
                  </div>
                  <div className="inline-flex items-center gap-1 font-mono text-[10px] text-[#64748B] dark:text-[#94A3B8] tabular-nums shrink-0">
                    <Clock className="w-3 h-3" />
                    <span>{formatAuditTimestamp(h.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface PhotoCaptionCardProps {
  photo: InspectionPhoto;
  pinBadge?: string | null;
  isLocked: boolean;
  onSaveCaption: (caption: string) => void;
  onDelete: () => void;
  onPreview: () => void;
}

function PhotoCaptionCard({
  photo,
  pinBadge,
  isLocked,
  onSaveCaption,
  onDelete,
  onPreview,
}: PhotoCaptionCardProps) {
  const [caption, setCaption] = useState(photo.caption);

  useEffect(() => {
    setCaption(photo.caption);
  }, [photo.caption]);

  return (
    <div className="border border-[#E2E8F0] dark:border-[#334155] rounded-md overflow-hidden bg-[#F8FAFC] dark:bg-[#0F172A] flex flex-col">
      <div className="relative h-36 bg-[#E2E8F0] dark:bg-[#1E293B] group">
        <img
          src={photo.fileUrl}
          alt={caption || photo.fileName}
          referrerPolicy="no-referrer"
          onClick={onPreview}
          className="w-full h-full object-cover cursor-pointer"
        />
        {pinBadge && (
          <span className="absolute top-2 left-2 px-2 py-0.5 bg-[#0F172A]/85 text-white font-mono text-[10px] rounded shadow-xs max-w-[75%] truncate">
            {pinBadge}
          </span>
        )}
        {!isLocked && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete photo"
            className="no-print absolute top-2 right-2 p-1.5 bg-white/90 dark:bg-[#111827]/90 hover:bg-[#FEF2F2] text-[#475569] dark:text-[#CBD5E1] hover:text-[#DC2626] rounded shadow-xs border border-[#E2E8F0] dark:border-[#334155]"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="p-2.5 bg-white dark:bg-[#111827] flex-1">
        {isLocked ? (
          <p className="text-xs text-[#334155] dark:text-[#CBD5E1]">
            {caption || <span className="text-[#94A3B8]">No caption provided</span>}
          </p>
        ) : (
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={() => {
              if (caption !== photo.caption) onSaveCaption(caption);
            }}
            placeholder="Add caption for this photo..."
            className="w-full px-2 py-1 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#E2E8F0] dark:border-[#334155] rounded focus:outline-none focus:border-[#1D4ED8]"
          />
        )}
      </div>
    </div>
  );
}

function PhotoLightbox({
  photo,
  onClose,
}: {
  photo: InspectionPhoto;
  onClose: () => void;
}) {
  return (
    <div
      className="no-print fixed inset-0 z-[60] bg-[#0F172A]/80 dark:bg-black/85 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#111827] rounded-lg max-w-4xl w-full overflow-hidden border border-[#E2E8F0] dark:border-[#334155]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between">
          <div className="text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
            {photo.fileName}
            {photo.caption && (
              <>
                <span aria-hidden="true" className="text-[#94A3B8]"> · </span>
                <span className="text-[#475569] dark:text-[#94A3B8]">{photo.caption}</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="bg-[#0F172A] flex items-center justify-center max-h-[75vh]">
          <img
            src={photo.fileUrl}
            alt={photo.caption || photo.fileName}
            referrerPolicy="no-referrer"
            className="max-h-[75vh] w-auto object-contain"
          />
        </div>
      </div>
    </div>
  );
}
