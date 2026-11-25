import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Crosshair,
  FolderKanban,
  Image as ImageIcon,
  Link2,
  MapPin,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  AssetPin,
  ConditionStatus,
  EntryVisualPin,
  InspectionEntry,
  InspectionPhoto,
  InspectionReport,
  LibraryItem,
  Project,
  ProjectTask,
} from '../types.ts';
import {
  formatAuditTimestamp,
  formatConditionLabel,
  formatShortDate,
  formatTaskStatusLabel,
} from '../utils/export.ts';
import {
  ACCEPTED_IMAGE_ACCEPT,
  parseApiResponse,
  prepareImageForUpload,
} from '../utils/imageUpload.ts';

type AuthorModalProps = {
  mode: 'author';
  asset: LibraryItem;
  canEdit: boolean;
  projects: Project[];
  tasks: ProjectTask[];
  reports?: InspectionReport[];
  token: string;
  onClose: () => void;
  onSyncComplete: () => Promise<void>;
  onNotify: (message: string, kind?: 'info' | 'error') => void;
  onNavigateToTask?: (projectId: string, taskId: string) => void;
};

type InspectModalProps = {
  mode: 'inspect';
  entry: InspectionEntry;
  isLocked: boolean;
  token: string;
  onClose: () => void;
  onSyncComplete: () => Promise<void>;
  onNotify: (message: string, kind?: 'info' | 'error') => void;
  onOpenLightbox: (photo: InspectionPhoto) => void;
  onNavigateToTask?: (projectId: string, taskId: string) => void;
};

type AssetVisualModalProps = AuthorModalProps | InspectModalProps;

const PIN_CONDITION_OPTIONS: {
  value: ConditionStatus;
  label: string;
  markerClass: string;
  btnActive: string;
}[] = [
  {
    value: 'good',
    label: 'Good',
    markerClass: 'bg-[#16A34A] border-white text-white',
    btnActive: 'text-[#16A34A] dark:text-[#4ADE80] border-[#16A34A] bg-[#F0FDF4] dark:bg-[#14532D]/40',
  },
  {
    value: 'fair',
    label: 'Fair',
    markerClass: 'bg-[#0284C7] border-white text-white',
    btnActive: 'text-[#0369A1] dark:text-[#38BDF8] border-[#0284C7] bg-[#F0F9FF] dark:bg-[#0C4A6E]/40',
  },
  {
    value: 'needs_attention',
    label: 'Needs Attention',
    markerClass: 'bg-[#D97706] border-white text-white',
    btnActive: 'text-[#B45309] dark:text-[#FBBF24] border-[#D97706] bg-[#FFFBEB] dark:bg-[#78350F]/40',
  },
  {
    value: 'critical',
    label: 'Critical',
    markerClass: 'bg-[#DC2626] border-white text-white',
    btnActive: 'text-[#B91C1C] dark:text-[#F87171] border-[#DC2626] bg-[#FEF2F2] dark:bg-[#7F1D1D]/40',
  },
  {
    value: 'na',
    label: 'Pending / N/A',
    markerClass: 'bg-[#475569] border-white text-white',
    btnActive: 'text-[#334155] dark:text-[#CBD5E1] border-[#64748B] bg-[#F8FAFC] dark:bg-[#1E293B]',
  },
];

interface PinDragState {
  pinId: string;
  startClientX: number;
  startClientY: number;
  xPercent: number;
  yPercent: number;
  moved: boolean;
}

export function AssetVisualModal(props: AssetVisualModalProps) {
  const drawingUrl = props.mode === 'author' ? props.asset.drawingUrl : props.entry.drawingUrl;
  const assetCode = props.mode === 'author' ? props.asset.code : props.entry.itemCode;
  const assetTitle = props.mode === 'author' ? props.asset.title : props.entry.itemTitle;
  const canAuthorEdit = props.mode === 'author' && props.canEdit;

  const pinsList: (AssetPin | EntryVisualPin)[] =
    props.mode === 'author' ? props.asset.pins ?? [] : props.entry.visualPins ?? [];

  const [selectedPinId, setSelectedPinId] = useState<string | null>(pinsList[0]?.id ?? null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [placeMode, setPlaceMode] = useState(false);
  const [uploadingDrawing, setUploadingDrawing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savingPin, setSavingPin] = useState(false);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [dropActive, setDropActive] = useState(false);

  // Author mode edit state
  const [pinLabel, setPinLabel] = useState('');
  const [pinGuidance, setPinGuidance] = useState('');
  const [pinNumber, setPinNumber] = useState<number>(1);
  const [pinLinkedTaskId, setPinLinkedTaskId] = useState<string>('');
  const [taskFilterQuery, setTaskFilterQuery] = useState('');
  const [repositionActive, setRepositionActive] = useState(false);

  // Pending new pin coordinates in author mode
  const [draftPinCoords, setDraftPinCoords] = useState<{ x: number; y: number } | null>(null);
  const [newPinLabel, setNewPinLabel] = useState('');
  const [newPinGuidance, setNewPinGuidance] = useState('');
  const [newPinTaskId, setNewPinTaskId] = useState<string>('');

  // Direct pointer drag-and-drop pin state
  const [pinDrag, setPinDrag] = useState<PinDragState | null>(null);

  // Inspect mode state
  const [inspectCondition, setInspectCondition] = useState<ConditionStatus>('na');
  const [inspectNotes, setInspectNotes] = useState('');
  const [uploadingPinPhoto, setUploadingPinPhoto] = useState(false);

  const imageWrapperRef = useRef<HTMLDivElement | null>(null);

  const selectedPin = useMemo(
    () => pinsList.find((p) => p.id === selectedPinId) ?? pinsList[0] ?? null,
    [pinsList, selectedPinId]
  );

  const projectById = useMemo(() => {
    if (props.mode !== 'author') return new Map<string, Project>();
    return new Map(props.projects.map((p) => [p.id, p]));
  }, [props]);

  const taskById = useMemo(() => {
    if (props.mode !== 'author') return new Map<string, ProjectTask>();
    return new Map(props.tasks.map((t) => [t.id, t]));
  }, [props]);

  const groupedFilteredTasks = useMemo(() => {
    if (props.mode !== 'author') return [];
    const q = taskFilterQuery.trim().toLowerCase();
    const filtered = props.tasks.filter((t) => {
      if (!q) return true;
      const proj = projectById.get(t.projectId);
      return (
        t.wbsCode.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.assigneeName.toLowerCase().includes(q) ||
        (proj?.name.toLowerCase().includes(q) ?? false) ||
        (proj?.code.toLowerCase().includes(q) ?? false)
      );
    });

    const groups = new Map<string, { project: Project | null; tasks: ProjectTask[] }>();
    for (const t of filtered) {
      const proj = projectById.get(t.projectId) ?? null;
      const gKey = proj?.id ?? 'unassigned';
      const bucket = groups.get(gKey) ?? { project: proj, tasks: [] };
      bucket.tasks.push(t);
      groups.set(gKey, bucket);
    }
    return Array.from(groups.values());
  }, [props, taskFilterQuery, projectById]);

  const recentPinFindings = useMemo(() => {
    if (props.mode !== 'author' || !selectedPin || !props.reports) return [];
    const findings: {
      reportId: string;
      reportNumber: string;
      reportTitle: string;
      condition: ConditionStatus;
      notes: string;
      updatedBy: string;
      updatedAt: string;
      photoCount: number;
    }[] = [];

    for (const rep of props.reports) {
      for (const ent of rep.entries) {
        const vp = (ent.visualPins ?? []).find((p) => p.id === selectedPin.id);
        if (vp && (vp.result || (vp.photos?.length ?? 0) > 0)) {
          findings.push({
            reportId: rep.id,
            reportNumber: rep.reportNumber,
            reportTitle: rep.title,
            condition: vp.result?.condition ?? 'na',
            notes: vp.result?.notes ?? '',
            updatedBy: vp.result?.updatedBy ?? rep.inspectorName,
            updatedAt: vp.result?.updatedAt ?? rep.updatedAt,
            photoCount: vp.photos?.length ?? 0,
          });
        }
      }
    }
    return findings.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [props, selectedPin]);

  useEffect(() => {
    if (!selectedPin) return;
    if (selectedPin.id !== selectedPinId) {
      setSelectedPinId(selectedPin.id);
    }
    if (props.mode === 'author') {
      setPinLabel(selectedPin.label);
      setPinGuidance(selectedPin.guidance);
      setPinNumber(selectedPin.pinNumber);
      setPinLinkedTaskId(selectedPin.linkedTaskId ?? '');
    } else {
      const vp = selectedPin as EntryVisualPin;
      setInspectCondition(vp.result?.condition ?? 'na');
      setInspectNotes(vp.result?.notes ?? '');
    }
  }, [selectedPin, props.mode, selectedPinId]);

  // Direct pointer drag-and-drop listeners for pins on drawing
  useEffect(() => {
    if (!pinDrag || !canAuthorEdit) return;

    function handleMove(ev: PointerEvent) {
      const wrapper = imageWrapperRef.current;
      if (!wrapper || !pinDrag) return;
      const rect = wrapper.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dist = Math.hypot(ev.clientX - pinDrag.startClientX, ev.clientY - pinDrag.startClientY);
      const xPercent = Math.max(
        2,
        Math.min(98, Number((((ev.clientX - rect.left) / rect.width) * 100).toFixed(1)))
      );
      const yPercent = Math.max(
        2,
        Math.min(98, Number((((ev.clientY - rect.top) / rect.height) * 100).toFixed(1)))
      );
      setPinDrag((prev) =>
        prev
          ? {
              ...prev,
              xPercent,
              yPercent,
              moved: prev.moved || dist > 4,
            }
          : null
      );
    }

    function handleUp() {
      if (!pinDrag) return;
      const finalState = pinDrag;
      setPinDrag(null);
      if (finalState.moved) {
        updateAuthorPin(finalState.pinId, {
          xPercent: finalState.xPercent,
          yPercent: finalState.yPercent,
        });
      }
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [pinDrag, canAuthorEdit]);

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!canAuthorEdit || !drawingUrl) return;
    if (!placeMode && !repositionActive) return;

    const wrapper = imageWrapperRef.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const xPercent = Math.max(
      2,
      Math.min(98, Number((((e.clientX - rect.left) / rect.width) * 100).toFixed(1)))
    );
    const yPercent = Math.max(
      2,
      Math.min(98, Number((((e.clientY - rect.top) / rect.height) * 100).toFixed(1)))
    );

    if (repositionActive && selectedPin) {
      setRepositionActive(false);
      updateAuthorPin(selectedPin.id, { xPercent, yPercent });
      return;
    }

    if (placeMode) {
      setDraftPinCoords({ x: xPercent, y: yPercent });
      setNewPinLabel('');
      setNewPinGuidance('');
      setNewPinTaskId('');
      setPlaceMode(false);
    }
  }

  async function handleDrawingUpload(file: File | undefined) {
    if (!file || !canAuthorEdit || props.mode !== 'author') return;
    setUploadError(null);
    setUploadingDrawing(true);
    try {
      const prepared = await prepareImageForUpload(file, 'drawing');
      const fd = new FormData();
      fd.append('drawing', prepared.file);
      const res = await fetch(`/api/library/${props.asset.id}/drawing`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${props.token}` },
        body: fd,
      });
      const parsed = await parseApiResponse<{ drawingUrl?: string; error?: string }>(res);
      if (!parsed.ok) {
        const msg = parsed.errorMessage ?? 'Failed to upload asset drawing.';
        setUploadError(msg);
        props.onNotify(msg, 'error');
        return;
      }
      await props.onSyncComplete();
      props.onNotify(
        prepared.wasOptimized
          ? `Uploaded drawing for ${props.asset.code} (${prepared.note}).`
          : `Uploaded drawing for ${props.asset.code}.`
      );
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Network error uploading asset drawing.';
      setUploadError(msg);
      props.onNotify(msg, 'error');
    } finally {
      setUploadingDrawing(false);
    }
  }

  async function handleRemoveDrawing() {
    if (!canAuthorEdit || props.mode !== 'author') return;
    try {
      const res = await fetch(`/api/library/${props.asset.id}/drawing`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${props.token}` },
      });
      if (!res.ok) {
        props.onNotify('Failed to remove drawing.', 'error');
        return;
      }
      await props.onSyncComplete();
      props.onNotify(`Removed drawing from ${props.asset.code}.`);
    } catch {
      props.onNotify('Network error removing drawing.', 'error');
    }
  }

  async function handleCreateAuthorPin(e: React.FormEvent) {
    e.preventDefault();
    if (!canAuthorEdit || props.mode !== 'author' || !draftPinCoords) return;
    setSavingPin(true);
    try {
      const nextNum =
        pinsList.length > 0 ? Math.max(...pinsList.map((p) => p.pinNumber)) + 1 : 1;
      const res = await fetch(`/api/library/${props.asset.id}/pins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${props.token}`,
        },
        body: JSON.stringify({
          pinNumber: nextNum,
          label: newPinLabel.trim(),
          guidance: newPinGuidance.trim(),
          xPercent: draftPinCoords.x,
          yPercent: draftPinCoords.y,
          linkedTaskId: newPinTaskId || null,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        props.onNotify(data.error ?? 'Failed to add inspection pin.', 'error');
        return;
      }
      setDraftPinCoords(null);
      setSelectedPinId(data.id);
      await props.onSyncComplete();
      props.onNotify(`Added inspection pin #${nextNum} to ${props.asset.code}.`);
    } catch {
      props.onNotify('Network error adding inspection pin.', 'error');
    } finally {
      setSavingPin(false);
    }
  }

  async function updateAuthorPin(
    pinId: string,
    payload: Partial<{
      pinNumber: number;
      label: string;
      guidance: string;
      xPercent: number;
      yPercent: number;
      linkedTaskId: string | null;
    }>
  ) {
    if (!canAuthorEdit) return;
    setSavingPin(true);
    try {
      const res = await fetch(`/api/pins/${pinId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${props.token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        props.onNotify(data.error ?? 'Failed to update pin.', 'error');
        return;
      }
      await props.onSyncComplete();
      props.onNotify('Updated inspection checkpoint pin.');
    } catch {
      props.onNotify('Network error updating pin.', 'error');
    } finally {
      setSavingPin(false);
    }
  }

  async function deleteAuthorPin(pinId: string) {
    if (!canAuthorEdit) return;
    try {
      const res = await fetch(`/api/pins/${pinId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${props.token}` },
      });
      if (!res.ok) {
        props.onNotify('Failed to delete pin.', 'error');
        return;
      }
      if (selectedPinId === pinId) setSelectedPinId(null);
      await props.onSyncComplete();
      props.onNotify('Removed inspection pin.');
    } catch {
      props.onNotify('Network error removing pin.', 'error');
    }
  }

  async function saveInspectPinResult(nextCondition: ConditionStatus, nextNotes: string) {
    if (props.mode !== 'inspect' || props.isLocked || !selectedPin) return;
    setSavingPin(true);
    try {
      const res = await fetch(`/api/entries/${props.entry.id}/pins/${selectedPin.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${props.token}`,
        },
        body: JSON.stringify({
          condition: nextCondition,
          notes: nextNotes,
        }),
      });
      if (!res.ok) {
        props.onNotify('Failed to save pin inspection result.', 'error');
        return;
      }
      await props.onSyncComplete();
      props.onNotify(`Saved Pin #${selectedPin.pinNumber} finding (${formatConditionLabel(nextCondition)}).`);
    } catch {
      props.onNotify('Network error saving pin finding.', 'error');
    } finally {
      setSavingPin(false);
    }
  }

  async function handlePinPhotoUpload(files: FileList | null) {
    if (props.mode !== 'inspect' || props.isLocked || !selectedPin || !files || files.length === 0) {
      return;
    }
    setUploadError(null);
    setUploadingPinPhoto(true);
    try {
      const preparedList = await Promise.all(
        Array.from(files).map((f) => prepareImageForUpload(f, 'photo'))
      );
      const fd = new FormData();
      fd.append('pinId', selectedPin.id);
      preparedList.forEach((p) => fd.append('photos', p.file));
      const res = await fetch(`/api/entries/${props.entry.id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${props.token}` },
        body: fd,
      });
      const parsed = await parseApiResponse<{ error?: string }>(res);
      if (!parsed.ok) {
        const msg = parsed.errorMessage ?? 'Pin photo upload failed.';
        setUploadError(msg);
        props.onNotify(msg, 'error');
        return;
      }
      await props.onSyncComplete();
      props.onNotify(`Uploaded ${preparedList.length} photo(s) for Pin #${selectedPin.pinNumber}.`);
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Network error uploading pin photo.';
      setUploadError(msg);
      props.onNotify(msg, 'error');
    } finally {
      setUploadingPinPhoto(false);
    }
  }

  async function handleDeletePinPhoto(photoId: string) {
    if (props.mode !== 'inspect' || props.isLocked) return;
    try {
      const res = await fetch(`/api/photos/${photoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${props.token}` },
      });
      if (!res.ok) return;
      await props.onSyncComplete();
      props.onNotify('Removed pin photo.');
    } catch {
      props.onNotify('Network error removing photo.', 'error');
    }
  }

  const evaluatedCount =
    props.mode === 'inspect'
      ? (props.entry.visualPins ?? []).filter((vp) => vp.result && vp.result.condition !== 'na').length
      : 0;
  const linkedPinCount = pinsList.filter((p) => Boolean(p.linkedTaskId)).length;

  return (
    <div className="no-print fixed inset-0 z-50 bg-[#0F172A]/60 dark:bg-black/75 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded-lg max-w-6xl w-full max-h-[92vh] shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-xs text-[#1D4ED8] dark:text-[#60A5FA] font-semibold">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>{assetCode}</span>
              <span aria-hidden="true" className="text-[#CBD5E1] dark:text-[#475569]">·</span>
              <span className="text-[#475569] dark:text-[#94A3B8]">
                {props.mode === 'author'
                  ? `Visual Inspection Module (${pinsList.length} pin${pinsList.length === 1 ? '' : 's'} · ${linkedPinCount} task-linked)`
                  : `Visual Pin Inspection (${evaluatedCount}/${pinsList.length} evaluated)`}
              </span>
            </div>
            <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC] truncate mt-0.5">
              {assetTitle}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {drawingUrl && (
              <div className="inline-flex items-center border border-[#CBD5E1] dark:border-[#334155] rounded-md bg-[#F8FAFC] dark:bg-[#0F172A] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setZoomPercent((z) => Math.max(80, z - 20))}
                  title="Zoom out"
                  className="p-1.5 text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B]"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomPercent(100)}
                  title="Reset zoom"
                  className="px-2 py-1 font-mono text-[11px] font-medium text-[#334155] dark:text-[#CBD5E1] border-x border-[#E2E8F0] dark:border-[#334155]"
                >
                  {zoomPercent}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoomPercent((z) => Math.min(220, z + 20))}
                  title="Zoom in"
                  className="p-1.5 text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B]"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {canAuthorEdit && (
              <>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingDrawing ? 'Uploading...' : drawingUrl ? 'Replace Drawing' : 'Upload Drawing'}</span>
                  <input
                    type="file"
                    accept={ACCEPTED_IMAGE_ACCEPT}
                    disabled={uploadingDrawing}
                    onChange={(e) => {
                      handleDrawingUpload(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>

                {drawingUrl && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setPlaceMode((v) => !v);
                        setRepositionActive(false);
                        setDraftPinCoords(null);
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                        placeMode
                          ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                          : 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 text-[#1D4ED8] dark:text-[#93C5FD] border-[#BFDBFE] dark:border-[#1D4ED8]'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{placeMode ? 'Click Drawing to Drop Pin...' : 'Place Custom Pin'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleRemoveDrawing}
                      title="Remove drawing"
                      className="p-1.5 text-[#64748B] dark:text-[#94A3B8] hover:text-[#DC2626] dark:hover:text-[#F87171] border border-[#E2E8F0] dark:border-[#334155] rounded-md"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </>
            )}

            <button
              type="button"
              onClick={props.onClose}
              className="p-1.5 text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body Split Layout */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* Left Interactive Drawing Canvas */}
          <div
            onDragOver={(e) => {
              if (!canAuthorEdit) return;
              e.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(e) => {
              if (!canAuthorEdit) return;
              e.preventDefault();
              setDropActive(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleDrawingUpload(file);
            }}
            className={`lg:col-span-7 bg-[#F1F5F9] dark:bg-[#0B1120] border-b lg:border-b-0 lg:border-r border-[#E2E8F0] dark:border-[#1E293B] p-5 flex flex-col items-center justify-center overflow-auto transition-colors ${
              dropActive ? 'ring-2 ring-inset ring-[#1D4ED8] bg-[#EFF6FF] dark:bg-[#1E3A8A]/20' : ''
            }`}
          >
            {uploadError && (
              <div className="mb-3 w-full max-w-lg px-3.5 py-2.5 rounded-md border border-[#FECACA] dark:border-[#991B1B] bg-[#FEF2F2] dark:bg-[#450A0A]/60 text-xs text-[#991B1B] dark:text-[#FCA5A5] flex items-start justify-between gap-3">
                <span>{uploadError}</span>
                <button
                  type="button"
                  onClick={() => setUploadError(null)}
                  className="text-[#991B1B] dark:text-[#FCA5A5] hover:opacity-75 shrink-0"
                  aria-label="Dismiss upload error"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {!drawingUrl ? (
              <div className="text-center max-w-md space-y-3 py-10 px-6 border-2 border-dashed border-[#CBD5E1] dark:border-[#334155] rounded-lg bg-white/70 dark:bg-[#111827]/70">
                <ImageIcon className="w-10 h-10 text-[#94A3B8] mx-auto" />
                <div className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  No Asset Drawing Uploaded Yet
                </div>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                  {canAuthorEdit
                    ? 'Drag & drop a P&ID schematic, GA drawing, or equipment photo (PNG, JPG, WebP, SVG, HEIC) here—or click below. Oversized raster images are auto-compressed.'
                    : 'No schematic drawing has been attached to this asset yet.'}
                </p>
                {canAuthorEdit && (
                  <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingDrawing ? 'Optimizing & Uploading...' : 'Select Asset Drawing'}</span>
                    <input
                      type="file"
                      accept={ACCEPTED_IMAGE_ACCEPT}
                      disabled={uploadingDrawing}
                      onChange={(e) => {
                        handleDrawingUpload(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            ) : (
              <div className="space-y-2.5 max-w-full flex flex-col items-center">
                {(placeMode || repositionActive) && (
                  <div className="px-3 py-1.5 text-xs font-medium bg-[#1D4ED8] text-white rounded-md shadow-xs">
                    {repositionActive
                      ? `Click anywhere on the drawing to move Pin #${selectedPin?.pinNumber}`
                      : 'Click anywhere on the drawing to place a new inspection point'}
                  </div>
                )}
                {!placeMode && !repositionActive && canAuthorEdit && pinsList.length > 0 && (
                  <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                    Tip: Drag any pin directly on the drawing to adjust its position, or click a pin to edit &amp; link tasks.
                  </div>
                )}

                <div
                  ref={imageWrapperRef}
                  onClick={handleCanvasClick}
                  style={{ width: zoomPercent === 100 ? 'auto' : `${zoomPercent}%` }}
                  className={`relative inline-block border border-[#CBD5E1] dark:border-[#334155] rounded-md bg-white overflow-visible shadow-sm ${
                    placeMode || repositionActive ? 'cursor-crosshair' : ''
                  }`}
                >
                  <img
                    src={drawingUrl}
                    alt={`${assetCode} visual drawing`}
                    className={`block max-w-full select-none rounded-md ${
                      zoomPercent === 100 ? 'max-h-[58vh]' : 'w-full h-auto'
                    }`}
                    draggable={false}
                  />

                  {pinsList.map((pin) => {
                    const isSelected = selectedPin?.id === pin.id;
                    const isDraggingThis = pinDrag?.pinId === pin.id;
                    const xPos = isDraggingThis ? pinDrag.xPercent : pin.xPercent;
                    const yPos = isDraggingThis ? pinDrag.yPercent : pin.yPercent;

                    let toneClass = pin.linkedTaskId
                      ? 'bg-[#0F766E] border-white text-white'
                      : 'bg-[#1D4ED8] border-white text-white';
                    if (props.mode === 'inspect') {
                      const vp = pin as EntryVisualPin;
                      const cond = vp.result?.condition ?? 'na';
                      const found = PIN_CONDITION_OPTIONS.find((o) => o.value === cond);
                      if (found) toneClass = found.markerClass;
                    }

                    const showTooltip = hoveredPinId === pin.id && !isDraggingThis;

                    return (
                      <div
                        key={pin.id}
                        style={{ left: `${xPos}%`, top: `${yPos}%` }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 ${
                          isSelected || isDraggingThis || showTooltip ? 'z-30' : 'z-10'
                        }`}
                      >
                        <button
                          type="button"
                          onPointerDown={(e) => {
                            if (!canAuthorEdit || placeMode || repositionActive) return;
                            e.stopPropagation();
                            setSelectedPinId(pin.id);
                            setDraftPinCoords(null);
                            setPinDrag({
                              pinId: pin.id,
                              startClientX: e.clientX,
                              startClientY: e.clientY,
                              xPercent: pin.xPercent,
                              yPercent: pin.yPercent,
                              moved: false,
                            });
                          }}
                          onMouseEnter={() => setHoveredPinId(pin.id)}
                          onMouseLeave={() => setHoveredPinId((cur) => (cur === pin.id ? null : cur))}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPinId(pin.id);
                            setDraftPinCoords(null);
                          }}
                          className={`relative w-7 h-7 rounded-full border-2 font-mono text-xs font-bold flex items-center justify-center shadow-md transition-transform ${toneClass} ${
                            canAuthorEdit && !placeMode && !repositionActive
                              ? 'cursor-grab active:cursor-grabbing'
                              : 'cursor-pointer'
                          } ${isSelected ? 'scale-125 ring-4 ring-[#1D4ED8]/40' : 'hover:scale-110'}`}
                        >
                          {pin.pinNumber}
                          {pin.linkedTaskId && (
                            <span
                              title={`Linked to ${pin.linkedTaskWbs ?? ''} ${pin.linkedTaskTitle ?? ''}`}
                              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-white dark:bg-[#0F172A] text-[#0F766E] dark:text-[#2DD4BF] border border-[#0F766E] flex items-center justify-center shadow-xs"
                            >
                              <Link2 className="w-2 h-2" />
                            </span>
                          )}
                        </button>

                        {showTooltip && (
                          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-9 w-56 p-2.5 rounded-md bg-[#0F172A] dark:bg-[#1E293B] text-white border border-[#334155] shadow-lg text-left">
                            <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-[#93C5FD]">
                              <span>Pin #{pin.pinNumber}</span>
                              <span>
                                ({xPos}%, {yPos}%)
                              </span>
                            </div>
                            <div className="text-xs font-semibold mt-0.5 leading-snug">
                              {pin.label}
                            </div>
                            {pin.linkedTaskId && pin.linkedTaskTitle && (
                              <div className="mt-1.5 pt-1.5 border-t border-[#334155] text-[10px] text-[#5EEAD4] flex items-center gap-1">
                                <Link2 className="w-3 h-3 shrink-0" />
                                <span className="truncate">
                                  {pin.linkedTaskWbs} {pin.linkedTaskTitle}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {draftPinCoords && (
                    <div
                      style={{ left: `${draftPinCoords.x}%`, top: `${draftPinCoords.y}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full border-2 border-dashed border-white bg-[#D97706] text-white font-mono text-xs font-bold flex items-center justify-center shadow-md z-30"
                    >
                      +
                    </div>
                  )}
                </div>

                {props.mode === 'inspect' ? (
                  <div className="flex flex-wrap items-center justify-center gap-4 pt-1 text-[11px] text-[#475569] dark:text-[#94A3B8]">
                    {PIN_CONDITION_OPTIONS.map((opt) => (
                      <span key={opt.value} className="inline-flex items-center gap-1.5">
                        <span
                          className={`w-2.5 h-2.5 rounded-full inline-block ${opt.markerClass.split(' ')[0]}`}
                        />
                        <span>{opt.label}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-4 pt-1 text-[11px] text-[#475569] dark:text-[#94A3B8]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full inline-block bg-[#1D4ED8]" />
                      <span>Standard Pin</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full inline-block bg-[#0F766E]" />
                      <span>Linked to Inspection Task</span>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Panel: Pin Directory & Editor */}
          <div className="lg:col-span-5 flex flex-col overflow-hidden bg-white dark:bg-[#111827]">
            {/* Pin Chips Selector */}
            <div className="px-5 py-3 border-b border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0F172A] shrink-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] mb-2">
                Inspection Points ({pinsList.length})
              </div>
              {pinsList.length === 0 ? (
                <div className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  No checkpoints pinned on this asset yet.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {pinsList.map((pin) => {
                    const active = selectedPin?.id === pin.id && !draftPinCoords;
                    const cond =
                      props.mode === 'inspect'
                        ? (pin as EntryVisualPin).result?.condition ?? 'na'
                        : null;
                    return (
                      <button
                        key={pin.id}
                        type="button"
                        onClick={() => {
                          setSelectedPinId(pin.id);
                          setDraftPinCoords(null);
                        }}
                        className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors flex items-center gap-1.5 ${
                          active
                            ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 text-[#1D4ED8] dark:text-[#93C5FD] border-[#1D4ED8]'
                            : 'bg-white dark:bg-[#111827] text-[#334155] dark:text-[#CBD5E1] border-[#E2E8F0] dark:border-[#334155] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]'
                        }`}
                      >
                        <span className="font-mono font-bold">#{pin.pinNumber}</span>
                        <span className="truncate max-w-[130px]">{pin.label}</span>
                        {pin.linkedTaskId && (
                          <Link2 className="w-3 h-3 text-[#0F766E] dark:text-[#2DD4BF] shrink-0" />
                        )}
                        {cond && cond !== 'na' && (
                          <span className="text-[10px] font-mono opacity-80">
                            · {formatConditionLabel(cond)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Active Pin Form */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {props.mode === 'author' && draftPinCoords ? (
                <form onSubmit={handleCreateAuthorPin} className="space-y-4">
                  <div className="text-xs font-semibold text-[#D97706] dark:text-[#FBBF24]">
                    New Custom Pin at ({draftPinCoords.x}%, {draftPinCoords.y}%)
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                      Checkpoint Label
                    </label>
                    <input
                      type="text"
                      required
                      value={newPinLabel}
                      onChange={(e) => setNewPinLabel(e.target.value)}
                      placeholder="e.g. Drive-End Bearing Housing"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                      Inspector Guidance / Limits
                    </label>
                    <textarea
                      rows={2}
                      value={newPinGuidance}
                      onChange={(e) => setNewPinGuidance(e.target.value)}
                      placeholder="e.g. Verify vibration below 4.5 mm/s and inspect oil seal."
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                      Link to Inspection / Project Task (Optional)
                    </label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={taskFilterQuery}
                        onChange={(e) => setTaskFilterQuery(e.target.value)}
                        placeholder="Filter tasks by WBS, title, or project..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                      />
                    </div>
                    <select
                      value={newPinTaskId}
                      onChange={(e) => setNewPinTaskId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                    >
                      <option value="">— No linked task —</option>
                      {groupedFilteredTasks.map((grp) => (
                        <optgroup
                          key={grp.project?.id ?? 'unassigned'}
                          label={grp.project ? `${grp.project.code} · ${grp.project.name}` : 'Project Tasks'}
                        >
                          {grp.tasks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.wbsCode} — {t.title} ({formatTaskStatusLabel(t.status)})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setDraftPinCoords(null)}
                      className="px-3 py-1.5 text-xs text-[#475569] dark:text-[#CBD5E1] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingPin}
                      className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md"
                    >
                      {savingPin ? 'Saving...' : 'Save Custom Pin'}
                    </button>
                  </div>
                </form>
              ) : !selectedPin ? (
                <div className="py-10 text-center text-xs text-[#64748B] dark:text-[#94A3B8]">
                  {canAuthorEdit
                    ? 'Select a pin on the drawing or click "Place Custom Pin" to define inspection points and link them to tasks.'
                    : 'Select a numbered pin on the asset drawing to record condition, notes, and photo evidence.'}
                </div>
              ) : props.mode === 'author' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-mono text-[#64748B] dark:text-[#94A3B8]">
                      Pin #{selectedPin.pinNumber} · ({selectedPin.xPercent}%, {selectedPin.yPercent}%)
                    </div>
                    {canAuthorEdit && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setRepositionActive((v) => !v)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border ${
                            repositionActive
                              ? 'bg-[#D97706] text-white border-[#D97706]'
                              : 'text-[#334155] dark:text-[#CBD5E1] border-[#CBD5E1] dark:border-[#334155]'
                          }`}
                        >
                          <Crosshair className="w-3 h-3" />
                          <span>{repositionActive ? 'Click Drawing...' : 'Move Pin'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteAuthorPin(selectedPin.id)}
                          className="p-1 text-[#DC2626] hover:bg-[#FEF2F2] dark:hover:bg-[#7F1D1D]/30 rounded"
                          title="Delete pin"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                        Pin #
                      </label>
                      <input
                        type="number"
                        min={1}
                        disabled={!canAuthorEdit}
                        value={pinNumber}
                        onChange={(e) => setPinNumber(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 text-sm font-mono bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                        Checkpoint Label
                      </label>
                      <input
                        type="text"
                        disabled={!canAuthorEdit}
                        value={pinLabel}
                        onChange={(e) => setPinLabel(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                      Inspection Criteria / Guidance
                    </label>
                    <textarea
                      rows={2}
                      disabled={!canAuthorEdit}
                      value={pinGuidance}
                      onChange={(e) => setPinGuidance(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                    />
                  </div>

                  {/* Link to Inspection / Project Task */}
                  <div className="p-3.5 border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0F172A] rounded-md space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                        <Link2 className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#2DD4BF]" />
                        <span>Linked Inspection / Project Task</span>
                      </label>
                      {pinLinkedTaskId && canAuthorEdit && (
                        <button
                          type="button"
                          onClick={() => setPinLinkedTaskId('')}
                          className="text-[11px] text-[#64748B] hover:text-[#DC2626] dark:hover:text-[#F87171]"
                        >
                          Unlink
                        </button>
                      )}
                    </div>

                    {canAuthorEdit && (
                      <>
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={taskFilterQuery}
                            onChange={(e) => setTaskFilterQuery(e.target.value)}
                            placeholder="Search task by WBS code, title, or project..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                          />
                        </div>
                        <select
                          value={pinLinkedTaskId}
                          onChange={(e) => setPinLinkedTaskId(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                        >
                          <option value="">
                            {props.tasks.length === 0
                              ? 'No project tasks created yet (create tasks in Projects tab)'
                              : '— Select an inspection / project task —'}
                          </option>
                          {groupedFilteredTasks.map((grp) => (
                            <optgroup
                              key={grp.project?.id ?? 'unassigned'}
                              label={grp.project ? `${grp.project.code} · ${grp.project.name}` : 'Project Tasks'}
                            >
                              {grp.tasks.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.wbsCode} — {t.title} ({formatTaskStatusLabel(t.status)} · {t.progress}%)
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </>
                    )}

                    {(() => {
                      const activeTask = pinLinkedTaskId ? taskById.get(pinLinkedTaskId) : undefined;
                      if (!activeTask) return null;
                      const proj = projectById.get(activeTask.projectId);
                      return (
                        <div className="p-2.5 bg-white dark:bg-[#111827] border border-[#CCFBF1] dark:border-[#115E59] rounded text-xs space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-semibold text-[#0F766E] dark:text-[#2DD4BF] flex items-center gap-1">
                              <FolderKanban className="w-3 h-3" />
                              <span>
                                {proj?.code ? `${proj.code} · ` : ''}WBS {activeTask.wbsCode}
                              </span>
                            </span>
                            <span className="font-mono text-[11px] text-[#475569] dark:text-[#CBD5E1]">
                              {formatTaskStatusLabel(activeTask.status)} · {activeTask.progress}%
                            </span>
                          </div>
                          <div className="font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                            {activeTask.title}
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                            <span>
                              {formatShortDate(activeTask.startDate)} → {formatShortDate(activeTask.endDate)}
                            </span>
                            {props.onNavigateToTask && (
                              <button
                                type="button"
                                onClick={() => {
                                  props.onClose();
                                  props.onNavigateToTask?.(activeTask.projectId, activeTask.id);
                                }}
                                className="inline-flex items-center gap-1 text-[#1D4ED8] dark:text-[#60A5FA] font-medium hover:underline"
                              >
                                <span>Open Task</span>
                                <ArrowUpRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {canAuthorEdit && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={savingPin}
                        onClick={() =>
                          updateAuthorPin(selectedPin.id, {
                            pinNumber,
                            label: pinLabel,
                            guidance: pinGuidance,
                            linkedTaskId: pinLinkedTaskId || null,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{savingPin ? 'Saving...' : 'Save Pin & Task Link'}</span>
                      </button>
                    </div>
                  )}

                  {/* Recent Field Findings for this Pin */}
                  {recentPinFindings.length > 0 && (
                    <div className="border-t border-[#E2E8F0] dark:border-[#1E293B] pt-3 space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                        Recent Field Findings ({recentPinFindings.length})
                      </div>
                      <div className="space-y-2">
                        {recentPinFindings.slice(0, 3).map((f) => (
                          <div
                            key={`${f.reportId}_${f.updatedAt}`}
                            className="p-2.5 border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0F172A] rounded text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-semibold text-[#1D4ED8] dark:text-[#60A5FA]">
                                {f.reportNumber}
                              </span>
                              <span className="font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                                {formatConditionLabel(f.condition)}
                              </span>
                            </div>
                            {f.notes && (
                              <p className="text-[#475569] dark:text-[#CBD5E1]">{f.notes}</p>
                            )}
                            <div className="text-[10px] font-mono text-[#64748B] dark:text-[#94A3B8]">
                              {f.updatedBy} · {formatAuditTimestamp(f.updatedAt)}
                              {f.photoCount > 0 ? ` · ${f.photoCount} photo(s)` : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Inspect Mode Side Editor */
                (() => {
                  const vp = selectedPin as EntryVisualPin;
                  return (
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA]">
                            Checkpoint #{vp.pinNumber}
                          </span>
                          {vp.result?.updatedAt && (
                            <span className="font-mono text-[10px] text-[#64748B] dark:text-[#94A3B8]">
                              {formatAuditTimestamp(vp.result.updatedAt)}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC] mt-0.5">
                          {vp.label}
                        </h4>
                        {vp.guidance && (
                          <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1 leading-relaxed">
                            Guidance: {vp.guidance}
                          </p>
                        )}
                      </div>

                      {vp.linkedTaskId && vp.linkedTaskTitle && (
                        <div className="p-2.5 border border-[#CCFBF1] dark:border-[#115E59] bg-[#F0FDFA] dark:bg-[#134E4A]/30 rounded text-xs space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-semibold text-[#0F766E] dark:text-[#2DD4BF] flex items-center gap-1">
                              <Link2 className="w-3 h-3" />
                              <span>Linked Task · WBS {vp.linkedTaskWbs}</span>
                            </span>
                            {vp.linkedTaskStatus && (
                              <span className="font-mono text-[11px] text-[#0F766E] dark:text-[#5EEAD4]">
                                {formatTaskStatusLabel(vp.linkedTaskStatus)} ({vp.linkedTaskProgress ?? 0}%)
                              </span>
                            )}
                          </div>
                          <div className="font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                            {vp.linkedTaskTitle}
                          </div>
                          {props.onNavigateToTask && vp.linkedProjectId && (
                            <button
                              type="button"
                              onClick={() => {
                                props.onClose();
                                props.onNavigateToTask?.(vp.linkedProjectId!, vp.linkedTaskId!);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] text-[#1D4ED8] dark:text-[#60A5FA] font-medium hover:underline"
                            >
                              <span>Open Linked Task</span>
                              <ArrowUpRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}

                      <div>
                        <label className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8] mb-1.5">
                          Checkpoint Condition
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {PIN_CONDITION_OPTIONS.map((opt) => {
                            const active = inspectCondition === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                disabled={props.isLocked || savingPin}
                                onClick={() => {
                                  setInspectCondition(opt.value);
                                  saveInspectPinResult(opt.value, inspectNotes);
                                }}
                                className={`px-2.5 py-1 text-xs font-medium border rounded transition-colors ${
                                  active
                                    ? opt.btnActive
                                    : 'text-[#475569] dark:text-[#CBD5E1] border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#0F172A] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]'
                                } ${props.isLocked && !active ? 'opacity-45' : ''}`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8] mb-1">
                          Pin Inspection Notes &amp; Measurements
                        </label>
                        {props.isLocked ? (
                          <div className="text-xs text-[#334155] dark:text-[#CBD5E1] bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded p-2.5 min-h-[54px]">
                            {inspectNotes || 'No remarks recorded for this checkpoint.'}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <textarea
                              rows={3}
                              value={inspectNotes}
                              onChange={(e) => setInspectNotes(e.target.value)}
                              placeholder="Enter temperature, vibration reading, leak observation, or repair need..."
                              className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                            />
                            <div className="flex justify-end">
                              <button
                                type="button"
                                disabled={savingPin}
                                onClick={() => saveInspectPinResult(inspectCondition, inspectNotes)}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md"
                              >
                                {savingPin ? 'Saving...' : 'Save Pin Finding'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Pin Photo Evidence */}
                      <div className="border-t border-[#E2E8F0] dark:border-[#1E293B] pt-3 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                            Pin Evidence Photos ({vp.photos?.length ?? 0})
                          </span>
                          {!props.isLocked && (
                            <label className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#1D4ED8] dark:text-[#93C5FD] bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 hover:bg-[#DBEAFE] border border-[#BFDBFE] dark:border-[#1D4ED8] rounded cursor-pointer">
                              <Upload className="w-3 h-3" />
                              <span>{uploadingPinPhoto ? 'Uploading...' : 'Attach Photo'}</span>
                              <input
                                type="file"
                                accept={ACCEPTED_IMAGE_ACCEPT}
                                multiple
                                disabled={uploadingPinPhoto}
                                onChange={(e) => {
                                  handlePinPhotoUpload(e.target.files);
                                  e.target.value = '';
                                }}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>

                        {(vp.photos?.length ?? 0) === 0 ? (
                          <div className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                            No photos attached directly to Pin #{vp.pinNumber}.
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2.5">
                            {vp.photos.map((photo) => (
                              <div
                                key={photo.id}
                                className="relative border border-[#E2E8F0] dark:border-[#334155] rounded overflow-hidden bg-[#F8FAFC] dark:bg-[#0F172A]"
                              >
                                <img
                                  src={photo.fileUrl}
                                  alt={photo.caption || photo.fileName}
                                  onClick={() => props.onOpenLightbox(photo)}
                                  className="w-full h-24 object-cover cursor-pointer"
                                />
                                {!props.isLocked && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePinPhoto(photo.id)}
                                    title="Delete photo"
                                    className="absolute top-1.5 right-1.5 p-1 bg-white/90 dark:bg-[#111827]/90 text-[#DC2626] rounded shadow-xs"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
