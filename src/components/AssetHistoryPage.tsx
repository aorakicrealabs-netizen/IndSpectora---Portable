import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Camera,
  Check,
  Columns2,
  Columns3,
  Columns4,
  ExternalLink,
  History,
  Image as ImageIcon,
  MapPin,
  Minus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type {
  ConditionStatus,
  FacilityArea,
  InspectionEntry,
  InspectionPhoto,
  InspectionReport,
  LibraryItem,
} from '../types.ts';
import {
  formatConditionLabel,
  formatCycleLabel,
  formatDateTime,
  formatReportStatusLabel,
  formatShortDate,
} from '../utils/export.ts';

interface AssetHistoryPageProps {
  libraryItems: LibraryItem[];
  facilityAreas: FacilityArea[];
  reports: InspectionReport[];
  initialAssetId: string | null;
  onClearInitialAsset: () => void;
  onOpenReport: (reportId: string) => void;
}

interface AssetSessionItem {
  report: InspectionReport;
  entry: InspectionEntry;
  timestamp: string;
  allPhotos: (InspectionPhoto & { pinLabel?: string })[];
}

function getConditionToneClass(condition: ConditionStatus): string {
  switch (condition) {
    case 'good':
    case 'fair':
      return 'text-[#16A34A] dark:text-[#4ADE80]';
    case 'needs_attention':
      return 'text-[#D97706] dark:text-[#FBBF24]';
    case 'critical':
      return 'text-[#DC2626] dark:text-[#F87171]';
    default:
      return 'text-[#64748B] dark:text-[#94A3B8]';
  }
}

function getConditionTintClass(condition: ConditionStatus): string {
  switch (condition) {
    case 'good':
    case 'fair':
      return 'bg-[#F0FDF4] dark:bg-[#14532D]/30 border-[#BBF7D0] dark:border-[#166534] text-[#15803D] dark:text-[#4ADE80]';
    case 'needs_attention':
      return 'bg-[#FFFBEB] dark:bg-[#78350F]/30 border-[#FDE68A] dark:border-[#B45309] text-[#B45309] dark:text-[#FBBF24]';
    case 'critical':
      return 'bg-[#FEF2F2] dark:bg-[#7F1D1D]/30 border-[#FECACA] dark:border-[#991B1B] text-[#B91C1C] dark:text-[#FCA5A5]';
    default:
      return 'bg-[#F8FAFC] dark:bg-[#0F172A] border-[#E2E8F0] dark:border-[#334155] text-[#64748B] dark:text-[#94A3B8]';
  }
}

export function AssetHistoryPage({
  libraryItems,
  facilityAreas,
  reports,
  initialAssetId,
  onClearInitialAsset,
  onOpenReport,
}: AssetHistoryPageProps) {
  const [search, setSearch] = useState('');
  const [facilityFilter, setFacilityFilter] = useState<string>('all');
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'timeline' | 'compare'>('timeline');
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [lightboxPhoto, setLightboxPhoto] = useState<{
    photo: InspectionPhoto;
    subtitle: string;
  } | null>(null);

  // Count how many sessions exist per asset for quick prioritization & badge counters
  const sessionCountByAssetId = useMemo(() => {
    const counts = new Map<string, number>();
    const codeToAssetId = new Map(libraryItems.map((i) => [i.code, i.id]));
    for (const rep of reports) {
      for (const ent of rep.entries) {
        const assetId = ent.libraryItemId || codeToAssetId.get(ent.itemCode);
        if (!assetId) continue;
        counts.set(assetId, (counts.get(assetId) ?? 0) + 1);
      }
    }
    return counts;
  }, [libraryItems, reports]);

  // Honor initialAssetId deep-linked from Asset Library
  useEffect(() => {
    if (!initialAssetId) return;
    if (libraryItems.some((i) => i.id === initialAssetId)) {
      setSelectedAssetId(initialAssetId);
      setViewMode('timeline');
      setSelectedSessionIds([]);
    }
    onClearInitialAsset();
  }, [initialAssetId, libraryItems, onClearInitialAsset]);

  // Filter asset catalog
  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return libraryItems.filter((item) => {
      if (facilityFilter !== 'all') {
        if (facilityFilter === 'unassigned') {
          if (item.facilityAreaId) return false;
        } else if (item.facilityAreaId !== facilityFilter) {
          return false;
        }
      }
      if (!q) return true;
      return (
        item.code.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.facilityAreaName || '').toLowerCase().includes(q)
      );
    });
  }, [libraryItems, search, facilityFilter]);

  // Default to the first asset with inspection history, or first filtered asset
  useEffect(() => {
    if (selectedAssetId && libraryItems.some((i) => i.id === selectedAssetId)) return;
    if (filteredAssets.length === 0) {
      setSelectedAssetId('');
      return;
    }
    const withHistory = filteredAssets.find((i) => (sessionCountByAssetId.get(i.id) ?? 0) > 0);
    setSelectedAssetId((withHistory ?? filteredAssets[0]).id);
  }, [filteredAssets, libraryItems, selectedAssetId, sessionCountByAssetId]);

  const activeAsset = useMemo(
    () => libraryItems.find((i) => i.id === selectedAssetId) ?? null,
    [libraryItems, selectedAssetId]
  );

  // All chronological inspection sessions (newest first) for activeAsset
  const sessions = useMemo((): AssetSessionItem[] => {
    if (!activeAsset) return [];
    const list: AssetSessionItem[] = [];
    for (const rep of reports) {
      for (const ent of rep.entries) {
        if (ent.libraryItemId === activeAsset.id || ent.itemCode === activeAsset.code) {
          const pinLabelMap = new Map<string, string>();
          for (const pin of ent.visualPins ?? []) {
            pinLabelMap.set(pin.id, `Pin #${pin.pinNumber} · ${pin.label}`);
          }
          const combinedPhotos: (InspectionPhoto & { pinLabel?: string })[] = [];
          const seenPhotoIds = new Set<string>();
          for (const p of ent.photos ?? []) {
            if (seenPhotoIds.has(p.id)) continue;
            seenPhotoIds.add(p.id);
            combinedPhotos.push({
              ...p,
              pinLabel: p.pinId ? pinLabelMap.get(p.pinId) : undefined,
            });
          }
          for (const pin of ent.visualPins ?? []) {
            for (const p of pin.photos ?? []) {
              if (seenPhotoIds.has(p.id)) continue;
              seenPhotoIds.add(p.id);
              combinedPhotos.push({
                ...p,
                pinLabel: `Pin #${pin.pinNumber} · ${pin.label}`,
              });
            }
          }
          list.push({
            report: rep,
            entry: ent,
            timestamp: rep.submittedAt || rep.updatedAt || rep.createdAt,
            allPhotos: combinedPhotos,
          });
        }
      }
    }
    list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return list;
  }, [activeAsset, reports]);

  // Reset compare selection when switching assets
  function selectAsset(id: string) {
    setSelectedAssetId(id);
    setSelectedSessionIds([]);
    setViewMode('timeline');
  }

  // Keep selectedSessionIds clean if reports refresh
  useEffect(() => {
    const validIds = new Set(sessions.map((s) => s.report.id));
    setSelectedSessionIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [sessions]);

  const totalPhotosCount = useMemo(
    () => sessions.reduce((acc, s) => acc + s.allPhotos.length, 0),
    [sessions]
  );

  // Numeric parameter trend statistics across all sessions (ordered newest-first)
  const numericParamStats = useMemo(() => {
    if (sessions.length === 0) return [];
    const bucket = new Map<
      string,
      { label: string; unit: string; values: number[]; timestamps: string[] }
    >();
    for (const { entry, timestamp } of sessions) {
      for (const pv of entry.parameterValues ?? []) {
        if (pv.paramType !== 'number') continue;
        const parsed = Number(pv.valueText);
        if (pv.valueText.trim() === '' || Number.isNaN(parsed)) continue;
        const existing = bucket.get(pv.label);
        if (!existing) {
          bucket.set(pv.label, {
            label: pv.label,
            unit: pv.unit,
            values: [parsed],
            timestamps: [timestamp],
          });
        } else {
          existing.values.push(parsed);
          existing.timestamps.push(timestamp);
        }
      }
    }
    return Array.from(bucket.values()).map((item) => {
      const latest = item.values[0];
      const previous = item.values.length > 1 ? item.values[1] : null;
      const sum = item.values.reduce((acc, v) => acc + v, 0);
      const delta = previous !== null ? Math.round((latest - previous) * 100) / 100 : null;
      return {
        label: item.label,
        unit: item.unit,
        count: item.values.length,
        latest,
        previous,
        delta,
        avg: Math.round((sum / item.values.length) * 100) / 100,
        min: Math.min(...item.values),
        max: Math.max(...item.values),
      };
    });
  }, [sessions]);

  function toggleCompareSession(reportId: string) {
    setSelectedSessionIds((prev) => {
      if (prev.includes(reportId)) {
        const next = prev.filter((id) => id !== reportId);
        if (next.length < 2 && viewMode === 'compare') {
          setViewMode('timeline');
        }
        return next;
      }
      if (prev.length >= 4) return prev;
      return [...prev, reportId];
    });
  }

  function applyQuickCompare(count: 2 | 3 | 4) {
    if (sessions.length < 2) return;
    const picked = sessions.slice(0, Math.min(count, sessions.length)).map((s) => s.report.id);
    setSelectedSessionIds(picked);
    if (picked.length >= 2) {
      setViewMode('compare');
    }
  }

  // Chronological oldest -> newest for side-by-side comparison columns so Baseline is on the left
  const compareSessions = useMemo(() => {
    const idSet = new Set(selectedSessionIds);
    return sessions
      .filter((s) => idSet.has(s.report.id))
      .slice(0, 4)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [sessions, selectedSessionIds]);

  // Unified list of custom parameters across compared sessions
  const compareParamRows = useMemo(() => {
    const seen = new Map<
      string,
      { key: string; label: string; paramType: string; unit: string }
    >();
    if (activeAsset) {
      for (const p of activeAsset.parameters ?? []) {
        seen.set(p.label, {
          key: p.label,
          label: p.label,
          paramType: p.paramType,
          unit: p.unit,
        });
      }
    }
    for (const s of compareSessions) {
      for (const pv of s.entry.parameterValues ?? []) {
        if (!seen.has(pv.label)) {
          seen.set(pv.label, {
            key: pv.label,
            label: pv.label,
            paramType: pv.paramType,
            unit: pv.unit,
          });
        }
      }
    }
    return Array.from(seen.values());
  }, [activeAsset, compareSessions]);

  // Unified list of visual pins across compared sessions
  const comparePinRows = useMemo(() => {
    const map = new Map<number, { pinNumber: number; label: string }>();
    if (activeAsset) {
      for (const pin of activeAsset.pins ?? []) {
        map.set(pin.pinNumber, { pinNumber: pin.pinNumber, label: pin.label });
      }
    }
    for (const s of compareSessions) {
      for (const vp of s.entry.visualPins ?? []) {
        if (!map.has(vp.pinNumber)) {
          map.set(vp.pinNumber, { pinNumber: vp.pinNumber, label: vp.label });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.pinNumber - b.pinNumber);
  }, [activeAsset, compareSessions]);

  const compareGridColsClass =
    compareSessions.length === 2
      ? 'grid-cols-2'
      : compareSessions.length === 3
      ? 'grid-cols-3'
      : 'grid-cols-4';

  const compareMinWidthClass =
    compareSessions.length <= 2
      ? 'min-w-[540px] md:min-w-0'
      : compareSessions.length === 3
      ? 'min-w-[760px] lg:min-w-0'
      : 'min-w-[960px] xl:min-w-0';

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Asset Filter & Picker Header */}
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl lg:rounded-lg p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 border border-[#BFDBFE] dark:border-[#1E40AF] flex items-center justify-center shrink-0">
              <History className="w-4 h-4 text-[#1D4ED8] dark:text-[#60A5FA]" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-sm sm:text-base font-bold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                Asset Inspection History &amp; Session Compare
              </h2>
              <p className="text-[11px] sm:text-xs text-[#64748B] dark:text-[#94A3B8] truncate">
                Inspect cross-audit findings, photos, and compare 2 to 4 custom sessions side by side
              </p>
            </div>
          </div>

          <span className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
            {filteredAssets.length} asset{filteredAssets.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <div className="sm:col-span-4 relative">
            <Search className="w-4 h-4 text-[#64748B] dark:text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter assets by code or title..."
              className="w-full min-h-[44px] sm:min-h-[38px] pl-9 pr-3 py-1.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-lg sm:rounded-md focus:outline-none focus:border-[#1D4ED8]"
            />
          </div>

          <div className="sm:col-span-3">
            <select
              value={facilityFilter}
              onChange={(e) => setFacilityFilter(e.target.value)}
              className="w-full min-h-[44px] sm:min-h-[38px] px-3 py-1.5 text-xs font-medium bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-lg sm:rounded-md text-[#334155] dark:text-[#CBD5E1] focus:outline-none focus:border-[#1D4ED8]"
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

          <div className="sm:col-span-5">
            <select
              value={activeAsset?.id ?? ''}
              onChange={(e) => selectAsset(e.target.value)}
              disabled={filteredAssets.length === 0}
              className="w-full min-h-[44px] sm:min-h-[38px] px-3 py-1.5 text-xs sm:text-sm font-semibold bg-white dark:bg-[#0F172A] border border-[#1D4ED8]/40 dark:border-[#3B82F6]/40 rounded-lg sm:rounded-md text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:border-[#1D4ED8]"
            >
              {filteredAssets.length === 0 ? (
                <option value="">No matching assets</option>
              ) : (
                filteredAssets.map((item) => {
                  const cnt = sessionCountByAssetId.get(item.id) ?? 0;
                  return (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.title} ({cnt} session{cnt === 1 ? '' : 's'})
                    </option>
                  );
                })
              )}
            </select>
          </div>
        </div>

        {/* Horizontal Quick Asset Chips for 1-Tap Switching */}
        {filteredAssets.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {filteredAssets.slice(0, 12).map((item) => {
              const cnt = sessionCountByAssetId.get(item.id) ?? 0;
              const active = activeAsset?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectAsset(item.id)}
                  className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 text-[#1D4ED8] dark:text-[#93C5FD] border-[#1D4ED8] dark:border-[#3B82F6] font-semibold'
                      : 'bg-[#F8FAFC] dark:bg-[#0F172A] text-[#475569] dark:text-[#94A3B8] border-[#E2E8F0] dark:border-[#334155] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                  }`}
                >
                  <span className="font-mono text-[11px]">{item.code}</span>
                  <span className="truncate max-w-[140px]">{item.title}</span>
                  <span className="font-mono text-[10px] opacity-75 tabular-nums">({cnt})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!activeAsset ? (
        <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl lg:rounded-lg p-10 text-center text-sm text-[#64748B] dark:text-[#94A3B8]">
          No assets found in the library yet. Add assets in Asset Library or adjust filters above.
        </div>
      ) : (
        <>
          {/* Selected Asset Summary Card + KPI Strip */}
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl lg:rounded-lg p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono font-bold text-[#1D4ED8] dark:text-[#60A5FA]">
                    {activeAsset.code}
                  </span>
                  <span className="text-[#64748B] dark:text-[#94A3B8]">·</span>
                  <span className="text-[#475569] dark:text-[#CBD5E1] font-medium">
                    {activeAsset.category}
                  </span>
                  {activeAsset.facilityAreaName && (
                    <>
                      <span className="text-[#64748B] dark:text-[#94A3B8]">·</span>
                      <span className="inline-flex items-center gap-1 text-[#475569] dark:text-[#94A3B8]">
                        <Building2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{activeAsset.facilityAreaName}</span>
                      </span>
                    </>
                  )}
                </div>
                <h3 className="font-display text-lg font-bold text-[#0F172A] dark:text-[#F8FAFC] break-words">
                  {activeAsset.title}
                </h3>
                {activeAsset.criteria && (
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                    Acceptance Criteria: {activeAsset.criteria}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs shrink-0">
                <span
                  className={`font-semibold capitalize ${
                    activeAsset.criticality === 'high'
                      ? 'text-[#DC2626] dark:text-[#F87171]'
                      : activeAsset.criticality === 'medium'
                      ? 'text-[#D97706] dark:text-[#FBBF24]'
                      : 'text-[#475569] dark:text-[#94A3B8]'
                  }`}
                >
                  {activeAsset.criticality} Criticality
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg">
                <div className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                  Inspection Sessions
                </div>
                <div className="font-mono text-xl font-bold text-[#0F172A] dark:text-[#F8FAFC] mt-0.5 tabular-nums">
                  {sessions.length}
                </div>
              </div>
              <div className="p-3 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg">
                <div className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                  Latest Condition
                </div>
                <div
                  className={`text-sm font-bold mt-1 ${
                    sessions[0]
                      ? getConditionToneClass(sessions[0].entry.condition)
                      : 'text-[#64748B] dark:text-[#94A3B8]'
                  }`}
                >
                  {sessions[0]
                    ? formatConditionLabel(sessions[0].entry.condition)
                    : 'Not Yet Inspected'}
                </div>
              </div>
              <div className="p-3 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg">
                <div className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                  Evidence Photos
                </div>
                <div className="font-mono text-xl font-bold text-[#0F172A] dark:text-[#F8FAFC] mt-0.5 tabular-nums">
                  {totalPhotosCount}
                </div>
              </div>
              <div className="p-3 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg">
                <div className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                  Pins &amp; Parameters
                </div>
                <div className="font-mono text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC] mt-1 tabular-nums">
                  {activeAsset.pins?.length ?? 0} pins · {activeAsset.parameters?.length ?? 0} params
                </div>
              </div>
            </div>

            {/* Numeric Parameter Trends Across Sessions */}
            {numericParamStats.length > 0 && (
              <div className="pt-2 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                  Numeric Parameter Trends Across Audits
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {numericParamStats.map((stat) => (
                    <div
                      key={stat.label}
                      className="p-3 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-lg flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                          {stat.label}
                        </div>
                        <div className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5 tabular-nums">
                          Avg {stat.avg} · Min {stat.min} · Max {stat.max} ({stat.count})
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-sm font-bold text-[#1D4ED8] dark:text-[#60A5FA] tabular-nums">
                          {stat.latest}
                          {stat.unit ? ` ${stat.unit}` : ''}
                        </div>
                        {stat.delta !== null && (
                          <div
                            className={`inline-flex items-center gap-0.5 font-mono text-[10px] font-semibold tabular-nums ${
                              stat.delta > 0
                                ? 'text-[#D97706] dark:text-[#FBBF24]'
                                : stat.delta < 0
                                ? 'text-[#16A34A] dark:text-[#4ADE80]'
                                : 'text-[#64748B] dark:text-[#94A3B8]'
                            }`}
                          >
                            {stat.delta > 0 ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : stat.delta < 0 ? (
                              <ArrowDownRight className="w-3 h-3" />
                            ) : (
                              <Minus className="w-3 h-3" />
                            )}
                            <span>
                              {stat.delta > 0 ? `+${stat.delta}` : stat.delta} vs prev
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Compare & View Mode Control Bar */}
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl lg:rounded-lg p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] dark:bg-[#0F172A] rounded-lg border border-[#E2E8F0] dark:border-[#1E293B]">
                <button
                  type="button"
                  onClick={() => setViewMode('timeline')}
                  className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    viewMode === 'timeline'
                      ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                      : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                  }`}
                >
                  Timeline ({sessions.length})
                </button>
                <button
                  type="button"
                  disabled={selectedSessionIds.length < 2}
                  onClick={() => setViewMode('compare')}
                  className={`inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 ${
                    viewMode === 'compare'
                      ? 'bg-white dark:bg-[#1E293B] text-[#1D4ED8] dark:text-[#93C5FD] shadow-xs'
                      : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                  }`}
                >
                  <Columns2 className="w-3.5 h-3.5" />
                  <span>Side-by-Side Compare ({selectedSessionIds.length}/4)</span>
                </button>
              </div>

              {sessions.length >= 2 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyQuickCompare(2)}
                    className="inline-flex items-center gap-1 min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md whitespace-nowrap"
                  >
                    <Columns2 className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-[#60A5FA]" />
                    <span>Latest 2</span>
                  </button>
                  {sessions.length >= 3 && (
                    <button
                      type="button"
                      onClick={() => applyQuickCompare(3)}
                      className="inline-flex items-center gap-1 min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md whitespace-nowrap"
                    >
                      <Columns3 className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-[#60A5FA]" />
                      <span>Latest 3</span>
                    </button>
                  )}
                  {sessions.length >= 4 && (
                    <button
                      type="button"
                      onClick={() => applyQuickCompare(4)}
                      className="inline-flex items-center gap-1 min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md whitespace-nowrap"
                    >
                      <Columns4 className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-[#60A5FA]" />
                      <span>Latest 4</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs">
              {selectedSessionIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSessionIds([]);
                    setViewMode('timeline');
                  }}
                  className="min-h-[38px] px-2.5 py-1 text-xs font-medium text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]"
                >
                  Clear ({selectedSessionIds.length})
                </button>
              )}
              {selectedSessionIds.length === 1 && (
                <span className="text-[#D97706] dark:text-[#FBBF24] font-medium">
                  Pick 1–3 more sessions to compare
                </span>
              )}
              {viewMode === 'timeline' && selectedSessionIds.length >= 2 && (
                <button
                  type="button"
                  onClick={() => setViewMode('compare')}
                  className="min-h-[40px] px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md whitespace-nowrap"
                >
                  Compare {selectedSessionIds.length} Selected Sessions
                </button>
              )}
            </div>
          </div>

          {sessions.length === 0 ? (
            <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl lg:rounded-lg p-10 text-center space-y-2">
              <div className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                No Inspection Sessions Recorded Yet
              </div>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] max-w-md mx-auto">
                Include {activeAsset.code} in an inspection report under Inspections &amp; Audits to
                track condition notes, photos, parameter readings, and side-by-side comparisons here.
              </p>
            </div>
          ) : viewMode === 'compare' && compareSessions.length >= 2 ? (
            /* Side-by-Side Comparison View (2 to 4 Sessions) */
            <div className="space-y-4">
              {/* Session Selector Ribbon Inside Compare Mode */}
              <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl lg:rounded-lg p-3.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    Selected Sessions for Side-by-Side Comparison ({compareSessions.length} of 4 max)
                  </span>
                  <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                    Sorted chronologically left to right (earliest is baseline for numeric deltas)
                  </span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {sessions.map((s) => {
                    const checked = selectedSessionIds.includes(s.report.id);
                    const disabled = !checked && selectedSessionIds.length >= 4;
                    return (
                      <button
                        key={s.report.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleCompareSession(s.report.id)}
                        className={`inline-flex items-center gap-2 min-h-[38px] px-3 py-1.5 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 ${
                          checked
                            ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 text-[#1D4ED8] dark:text-[#93C5FD] border-[#1D4ED8] dark:border-[#3B82F6] font-semibold'
                            : 'bg-[#F8FAFC] dark:bg-[#0F172A] text-[#475569] dark:text-[#94A3B8] border-[#CBD5E1] dark:border-[#334155]'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center border ${
                            checked
                              ? 'bg-[#1D4ED8] border-[#1D4ED8] text-white'
                              : 'border-[#94A3B8]'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" />}
                        </span>
                        <span className="font-mono">{s.report.reportNumber}</span>
                        <span className="text-[11px] opacity-80">
                          {formatShortDate(s.timestamp)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Synchronized Multi-Column Matrix */}
              <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl lg:rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <div className={`${compareMinWidthClass} divide-y divide-[#E2E8F0] dark:divide-[#1E293B]`}>
                    {/* 1. Session Column Headers */}
                    <div className={`grid ${compareGridColsClass} divide-x divide-[#E2E8F0] dark:divide-[#1E293B] bg-[#F8FAFC] dark:bg-[#0F172A]`}>
                      {compareSessions.map((s, idx) => (
                        <div key={s.report.id} className="p-3.5 sm:p-4 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                              {idx === 0 ? 'Session 1 · Baseline' : `Session ${idx + 1}`}
                            </span>
                            {compareSessions.length > 2 && (
                              <button
                                type="button"
                                onClick={() => toggleCompareSession(s.report.id)}
                                title="Remove from comparison"
                                className="p-1 text-[#64748B] hover:text-[#DC2626] dark:text-[#94A3B8] dark:hover:text-[#F87171] rounded"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenReport(s.report.id)}
                              className="inline-flex items-center gap-1 font-mono text-xs font-bold text-[#1D4ED8] dark:text-[#60A5FA] hover:underline"
                            >
                              <span>{s.report.reportNumber}</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                            <span className="text-[11px] font-medium text-[#475569] dark:text-[#CBD5E1]">
                              {formatCycleLabel(s.report.cycleType, true)}
                            </span>
                          </div>

                          <div className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] line-clamp-2">
                            {s.report.title}
                          </div>

                          <div className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                            {formatDateTime(s.timestamp)}
                          </div>
                          <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                            Executor:{' '}
                            <span className="font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                              {s.report.inspectorName}
                            </span>
                            {' · '}
                            {formatReportStatusLabel(s.report.status)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 2. Condition & Inspector Observations */}
                    <div className={`grid ${compareGridColsClass} divide-x divide-[#E2E8F0] dark:divide-[#1E293B]`}>
                      {compareSessions.map((s) => (
                        <div key={s.report.id} className="p-3.5 sm:p-4 space-y-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                            Asset Condition &amp; Notes
                          </div>
                          <div
                            className={`inline-block px-2.5 py-1 text-xs font-semibold rounded border ${getConditionTintClass(
                              s.entry.condition
                            )}`}
                          >
                            {formatConditionLabel(s.entry.condition)}
                          </div>
                          <p className="text-xs text-[#334155] dark:text-[#CBD5E1] leading-relaxed">
                            {s.entry.conditionNote || 'No condition notes logged.'}
                          </p>
                          {s.entry.itemRemarks && (
                            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] pt-1 border-t border-[#F1F5F9] dark:border-[#1E293B]">
                              Remarks: {s.entry.itemRemarks}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* 3. Custom Inspection Parameters Matrix (Aligned Row-by-Row with Baseline Delta) */}
                    {compareParamRows.length > 0 && (
                      <div>
                        <div className="px-4 py-2 bg-[#F8FAFC] dark:bg-[#0F172A] border-b border-[#E2E8F0] dark:border-[#1E293B] text-[11px] font-semibold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8] flex items-center gap-1.5">
                          <SlidersHorizontal className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-[#60A5FA]" />
                          <span>Custom Parameters Comparison (Delta vs Baseline Session 1)</span>
                        </div>
                        <div className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B]">
                          {compareParamRows.map((param) => {
                            const baselineValObj = compareSessions[0]?.entry.parameterValues.find(
                              (pv) => pv.label === param.label
                            );
                            const baselineNum =
                              param.paramType === 'number' &&
                              baselineValObj?.valueText &&
                              !Number.isNaN(Number(baselineValObj.valueText))
                                ? Number(baselineValObj.valueText)
                                : null;

                            return (
                              <div
                                key={param.key}
                                className={`grid ${compareGridColsClass} divide-x divide-[#E2E8F0] dark:divide-[#1E293B]`}
                              >
                                {compareSessions.map((s, idx) => {
                                  const match = s.entry.parameterValues.find(
                                    (pv) => pv.label === param.label
                                  );
                                  const rawVal = match?.valueText ?? '';
                                  const numVal =
                                    param.paramType === 'number' &&
                                    rawVal.trim() !== '' &&
                                    !Number.isNaN(Number(rawVal))
                                      ? Number(rawVal)
                                      : null;
                                  const delta =
                                    idx > 0 && baselineNum !== null && numVal !== null
                                      ? Math.round((numVal - baselineNum) * 100) / 100
                                      : null;

                                  return (
                                    <div key={s.report.id} className="p-3 sm:px-4 space-y-1">
                                      <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                                        {param.label}
                                      </div>
                                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <span className="font-mono text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
                                          {rawVal ? (
                                            <>
                                              {rawVal}
                                              {param.paramType === 'number' && param.unit
                                                ? ` ${param.unit}`
                                                : ''}
                                            </>
                                          ) : (
                                            <span className="text-[#94A3B8] font-normal">—</span>
                                          )}
                                        </span>
                                        {delta !== null && (
                                          <span
                                            className={`font-mono text-[11px] font-semibold tabular-nums ${
                                              delta > 0
                                                ? 'text-[#D97706] dark:text-[#FBBF24]'
                                                : delta < 0
                                                ? 'text-[#16A34A] dark:text-[#4ADE80]'
                                                : 'text-[#64748B] dark:text-[#94A3B8]'
                                            }`}
                                          >
                                            {delta > 0 ? `+${delta}` : delta}
                                            {param.unit ? ` ${param.unit}` : ''}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 4. Visual Pin Findings Matrix */}
                    {comparePinRows.length > 0 && (
                      <div>
                        <div className="px-4 py-2 bg-[#F8FAFC] dark:bg-[#0F172A] border-b border-[#E2E8F0] dark:border-[#1E293B] text-[11px] font-semibold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8] flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-[#60A5FA]" />
                          <span>Visual Inspection Pins Comparison</span>
                        </div>
                        <div className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B]">
                          {comparePinRows.map((pinMeta) => (
                            <div
                              key={pinMeta.pinNumber}
                              className={`grid ${compareGridColsClass} divide-x divide-[#E2E8F0] dark:divide-[#1E293B]`}
                            >
                              {compareSessions.map((s) => {
                                const vp = s.entry.visualPins.find(
                                  (p) => p.pinNumber === pinMeta.pinNumber
                                );
                                const cond = vp?.result?.condition ?? 'na';
                                const notes = vp?.result?.notes ?? '';
                                return (
                                  <div key={s.report.id} className="p-3 sm:px-4 space-y-1">
                                    <div className="flex items-center justify-between gap-2 text-[11px]">
                                      <span className="font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                                        #{pinMeta.pinNumber} {pinMeta.label}
                                      </span>
                                      <span
                                        className={`font-semibold shrink-0 ${getConditionToneClass(
                                          cond
                                        )}`}
                                      >
                                        {formatConditionLabel(cond)}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                                      {notes || 'No pin findings.'}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 5. Side-by-Side Evidence Photos Comparison */}
                    <div>
                      <div className="px-4 py-2 bg-[#F8FAFC] dark:bg-[#0F172A] border-b border-[#E2E8F0] dark:border-[#1E293B] text-[11px] font-semibold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8] flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-[#60A5FA]" />
                        <span>Inspection Evidence Photos Side-by-Side</span>
                      </div>
                      <div
                        className={`grid ${compareGridColsClass} divide-x divide-[#E2E8F0] dark:divide-[#1E293B]`}
                      >
                        {compareSessions.map((s) => (
                          <div key={s.report.id} className="p-3.5 sm:p-4 space-y-2.5">
                            <div className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                              {s.allPhotos.length} photo{s.allPhotos.length === 1 ? '' : 's'}
                            </div>
                            {s.allPhotos.length === 0 ? (
                              <div className="py-6 px-3 bg-[#F8FAFC] dark:bg-[#0F172A] border border-dashed border-[#CBD5E1] dark:border-[#334155] rounded-lg text-center text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                                No photos captured in this session
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {s.allPhotos.map((ph) => (
                                  <button
                                    key={ph.id}
                                    type="button"
                                    onClick={() =>
                                      setLightboxPhoto({
                                        photo: ph,
                                        subtitle: `${s.report.reportNumber} · ${formatDateTime(
                                          s.timestamp
                                        )}${ph.pinLabel ? ` · ${ph.pinLabel}` : ''}`,
                                      })
                                    }
                                    className="group text-left bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] hover:border-[#1D4ED8] dark:hover:border-[#60A5FA] rounded-lg overflow-hidden transition-colors"
                                  >
                                    <div className="aspect-[4/3] bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden">
                                      <img
                                        src={ph.fileUrl}
                                        alt={ph.caption || ph.fileName}
                                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-150"
                                      />
                                    </div>
                                    <div className="p-1.5 text-[10px] text-[#475569] dark:text-[#CBD5E1] truncate">
                                      {ph.pinLabel || ph.caption || ph.fileName}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Chronological Inspection Session Timeline */
            <div className="space-y-3">
              {sessions.map((s) => {
                const isSelectedForCompare = selectedSessionIds.includes(s.report.id);
                const disableSelect = !isSelectedForCompare && selectedSessionIds.length >= 4;
                const evaluatedPins = (s.entry.visualPins ?? []).filter(
                  (vp) => vp.result && (vp.result.condition !== 'na' || vp.result.notes)
                );

                return (
                  <div
                    key={s.entry.id}
                    className={`bg-white dark:bg-[#111827] border rounded-xl lg:rounded-lg p-4 sm:p-5 space-y-3 transition-colors ${
                      isSelectedForCompare
                        ? 'border-[#1D4ED8] dark:border-[#3B82F6] ring-1 ring-[#1D4ED8]/20'
                        : 'border-[#E2E8F0] dark:border-[#1E293B]'
                    }`}
                  >
                    {/* Session Header Row */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => onOpenReport(s.report.id)}
                            className="inline-flex items-center gap-1 font-mono font-bold text-[#1D4ED8] dark:text-[#60A5FA] hover:underline"
                          >
                            <span>{s.report.reportNumber}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                          <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                            {s.report.title}
                          </span>
                          <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] text-[#475569] dark:text-[#CBD5E1]">
                            {formatReportStatusLabel(s.report.status)}
                          </span>
                        </div>
                        <div className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                          <span>{formatCycleLabel(s.report.cycleType)}</span>
                          <span aria-hidden="true"> · </span>
                          <span>
                            Executor:{' '}
                            <span className="font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                              {s.report.inspectorName}
                            </span>
                          </span>
                          <span aria-hidden="true"> · </span>
                          <span className="font-mono tabular-nums">
                            {formatDateTime(s.timestamp)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <span
                          className={`px-2.5 py-1 text-xs font-semibold rounded border ${getConditionTintClass(
                            s.entry.condition
                          )}`}
                        >
                          {formatConditionLabel(s.entry.condition)}
                        </span>

                        {sessions.length >= 2 && (
                          <button
                            type="button"
                            disabled={disableSelect}
                            onClick={() => toggleCompareSession(s.report.id)}
                            title={
                              disableSelect
                                ? 'Maximum 4 sessions can be compared at once'
                                : 'Toggle session for side-by-side comparison'
                            }
                            className={`inline-flex items-center gap-1.5 min-h-[40px] sm:min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-lg sm:rounded-md border transition-colors disabled:opacity-40 ${
                              isSelectedForCompare
                                ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                                : 'bg-[#F8FAFC] dark:bg-[#0F172A] text-[#334155] dark:text-[#CBD5E1] border-[#CBD5E1] dark:border-[#334155] hover:border-[#1D4ED8]'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{isSelectedForCompare ? 'Selected' : 'Compare'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Notes & Observations */}
                    {(s.entry.conditionNote || s.entry.itemRemarks) && (
                      <div className="p-3 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg text-xs text-[#334155] dark:text-[#CBD5E1] space-y-1">
                        {s.entry.conditionNote && (
                          <div>
                            <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                              Observation:
                            </span>{' '}
                            {s.entry.conditionNote}
                          </div>
                        )}
                        {s.entry.itemRemarks && (
                          <div className="text-[#64748B] dark:text-[#94A3B8]">
                            Remarks: {s.entry.itemRemarks}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Custom Parameter Values */}
                    {(s.entry.parameterValues ?? []).length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {s.entry.parameterValues.map((pv) => (
                          <div
                            key={pv.id}
                            className="px-3 py-2 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-lg text-xs"
                          >
                            <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                              {pv.label}
                            </div>
                            <div className="font-mono font-bold text-[#0F172A] dark:text-[#F8FAFC] mt-0.5 tabular-nums">
                              {pv.valueText ? (
                                <>
                                  {pv.valueText}
                                  {pv.paramType === 'number' && pv.unit ? ` ${pv.unit}` : ''}
                                </>
                              ) : (
                                <span className="text-[#94A3B8] font-normal">—</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Recorded Visual Pin Notes */}
                    {evaluatedPins.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-[#60A5FA]" />
                          <span>Visual Pin Findings ({evaluatedPins.length})</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {evaluatedPins.map((vp) => (
                            <div
                              key={vp.id}
                              className="px-3 py-2 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-lg text-xs space-y-0.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                                  Pin #{vp.pinNumber} · {vp.label}
                                </span>
                                <span
                                  className={`font-semibold shrink-0 ${getConditionToneClass(
                                    vp.result?.condition ?? 'na'
                                  )}`}
                                >
                                  {formatConditionLabel(vp.result?.condition ?? 'na')}
                                </span>
                              </div>
                              {vp.result?.notes && (
                                <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                                  {vp.result.notes}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Session Photos Strip */}
                    {s.allPhotos.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <div className="text-[11px] font-semibold text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-[#60A5FA]" />
                          <span>Captured Evidence Photos ({s.allPhotos.length})</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
                          {s.allPhotos.map((ph) => (
                            <button
                              key={ph.id}
                              type="button"
                              onClick={() =>
                                setLightboxPhoto({
                                  photo: ph,
                                  subtitle: `${s.report.reportNumber} · ${formatDateTime(
                                    s.timestamp
                                  )}${ph.pinLabel ? ` · ${ph.pinLabel}` : ''}`,
                                })
                              }
                              className="group text-left bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] hover:border-[#1D4ED8] dark:hover:border-[#60A5FA] rounded-lg overflow-hidden transition-colors"
                            >
                              <div className="aspect-[4/3] bg-[#E2E8F0] dark:bg-[#1E293B] overflow-hidden">
                                <img
                                  src={ph.fileUrl}
                                  alt={ph.caption || ph.fileName}
                                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-150"
                                />
                              </div>
                              <div className="p-1.5 text-[10px] text-[#475569] dark:text-[#CBD5E1] truncate">
                                {ph.pinLabel || ph.caption || ph.fileName}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Photo Lightbox Modal */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="bg-white dark:bg-[#111827] border border-[#334155] rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                  {lightboxPhoto.photo.caption || lightboxPhoto.photo.fileName}
                </div>
                <div className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                  {lightboxPhoto.subtitle}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 bg-[#0B1120] flex items-center justify-center p-4 overflow-auto">
              <img
                src={lightboxPhoto.photo.fileUrl}
                alt={lightboxPhoto.photo.caption || lightboxPhoto.photo.fileName}
                className="max-h-[75vh] max-w-full object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
