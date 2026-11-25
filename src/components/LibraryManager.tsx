import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Camera,
  Check,
  ClipboardList,
  Download,
  Edit3,
  FileSpreadsheet,
  History,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  CriticalityLevel,
  CustomParameterType,
  FacilityArea,
  InspectionEntry,
  InspectionReport,
  LibraryItem,
  Project,
  ProjectTask,
  User,
  WorkspaceDefaults,
} from '../types.ts';
import { hasAnyRole } from '../types.ts';
import {
  downloadAssetCsvTemplate,
  formatAuditTimestamp,
  formatConditionLabel,
  formatReportStatusLabel,
  parseAssetCsvText,
  type ParsedAssetCsvRow,
} from '../utils/export.ts';
import { parseApiResponse, prepareImageForUpload } from '../utils/imageUpload.ts';
import {
  AssetVisualDraftPanel,
  type DraftAssetPin,
} from './AssetVisualDraftPanel.tsx';
import { AssetVisualModal } from './AssetVisualModal.tsx';
import { ResizableTh, useResizableColumns } from './ResizableTable.tsx';

interface LibraryManagerProps {
  items: LibraryItem[];
  facilityAreas: FacilityArea[];
  projects: Project[];
  tasks: ProjectTask[];
  reports: InspectionReport[];
  currentUser: User;
  token: string;
  onSyncComplete: () => Promise<void>;
  onNotify: (message: string, kind?: 'info' | 'error') => void;
  onNavigateToTask?: (projectId: string, taskId: string) => void;
  onOpenReport?: (reportId: string) => void;
  onOpenAssetHistory?: (assetId: string) => void;
  initialVisualAssetId?: string | null;
  onClearInitialVisualAsset?: () => void;
  workspaceDefaults?: WorkspaceDefaults;
}

type LibrarySubTab = 'items' | 'facilities';

interface DraftParameter {
  id?: string;
  label: string;
  paramType: CustomParameterType;
  unit: string;
  isRequired: boolean;
}

interface ItemFormState {
  code: string;
  category: string;
  title: string;
  description: string;
  criteria: string;
  facilityAreaId: string;
  requirePhoto: boolean;
  criticality: CriticalityLevel;
  isActive: boolean;
  parameters: DraftParameter[];
}

interface FacilityFormState {
  code: string;
  name: string;
  building: string;
  riskLevel: CriticalityLevel;
  description: string;
  isActive: boolean;
}

const EMPTY_ITEM_FORM: ItemFormState = {
  code: '',
  category: 'Production Equipment',
  title: '',
  description: '',
  criteria: '',
  facilityAreaId: '',
  requirePhoto: true,
  criticality: 'medium',
  isActive: true,
  parameters: [],
};

const EMPTY_FACILITY_FORM: FacilityFormState = {
  code: '',
  name: '',
  building: '',
  riskLevel: 'medium',
  description: '',
  isActive: true,
};

export function LibraryManager({
  items,
  facilityAreas,
  projects,
  tasks,
  reports,
  currentUser,
  token,
  onSyncComplete,
  onNotify,
  onNavigateToTask,
  onOpenReport,
  onOpenAssetHistory,
  initialVisualAssetId,
  onClearInitialVisualAsset,
  workspaceDefaults,
}: LibraryManagerProps) {
  const [subTab, setSubTab] = useState<LibrarySubTab>('items');

  const canEdit = hasAnyRole(currentUser, 'admin', 'approver');

  // Assets state
  const [search, setSearch] = useState('');
  const [facilityFilter, setFacilityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [visualOnly, setVisualOnly] = useState(false);
  const [editingItem, setEditingItem] = useState<LibraryItem | null>(null);
  const [showItemModal, setShowItemModal] = useState(false);
  const [activeItemModalTab, setActiveItemModalTab] = useState<'details' | 'visual'>('details');
  const [createdDraftAssetId, setCreatedDraftAssetId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(EMPTY_ITEM_FORM);
  const [savingItem, setSavingItem] = useState(false);
  const [saveStatusText, setSaveStatusText] = useState<string | null>(null);

  // Staged visual map state inside Add/Edit Asset Modal
  const [draftDrawingFile, setDraftDrawingFile] = useState<File | null>(null);
  const [draftDrawingPreviewUrl, setDraftDrawingPreviewUrl] = useState<string | null>(null);
  const [draftDrawingNote, setDraftDrawingNote] = useState<string | null>(null);
  const [draftDrawingRemoved, setDraftDrawingRemoved] = useState(false);
  const [processingDrawing, setProcessingDrawing] = useState(false);
  const [drawingError, setDrawingError] = useState<string | null>(null);
  const [draftPins, setDraftPins] = useState<DraftAssetPin[]>([]);
  const [deletedPinIds, setDeletedPinIds] = useState<string[]>([]);

  const [visualAssetId, setVisualAssetId] = useState<string | null>(null);
  const [historyAssetId, setHistoryAssetId] = useState<string | null>(null);

  // CSV Import state
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvRawText, setCsvRawText] = useState('');
  const [csvParsedRows, setCsvParsedRows] = useState<ParsedAssetCsvRow[]>([]);
  const [importingCsv, setImportingCsv] = useState(false);
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!initialVisualAssetId) return;
    setSubTab('items');
    setVisualAssetId(initialVisualAssetId);
    onClearInitialVisualAsset?.();
  }, [initialVisualAssetId, onClearInitialVisualAsset]);

  // Facility areas state
  const [facSearch, setFacSearch] = useState('');
  const [facRiskFilter, setFacRiskFilter] = useState<'all' | CriticalityLevel>('all');
  const [editingFacility, setEditingFacility] = useState<FacilityArea | null>(null);
  const [showFacilityModal, setShowFacilityModal] = useState(false);
  const [facForm, setFacForm] = useState<FacilityFormState>(EMPTY_FACILITY_FORM);
  const [savingFacility, setSavingFacility] = useState(false);

  const { widths: itemCols, startResize: resizeItemCol } = useResizableColumns({
    code: 96,
    item: 300,
    facility: 165,
    category: 145,
    params: 130,
    visual: 145,
    photo: 90,
    criticality: 95,
    state: 85,
    actions: 115,
  });

  const { widths: facCols, startResize: resizeFacCol } = useResizableColumns({
    code: 110,
    name: 310,
    building: 185,
    risk: 115,
    state: 100,
    actions: 90,
  });

  const visualAsset = useMemo(
    () => (visualAssetId ? items.find((i) => i.id === visualAssetId) ?? null : null),
    [items, visualAssetId]
  );

  const historyAsset = useMemo(
    () => (historyAssetId ? items.find((i) => i.id === historyAssetId) ?? null : null),
    [items, historyAssetId]
  );

  const assetHistoryEntries = useMemo(() => {
    if (!historyAsset) return [] as { report: InspectionReport; entry: InspectionEntry }[];
    const matches: { report: InspectionReport; entry: InspectionEntry }[] = [];
    for (const rep of reports) {
      for (const ent of rep.entries) {
        if (ent.libraryItemId === historyAsset.id || ent.itemCode === historyAsset.code) {
          matches.push({ report: rep, entry: ent });
        }
      }
    }
    matches.sort((a, b) => {
      const da = a.report.submittedAt || a.report.createdAt;
      const db = b.report.submittedAt || b.report.createdAt;
      return db.localeCompare(da);
    });
    return matches;
  }, [historyAsset, reports]);

  const numericParamSummaries = useMemo(() => {
    if (!historyAsset || assetHistoryEntries.length === 0) return [];
    const bucket = new Map<
      string,
      { label: string; unit: string; values: number[]; latest: number; latestDate: string }
    >();
    for (const { report, entry } of assetHistoryEntries) {
      for (const pv of entry.parameterValues ?? []) {
        if (pv.paramType !== 'number') continue;
        const parsed = Number(pv.valueText);
        if (pv.valueText === '' || Number.isNaN(parsed)) continue;
        const existing = bucket.get(pv.label);
        if (!existing) {
          bucket.set(pv.label, {
            label: pv.label,
            unit: pv.unit,
            values: [parsed],
            latest: parsed,
            latestDate: report.submittedAt || report.createdAt,
          });
        } else {
          existing.values.push(parsed);
        }
      }
    }
    return Array.from(bucket.values()).map((item) => {
      const sum = item.values.reduce((acc, v) => acc + v, 0);
      return {
        label: item.label,
        unit: item.unit,
        count: item.values.length,
        latest: item.latest,
        latestDate: item.latestDate,
        avg: Math.round((sum / item.values.length) * 100) / 100,
        min: Math.min(...item.values),
        max: Math.max(...item.values),
      };
    });
  }, [historyAsset, assetHistoryEntries]);

  const categories = useMemo(() => {
    const set = new Set<string>(items.map((i) => i.category));
    return Array.from(set).sort();
  }, [items]);

  const buildings = useMemo(() => {
    const set = new Set<string>(
      facilityAreas.map((f) => f.building).filter((b) => Boolean(b.trim()))
    );
    return Array.from(set).sort();
  }, [facilityAreas]);

  const assetsWithDrawingCount = useMemo(
    () => items.filter((i) => Boolean(i.drawingUrl)).length,
    [items]
  );

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (facilityFilter !== 'all') {
        if (facilityFilter === 'unassigned') {
          if (item.facilityAreaId) return false;
        } else if (item.facilityAreaId !== facilityFilter) {
          return false;
        }
      }
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (visualOnly && !item.drawingUrl) return false;
      if (!q) return true;
      return (
        item.code.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.facilityAreaName || '').toLowerCase().includes(q) ||
        item.criteria.toLowerCase().includes(q)
      );
    });
  }, [items, search, facilityFilter, categoryFilter, visualOnly]);

  const filteredFacilities = useMemo(() => {
    const q = facSearch.trim().toLowerCase();
    return facilityAreas.filter((fac) => {
      if (facRiskFilter !== 'all' && fac.riskLevel !== facRiskFilter) return false;
      if (!q) return true;
      return (
        fac.code.toLowerCase().includes(q) ||
        fac.name.toLowerCase().includes(q) ||
        fac.building.toLowerCase().includes(q) ||
        fac.description.toLowerCase().includes(q)
      );
    });
  }, [facilityAreas, facSearch, facRiskFilter]);

  // --- Asset Library Handlers ---

  function revokePreviewUrl(url: string | null) {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }

  useEffect(() => {
    return () => {
      revokePreviewUrl(draftDrawingPreviewUrl);
    };
  }, [draftDrawingPreviewUrl]);

  function closeItemModal() {
    revokePreviewUrl(draftDrawingPreviewUrl);
    setDraftDrawingFile(null);
    setDraftDrawingPreviewUrl(null);
    setDraftDrawingNote(null);
    setDraftDrawingRemoved(false);
    setDrawingError(null);
    setDraftPins([]);
    setDeletedPinIds([]);
    setCreatedDraftAssetId(null);
    setSaveStatusText(null);
    setShowItemModal(false);
  }

  function openCreateItemModal() {
    revokePreviewUrl(draftDrawingPreviewUrl);
    setEditingItem(null);
    setCreatedDraftAssetId(null);
    setActiveItemModalTab('details');
    setDraftDrawingFile(null);
    setDraftDrawingPreviewUrl(null);
    setDraftDrawingNote(null);
    setDraftDrawingRemoved(false);
    setDrawingError(null);
    setDraftPins([]);
    setDeletedPinIds([]);
    setSaveStatusText(null);
    const defaultFacId = facilityAreas.find((f) => f.isActive)?.id ?? '';
    setItemForm({
      ...EMPTY_ITEM_FORM,
      code: `AST-${String(items.length + 1).padStart(2, '0')}`,
      facilityAreaId: defaultFacId,
      criticality: workspaceDefaults?.defaultCriticality ?? 'medium',
      requirePhoto: workspaceDefaults?.defaultRequirePhoto ?? true,
      parameters: [],
    });
    setShowItemModal(true);
  }

  function openEditItemModal(item: LibraryItem) {
    revokePreviewUrl(draftDrawingPreviewUrl);
    setEditingItem(item);
    setCreatedDraftAssetId(item.id);
    setActiveItemModalTab('details');
    setDraftDrawingFile(null);
    setDraftDrawingPreviewUrl(null);
    setDraftDrawingNote(null);
    setDraftDrawingRemoved(false);
    setDrawingError(null);
    setDraftPins(
      (item.pins ?? []).map((p) => ({
        key: p.id,
        id: p.id,
        pinNumber: p.pinNumber,
        label: p.label,
        guidance: p.guidance,
        xPercent: p.xPercent,
        yPercent: p.yPercent,
        linkedTaskId: p.linkedTaskId ?? null,
      }))
    );
    setDeletedPinIds([]);
    setSaveStatusText(null);
    setItemForm({
      code: item.code,
      category: item.category,
      title: item.title,
      description: item.description,
      criteria: item.criteria,
      facilityAreaId: item.facilityAreaId ?? '',
      requirePhoto: item.requirePhoto,
      criticality: item.criticality,
      isActive: item.isActive,
      parameters: (item.parameters ?? []).map((p) => ({
        id: p.id,
        label: p.label,
        paramType: p.paramType,
        unit: p.unit,
        isRequired: p.isRequired,
      })),
    });
    setShowItemModal(true);
  }

  async function handleSelectDraftDrawing(file: File | undefined) {
    if (!file) return;
    setDrawingError(null);
    setProcessingDrawing(true);
    try {
      const prepared = await prepareImageForUpload(file, 'drawing');
      const previewUrl = URL.createObjectURL(prepared.file);
      revokePreviewUrl(draftDrawingPreviewUrl);
      setDraftDrawingFile(prepared.file);
      setDraftDrawingPreviewUrl(previewUrl);
      setDraftDrawingNote(prepared.note);
      setDraftDrawingRemoved(false);
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Unable to process selected drawing file.';
      setDrawingError(msg);
      onNotify(msg, 'error');
    } finally {
      setProcessingDrawing(false);
    }
  }

  function handleRemoveDraftDrawing() {
    revokePreviewUrl(draftDrawingPreviewUrl);
    setDraftDrawingFile(null);
    setDraftDrawingPreviewUrl(null);
    setDraftDrawingNote(null);
    setDraftDrawingRemoved(true);
    setDrawingError(null);
  }

  function addDraftParameter() {
    setItemForm((prev) => ({
      ...prev,
      parameters: [
        ...prev.parameters,
        { label: '', paramType: 'number', unit: '', isRequired: false },
      ],
    }));
  }

  function updateDraftParameter(idx: number, patch: Partial<DraftParameter>) {
    setItemForm((prev) => {
      const next = [...prev.parameters];
      const current = next[idx];
      if (!current) return prev;
      const merged = { ...current, ...patch };
      if (patch.paramType && patch.paramType !== 'number') {
        merged.unit = '';
      }
      next[idx] = merged;
      return { ...prev, parameters: next };
    });
  }

  function removeDraftParameter(idx: number) {
    setItemForm((prev) => ({
      ...prev,
      parameters: prev.parameters.filter((_, i) => i !== idx),
    }));
  }

  async function handleSaveItem(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;

    if (!itemForm.code.trim() || !itemForm.category.trim() || !itemForm.title.trim()) {
      setActiveItemModalTab('details');
      onNotify('Asset code, category, and title are required before saving.', 'error');
      return;
    }

    setSavingItem(true);
    setDrawingError(null);
    setSaveStatusText('Saving asset details...');

    try {
      const activeAssetId = editingItem?.id ?? createdDraftAssetId;
      const url = activeAssetId ? `/api/library/${activeAssetId}` : '/api/library';
      const method = activeAssetId ? 'PATCH' : 'POST';
      const payload = {
        ...itemForm,
        facilityAreaId: itemForm.facilityAreaId || null,
        parameters: itemForm.parameters.filter((p) => p.label.trim().length > 0),
      };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const parsed = await parseApiResponse<{ id?: string; error?: string }>(res);
      if (!parsed.ok) {
        onNotify(parsed.errorMessage ?? 'Failed to save asset.', 'error');
        return;
      }

      const targetAssetId = activeAssetId ?? parsed.data?.id ?? null;
      if (!targetAssetId) {
        onNotify('Asset was created without an ID response.', 'error');
        return;
      }
      if (!activeAssetId) {
        setCreatedDraftAssetId(targetAssetId);
      }

      // 1. Drawing removal or upload
      if (draftDrawingRemoved && !draftDrawingFile && editingItem?.drawingUrl) {
        setSaveStatusText('Removing previous drawing...');
        const delRes = await fetch(`/api/library/${targetAssetId}/drawing`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        const delParsed = await parseApiResponse<{ error?: string }>(delRes);
        if (!delParsed.ok) {
          const msg = delParsed.errorMessage ?? 'Failed to remove existing drawing.';
          setActiveItemModalTab('visual');
          setDrawingError(msg);
          onNotify(msg, 'error');
          await onSyncComplete();
          return;
        }
      }

      if (draftDrawingFile) {
        setSaveStatusText('Uploading schematic drawing...');
        const fd = new FormData();
        fd.append('drawing', draftDrawingFile);
        const drawRes = await fetch(`/api/library/${targetAssetId}/drawing`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const drawParsed = await parseApiResponse<{ drawingUrl?: string; error?: string }>(drawRes);
        if (!drawParsed.ok) {
          const msg = drawParsed.errorMessage ?? 'Asset saved, but drawing upload failed.';
          setActiveItemModalTab('visual');
          setDrawingError(msg);
          onNotify(msg, 'error');
          await onSyncComplete();
          return;
        }
      }

      // 2. Sync deleted, modified, and newly staged inspection pins
      if (deletedPinIds.length > 0 || draftPins.length > 0) {
        setSaveStatusText('Syncing visual inspection pins...');
      }

      for (const pinId of deletedPinIds) {
        const delPinRes = await fetch(`/api/pins/${pinId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        const delPinParsed = await parseApiResponse<{ error?: string }>(delPinRes);
        if (!delPinParsed.ok) {
          onNotify(delPinParsed.errorMessage ?? 'Failed to delete an inspection pin.', 'error');
          setActiveItemModalTab('visual');
          await onSyncComplete();
          return;
        }
      }

      for (const pin of draftPins) {
        const cleanLabel = pin.label.trim() || `Checkpoint #${pin.pinNumber}`;
        if (pin.id) {
          const orig = editingItem?.pins?.find((p) => p.id === pin.id);
          const changed =
            !orig ||
            orig.pinNumber !== pin.pinNumber ||
            orig.label !== cleanLabel ||
            orig.guidance !== pin.guidance.trim() ||
            orig.xPercent !== pin.xPercent ||
            orig.yPercent !== pin.yPercent ||
            (orig.linkedTaskId ?? null) !== (pin.linkedTaskId ?? null);

          if (changed) {
            const updRes = await fetch(`/api/pins/${pin.id}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                pinNumber: pin.pinNumber,
                label: cleanLabel,
                guidance: pin.guidance.trim(),
                xPercent: pin.xPercent,
                yPercent: pin.yPercent,
                linkedTaskId: pin.linkedTaskId || null,
              }),
            });
            const updParsed = await parseApiResponse<{ error?: string }>(updRes);
            if (!updParsed.ok) {
              onNotify(updParsed.errorMessage ?? `Failed to update Pin #${pin.pinNumber}.`, 'error');
              setActiveItemModalTab('visual');
              await onSyncComplete();
              return;
            }
          }
        } else {
          const addRes = await fetch(`/api/library/${targetAssetId}/pins`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              pinNumber: pin.pinNumber,
              label: cleanLabel,
              guidance: pin.guidance.trim(),
              xPercent: pin.xPercent,
              yPercent: pin.yPercent,
              linkedTaskId: pin.linkedTaskId || null,
            }),
          });
          const addParsed = await parseApiResponse<{ id?: string; error?: string }>(addRes);
          if (!addParsed.ok) {
            onNotify(addParsed.errorMessage ?? `Failed to save Pin #${pin.pinNumber}.`, 'error');
            setActiveItemModalTab('visual');
            await onSyncComplete();
            return;
          }
        }
      }

      const wasEditing = Boolean(editingItem);
      const pinSummary =
        draftPins.length > 0 ? ` with ${draftPins.length} visual pin(s)` : '';
      closeItemModal();
      await onSyncComplete();
      onNotify(
        wasEditing
          ? `Updated ${itemForm.code}${pinSummary} and synced changes.`
          : `Added asset ${itemForm.code}${pinSummary} to Asset Library.`
      );
    } catch (err) {
      onNotify(
        err instanceof Error && err.message
          ? err.message
          : 'Network error while saving asset.',
        'error'
      );
    } finally {
      setSavingItem(false);
      setSaveStatusText(null);
    }
  }

  async function handleDeleteItem(item: LibraryItem) {
    if (!canEdit) return;
    try {
      const res = await fetch(`/api/library/${item.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        onNotify(data.error ?? 'Failed to remove asset.', 'error');
        return;
      }
      await onSyncComplete();
      onNotify(`Removed ${item.code} from Asset Library.`);
    } catch {
      onNotify('Network error while deleting asset.', 'error');
    }
  }

  async function toggleItemActive(item: LibraryItem) {
    if (!canEdit) return;
    try {
      const res = await fetch(`/api/library/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      if (!res.ok) return;
      await onSyncComplete();
      onNotify(`${item.code} marked ${!item.isActive ? 'Active' : 'Archived'}.`);
    } catch {
      onNotify('Unable to update asset status.', 'error');
    }
  }

  // --- CSV Import Handlers ---

  function handleCsvTextChange(nextText: string) {
    setCsvRawText(nextText);
    setCsvParsedRows(parseAssetCsvText(nextText));
  }

  async function handleCsvFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    handleCsvTextChange(text);
    e.target.value = '';
  }

  async function handleConfirmCsvImport() {
    const validRows = csvParsedRows.filter((r) => !r.error);
    if (validRows.length === 0) {
      onNotify('No valid CSV rows to import.', 'error');
      return;
    }
    setImportingCsv(true);
    try {
      const res = await fetch('/api/library/import-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rows: validRows }),
      });
      const data = (await res.json()) as {
        createdCount?: number;
        updatedCount?: number;
        error?: string;
      };
      if (!res.ok) {
        onNotify(data.error ?? 'CSV import failed.', 'error');
        return;
      }
      setShowCsvModal(false);
      setCsvRawText('');
      setCsvParsedRows([]);
      await onSyncComplete();
      onNotify(
        `CSV import complete: ${data.createdCount ?? 0} created, ${data.updatedCount ?? 0} updated.`
      );
    } catch {
      onNotify('Network error while importing CSV.', 'error');
    } finally {
      setImportingCsv(false);
    }
  }

  // --- Facility / Zone Area Handlers ---

  function openCreateFacilityModal() {
    setEditingFacility(null);
    setFacForm({
      ...EMPTY_FACILITY_FORM,
      code: `FAC-${String(facilityAreas.length + 1).padStart(2, '0')}`,
    });
    setShowFacilityModal(true);
  }

  function openEditFacilityModal(fac: FacilityArea) {
    setEditingFacility(fac);
    setFacForm({
      code: fac.code,
      name: fac.name,
      building: fac.building,
      riskLevel: fac.riskLevel,
      description: fac.description,
      isActive: fac.isActive,
    });
    setShowFacilityModal(true);
  }

  async function handleSaveFacility(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSavingFacility(true);
    try {
      const url = editingFacility ? `/api/facilities/${editingFacility.id}` : '/api/facilities';
      const method = editingFacility ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(facForm),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify(data.error ?? 'Failed to save facility zone.', 'error');
        return;
      }
      setShowFacilityModal(false);
      await onSyncComplete();
      onNotify(
        editingFacility
          ? `Updated facility zone ${facForm.code} — ${facForm.name}.`
          : `Added facility zone ${facForm.code} — ${facForm.name}.`
      );
    } catch {
      onNotify('Network error while saving facility zone.', 'error');
    } finally {
      setSavingFacility(false);
    }
  }

  async function handleDeleteFacility(fac: FacilityArea) {
    if (!canEdit) return;
    try {
      const res = await fetch(`/api/facilities/${fac.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        onNotify(data.error ?? 'Failed to remove facility zone.', 'error');
        return;
      }
      await onSyncComplete();
      onNotify(`Removed facility zone ${fac.code}.`);
    } catch {
      onNotify('Network error while deleting facility zone.', 'error');
    }
  }

  async function toggleFacilityActive(fac: FacilityArea) {
    if (!canEdit) return;
    try {
      const res = await fetch(`/api/facilities/${fac.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !fac.isActive }),
      });
      if (!res.ok) return;
      await onSyncComplete();
      onNotify(`${fac.code} marked ${!fac.isActive ? 'Active' : 'Archived'}.`);
    } catch {
      onNotify('Unable to update facility status.', 'error');
    }
  }

  return (
    <div className="space-y-5">
      {/* Top Sub-Tab Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] dark:bg-[#0F172A] rounded-md border border-[#E2E8F0] dark:border-[#1E293B]">
          <button
            type="button"
            onClick={() => setSubTab('items')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'items'
                ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Assets</span>
            <span className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
              ({items.length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('facilities')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'facilities'
                ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Facility / Zone Areas</span>
            <span className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
              ({facilityAreas.length})
            </span>
          </button>
        </div>

        <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">
          Drag column borders to resize · Assets include Facility Zone, Visual Pins &amp; Custom Parameters
        </span>
      </div>

      {subTab === 'items' ? (
        <>
          {/* Assets Controls */}
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-4 h-4 text-[#64748B] dark:text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search asset code, title, zone, criteria..."
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8] focus:bg-white dark:focus:bg-[#0F172A]"
                />
              </div>

              <select
                value={facilityFilter}
                onChange={(e) => setFacilityFilter(e.target.value)}
                className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md text-[#334155] dark:text-[#CBD5E1] focus:outline-none focus:border-[#1D4ED8]"
              >
                <option value="all">All Facility Zones</option>
                {facilityAreas.map((fac) => (
                  <option key={fac.id} value={fac.id}>
                    {fac.code} — {fac.name}
                  </option>
                ))}
                <option value="unassigned">Unassigned Zone</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md text-[#334155] dark:text-[#CBD5E1] focus:outline-none focus:border-[#1D4ED8]"
              >
                <option value="all">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setVisualOnly((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  visualOnly
                    ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 text-[#1D4ED8] dark:text-[#93C5FD] border-[#1D4ED8]'
                    : 'bg-white dark:bg-[#0F172A] text-[#475569] dark:text-[#CBD5E1] border-[#CBD5E1] dark:border-[#334155] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>With Visual Map ({assetsWithDrawingCount})</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs text-[#64748B] dark:text-[#94A3B8] font-mono tabular-nums mr-1">
                {filteredItems.length} of {items.length} assets
              </span>

              <button
                type="button"
                onClick={() => downloadAssetCsvTemplate(facilityAreas)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] bg-white dark:bg-[#0F172A] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV Template</span>
              </button>

              {canEdit ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setCsvRawText('');
                      setCsvParsedRows([]);
                      setShowCsvModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#1D4ED8] dark:text-[#93C5FD] bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 hover:bg-[#DBEAFE] dark:hover:bg-[#1E3A8A]/50 border border-[#BFDBFE] dark:border-[#1E40AF] rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={openCreateItemModal}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Asset</span>
                  </button>
                </>
              ) : (
                <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  Read-only (Admin or Approver role required to edit)
                </span>
              )}
            </div>
          </div>

          {/* Assets Compact Mobile Card View (< md) */}
          <div className="md:hidden space-y-2.5">
            {filteredItems.length === 0 ? (
              <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl p-8 text-center text-sm text-[#64748B] dark:text-[#94A3B8]">
                No assets match your filters.
              </div>
            ) : (
              filteredItems.map((item) => {
                const pinCount = item.pins?.length ?? 0;
                const paramCount = item.parameters?.length ?? 0;
                const hasDrawing = Boolean(item.drawingUrl);

                return (
                  <div
                    key={item.id}
                    className={`bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl p-3.5 space-y-2.5 ${
                      !item.isActive ? 'opacity-65' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-bold text-[#1D4ED8] dark:text-[#60A5FA]">
                            {item.code}
                          </span>
                          <span className="text-[#64748B] dark:text-[#94A3B8] truncate">
                            {item.category}
                          </span>
                        </div>
                        <div className="font-semibold text-sm text-[#0F172A] dark:text-[#F8FAFC] mt-0.5">
                          {item.title}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-semibold capitalize shrink-0 ${
                          item.criticality === 'high'
                            ? 'text-[#DC2626] dark:text-[#F87171]'
                            : item.criticality === 'medium'
                            ? 'text-[#D97706] dark:text-[#FBBF24]'
                            : 'text-[#475569] dark:text-[#94A3B8]'
                        }`}
                      >
                        {item.criticality}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#64748B] dark:text-[#94A3B8]">
                      <span>{item.facilityAreaName || 'Unassigned Zone'}</span>
                      <span>·</span>
                      <span className="font-mono">{paramCount} params</span>
                      <span>·</span>
                      <span
                        className={
                          item.isActive
                            ? 'text-[#16A34A] dark:text-[#4ADE80] font-medium'
                            : 'text-[#64748B] dark:text-[#94A3B8]'
                        }
                      >
                        {item.isActive ? 'Active' : 'Archived'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#F1F5F9] dark:border-[#1E293B]">
                      <button
                        type="button"
                        onClick={() => setVisualAssetId(item.id)}
                        className="min-h-[40px] inline-flex items-center gap-1.5 px-2.5 text-xs font-medium text-[#1D4ED8] dark:text-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 rounded-lg"
                      >
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span>{hasDrawing ? `Map (${pinCount})` : 'Visual Map'}</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenAssetHistory
                              ? onOpenAssetHistory(item.id)
                              : setHistoryAssetId(item.id)
                          }
                          className="min-h-[40px] inline-flex items-center gap-1 px-2.5 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-lg"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>History</span>
                        </button>
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditItemModal(item)}
                              aria-label="Edit asset"
                              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] hover:text-[#1D4ED8] bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-lg"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(item)}
                              aria-label="Delete asset"
                              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#DC2626] dark:text-[#F87171] bg-[#FEF2F2] dark:bg-[#7F1D1D]/25 border border-[#FECACA] dark:border-[#991B1B] rounded-lg"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Assets Resizable Table (Desktop & Tablet) */}
          <div className="hidden md:block bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0F172A] text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                    <ResizableTh
                      width={itemCols.code}
                      onStartResize={(e) => resizeItemCol('code', e)}
                      className="py-3 px-4"
                    >
                      Code
                    </ResizableTh>
                    <ResizableTh
                      width={itemCols.item}
                      onStartResize={(e) => resizeItemCol('item', e)}
                      className="py-3 px-4"
                    >
                      Asset Title &amp; Acceptance Criteria
                    </ResizableTh>
                    <ResizableTh
                      width={itemCols.facility}
                      onStartResize={(e) => resizeItemCol('facility', e)}
                      className="py-3 px-4"
                    >
                      Facility / Zone
                    </ResizableTh>
                    <ResizableTh
                      width={itemCols.category}
                      onStartResize={(e) => resizeItemCol('category', e)}
                      className="py-3 px-4"
                    >
                      Category
                    </ResizableTh>
                    <ResizableTh
                      width={itemCols.params}
                      onStartResize={(e) => resizeItemCol('params', e)}
                      className="py-3 px-4"
                    >
                      Custom Params
                    </ResizableTh>
                    <ResizableTh
                      width={itemCols.visual}
                      onStartResize={(e) => resizeItemCol('visual', e)}
                      className="py-3 px-4"
                    >
                      Visual Map
                    </ResizableTh>
                    <ResizableTh
                      width={itemCols.photo}
                      onStartResize={(e) => resizeItemCol('photo', e)}
                      className="py-3 px-4"
                    >
                      Photo
                    </ResizableTh>
                    <ResizableTh
                      width={itemCols.criticality}
                      onStartResize={(e) => resizeItemCol('criticality', e)}
                      className="py-3 px-4"
                    >
                      Criticality
                    </ResizableTh>
                    <ResizableTh
                      width={itemCols.state}
                      onStartResize={(e) => resizeItemCol('state', e)}
                      className="py-3 px-4"
                    >
                      State
                    </ResizableTh>
                    <ResizableTh
                      width={itemCols.actions}
                      onStartResize={(e) => resizeItemCol('actions', e)}
                      align="right"
                      className="py-3 px-4"
                    >
                      Actions
                    </ResizableTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B] text-sm">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="py-10 px-4 text-center text-sm text-[#64748B] dark:text-[#94A3B8]"
                      >
                        No assets match your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const pinCount = item.pins?.length ?? 0;
                      const paramCount = item.parameters?.length ?? 0;
                      const hasDrawing = Boolean(item.drawingUrl);

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/60 transition-colors ${
                            !item.isActive ? 'opacity-60' : ''
                          }`}
                        >
                          <td className="py-3 px-4 font-mono text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate align-top">
                            {item.code}
                          </td>
                          <td className="py-3 px-4 align-top min-w-0">
                            <div className="font-medium text-[#0F172A] dark:text-[#F8FAFC] text-sm break-words">
                              {item.title}
                            </div>
                            {item.description && (
                              <div className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5 break-words">
                                {item.description}
                              </div>
                            )}
                            {item.criteria && (
                              <div className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1 break-words">
                                <span className="font-medium text-[#334155] dark:text-[#CBD5E1]">
                                  Criteria:
                                </span>{' '}
                                {item.criteria}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-[#334155] dark:text-[#CBD5E1] align-top">
                            {item.facilityAreaName ? (
                              <span className="inline-flex items-center gap-1 text-xs text-[#0F172A] dark:text-[#F8FAFC] break-words">
                                <Building2 className="w-3.5 h-3.5 text-[#64748B] dark:text-[#94A3B8] shrink-0" />
                                <span>{item.facilityAreaName}</span>
                              </span>
                            ) : (
                              <span className="text-[#94A3B8] dark:text-[#64748B]">— Unassigned</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-[#334155] dark:text-[#CBD5E1] truncate align-top">
                            {item.category}
                          </td>
                          <td className="py-3 px-4 text-xs align-top">
                            {paramCount > 0 ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-[#1D4ED8] dark:text-[#60A5FA]">
                                  <SlidersHorizontal className="w-3 h-3 shrink-0" />
                                  <span>
                                    {paramCount} field{paramCount === 1 ? '' : 's'}
                                  </span>
                                </span>
                                <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                                  {item.parameters.map((p) => p.label).join(', ')}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[#94A3B8] dark:text-[#64748B]">None</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs whitespace-nowrap align-top">
                            {(() => {
                              const linkedCount = (item.pins ?? []).filter((p) => Boolean(p.linkedTaskId)).length;
                              return (
                                <button
                                  type="button"
                                  onClick={() => setVisualAssetId(item.id)}
                                  className={`inline-flex items-center gap-1.5 font-medium hover:underline ${
                                    hasDrawing
                                      ? 'text-[#1D4ED8] dark:text-[#60A5FA]'
                                      : 'text-[#64748B] dark:text-[#94A3B8]'
                                  }`}
                                >
                                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                                  <span>
                                    {hasDrawing
                                      ? `Drawing (${pinCount} pin${pinCount === 1 ? '' : 's'}${
                                          linkedCount > 0 ? ` · ${linkedCount} linked` : ''
                                        })`
                                      : canEdit
                                      ? 'Upload Drawing & Pin'
                                      : 'No Drawing'}
                                  </span>
                                </button>
                              );
                            })()}
                          </td>
                          <td className="py-3 px-4 text-xs whitespace-nowrap align-top">
                            {item.requirePhoto ? (
                              <span className="inline-flex items-center gap-1 text-[#1D4ED8] dark:text-[#60A5FA] font-medium">
                                <Camera className="w-3.5 h-3.5 shrink-0" />
                                <span>Required</span>
                              </span>
                            ) : (
                              <span className="text-[#64748B] dark:text-[#94A3B8]">Optional</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs whitespace-nowrap align-top capitalize">
                            <span
                              className={`font-medium ${
                                item.criticality === 'high'
                                  ? 'text-[#DC2626] dark:text-[#F87171]'
                                  : item.criticality === 'medium'
                                  ? 'text-[#D97706] dark:text-[#FBBF24]'
                                  : 'text-[#475569] dark:text-[#94A3B8]'
                              }`}
                            >
                              {item.criticality}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs whitespace-nowrap align-top">
                            {canEdit ? (
                              <button
                                type="button"
                                onClick={() => toggleItemActive(item)}
                                className={`text-xs font-medium hover:underline ${
                                  item.isActive
                                    ? 'text-[#16A34A] dark:text-[#4ADE80]'
                                    : 'text-[#64748B] dark:text-[#94A3B8]'
                                }`}
                              >
                                {item.isActive ? 'Active' : 'Archived'}
                              </button>
                            ) : (
                              <span
                                className={
                                  item.isActive
                                    ? 'text-[#16A34A] dark:text-[#4ADE80]'
                                    : 'text-[#64748B] dark:text-[#94A3B8]'
                                }
                              >
                                {item.isActive ? 'Active' : 'Archived'}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap align-top">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenAssetHistory
                                    ? onOpenAssetHistory(item.id)
                                    : setHistoryAssetId(item.id)
                                }
                                title="Open Asset Inspection History & Compare"
                                className="p-1.5 text-[#475569] dark:text-[#94A3B8] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#1E3A8A]/30 rounded transition-colors"
                              >
                                <History className="w-3.5 h-3.5" />
                              </button>
                              {canEdit && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditItemModal(item)}
                                    title="Edit asset"
                                    className="p-1.5 text-[#475569] dark:text-[#94A3B8] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#1E3A8A]/30 rounded transition-colors"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem(item)}
                                    title="Delete asset"
                                    className="p-1.5 text-[#475569] dark:text-[#94A3B8] hover:text-[#DC2626] dark:hover:text-[#F87171] hover:bg-[#FEF2F2] dark:hover:bg-[#7F1D1D]/30 rounded transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
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
        </>
      ) : (
        <>
          {/* Facility / Zone Area Controls */}
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-4 h-4 text-[#64748B] dark:text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={facSearch}
                  onChange={(e) => setFacSearch(e.target.value)}
                  placeholder="Search zone code, name, or building..."
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] dark:bg-[#0F172A] rounded-md border border-[#E2E8F0] dark:border-[#1E293B]">
                {(
                  [
                    { key: 'all', label: 'All Risk' },
                    { key: 'low', label: 'Low' },
                    { key: 'medium', label: 'Medium' },
                    { key: 'high', label: 'High' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setFacRiskFilter(opt.key)}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      facRiskFilter === opt.key
                        ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                        : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-[#64748B] dark:text-[#94A3B8] font-mono tabular-nums">
                {filteredFacilities.length} of {facilityAreas.length} zones
              </span>
              {canEdit ? (
                <button
                  type="button"
                  onClick={openCreateFacilityModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Facility Zone</span>
                </button>
              ) : (
                <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  Read-only zone directory (Admin or Approver required to edit)
                </span>
              )}
            </div>
          </div>

          {/* Facility / Zone Compact Mobile Cards (< md) */}
          <div className="md:hidden space-y-2.5">
            {filteredFacilities.length === 0 ? (
              <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl p-8 text-center text-sm text-[#64748B] dark:text-[#94A3B8]">
                No facility zones match your filters.
              </div>
            ) : (
              filteredFacilities.map((fac) => (
                <div
                  key={fac.id}
                  className={`bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl p-3.5 space-y-2 ${
                    !fac.isActive ? 'opacity-65' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-bold text-[#1D4ED8] dark:text-[#60A5FA]">
                        {fac.code}
                      </span>
                      <div className="font-semibold text-sm text-[#0F172A] dark:text-[#F8FAFC]">
                        {fac.name}
                      </div>
                      {fac.building && (
                        <div className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                          {fac.building}
                        </div>
                      )}
                    </div>
                    <span
                      className={`text-xs font-semibold capitalize shrink-0 ${
                        fac.riskLevel === 'high'
                          ? 'text-[#DC2626] dark:text-[#F87171]'
                          : fac.riskLevel === 'medium'
                          ? 'text-[#D97706] dark:text-[#FBBF24]'
                          : 'text-[#475569] dark:text-[#94A3B8]'
                      }`}
                    >
                      {fac.riskLevel} Risk
                    </span>
                  </div>
                  {canEdit && (
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#F1F5F9] dark:border-[#1E293B]">
                      <button
                        type="button"
                        onClick={() => toggleFacilityActive(fac)}
                        className={`min-h-[38px] text-xs font-medium ${
                          fac.isActive
                            ? 'text-[#16A34A] dark:text-[#4ADE80]'
                            : 'text-[#64748B] dark:text-[#94A3B8]'
                        }`}
                      >
                        {fac.isActive ? 'Active' : 'Archived'}
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditFacilityModal(fac)}
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-lg"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteFacility(fac)}
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#DC2626] dark:text-[#F87171] bg-[#FEF2F2] dark:bg-[#7F1D1D]/25 border border-[#FECACA] dark:border-[#991B1B] rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Facility / Zone Resizable Table */}
          <div className="hidden md:block bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0F172A] text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                    <ResizableTh
                      width={facCols.code}
                      onStartResize={(e) => resizeFacCol('code', e)}
                      className="py-3 px-4"
                    >
                      Zone Code
                    </ResizableTh>
                    <ResizableTh
                      width={facCols.name}
                      onStartResize={(e) => resizeFacCol('name', e)}
                      className="py-3 px-4"
                    >
                      Facility / Zone Name &amp; Scope
                    </ResizableTh>
                    <ResizableTh
                      width={facCols.building}
                      onStartResize={(e) => resizeFacCol('building', e)}
                      className="py-3 px-4"
                    >
                      Building / Plant
                    </ResizableTh>
                    <ResizableTh
                      width={facCols.risk}
                      onStartResize={(e) => resizeFacCol('risk', e)}
                      className="py-3 px-4"
                    >
                      Risk Level
                    </ResizableTh>
                    <ResizableTh
                      width={facCols.state}
                      onStartResize={(e) => resizeFacCol('state', e)}
                      className="py-3 px-4"
                    >
                      State
                    </ResizableTh>
                    {canEdit && (
                      <ResizableTh
                        width={facCols.actions}
                        onStartResize={(e) => resizeFacCol('actions', e)}
                        align="right"
                        className="py-3 px-4"
                      >
                        Actions
                      </ResizableTh>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B] text-sm">
                  {filteredFacilities.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canEdit ? 6 : 5}
                        className="py-10 px-4 text-center text-sm text-[#64748B] dark:text-[#94A3B8]"
                      >
                        No facility zones match your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredFacilities.map((fac) => (
                      <tr
                        key={fac.id}
                        className={`hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/60 transition-colors ${
                          !fac.isActive ? 'opacity-60' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate align-top">
                          {fac.code}
                        </td>
                        <td className="py-3 px-4 align-top min-w-0">
                          <div className="font-medium text-[#0F172A] dark:text-[#F8FAFC] text-sm break-words">
                            {fac.name}
                          </div>
                          {fac.description && (
                            <div className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5 break-words">
                              {fac.description}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-[#334155] dark:text-[#CBD5E1] truncate align-top">
                          {fac.building || '—'}
                        </td>
                        <td className="py-3 px-4 text-xs whitespace-nowrap align-top capitalize">
                          <span
                            className={`font-medium ${
                              fac.riskLevel === 'high'
                                ? 'text-[#DC2626] dark:text-[#F87171]'
                                : fac.riskLevel === 'medium'
                                ? 'text-[#D97706] dark:text-[#FBBF24]'
                                : 'text-[#475569] dark:text-[#94A3B8]'
                            }`}
                          >
                            {fac.riskLevel}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs whitespace-nowrap align-top">
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => toggleFacilityActive(fac)}
                              className={`text-xs font-medium hover:underline ${
                                fac.isActive
                                  ? 'text-[#16A34A] dark:text-[#4ADE80]'
                                  : 'text-[#64748B] dark:text-[#94A3B8]'
                              }`}
                            >
                              {fac.isActive ? 'Active' : 'Archived'}
                            </button>
                          ) : (
                            <span
                              className={
                                fac.isActive
                                  ? 'text-[#16A34A] dark:text-[#4ADE80]'
                                  : 'text-[#64748B] dark:text-[#94A3B8]'
                              }
                            >
                              {fac.isActive ? 'Active' : 'Archived'}
                            </span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="py-3 px-4 text-right whitespace-nowrap align-top">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditFacilityModal(fac)}
                                title="Edit facility zone"
                                className="p-1.5 text-[#475569] dark:text-[#94A3B8] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#1E3A8A]/30 rounded transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteFacility(fac)}
                                title="Delete facility zone"
                                className="p-1.5 text-[#475569] dark:text-[#94A3B8] hover:text-[#DC2626] dark:hover:text-[#F87171] hover:bg-[#FEF2F2] dark:hover:bg-[#7F1D1D]/30 rounded transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Visual Drawing & Inspection Pin Authoring Modal */}
      {visualAsset && (
        <AssetVisualModal
          mode="author"
          asset={visualAsset}
          canEdit={canEdit}
          projects={projects}
          tasks={tasks}
          reports={reports}
          token={token}
          onClose={() => setVisualAssetId(null)}
          onSyncComplete={onSyncComplete}
          onNotify={onNotify}
          onNavigateToTask={onNavigateToTask}
        />
      )}

      {/* Per-Asset Inspection History Modal */}
      {historyAsset && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/55 dark:bg-black/75 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded-lg max-w-4xl w-full max-h-[88vh] flex flex-col shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-4 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-[#1D4ED8] dark:text-[#60A5FA]" />
                  <span className="font-mono text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA]">
                    {historyAsset.code}
                  </span>
                  {historyAsset.facilityAreaName && (
                    <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                      · {historyAsset.facilityAreaName}
                    </span>
                  )}
                </div>
                <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC] mt-0.5">
                  Asset Inspection History · {historyAsset.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setHistoryAssetId(null)}
                className="p-1.5 text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {/* Summary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md">
                  <div className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                    Total Inspection Sessions
                  </div>
                  <div className="font-mono text-xl font-bold text-[#0F172A] dark:text-[#F8FAFC] mt-1 tabular-nums">
                    {assetHistoryEntries.length}
                  </div>
                </div>
                <div className="p-3.5 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md">
                  <div className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                    Latest Condition
                  </div>
                  <div className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] mt-1">
                    {assetHistoryEntries[0]
                      ? formatConditionLabel(assetHistoryEntries[0].entry.condition)
                      : 'Not Yet Inspected'}
                  </div>
                </div>
                <div className="p-3.5 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md">
                  <div className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                    Configured Parameters
                  </div>
                  <div className="font-mono text-xl font-bold text-[#0F172A] dark:text-[#F8FAFC] mt-1 tabular-nums">
                    {historyAsset.parameters?.length ?? 0}
                  </div>
                </div>
              </div>

              {/* Numeric Parameter Aggregates */}
              {numericParamSummaries.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] mb-2.5">
                    Custom Numeric Parameter Trends Across Inspections
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {numericParamSummaries.map((stat) => (
                      <div
                        key={stat.label}
                        className="p-3.5 bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-md"
                      >
                        <div className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                          {stat.label}
                        </div>
                        <div className="mt-1 font-mono text-lg font-bold text-[#1D4ED8] dark:text-[#60A5FA] tabular-nums">
                          Latest: {stat.latest}
                          {stat.unit ? ` ${stat.unit}` : ''}
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                          Avg {stat.avg}
                          {stat.unit ? ` ${stat.unit}` : ''} · Min {stat.min} · Max {stat.max} ({stat.count}{' '}
                          readings)
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chronological Inspection Log */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] mb-2.5">
                  Chronological Inspection Records
                </h4>
                {assetHistoryEntries.length === 0 ? (
                  <div className="p-8 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md text-center text-xs text-[#64748B] dark:text-[#94A3B8]">
                    This asset has not been included in any inspection reports yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {assetHistoryEntries.map(({ report, entry }) => (
                      <div
                        key={entry.id}
                        className="p-4 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                if (onOpenReport) {
                                  setHistoryAssetId(null);
                                  onOpenReport(report.id);
                                }
                              }}
                              className="font-mono font-semibold text-[#1D4ED8] dark:text-[#60A5FA] hover:underline"
                            >
                              {report.reportNumber}
                            </button>
                            <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                              {report.title}
                            </span>
                            <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] text-[#475569] dark:text-[#CBD5E1]">
                              {formatReportStatusLabel(report.status)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span
                              className={`font-semibold ${
                                entry.condition === 'critical'
                                  ? 'text-[#DC2626] dark:text-[#F87171]'
                                  : entry.condition === 'needs_attention'
                                  ? 'text-[#D97706] dark:text-[#FBBF24]'
                                  : entry.condition === 'good' || entry.condition === 'fair'
                                  ? 'text-[#16A34A] dark:text-[#4ADE80]'
                                  : 'text-[#64748B] dark:text-[#94A3B8]'
                              }`}
                            >
                              {formatConditionLabel(entry.condition)}
                            </span>
                            <span className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                              {formatAuditTimestamp(report.submittedAt || report.createdAt)}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs text-[#475569] dark:text-[#94A3B8]">
                          Executor: <span className="font-medium text-[#0F172A] dark:text-[#F8FAFC]">{report.inspectorName}</span>
                          <span aria-hidden="true"> · </span>
                          Facility: {report.facilityArea}
                          <span aria-hidden="true"> · </span>
                          Photos: {entry.photos.length}
                        </div>

                        {(entry.parameterValues ?? []).length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                            {entry.parameterValues.map((pv) => (
                              <div
                                key={pv.id}
                                className="px-2.5 py-1.5 bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded text-xs"
                              >
                                <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                                  {pv.label}
                                </div>
                                <div className="font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC] mt-0.5">
                                  {pv.valueText ? (
                                    <>
                                      {pv.valueText}
                                      {pv.paramType === 'number' && pv.unit ? ` ${pv.unit}` : ''}
                                    </>
                                  ) : (
                                    <span className="text-[#94A3B8]">—</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {(entry.conditionNote || entry.itemRemarks) && (
                          <div className="text-xs text-[#334155] dark:text-[#CBD5E1] pt-1 border-t border-[#E2E8F0] dark:border-[#1E293B]">
                            {entry.conditionNote && <div>Observation: {entry.conditionNote}</div>}
                            {entry.itemRemarks && (
                              <div className="text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                                Remarks: {entry.itemRemarks}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Bulk Import Modal */}
      {showCsvModal && canEdit && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 dark:bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded-lg max-w-4xl w-full max-h-[88vh] flex flex-col shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[#1D4ED8] dark:text-[#60A5FA]" />
                <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                  Import Assets from CSV Template
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCsvModal(false)}
                className="p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="p-4 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-md flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-[#475569] dark:text-[#94A3B8]">
                  Download the template CSV first, fill your Asset Codes, Facility Zone Codes, and
                  Custom Parameters, then upload or paste below. Existing asset codes update in-place.
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => downloadAssetCsvTemplate(facilityAreas)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] bg-white dark:bg-[#111827] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Template</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => csvFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Choose .CSV File</span>
                  </button>
                  <input
                    ref={csvFileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleCsvFileSelected}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Paste CSV Content or Load File Above
                </label>
                <textarea
                  rows={5}
                  value={csvRawText}
                  onChange={(e) => handleCsvTextChange(e.target.value)}
                  placeholder="Asset Code,Category,Asset Title,Facility Area Code,Description,Inspection Criteria,Criticality,Require Photo,Active,Custom Parameters"
                  className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              {csvParsedRows.length > 0 && (
                <div className="border border-[#E2E8F0] dark:border-[#334155] rounded-md overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#F8FAFC] dark:bg-[#0F172A] border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                      Preview ({csvParsedRows.filter((r) => !r.error).length} valid ·{' '}
                      {csvParsedRows.filter((r) => Boolean(r.error)).length} errors)
                    </span>
                  </div>
                  <div className="max-h-56 overflow-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#E2E8F0] dark:border-[#1E293B] text-[#64748B] dark:text-[#94A3B8]">
                          <th className="py-2 px-3">Code</th>
                          <th className="py-2 px-3">Title</th>
                          <th className="py-2 px-3">Category</th>
                          <th className="py-2 px-3">Facility Code</th>
                          <th className="py-2 px-3">Params</th>
                          <th className="py-2 px-3">Validation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B]">
                        {csvParsedRows.map((row, idx) => (
                          <tr key={`${row.code}-${idx}`}>
                            <td className="py-2 px-3 font-mono font-semibold">{row.code || '—'}</td>
                            <td className="py-2 px-3">{row.title || '—'}</td>
                            <td className="py-2 px-3">{row.category || '—'}</td>
                            <td className="py-2 px-3 font-mono">{row.facilityCode || '—'}</td>
                            <td className="py-2 px-3 font-mono">{row.parameters.length}</td>
                            <td className="py-2 px-3">
                              {row.error ? (
                                <span className="text-[#DC2626] dark:text-[#F87171] font-medium">
                                  {row.error}
                                </span>
                              ) : (
                                <span className="text-[#16A34A] dark:text-[#4ADE80] font-medium">
                                  Ready
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowCsvModal(false)}
                className="px-4 py-2 text-xs font-medium text-[#475569] dark:text-[#CBD5E1] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={importingCsv || csvParsedRows.filter((r) => !r.error).length === 0}
                onClick={handleConfirmCsvImport}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md"
              >
                <Check className="w-3.5 h-3.5" />
                <span>
                  {importingCsv
                    ? 'Importing...'
                    : `Import ${csvParsedRows.filter((r) => !r.error).length} Valid Rows`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Asset Modal (Two-Tab: Details & Parameters + Visual Map & Pins) */}
      {showItemModal && canEdit && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/45 dark:bg-black/70 flex items-center justify-center p-4">
          <div
            className={`bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded-lg w-full max-h-[92vh] flex flex-col shadow-lg overflow-hidden transition-[max-width] duration-150 ${
              activeItemModalTab === 'visual' ? 'max-w-5xl' : 'max-w-2xl'
            }`}
          >
            {/* Header + 2-Tab Segmented Switcher */}
            <div className="px-6 pt-4 pb-3 border-b border-[#E2E8F0] dark:border-[#1E293B] space-y-3 shrink-0">
              <div className="flex items-center justify-between gap-4">
                <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                  {editingItem
                    ? `Edit Asset · ${editingItem.code}`
                    : createdDraftAssetId
                      ? `New Asset · ${itemForm.code || 'Draft'}`
                      : 'New Asset'}
                </h3>
                <button
                  type="button"
                  onClick={closeItemModal}
                  className="p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="inline-flex items-center gap-1 p-1 bg-[#F1F5F9] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-lg">
                <button
                  type="button"
                  onClick={() => setActiveItemModalTab('details')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    activeItemModalTab === 'details'
                      ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                      : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                  }`}
                >
                  Details &amp; Parameters
                  {itemForm.parameters.length > 0 && (
                    <span className="ml-1.5 font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                      ({itemForm.parameters.length})
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveItemModalTab('visual')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    activeItemModalTab === 'visual'
                      ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                      : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                  }`}
                >
                  Visual Map &amp; Pins
                  <span className="ml-1.5 font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                    {draftPins.length > 0
                      ? `(${draftPins.length})`
                      : draftDrawingPreviewUrl || (!draftDrawingRemoved && editingItem?.drawingUrl)
                        ? '(Drawing ready)'
                        : ''}
                  </span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveItem} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-6 overflow-y-auto flex-1">
                {activeItemModalTab === 'details' ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                          Asset Code
                        </label>
                        <input
                          type="text"
                          required
                          value={itemForm.code}
                          onChange={(e) => setItemForm({ ...itemForm, code: e.target.value })}
                          placeholder="e.g. AST-01"
                          className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                          Category
                        </label>
                        <input
                          type="text"
                          required
                          list="library-categories"
                          value={itemForm.category}
                          onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                          placeholder="Category name"
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                        />
                        <datalist id="library-categories">
                          {categories.map((cat) => (
                            <option key={cat} value={cat} />
                          ))}
                        </datalist>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                          Asset Title
                        </label>
                        <input
                          type="text"
                          required
                          value={itemForm.title}
                          onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
                          placeholder="e.g. Rotary Powder Dryer #1"
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                          Facility / Zone Area
                        </label>
                        <select
                          value={itemForm.facilityAreaId}
                          onChange={(e) =>
                            setItemForm({ ...itemForm, facilityAreaId: e.target.value })
                          }
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                        >
                          <option value="">— Unassigned Facility Zone —</option>
                          {facilityAreas.map((fac) => (
                            <option key={fac.id} value={fac.id}>
                              {fac.code} — {fac.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                        Scope / Description
                      </label>
                      <textarea
                        rows={2}
                        value={itemForm.description}
                        onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                        placeholder="Inspection scope and physical checkpoints..."
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                        Pass / Acceptance Criteria
                      </label>
                      <textarea
                        rows={2}
                        value={itemForm.criteria}
                        onChange={(e) => setItemForm({ ...itemForm, criteria: e.target.value })}
                        placeholder="Standard tolerance, measurement limits, or safety requirement..."
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                          Criticality
                        </label>
                        <select
                          value={itemForm.criticality}
                          onChange={(e) =>
                            setItemForm({
                              ...itemForm,
                              criticality: e.target.value as CriticalityLevel,
                            })
                          }
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>

                      <div className="flex items-end pb-2">
                        <label className="inline-flex items-center gap-2 text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={itemForm.requirePhoto}
                            onChange={(e) =>
                              setItemForm({ ...itemForm, requirePhoto: e.target.checked })
                            }
                            className="rounded border-[#CBD5E1] text-[#1D4ED8] focus:ring-[#1D4ED8]"
                          />
                          <span>Require Photo Evidence</span>
                        </label>
                      </div>
                    </div>

                    {/* Custom Inspection Parameters Builder */}
                    <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                            Custom Inspection Parameters
                          </div>
                          <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                            e.g., Powder Accumulation (Number + kg), Filter Replaced (Yes/No), Bearing Note (Text)
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={addDraftParameter}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#1D4ED8] dark:text-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 hover:bg-[#DBEAFE] dark:hover:bg-[#1E3A8A]/50 rounded-md shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Parameter</span>
                        </button>
                      </div>

                      {itemForm.parameters.length === 0 ? (
                        <div className="p-3 bg-[#F8FAFC] dark:bg-[#0F172A] border border-dashed border-[#CBD5E1] dark:border-[#334155] rounded text-xs text-[#64748B] dark:text-[#94A3B8]">
                          No custom parameters yet. Click &ldquo;Add Parameter&rdquo; to track custom field readings.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {itemForm.parameters.map((param, idx) => (
                            <div
                              key={param.id ?? `draft-${idx}`}
                              className="grid grid-cols-12 gap-2 items-center p-2.5 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-md"
                            >
                              <div className="col-span-5">
                                <input
                                  type="text"
                                  required
                                  value={param.label}
                                  onChange={(e) =>
                                    updateDraftParameter(idx, { label: e.target.value })
                                  }
                                  placeholder="Parameter label..."
                                  className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded"
                                />
                              </div>
                              <div className="col-span-3">
                                <select
                                  value={param.paramType}
                                  onChange={(e) =>
                                    updateDraftParameter(idx, {
                                      paramType: e.target.value as CustomParameterType,
                                    })
                                  }
                                  className="w-full px-2 py-1.5 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded"
                                >
                                  <option value="number">Number + Unit</option>
                                  <option value="text">Text</option>
                                  <option value="boolean">Yes / No</option>
                                </select>
                              </div>
                              <div className="col-span-2">
                                <input
                                  type="text"
                                  disabled={param.paramType !== 'number'}
                                  value={param.unit}
                                  onChange={(e) =>
                                    updateDraftParameter(idx, { unit: e.target.value })
                                  }
                                  placeholder={param.paramType === 'number' ? 'Unit (kg)' : '—'}
                                  className="w-full px-2 py-1.5 text-xs font-mono bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] disabled:opacity-45 rounded"
                                />
                              </div>
                              <div className="col-span-2 flex items-center justify-end gap-1.5">
                                <label
                                  title="Required during inspection"
                                  className="inline-flex items-center gap-1 text-[11px] text-[#475569] dark:text-[#94A3B8] cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={param.isRequired}
                                    onChange={(e) =>
                                      updateDraftParameter(idx, { isRequired: e.target.checked })
                                    }
                                  />
                                  <span>Req</span>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => removeDraftParameter(idx)}
                                  className="p-1 text-[#64748B] hover:text-[#DC2626] dark:hover:text-[#F87171]"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <AssetVisualDraftPanel
                    assetCode={itemForm.code}
                    existingDrawingUrl={editingItem?.drawingUrl ?? null}
                    draftDrawingPreviewUrl={draftDrawingPreviewUrl}
                    draftDrawingNote={draftDrawingNote}
                    draftDrawingRemoved={draftDrawingRemoved}
                    processingDrawing={processingDrawing}
                    drawingError={drawingError}
                    onSelectDrawingFile={handleSelectDraftDrawing}
                    onRemoveDrawing={handleRemoveDraftDrawing}
                    onClearError={() => setDrawingError(null)}
                    draftPins={draftPins}
                    onChangePins={setDraftPins}
                    onTrackDeletedPinId={(pinId) =>
                      setDeletedPinIds((prev) =>
                        prev.includes(pinId) ? prev : [...prev, pinId]
                      )
                    }
                    projects={projects}
                    tasks={tasks}
                  />
                )}
              </div>

              <div className="px-6 py-4 border-t border-[#E2E8F0] dark:border-[#1E293B] flex flex-wrap items-center justify-between gap-3 shrink-0 bg-[#F8FAFC] dark:bg-[#0F172A]/60">
                <div className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  {saveStatusText ? (
                    <span className="font-medium text-[#1D4ED8] dark:text-[#60A5FA]">
                      {saveStatusText}
                    </span>
                  ) : (
                    <span>
                      {itemForm.parameters.length} parameter(s)
                      <span aria-hidden="true" className="mx-1.5">·</span>
                      {draftDrawingPreviewUrl || (!draftDrawingRemoved && editingItem?.drawingUrl)
                        ? 'Visual drawing attached'
                        : 'No visual drawing'}
                      <span aria-hidden="true" className="mx-1.5">·</span>
                      {draftPins.length} pin(s)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={closeItemModal}
                    className="px-4 py-2 text-xs font-medium text-[#475569] dark:text-[#CBD5E1] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md whitespace-nowrap shrink-0"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingItem || processingDrawing}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md whitespace-nowrap shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{savingItem ? 'Saving...' : 'Save & Sync Asset'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Facility Zone Modal */}
      {showFacilityModal && canEdit && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/45 dark:bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded-lg max-w-lg w-full shadow-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                {editingFacility
                  ? `Edit Facility Zone · ${editingFacility.code}`
                  : 'New Facility / Zone Area'}
              </h3>
              <button
                type="button"
                onClick={() => setShowFacilityModal(false)}
                className="p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFacility} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Zone Code
                  </label>
                  <input
                    type="text"
                    required
                    value={facForm.code}
                    onChange={(e) => setFacForm({ ...facForm, code: e.target.value })}
                    placeholder="e.g. FAC-05"
                    className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Building / Plant
                  </label>
                  <input
                    type="text"
                    list="facility-buildings"
                    value={facForm.building}
                    onChange={(e) => setFacForm({ ...facForm, building: e.target.value })}
                    placeholder="e.g. Plant B, Utility Wing"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                  />
                  <datalist id="facility-buildings">
                    {buildings.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Facility / Zone Area Name
                </label>
                <input
                  type="text"
                  required
                  value={facForm.name}
                  onChange={(e) => setFacForm({ ...facForm, name: e.target.value })}
                  placeholder="e.g. Plant B · Boiler & Steam Manifold Bay"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Zone Description &amp; Access Notes
                </label>
                <textarea
                  rows={2}
                  value={facForm.description}
                  onChange={(e) => setFacForm({ ...facForm, description: e.target.value })}
                  placeholder="Primary equipment, hazard controls, or inspection boundary..."
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Risk Classification
                  </label>
                  <select
                    value={facForm.riskLevel}
                    onChange={(e) =>
                      setFacForm({ ...facForm, riskLevel: e.target.value as CriticalityLevel })
                    }
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="flex items-end pb-2">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={facForm.isActive}
                      onChange={(e) => setFacForm({ ...facForm, isActive: e.target.checked })}
                      className="rounded border-[#CBD5E1] text-[#1D4ED8] focus:ring-[#1D4ED8]"
                    />
                    <span>Active for Inspection Selection</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowFacilityModal(false)}
                  className="px-4 py-2 text-xs font-medium text-[#475569] dark:text-[#CBD5E1] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingFacility}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{savingFacility ? 'Saving...' : 'Save Facility Zone'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
