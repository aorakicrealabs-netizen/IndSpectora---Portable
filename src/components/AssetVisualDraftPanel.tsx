import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Crosshair,
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
import type { Project, ProjectTask } from '../types.ts';
import { ACCEPTED_IMAGE_ACCEPT } from '../utils/imageUpload.ts';

export interface DraftAssetPin {
  key: string;
  id?: string;
  pinNumber: number;
  label: string;
  guidance: string;
  xPercent: number;
  yPercent: number;
  linkedTaskId: string | null;
}

interface PinDragState {
  pinKey: string;
  startClientX: number;
  startClientY: number;
  xPercent: number;
  yPercent: number;
  moved: boolean;
}

interface AssetVisualDraftPanelProps {
  assetCode: string;
  existingDrawingUrl: string | null;
  draftDrawingPreviewUrl: string | null;
  draftDrawingNote: string | null;
  draftDrawingRemoved: boolean;
  processingDrawing: boolean;
  drawingError: string | null;
  onSelectDrawingFile: (file: File | undefined) => void;
  onRemoveDrawing: () => void;
  onClearError: () => void;
  draftPins: DraftAssetPin[];
  onChangePins: (pins: DraftAssetPin[]) => void;
  onTrackDeletedPinId?: (pinId: string) => void;
  projects: Project[];
  tasks: ProjectTask[];
}

export function AssetVisualDraftPanel({
  assetCode,
  existingDrawingUrl,
  draftDrawingPreviewUrl,
  draftDrawingNote,
  draftDrawingRemoved,
  processingDrawing,
  drawingError,
  onSelectDrawingFile,
  onRemoveDrawing,
  onClearError,
  draftPins,
  onChangePins,
  onTrackDeletedPinId,
  projects,
  tasks,
}: AssetVisualDraftPanelProps) {
  const activeDrawingUrl = draftDrawingPreviewUrl
    ? draftDrawingPreviewUrl
    : draftDrawingRemoved
      ? null
      : existingDrawingUrl;

  const [selectedPinKey, setSelectedPinKey] = useState<string | null>(draftPins[0]?.key ?? null);
  const [hoveredPinKey, setHoveredPinKey] = useState<string | null>(null);
  const [placeMode, setPlaceMode] = useState(false);
  const [repositionActive, setRepositionActive] = useState(false);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [dropActive, setDropActive] = useState(false);

  // Pending new pin state
  const [draftPinCoords, setDraftPinCoords] = useState<{ x: number; y: number } | null>(null);
  const [newPinLabel, setNewPinLabel] = useState('');
  const [newPinGuidance, setNewPinGuidance] = useState('');
  const [newPinTaskId, setNewPinTaskId] = useState<string>('');
  const [taskFilterQuery, setTaskFilterQuery] = useState('');

  // Dragging pin state
  const [pinDrag, setPinDrag] = useState<PinDragState | null>(null);
  const imageWrapperRef = useRef<HTMLDivElement | null>(null);

  const selectedPin = useMemo(
    () => draftPins.find((p) => p.key === selectedPinKey) ?? draftPins[0] ?? null,
    [draftPins, selectedPinKey]
  );

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const groupedFilteredTasks = useMemo(() => {
    const q = taskFilterQuery.trim().toLowerCase();
    const filtered = tasks.filter((t) => {
      if (t.taskType === 'phase') return false;
      if (!q) return true;
      const projName = projectById.get(t.projectId)?.name ?? '';
      return (
        t.title.toLowerCase().includes(q) ||
        t.wbsCode.toLowerCase().includes(q) ||
        projName.toLowerCase().includes(q)
      );
    });
    const groups = new Map<string, { project: Project | undefined; items: ProjectTask[] }>();
    for (const task of filtered) {
      const existing = groups.get(task.projectId);
      if (existing) {
        existing.items.push(task);
      } else {
        groups.set(task.projectId, { project: projectById.get(task.projectId), items: [task] });
      }
    }
    return Array.from(groups.values());
  }, [tasks, taskFilterQuery, projectById]);

  useEffect(() => {
    if (!pinDrag) return;

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
      const finalDrag = pinDrag;
      setPinDrag(null);
      if (finalDrag.moved) {
        onChangePins(
          draftPins.map((p) =>
            p.key === finalDrag.pinKey
              ? { ...p, xPercent: finalDrag.xPercent, yPercent: finalDrag.yPercent }
              : p
          )
        );
      }
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [pinDrag, draftPins, onChangePins]);

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!activeDrawingUrl) return;
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
      onChangePins(
        draftPins.map((p) => (p.key === selectedPin.key ? { ...p, xPercent, yPercent } : p))
      );
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

  function handleConfirmNewPin() {
    const cleanLabel = newPinLabel.trim();
    if (!cleanLabel || !draftPinCoords) return;
    const nextNum =
      draftPins.length > 0 ? Math.max(...draftPins.map((p) => p.pinNumber)) + 1 : 1;
    const newKey = `draft-pin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nextPin: DraftAssetPin = {
      key: newKey,
      pinNumber: nextNum,
      label: cleanLabel,
      guidance: newPinGuidance.trim(),
      xPercent: draftPinCoords.x,
      yPercent: draftPinCoords.y,
      linkedTaskId: newPinTaskId || null,
    };
    onChangePins([...draftPins, nextPin]);
    setSelectedPinKey(newKey);
    setDraftPinCoords(null);
    setNewPinLabel('');
    setNewPinGuidance('');
    setNewPinTaskId('');
  }

  function updateSelectedPin(patch: Partial<DraftAssetPin>) {
    if (!selectedPin) return;
    onChangePins(draftPins.map((p) => (p.key === selectedPin.key ? { ...p, ...patch } : p)));
  }

  function deletePin(pin: DraftAssetPin) {
    if (pin.id && onTrackDeletedPinId) {
      onTrackDeletedPinId(pin.id);
    }
    const next = draftPins.filter((p) => p.key !== pin.key);
    onChangePins(next);
    if (selectedPinKey === pin.key) {
      setSelectedPinKey(next[0]?.key ?? null);
    }
  }

  const linkedPinCount = draftPins.filter((p) => Boolean(p.linkedTaskId)).length;

  return (
    <div className="space-y-4">
      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E2E8F0] dark:border-[#1E293B]">
        <div className="text-xs text-[#64748B] dark:text-[#94A3B8] flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-[#60A5FA] shrink-0" />
          <span className="font-mono font-medium text-[#0F172A] dark:text-[#F8FAFC]">
            {assetCode || 'NEW-ASSET'}
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            {draftPins.length} pin{draftPins.length === 1 ? '' : 's'} · {linkedPinCount} task-linked
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeDrawingUrl && (
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

          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md cursor-pointer transition-colors whitespace-nowrap shrink-0">
            <Upload className="w-3.5 h-3.5" />
            <span>
              {processingDrawing
                ? 'Optimizing...'
                : activeDrawingUrl
                  ? 'Replace Drawing'
                  : 'Upload Drawing'}
            </span>
            <input
              type="file"
              accept={ACCEPTED_IMAGE_ACCEPT}
              disabled={processingDrawing}
              onChange={(e) => {
                onSelectDrawingFile(e.target.files?.[0]);
                e.target.value = '';
              }}
              className="hidden"
            />
          </label>

          {activeDrawingUrl && (
            <>
              <button
                type="button"
                onClick={() => {
                  setPlaceMode((v) => !v);
                  setRepositionActive(false);
                  setDraftPinCoords(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
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
                onClick={() => {
                  setPlaceMode(false);
                  setRepositionActive(false);
                  setDraftPinCoords(null);
                  onRemoveDrawing();
                }}
                title="Remove drawing"
                className="p-1.5 text-[#64748B] dark:text-[#94A3B8] hover:text-[#DC2626] dark:hover:text-[#F87171] border border-[#E2E8F0] dark:border-[#334155] rounded-md"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inline Drawing Error or Optimization Note */}
      {drawingError && (
        <div className="px-3.5 py-2.5 rounded-md border border-[#FECACA] dark:border-[#991B1B] bg-[#FEF2F2] dark:bg-[#450A0A]/60 text-xs text-[#991B1B] dark:text-[#FCA5A5] flex items-start justify-between gap-3">
          <span>{drawingError}</span>
          <button
            type="button"
            onClick={onClearError}
            className="text-[#991B1B] dark:text-[#FCA5A5] hover:opacity-75 shrink-0"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {draftDrawingNote && !drawingError && (
        <div className="px-3.5 py-2 rounded-md border border-[#BFDBFE] dark:border-[#1E3A8A] bg-[#EFF6FF] dark:bg-[#1E3A8A]/25 text-xs text-[#1E40AF] dark:text-[#93C5FD] flex items-center justify-between gap-2">
          <span>Staged schematic ready: {draftDrawingNote}. Click &ldquo;Save &amp; Sync Asset&rdquo; below to apply.</span>
        </div>
      )}

      {/* Split Canvas + Pin Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Canvas */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDropActive(false);
            const file = e.dataTransfer.files?.[0];
            if (file) onSelectDrawingFile(file);
          }}
          className={`lg:col-span-7 min-h-[320px] max-h-[52vh] bg-[#F1F5F9] dark:bg-[#0B1120] border border-[#E2E8F0] dark:border-[#334155] rounded-lg p-4 flex flex-col items-center justify-center overflow-auto transition-colors ${
            dropActive ? 'ring-2 ring-inset ring-[#1D4ED8] bg-[#EFF6FF] dark:bg-[#1E3A8A]/20' : ''
          }`}
        >
          {!activeDrawingUrl ? (
            <div className="text-center max-w-md space-y-3 py-8 px-5 border-2 border-dashed border-[#CBD5E1] dark:border-[#334155] rounded-lg bg-white/75 dark:bg-[#111827]/75">
              <ImageIcon className="w-9 h-9 text-[#94A3B8] mx-auto" />
              <div className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Attach Equipment Schematic or Visual Map
              </div>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                Drag &amp; drop a P&amp;ID diagram, GA floorplan, or equipment photo (PNG, JPG, WebP, SVG, HEIC). Oversized raster images are auto-compressed before saving.
              </p>
              <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>{processingDrawing ? 'Optimizing Image...' : 'Select Asset Drawing'}</span>
                <input
                  type="file"
                  accept={ACCEPTED_IMAGE_ACCEPT}
                  disabled={processingDrawing}
                  onChange={(e) => {
                    onSelectDrawingFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-2 max-w-full flex flex-col items-center">
              {(placeMode || repositionActive) && (
                <div className="px-3 py-1 text-xs font-medium bg-[#1D4ED8] text-white rounded-md">
                  {repositionActive
                    ? `Click anywhere on the drawing to move Pin #${selectedPin?.pinNumber}`
                    : 'Click anywhere on the drawing to place a new inspection point'}
                </div>
              )}
              {!placeMode && !repositionActive && draftPins.length > 0 && (
                <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Tip: Drag any pin to adjust position, or click &ldquo;Place Custom Pin&rdquo; to add more.
                </div>
              )}

              <div
                ref={imageWrapperRef}
                onClick={handleCanvasClick}
                style={{ width: zoomPercent === 100 ? 'auto' : `${zoomPercent}%` }}
                className={`relative inline-block border border-[#CBD5E1] dark:border-[#334155] rounded-md bg-white overflow-visible ${
                  placeMode || repositionActive ? 'cursor-crosshair' : ''
                }`}
              >
                <img
                  src={activeDrawingUrl}
                  alt={`${assetCode || 'Asset'} visual drawing preview`}
                  className={`block max-w-full select-none rounded-md ${
                    zoomPercent === 100 ? 'max-h-[42vh]' : 'w-full h-auto'
                  }`}
                  draggable={false}
                />

                {draftPins.map((pin) => {
                  const isSelected = selectedPin?.key === pin.key;
                  const isDraggingThis = pinDrag?.pinKey === pin.key;
                  const xPos = isDraggingThis ? pinDrag.xPercent : pin.xPercent;
                  const yPos = isDraggingThis ? pinDrag.yPercent : pin.yPercent;
                  const toneClass = pin.linkedTaskId
                    ? 'bg-[#0F766E] border-white text-white'
                    : 'bg-[#1D4ED8] border-white text-white';
                  const showTooltip = hoveredPinKey === pin.key && !isDraggingThis;
                  const linkedTask = pin.linkedTaskId ? taskById.get(pin.linkedTaskId) : undefined;

                  return (
                    <div
                      key={pin.key}
                      style={{ left: `${xPos}%`, top: `${yPos}%` }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 ${
                        isSelected || isDraggingThis || showTooltip ? 'z-30' : 'z-10'
                      }`}
                    >
                      <button
                        type="button"
                        onPointerDown={(e) => {
                          if (placeMode || repositionActive) return;
                          e.stopPropagation();
                          setSelectedPinKey(pin.key);
                          setDraftPinCoords(null);
                          setPinDrag({
                            pinKey: pin.key,
                            startClientX: e.clientX,
                            startClientY: e.clientY,
                            xPercent: pin.xPercent,
                            yPercent: pin.yPercent,
                            moved: false,
                          });
                        }}
                        onMouseEnter={() => setHoveredPinKey(pin.key)}
                        onMouseLeave={() =>
                          setHoveredPinKey((cur) => (cur === pin.key ? null : cur))
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPinKey(pin.key);
                          setDraftPinCoords(null);
                        }}
                        className={`relative w-7 h-7 rounded-full border-2 font-mono text-xs font-bold flex items-center justify-center shadow-md transition-transform ${toneClass} ${
                          !placeMode && !repositionActive
                            ? 'cursor-grab active:cursor-grabbing'
                            : 'cursor-pointer'
                        } ${isSelected ? 'scale-125 ring-4 ring-[#1D4ED8]/40' : 'hover:scale-110'}`}
                      >
                        {pin.pinNumber}
                        {pin.linkedTaskId && (
                          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-white dark:bg-[#0F172A] text-[#0F766E] dark:text-[#2DD4BF] border border-[#0F766E] flex items-center justify-center">
                            <Link2 className="w-2 h-2" />
                          </span>
                        )}
                      </button>

                      {showTooltip && (
                        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-9 w-52 p-2.5 rounded-md bg-[#0F172A] dark:bg-[#1E293B] text-white border border-[#334155] shadow-lg text-left">
                          <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-[#93C5FD]">
                            <span>Pin #{pin.pinNumber}</span>
                            <span>
                              ({xPos}%, {yPos}%)
                            </span>
                          </div>
                          <div className="text-xs font-semibold mt-0.5 leading-snug">
                            {pin.label}
                          </div>
                          {linkedTask && (
                            <div className="mt-1.5 pt-1.5 border-t border-[#334155] text-[10px] text-[#5EEAD4] flex items-center gap-1">
                              <Link2 className="w-3 h-3 shrink-0" />
                              <span className="truncate">
                                {linkedTask.wbsCode} {linkedTask.title}
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
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full border-2 border-dashed border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8] font-mono text-xs font-bold flex items-center justify-center shadow"
                  >
                    +
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Pin Properties & List Column */}
        <div className="lg:col-span-5 border border-[#E2E8F0] dark:border-[#334155] rounded-lg bg-[#F8FAFC] dark:bg-[#0F172A] p-4 flex flex-col justify-between gap-4 max-h-[52vh] overflow-y-auto">
          {draftPinCoords ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA]">
                  New Pin at ({draftPinCoords.x}%, {draftPinCoords.y}%)
                </span>
                <button
                  type="button"
                  onClick={() => setDraftPinCoords(null)}
                  className="text-xs text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Checkpoint Label
                </label>
                <input
                  type="text"
                  value={newPinLabel}
                  onChange={(e) => setNewPinLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirmNewPin();
                    }
                  }}
                  placeholder="e.g. Drive-End Bearing Housing"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Inspection Guidance
                </label>
                <textarea
                  rows={2}
                  value={newPinGuidance}
                  onChange={(e) => setNewPinGuidance(e.target.value)}
                  placeholder="What to check at this point..."
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Link to Project Task (Optional)
                </label>
                <select
                  value={newPinTaskId}
                  onChange={(e) => setNewPinTaskId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                >
                  <option value="">— No linked task —</option>
                  {groupedFilteredTasks.map((grp, idx) => (
                    <optgroup
                      key={grp.project?.id ?? idx}
                      label={grp.project ? `${grp.project.code} — ${grp.project.name}` : 'Project Tasks'}
                    >
                      {grp.items.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.wbsCode} · {t.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <button
                type="button"
                disabled={!newPinLabel.trim()}
                onClick={handleConfirmNewPin}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 rounded-md"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Add Pin to Drawing</span>
              </button>
            </div>
          ) : selectedPin ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA]">
                  Pin #{selectedPin.pinNumber} · ({selectedPin.xPercent}%, {selectedPin.yPercent}%)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!activeDrawingUrl}
                    onClick={() => {
                      setPlaceMode(false);
                      setRepositionActive((v) => !v);
                    }}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border whitespace-nowrap ${
                      repositionActive
                        ? 'bg-[#D97706] text-white border-[#D97706]'
                        : 'bg-white dark:bg-[#111827] text-[#475569] dark:text-[#CBD5E1] border-[#CBD5E1] dark:border-[#334155]'
                    }`}
                  >
                    <Crosshair className="w-3 h-3" />
                    <span>{repositionActive ? 'Click Canvas' : 'Move'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePin(selectedPin)}
                    title="Delete pin"
                    className="p-1 text-[#64748B] hover:text-[#DC2626] dark:hover:text-[#F87171] border border-[#E2E8F0] dark:border-[#334155] rounded bg-white dark:bg-[#111827]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8] mb-1">
                    Pin #
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={selectedPin.pinNumber}
                    onChange={(e) =>
                      updateSelectedPin({
                        pinNumber: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8] mb-1">
                    Checkpoint Label
                  </label>
                  <input
                    type="text"
                    value={selectedPin.label}
                    onChange={(e) => updateSelectedPin({ label: e.target.value })}
                    placeholder="Checkpoint label..."
                    className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8] mb-1">
                  Inspection Guidance
                </label>
                <textarea
                  rows={2}
                  value={selectedPin.guidance}
                  onChange={(e) => updateSelectedPin({ guidance: e.target.value })}
                  placeholder="Inspection check instructions..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-[11px] font-medium text-[#475569] dark:text-[#94A3B8]">
                    Linked Project Task
                  </label>
                  <div className="relative w-32">
                    <Search className="w-3 h-3 text-[#94A3B8] absolute left-2 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={taskFilterQuery}
                      onChange={(e) => setTaskFilterQuery(e.target.value)}
                      placeholder="Filter tasks..."
                      className="w-full pl-6 pr-2 py-1 text-[11px] bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded"
                    />
                  </div>
                </div>
                <select
                  value={selectedPin.linkedTaskId ?? ''}
                  onChange={(e) =>
                    updateSelectedPin({ linkedTaskId: e.target.value || null })
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded"
                >
                  <option value="">— No linked task —</option>
                  {groupedFilteredTasks.map((grp, idx) => (
                    <optgroup
                      key={grp.project?.id ?? idx}
                      label={grp.project ? `${grp.project.code} — ${grp.project.name}` : 'Project Tasks'}
                    >
                      {grp.items.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.wbsCode} · {t.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-[#64748B] dark:text-[#94A3B8]">
              {activeDrawingUrl
                ? 'Click "Place Custom Pin" above, then click on the drawing to mark an inspection checkpoint.'
                : 'Upload an equipment schematic or photo on the left to start placing inspection pins.'}
            </div>
          )}

          {draftPins.length > 0 && (
            <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#334155] space-y-1.5">
              <div className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                Staged Inspection Points ({draftPins.length})
              </div>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {draftPins.map((pin) => {
                  const isSel = selectedPin?.key === pin.key;
                  return (
                    <button
                      key={pin.key}
                      type="button"
                      onClick={() => {
                        setSelectedPinKey(pin.key);
                        setDraftPinCoords(null);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded text-xs flex items-center justify-between gap-2 border transition-colors ${
                        isSel
                          ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 border-[#93C5FD] dark:border-[#1D4ED8] text-[#0F172A] dark:text-[#F8FAFC]'
                          : 'bg-white dark:bg-[#111827] border-[#E2E8F0] dark:border-[#334155] text-[#475569] dark:text-[#CBD5E1] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B]'
                      }`}
                    >
                      <span className="truncate font-medium">
                        <span className="font-mono text-[#1D4ED8] dark:text-[#60A5FA] mr-1.5">
                          #{pin.pinNumber}
                        </span>
                        {pin.label || 'Untitled Pin'}
                      </span>
                      <span className="font-mono text-[10px] text-[#64748B] dark:text-[#94A3B8] shrink-0">
                        ({pin.xPercent}%, {pin.yPercent}%)
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
