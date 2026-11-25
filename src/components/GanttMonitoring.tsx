import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Check,
  CheckCircle2,
  Diamond,
  Download,
  Edit3,
  FolderKanban,
  GanttChart,
  History,
  Link2,
  MapPin,
  MessageSquare,
  Plus,
  Search,
  Send,
  Settings,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import type {
  CycleType,
  DependencyType,
  LibraryItem,
  Project,
  ProjectTask,
  TaskBlocker,
  TaskComment,
  TaskHistoryEntry,
  TaskStatus,
  TaskType,
  User,
} from '../types.ts';
import { formatRoleLabel, hasAnyRole } from '../types.ts';
import {
  exportProjectScheduleToCsv,
  formatAuditTimestamp,
  formatCycleLabel,
  formatShortDate,
  formatTaskStatusLabel,
  getDurationDays,
} from '../utils/export.ts';
import { ResizableTh, useResizableColumns } from './ResizableTable.tsx';

interface GanttMonitoringProps {
  projects: Project[];
  tasks: ProjectTask[];
  blockers: TaskBlocker[];
  taskHistory: TaskHistoryEntry[];
  taskComments: TaskComment[];
  libraryItems?: LibraryItem[];
  users?: User[];
  initialFocusTask?: { projectId: string; taskId: string } | null;
  onClearInitialFocus?: () => void;
  onOpenAssetVisual?: (assetId: string) => void;
  currentUser: User;
  token: string;
  onSyncComplete: () => Promise<void>;
  onNotify: (message: string, kind?: 'info' | 'error') => void;
}

type ZoomLevel = 'day' | 'week' | 'month';
type ProjectSubTab = 'gantt' | 'history';
type ActiveProjectViewMode = 'gantt' | 'table';

const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 52;

const PROGRESS_PRESETS = [0, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100];

function parseUtcDate(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getTime();
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface BarDragState {
  taskId: string;
  mode: 'move' | 'resize-start' | 'resize-end';
  originClientX: number;
  origStartDate: string;
  origEndDate: string;
  deltaDays: number;
  moved: boolean;
}

interface LinkDragState {
  sourceTaskId: string;
  sourcePort: 'start' | 'end';
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  hoverTargetTaskId: string | null;
}

export function GanttMonitoring({
  projects,
  tasks,
  blockers,
  taskHistory,
  taskComments,
  libraryItems = [],
  users = [],
  initialFocusTask,
  onClearInitialFocus,
  onOpenAssetVisual,
  currentUser,
  token,
  onSyncComplete,
  onNotify,
}: GanttMonitoringProps) {
  const isAdmin = hasAnyRole(currentUser, 'admin');
  const canManageProjects = hasAnyRole(currentUser, 'admin', 'approver');

  function canEditTask(task: ProjectTask): boolean {
    if (task.status === 'completed') return isAdmin;
    if (canManageProjects) return true;
    return (
      (Boolean(task.assigneeId) && task.assigneeId === currentUser.id) ||
      (Boolean(task.assigneeName) &&
        task.assigneeName.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
    );
  }

  const [subTab, setSubTab] = useState<ProjectSubTab>('gantt');
  const [viewMode, setViewMode] = useState<ActiveProjectViewMode>('gantt');
  const [historySearch, setHistorySearch] = useState('');
  const [historyCycleFilter, setHistoryCycleFilter] = useState<'all' | CycleType>('all');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id ?? '');
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [blockersOnly, setBlockersOnly] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!initialFocusTask) return;
    setSubTab('gantt');
    setSelectedProjectId(initialFocusTask.projectId);
    setSelectedTaskId(initialFocusTask.taskId);
    onClearInitialFocus?.();
  }, [initialFocusTask, onClearInitialFocus]);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [showNewBlockerModal, setShowNewBlockerModal] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showProjectSettingsModal, setShowProjectSettingsModal] = useState(false);
  const [overridePrompt, setOverridePrompt] = useState<{
    taskId: string;
    pendingUpdates: Partial<ProjectTask>;
    message: string;
    blockingTasks: { id: string; wbs_code: string; title: string; status?: string }[];
  } | null>(null);

  const [barDrag, setBarDrag] = useState<BarDragState | null>(null);
  const [linkDrag, setLinkDrag] = useState<LinkDragState | null>(null);
  const [wbsPaneWidth, setWbsPaneWidth] = useState<number>(612);
  const [hoverCard, setHoverCard] = useState<{
    taskId: string;
    x: number;
    y: number;
  } | null>(null);
  const ganttCanvasRef = useRef<HTMLDivElement | null>(null);

  const { widths: wbsCols, startResize: resizeWbsCol } = useResizableColumns(
    {
      wbs: 72,
      activity: 310,
      dates: 115,
      progress: 115,
    },
    56
  );

  const { widths: tableCols, startResize: resizeTableCol } = useResizableColumns(
    {
      wbs: 76,
      activity: 290,
      assignee: 145,
      schedule: 215,
      status: 145,
      progress: 155,
      cycle: 120,
      actions: 90,
    },
    64
  );

  const { widths: blockerCols, startResize: resizeBlockerCol } = useResizableColumns({
    upstream: 230,
    type: 130,
    downstream: 230,
    reason: 280,
    state: 130,
    actions: 130,
  });

  const { widths: historyCols, startResize: resizeHistoryCol } = useResizableColumns({
    code: 115,
    name: 280,
    cycle: 145,
    window: 195,
    tasks: 100,
    progress: 120,
    blockers: 115,
    action: 115,
  });

  const activeProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId]
  );

  const useWbs = activeProject?.useWbs ?? true;
  const totalWbsWidth = (useWbs ? wbsCols.wbs : 0) + wbsCols.activity + wbsCols.dates + wbsCols.progress;
  const effectiveWbsPaneWidth = useWbs ? wbsPaneWidth : Math.max(320, wbsPaneWidth - wbsCols.wbs);

  function startWbsColumnResize(
    key: 'wbs' | 'activity' | 'dates' | 'progress',
    e: React.PointerEvent
  ) {
    resizeWbsCol(key, e);
    const startX = e.clientX;
    const startPane = wbsPaneWidth;
    const startCol = wbsCols[key];
    function onMove(ev: PointerEvent) {
      const nextCol = Math.max(56, Math.round(startCol + (ev.clientX - startX)));
      const delta = nextCol - startCol;
      setWbsPaneWidth(Math.max(360, Math.min(960, startPane + delta)));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startSplitPaneResize(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = wbsPaneWidth;
    function onMove(ev: PointerEvent) {
      setWbsPaneWidth(Math.max(360, Math.min(960, Math.round(startWidth + (ev.clientX - startX)))));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function handleTaskHoverEnter(taskId: string, e: React.MouseEvent) {
    if (barDrag || linkDrag) return;
    setHoverCard({ taskId, x: e.clientX, y: e.clientY });
  }

  function handleTaskHoverMove(taskId: string, e: React.MouseEvent) {
    if (barDrag || linkDrag) {
      if (hoverCard) setHoverCard(null);
      return;
    }
    setHoverCard({ taskId, x: e.clientX, y: e.clientY });
  }

  function handleTaskHoverLeave() {
    setHoverCard(null);
  }

  const projectTasks = useMemo(() => {
    if (!activeProject) return [];
    return tasks.filter((t) => t.projectId === activeProject.id);
  }, [tasks, activeProject]);

  const projectBlockers = useMemo(() => {
    if (!activeProject) return [];
    return blockers.filter((b) => b.projectId === activeProject.id);
  }, [blockers, activeProject]);

  const taskById = useMemo(() => new Map(projectTasks.map((t) => [t.id, t])), [projectTasks]);

  const activeBlockersByBlockedId = useMemo(() => {
    const map = new Map<string, TaskBlocker[]>();
    for (const b of projectBlockers) {
      if (!b.isResolved) {
        const list = map.get(b.blockedTaskId) ?? [];
        list.push(b);
        map.set(b.blockedTaskId, list);
      }
    }
    return map;
  }, [projectBlockers]);

  const activeBlockersByBlockerId = useMemo(() => {
    const map = new Map<string, TaskBlocker[]>();
    for (const b of projectBlockers) {
      if (!b.isResolved) {
        const list = map.get(b.blockerTaskId) ?? [];
        list.push(b);
        map.set(b.blockerTaskId, list);
      }
    }
    return map;
  }, [projectBlockers]);

  const visibleTasks = useMemo(() => {
    if (!blockersOnly) return projectTasks;
    return projectTasks.filter(
      (t) =>
        activeBlockersByBlockedId.has(t.id) ||
        activeBlockersByBlockerId.has(t.id) ||
        t.status === 'blocked'
    );
  }, [projectTasks, blockersOnly, activeBlockersByBlockedId, activeBlockersByBlockerId]);

  const selectedTask = useMemo(
    () => projectTasks.find((t) => t.id === selectedTaskId) ?? null,
    [projectTasks, selectedTaskId]
  );

  const timelineMeta = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    let minDate = activeProject?.startDate ?? todayStr;
    let maxDate = activeProject?.endDate ?? addDaysStr(todayStr, 28);

    for (const t of projectTasks) {
      if (t.startDate < minDate) minDate = t.startDate;
      if (t.endDate > maxDate) maxDate = t.endDate;
    }

    const startBound = addDaysStr(minDate, -4);
    const endBound = addDaysStr(maxDate, 6);
    const totalDays = Math.max(14, getDurationDays(startBound, endBound));
    const pxPerDay = zoom === 'day' ? 42 : zoom === 'week' ? 24 : 12;
    const totalWidth = totalDays * pxPerDay;

    const ticks: { label: string; subLabel: string; leftPx: number; widthPx: number }[] = [];
    const step = zoom === 'day' ? 1 : zoom === 'week' ? 7 : 14;
    for (let i = 0; i < totalDays; i += step) {
      const dateIso = addDaysStr(startBound, i);
      const d = new Date(`${dateIso}T00:00:00Z`);
      const label = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
      const subLabel =
        zoom === 'day'
          ? d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
          : `W${Math.ceil(d.getUTCDate() / 7)}`;
      ticks.push({
        label,
        subLabel,
        leftPx: i * pxPerDay,
        widthPx: Math.min(step, totalDays - i) * pxPerDay,
      });
    }

    const todayOffsetDays = (parseUtcDate(todayStr) - parseUtcDate(startBound)) / 86400000;
    const todayPx =
      todayOffsetDays >= 0 && todayOffsetDays <= totalDays ? todayOffsetDays * pxPerDay : null;

    return { startBound, endBound, totalDays, pxPerDay, totalWidth, ticks, todayPx };
  }, [activeProject, projectTasks, zoom]);

  function getPreviewDates(task: ProjectTask): { startDate: string; endDate: string } {
    if (!barDrag || barDrag.taskId !== task.id) {
      return { startDate: task.startDate, endDate: task.endDate };
    }
    const { mode, origStartDate, origEndDate, deltaDays } = barDrag;
    if (mode === 'move') {
      return {
        startDate: addDaysStr(origStartDate, deltaDays),
        endDate: addDaysStr(origEndDate, deltaDays),
      };
    }
    if (mode === 'resize-start') {
      const candidate = addDaysStr(origStartDate, deltaDays);
      return {
        startDate: candidate > origEndDate ? origEndDate : candidate,
        endDate: origEndDate,
      };
    }
    const candidateEnd = addDaysStr(origEndDate, deltaDays);
    return {
      startDate: origStartDate,
      endDate: candidateEnd < origStartDate ? origStartDate : candidateEnd,
    };
  }

  function getBarGeometry(task: ProjectTask) {
    const { startDate, endDate } = getPreviewDates(task);
    const startDays = (parseUtcDate(startDate) - parseUtcDate(timelineMeta.startBound)) / 86400000;
    const durationDays = getDurationDays(startDate, endDate);
    const left = Math.max(0, startDays * timelineMeta.pxPerDay);
    const width =
      task.taskType === 'milestone' ? 18 : Math.max(18, durationDays * timelineMeta.pxPerDay);
    return { left, width, startDate, endDate };
  }

  async function patchTask(
    taskId: string,
    updates: Partial<ProjectTask> & { forceOverride?: boolean }
  ): Promise<boolean> {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });
      const data = (await res.json()) as {
        error?: string;
        blockingTasks?: { id: string; wbs_code: string; title: string; status?: string }[];
      };
      if (res.status === 409 && data.blockingTasks) {
        setOverridePrompt({
          taskId,
          pendingUpdates: updates,
          message: data.error ?? 'Activity is blocked by unfinished predecessor work.',
          blockingTasks: data.blockingTasks,
        });
        return false;
      }
      if (!res.ok) {
        onNotify(data.error ?? 'Unable to update task.', 'error');
        return false;
      }
      await onSyncComplete();
      onNotify('Schedule updated and change log recorded.');
      return true;
    } catch {
      onNotify('Network error updating task.', 'error');
      return false;
    }
  }

  async function createBlockerLink(params: {
    blockerTaskId: string;
    blockedTaskId: string;
    dependencyType: DependencyType;
    blockerReason?: string;
  }): Promise<boolean> {
    if (!activeProject) return false;
    try {
      const res = await fetch('/api/blockers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId: activeProject.id,
          ...params,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify(data.error ?? 'Could not create dependency link.', 'error');
        return false;
      }
      await onSyncComplete();
      onNotify('Dependency & blocker linked on project schedule.');
      return true;
    } catch {
      onNotify('Network error linking dependency.', 'error');
      return false;
    }
  }

  async function updateBlockerLink(
    blockerId: string,
    updates: Partial<{
      blockerTaskId: string;
      dependencyType: DependencyType;
      blockerReason: string;
      isResolved: boolean;
    }>
  ): Promise<boolean> {
    try {
      const res = await fetch(`/api/blockers/${blockerId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify(data.error ?? 'Failed to update blocker.', 'error');
        return false;
      }
      await onSyncComplete();
      onNotify('Updated activity blocker details.');
      return true;
    } catch {
      onNotify('Network error updating blocker.', 'error');
      return false;
    }
  }

  async function deleteTask(taskId: string) {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        onNotify('Unable to delete task.', 'error');
        return;
      }
      if (selectedTaskId === taskId) setSelectedTaskId(null);
      await onSyncComplete();
      onNotify('Activity removed from project schedule.');
    } catch {
      onNotify('Network error removing task.', 'error');
    }
  }

  async function resolveOrRemoveBlocker(blocker: TaskBlocker, mode: 'resolve' | 'delete') {
    try {
      const res =
        mode === 'resolve'
          ? await fetch(`/api/blockers/${blocker.id}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ isResolved: !blocker.isResolved }),
            })
          : await fetch(`/api/blockers/${blocker.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });

      if (!res.ok) {
        onNotify('Failed to update blocker link.', 'error');
        return;
      }
      await onSyncComplete();
      onNotify(
        mode === 'delete'
          ? 'Removed blocker dependency.'
          : blocker.isResolved
          ? 'Re-opened activity blocker.'
          : 'Marked blocker as cleared.'
      );
    } catch {
      onNotify('Network error updating blocker.', 'error');
    }
  }

  // Global window pointer listeners for Bar Move/Resize Drag
  useEffect(() => {
    if (!barDrag) return;
    function handleMove(e: PointerEvent) {
      const deltaPx = e.clientX - barDrag!.originClientX;
      const deltaDays = Math.round(deltaPx / timelineMeta.pxPerDay);
      const moved = barDrag!.moved || Math.abs(deltaPx) > 4;
      setBarDrag((prev) => (prev ? { ...prev, deltaDays, moved } : null));
    }

    function handleUp() {
      const current = barDrag!;
      setBarDrag(null);
      if (!current.moved) {
        setSelectedTaskId(current.taskId);
        return;
      }
      if (current.deltaDays === 0) return;

      const task = taskById.get(current.taskId);
      if (!task) return;
      let nextStart = current.origStartDate;
      let nextEnd = current.origEndDate;
      if (current.mode === 'move') {
        nextStart = addDaysStr(current.origStartDate, current.deltaDays);
        nextEnd = addDaysStr(current.origEndDate, current.deltaDays);
      } else if (current.mode === 'resize-start') {
        const candidate = addDaysStr(current.origStartDate, current.deltaDays);
        nextStart = candidate > current.origEndDate ? current.origEndDate : candidate;
      } else {
        const candidate = addDaysStr(current.origEndDate, current.deltaDays);
        nextEnd = candidate < current.origStartDate ? current.origStartDate : candidate;
      }

      if (nextStart !== task.startDate || nextEnd !== task.endDate) {
        patchTask(task.id, { startDate: nextStart, endDate: nextEnd });
      }
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [barDrag, timelineMeta.pxPerDay, taskById]);

  // Global window pointer listeners for Drag-to-Link Dependency Arrows
  useEffect(() => {
    if (!linkDrag) return;
    function handleMove(e: PointerEvent) {
      const canvas = ganttCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const rowIdx = Math.floor(y / ROW_HEIGHT);
      const hoverTask =
        rowIdx >= 0 && rowIdx < visibleTasks.length ? visibleTasks[rowIdx] : undefined;
      const hoverTargetTaskId =
        hoverTask && hoverTask.id !== linkDrag!.sourceTaskId ? hoverTask.id : null;

      setLinkDrag((prev) =>
        prev
          ? {
              ...prev,
              currentX: x,
              currentY: y,
              hoverTargetTaskId,
            }
          : null
      );
    }

    function handleUp() {
      const current = linkDrag!;
      setLinkDrag(null);
      if (!current.hoverTargetTaskId) return;

      const sourceTask = taskById.get(current.sourceTaskId);
      const targetTask = taskById.get(current.hoverTargetTaskId);
      if (!sourceTask || !targetTask) return;

      const depType: DependencyType = current.sourcePort === 'start' ? 'SS' : 'FS';
      createBlockerLink({
        blockerTaskId: sourceTask.id,
        blockedTaskId: targetTask.id,
        dependencyType: depType,
        blockerReason: `Waiting on ${useWbs ? `${sourceTask.wbsCode} ` : ''}${sourceTask.title}`,
      });
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [linkDrag, visibleTasks, taskById]);

  function startLinkDrag(
    e: React.PointerEvent,
    task: ProjectTask,
    port: 'start' | 'end',
    rowIdx: number,
    barLeft: number,
    barWidth: number
  ) {
    e.stopPropagation();
    e.preventDefault();
    const startX = port === 'start' ? barLeft : barLeft + barWidth;
    const startY = rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
    setLinkDrag({
      sourceTaskId: task.id,
      sourcePort: port,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      hoverTargetTaskId: null,
    });
  }

  const rowIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    visibleTasks.forEach((t, idx) => map.set(t.id, idx));
    return map;
  }, [visibleTasks]);

  const activeBlockerCount = projectBlockers.filter((b) => !b.isResolved).length;

  const projectHistoryRows = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return projects
      .filter((p) => {
        if (historyCycleFilter !== 'all' && p.cycleType !== historyCycleFilter) return false;
        if (!q) return true;
        return (
          p.code.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
        );
      })
      .map((p) => {
        const pTasks = tasks.filter((t) => t.projectId === p.id);
        const pBlockers = blockers.filter((b) => b.projectId === p.id);
        const completedTasks = pTasks.filter((t) => t.status === 'completed').length;
        const avgProgress =
          pTasks.length > 0
            ? Math.round(pTasks.reduce((acc, t) => acc + t.progress, 0) / pTasks.length)
            : 0;
        const unresolvedBlockers = pBlockers.filter((b) => !b.isResolved).length;
        return {
          project: p,
          totalTasks: pTasks.length,
          completedTasks,
          avgProgress,
          unresolvedBlockers,
          totalBlockers: pBlockers.length,
        };
      });
  }, [projects, tasks, blockers, historySearch, historyCycleFilter]);

  const hoveredTask = hoverCard ? taskById.get(hoverCard.taskId) ?? null : null;

  return (
    <div className="space-y-5">
      {/* Top Sub-Tab Switcher + New Project */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] dark:bg-[#0F172A] rounded-md border border-[#E2E8F0] dark:border-[#1E293B]">
          <button
            type="button"
            onClick={() => setSubTab('gantt')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'gantt'
                ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5" />
            <span>Active Project</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('history')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'history'
                ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Project History</span>
            <span className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
              ({projects.length})
            </span>
          </button>
        </div>

        {canManageProjects ? (
          <button
            type="button"
            onClick={() => setShowNewProjectModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] bg-white dark:bg-[#111827] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Project</span>
          </button>
        ) : (
          <span className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
            Assigned activities can be updated inline or in the inspector
          </span>
        )}
      </div>

      {subTab === 'history' ? (
        <div className="space-y-4">
          {/* Project History Toolbar */}
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-4 h-4 text-[#64748B] dark:text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search project code, name, or scope..."
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] dark:bg-[#0F172A] rounded-md border border-[#E2E8F0] dark:border-[#1E293B]">
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
                    onClick={() => setHistoryCycleFilter(opt.key)}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      historyCycleFilter === opt.key
                        ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                        : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <span className="text-xs text-[#64748B] dark:text-[#94A3B8] font-mono tabular-nums">
              {projectHistoryRows.length} of {projects.length} projects · Click row to open
            </span>
          </div>

          {/* Project History Resizable Table (Desktop) & Compact Cards (Mobile) */}
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden">
            {/* Mobile Compact Cards */}
            <div className="md:hidden divide-y divide-[#E2E8F0] dark:divide-[#1E293B]">
              {projectHistoryRows.length === 0 ? (
                <div className="py-10 px-4 text-center text-sm text-[#64748B] dark:text-[#94A3B8]">
                  No maintenance projects match your filters.
                </div>
              ) : (
                projectHistoryRows.map((row) => {
                  const isActive = activeProject?.id === row.project.id;
                  return (
                    <button
                      key={row.project.id}
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(row.project.id);
                        setSelectedTaskId(null);
                        setSubTab('gantt');
                      }}
                      className={`w-full text-left p-4 space-y-2.5 transition-colors ${
                        isActive
                          ? 'bg-[#EFF6FF]/60 dark:bg-[#1E3A8A]/25'
                          : 'hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA]">
                            {row.project.code} · {formatCycleLabel(row.project.cycleType)}
                          </div>
                          <div className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] mt-0.5 leading-snug">
                            {row.project.name}
                          </div>
                        </div>
                        <span className="font-mono text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums shrink-0">
                          {row.avgProgress}%
                        </span>
                      </div>

                      <div className="w-full h-1.5 bg-[#F1F5F9] dark:bg-[#1E293B] rounded-sm overflow-hidden">
                        <div
                          className={`h-full ${
                            row.avgProgress === 100
                              ? 'bg-[#16A34A]'
                              : 'bg-[#1D4ED8] dark:bg-[#3B82F6]'
                          }`}
                          style={{ width: `${row.avgProgress}%` }}
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
                        <span className="font-mono tabular-nums">
                          {formatShortDate(row.project.startDate)} – {formatShortDate(row.project.endDate)} ·{' '}
                          {row.completedTasks}/{row.totalTasks} done
                        </span>
                        <span className="font-mono tabular-nums">
                          {row.unresolvedBlockers > 0 ? (
                            <span className="text-[#DC2626] dark:text-[#F87171] font-semibold">
                              {row.unresolvedBlockers} active blockers
                            </span>
                          ) : (
                            <span className="text-[#16A34A] dark:text-[#4ADE80]">Clear</span>
                          )}
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
                      width={historyCols.code}
                      onStartResize={(e) => resizeHistoryCol('code', e)}
                      className="py-3 px-4"
                    >
                      Project Code
                    </ResizableTh>
                    <ResizableTh
                      width={historyCols.name}
                      onStartResize={(e) => resizeHistoryCol('name', e)}
                      className="py-3 px-4"
                    >
                      Project Name &amp; Scope
                    </ResizableTh>
                    <ResizableTh
                      width={historyCols.cycle}
                      onStartResize={(e) => resizeHistoryCol('cycle', e)}
                      className="py-3 px-4"
                    >
                      Cycle Type
                    </ResizableTh>
                    <ResizableTh
                      width={historyCols.window}
                      onStartResize={(e) => resizeHistoryCol('window', e)}
                      className="py-3 px-4"
                    >
                      Schedule Window
                    </ResizableTh>
                    <ResizableTh
                      width={historyCols.tasks}
                      onStartResize={(e) => resizeHistoryCol('tasks', e)}
                      className="py-3 px-4"
                    >
                      Activities
                    </ResizableTh>
                    <ResizableTh
                      width={historyCols.progress}
                      onStartResize={(e) => resizeHistoryCol('progress', e)}
                      className="py-3 px-4"
                    >
                      Completion
                    </ResizableTh>
                    <ResizableTh
                      width={historyCols.blockers}
                      onStartResize={(e) => resizeHistoryCol('blockers', e)}
                      className="py-3 px-4"
                    >
                      Blockers
                    </ResizableTh>
                    <ResizableTh
                      width={historyCols.action}
                      onStartResize={(e) => resizeHistoryCol('action', e)}
                      align="right"
                      className="py-3 px-4"
                    >
                      Action
                    </ResizableTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B] text-sm">
                  {projectHistoryRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-10 px-4 text-center text-sm text-[#64748B] dark:text-[#94A3B8]"
                      >
                        No maintenance projects match your filters.
                      </td>
                    </tr>
                  ) : (
                    projectHistoryRows.map((row) => {
                      const isActive = activeProject?.id === row.project.id;
                      return (
                        <tr
                          key={row.project.id}
                          onClick={() => {
                            setSelectedProjectId(row.project.id);
                            setSelectedTaskId(null);
                            setSubTab('gantt');
                          }}
                          className={`cursor-pointer transition-colors ${
                            isActive
                              ? 'bg-[#EFF6FF]/60 dark:bg-[#1E3A8A]/25 hover:bg-[#EFF6FF] dark:hover:bg-[#1E3A8A]/40'
                              : 'hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/60'
                          }`}
                        >
                          <td className="py-3 px-4 font-mono text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA] truncate">
                            {row.project.code}
                          </td>
                          <td className="py-3 px-4 min-w-0">
                            <div className="font-medium text-[#0F172A] dark:text-[#F8FAFC] text-sm truncate">
                              {row.project.name}
                            </div>
                            {row.project.description && (
                              <div className="text-xs text-[#64748B] dark:text-[#94A3B8] truncate">
                                {row.project.description}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-[#334155] dark:text-[#CBD5E1] truncate">
                            {formatCycleLabel(row.project.cycleType)}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-[#475569] dark:text-[#94A3B8] truncate tabular-nums">
                            {formatShortDate(row.project.startDate)} – {formatShortDate(row.project.endDate)}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-[#0F172A] dark:text-[#F8FAFC] tabular-nums whitespace-nowrap">
                            {row.completedTasks}/{row.totalTasks} done
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-[#F1F5F9] dark:bg-[#1E293B] rounded-sm overflow-hidden">
                                <div
                                  className={`h-full ${
                                    row.avgProgress === 100
                                      ? 'bg-[#16A34A]'
                                      : 'bg-[#1D4ED8] dark:bg-[#3B82F6]'
                                  }`}
                                  style={{ width: `${row.avgProgress}%` }}
                                />
                              </div>
                              <span className="font-mono text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
                                {row.avgProgress}%
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs whitespace-nowrap font-mono tabular-nums">
                            {row.unresolvedBlockers > 0 ? (
                              <span className="text-[#DC2626] dark:text-[#F87171] font-semibold">
                                {row.unresolvedBlockers} active
                              </span>
                            ) : (
                              <span className="text-[#16A34A] dark:text-[#4ADE80]">Clear</span>
                            )}
                            {row.totalBlockers > 0 && (
                              <span className="text-[#64748B] dark:text-[#94A3B8]">
                                {' '}
                                / {row.totalBlockers}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] dark:text-[#60A5FA]">
                              <span>Open Project</span>
                              <ArrowRight className="w-3.5 h-3.5" />
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
        </div>
      ) : (
        <>
          {/* Active Project Header & Toolbar */}
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full lg:w-auto">
              <div className="flex items-center gap-2 flex-1 sm:flex-initial min-w-0">
                <FolderKanban className="w-4 h-4 text-[#1D4ED8] dark:text-[#60A5FA] shrink-0" />
                <select
                  value={activeProject?.id ?? ''}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value);
                    setSelectedTaskId(null);
                  }}
                  className="flex-1 sm:flex-initial min-w-0 px-3 py-1.5 text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name}
                    </option>
                  ))}
                </select>
                {canManageProjects && activeProject && (
                  <button
                    type="button"
                    onClick={() => setShowProjectSettingsModal(true)}
                    title="Project Settings & WBS Numbering"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md shrink-0"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Project Settings</span>
                  </button>
                )}
              </div>

              {/* View Mode Switcher: Gantt Chart | Table View */}
              <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] dark:bg-[#0F172A] rounded-md border border-[#E2E8F0] dark:border-[#1E293B]">
                <button
                  type="button"
                  onClick={() => setViewMode('gantt')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    viewMode === 'gantt'
                      ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                      : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                  }`}
                >
                  <GanttChart className="w-3.5 h-3.5" />
                  <span>Gantt Chart</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    viewMode === 'table'
                      ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                      : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                  }`}
                >
                  <Table2 className="w-3.5 h-3.5" />
                  <span>Table View</span>
                </button>
              </div>

              {viewMode === 'gantt' && (
                <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] dark:bg-[#0F172A] rounded-md border border-[#E2E8F0] dark:border-[#1E293B]">
                  {(['day', 'week', 'month'] as const).map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => setZoom(z)}
                      className={`px-2.5 py-1 text-xs font-medium rounded capitalize transition-colors whitespace-nowrap shrink-0 ${
                        zoom === z
                          ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                          : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                      }`}
                    >
                      {z}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setBlockersOnly((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  blockersOnly
                    ? 'bg-[#FEF2F2] dark:bg-[#7F1D1D]/40 text-[#B91C1C] dark:text-[#FCA5A5] border-[#FECACA] dark:border-[#B91C1C]'
                    : 'bg-white dark:bg-[#0F172A] text-[#475569] dark:text-[#CBD5E1] border-[#CBD5E1] dark:border-[#334155] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                }`}
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Blockers Only ({activeBlockerCount})</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {activeProject && (
                <button
                  type="button"
                  onClick={() =>
                    exportProjectScheduleToCsv(activeProject, projectTasks, projectBlockers)
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] bg-white dark:bg-[#0F172A] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-[#475569] dark:text-[#94A3B8]" />
                  <span>Export CSV</span>
                </button>
              )}

              {canManageProjects && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowNewBlockerModal(true)}
                    disabled={projectTasks.length < 2}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#B91C1C] dark:text-[#FCA5A5] bg-[#FEF2F2] dark:bg-[#7F1D1D]/35 hover:bg-[#FEE2E2] dark:hover:bg-[#7F1D1D]/55 border border-[#FECACA] dark:border-[#991B1B] disabled:opacity-50 rounded-md whitespace-nowrap shrink-0"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Link Blocker</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowNewTaskModal(true)}
                    disabled={!activeProject}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 rounded-md whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Activity</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {viewMode === 'table' ? (
            /* Active Project — Schedule Table View */
            <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden">
              {visibleTasks.length === 0 ? (
                <div className="py-14 px-6 text-center">
                  <p className="text-sm text-[#475569] dark:text-[#94A3B8]">
                    {blockersOnly
                      ? 'No blocked activities or active blocker chains in this project.'
                      : useWbs
                      ? 'No WBS activities scheduled yet for this project.'
                      : 'No activities scheduled yet for this project.'}
                  </p>
                  {(blockersOnly || canManageProjects) && (
                    <button
                      type="button"
                      onClick={() => (blockersOnly ? setBlockersOnly(false) : setShowNewTaskModal(true))}
                      className="mt-3 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] rounded-md"
                    >
                      {blockersOnly ? 'Show All Activities' : 'Add First Activity'}
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Mobile Compact Activity Cards */}
                  <div className="md:hidden divide-y divide-[#E2E8F0] dark:divide-[#1E293B]">
                    {visibleTasks.map((task) => {
                      const activeUpstream = activeBlockersByBlockedId.get(task.id) ?? [];
                      const firstBlockerTask = activeUpstream[0]
                        ? taskById.get(activeUpstream[0].blockerTaskId)
                        : null;
                      const isBlocked = task.status === 'blocked';
                      const durationDays = getDurationDays(task.startDate, task.endDate);
                      const taskEditable = canEditTask(task);
                      const progressChoices = PROGRESS_PRESETS.includes(task.progress)
                        ? PROGRESS_PRESETS
                        : [...PROGRESS_PRESETS, task.progress].sort((a, b) => a - b);

                      return (
                        <div
                          key={task.id}
                          onClick={() => setSelectedTaskId(task.id)}
                          className={`p-4 space-y-3 cursor-pointer ${
                            isBlocked ? 'bg-[#FEF2F2]/40 dark:bg-[#7F1D1D]/15' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              {useWbs && (
                                <div className="font-mono text-[11px] font-semibold text-[#1D4ED8] dark:text-[#60A5FA]">
                                  WBS {task.wbsCode}
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 min-w-0">
                                {task.taskType === 'milestone' && (
                                  <Diamond className="w-3 h-3 text-[#D97706] shrink-0 fill-[#D97706]/20" />
                                )}
                                <span className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] leading-snug">
                                  {task.title}
                                </span>
                              </div>
                              <div className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5 font-mono tabular-nums">
                                {formatShortDate(task.startDate)} → {formatShortDate(task.endDate)} ({durationDays}d) ·{' '}
                                {task.assigneeName || 'Unassigned'}
                              </div>
                            </div>
                            <span className="font-mono text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums shrink-0">
                              {task.progress}%
                            </span>
                          </div>

                          {firstBlockerTask && isBlocked && (
                            <div className="text-[11px] text-[#DC2626] dark:text-[#F87171] flex items-center gap-1">
                              <Ban className="w-3 h-3 shrink-0" />
                              <span className="truncate">
                                Blocked by {useWbs ? `${firstBlockerTask.wbsCode} ` : ''}{firstBlockerTask.title}
                              </span>
                            </div>
                          )}

                          <div
                            className="grid grid-cols-2 gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              value={task.status}
                              disabled={!taskEditable}
                              onChange={(e) =>
                                patchTask(task.id, { status: e.target.value as TaskStatus })
                              }
                              className="min-h-[40px] px-2.5 py-1.5 text-xs font-medium rounded border bg-white dark:bg-[#0F172A] border-[#CBD5E1] dark:border-[#334155] text-[#0F172A] dark:text-[#F8FAFC] disabled:opacity-60"
                            >
                              <option value="not_started">Not Started</option>
                              <option value="in_progress">In Progress</option>
                              <option value="blocked">Blocked</option>
                              <option value="completed">Completed</option>
                            </select>
                            <select
                              value={task.progress}
                              disabled={!taskEditable}
                              onChange={(e) => {
                                const nextProg = Number(e.target.value);
                                const nextStatus =
                                  nextProg === 100 && task.status !== 'completed'
                                    ? 'completed'
                                    : nextProg > 0 && nextProg < 100 && task.status === 'not_started'
                                    ? 'in_progress'
                                    : undefined;
                                patchTask(task.id, {
                                  progress: nextProg,
                                  ...(nextStatus ? { status: nextStatus } : {}),
                                });
                              }}
                              className="min-h-[40px] px-2.5 py-1.5 font-mono text-xs bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded disabled:opacity-60"
                            >
                              {progressChoices.map((pct) => (
                                <option key={pct} value={pct}>
                                  {pct}% Done
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full table-fixed text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0F172A] text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                          {useWbs && (
                            <ResizableTh
                              width={tableCols.wbs}
                              onStartResize={(e) => resizeTableCol('wbs', e)}
                              className="py-3 px-4"
                            >
                              WBS
                            </ResizableTh>
                          )}
                          <ResizableTh
                            width={tableCols.activity}
                            onStartResize={(e) => resizeTableCol('activity', e)}
                            className="py-3 px-4"
                          >
                            Activity &amp; Blockers
                          </ResizableTh>
                        <ResizableTh
                          width={tableCols.assignee}
                          onStartResize={(e) => resizeTableCol('assignee', e)}
                          className="py-3 px-4"
                        >
                          Assignee
                        </ResizableTh>
                        <ResizableTh
                          width={tableCols.schedule}
                          onStartResize={(e) => resizeTableCol('schedule', e)}
                          className="py-3 px-4"
                        >
                          Schedule Start–Stop
                        </ResizableTh>
                        <ResizableTh
                          width={tableCols.status}
                          onStartResize={(e) => resizeTableCol('status', e)}
                          className="py-3 px-4"
                        >
                          Status
                        </ResizableTh>
                        <ResizableTh
                          width={tableCols.progress}
                          onStartResize={(e) => resizeTableCol('progress', e)}
                          className="py-3 px-4"
                        >
                          Work Progress
                        </ResizableTh>
                        <ResizableTh
                          width={tableCols.cycle}
                          onStartResize={(e) => resizeTableCol('cycle', e)}
                          className="py-3 px-4"
                        >
                          Linked Cycle
                        </ResizableTh>
                        <ResizableTh
                          width={tableCols.actions}
                          onStartResize={(e) => resizeTableCol('actions', e)}
                          align="right"
                          className="py-3 px-4"
                        >
                          Actions
                        </ResizableTh>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B] text-xs">
                      {visibleTasks.map((task) => {
                        const activeUpstream = activeBlockersByBlockedId.get(task.id) ?? [];
                        const firstBlockerTask = activeUpstream[0]
                          ? taskById.get(activeUpstream[0].blockerTaskId)
                          : null;
                        const isBlocked = task.status === 'blocked';
                        const isSelected = selectedTaskId === task.id;
                        const durationDays = getDurationDays(task.startDate, task.endDate);

                        const progressChoices = PROGRESS_PRESETS.includes(task.progress)
                          ? PROGRESS_PRESETS
                          : [...PROGRESS_PRESETS, task.progress].sort((a, b) => a - b);

                        const taskEditable = canEditTask(task);
                        const canReassign = canManageProjects && (task.status !== 'completed' || isAdmin);
                        const matchedRegisteredUser = users.find(
                          (u) =>
                            (task.assigneeId && u.id === task.assigneeId) ||
                            (!task.assigneeId &&
                              task.assigneeName &&
                              u.name.toLowerCase() === task.assigneeName.toLowerCase())
                        );
                        const selectedAssigneeVal = matchedRegisteredUser
                          ? matchedRegisteredUser.id
                          : task.assigneeName
                          ? `__legacy__:${task.assigneeName}`
                          : '';

                        return (
                          <tr
                            key={task.id}
                            onClick={() => setSelectedTaskId(task.id)}
                            onMouseEnter={(e) => handleTaskHoverEnter(task.id, e)}
                            onMouseMove={(e) => handleTaskHoverMove(task.id, e)}
                            onMouseLeave={handleTaskHoverLeave}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/30'
                                : isBlocked
                                ? 'bg-[#FEF2F2]/40 dark:bg-[#7F1D1D]/20 hover:bg-[#FEF2F2]/70 dark:hover:bg-[#7F1D1D]/30'
                                : 'hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/60'
                            }`}
                          >
                            {useWbs && (
                              <td className="py-3 px-4 font-mono text-[#475569] dark:text-[#CBD5E1] tabular-nums truncate">
                                {task.wbsCode}
                              </td>
                            )}
                            <td className={`py-3 px-4 min-w-0 ${task.parentId ? 'pl-7' : ''}`}>
                              <div className="flex items-center gap-1.5 min-w-0">
                                {task.taskType === 'milestone' && (
                                  <Diamond className="w-3 h-3 text-[#D97706] shrink-0 fill-[#D97706]/20" />
                                )}
                                <span
                                  className={`truncate ${
                                    task.taskType === 'phase'
                                      ? 'font-bold text-[#0F172A] dark:text-[#F8FAFC]'
                                      : 'font-medium text-[#0F172A] dark:text-[#F8FAFC]'
                                  }`}
                                >
                                  {task.title}
                                </span>
                              </div>
                              {firstBlockerTask && isBlocked && (
                                <div className="text-[11px] text-[#DC2626] dark:text-[#F87171] truncate flex items-center gap-1 mt-0.5">
                                  <Ban className="w-2.5 h-2.5 shrink-0" />
                                  <span className="truncate">
                                    Blocked by {useWbs ? `${firstBlockerTask.wbsCode} ` : ''}
                                    {firstBlockerTask.title}
                                  </span>
                                </div>
                              )}
                              {firstBlockerTask && task.manualOverride && !isBlocked && (
                                <div className="text-[11px] text-[#B45309] dark:text-[#FBBF24] truncate flex items-center gap-1 mt-0.5">
                                  <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                  <span className="truncate">
                                    Override · Dep:{' '}
                                    {useWbs ? firstBlockerTask.wbsCode : firstBlockerTask.title}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td
                              className="py-3 px-4 text-[#475569] dark:text-[#94A3B8]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {canReassign && users.length > 0 ? (
                                <select
                                  value={selectedAssigneeVal}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (!val) {
                                      patchTask(task.id, { assigneeId: null, assigneeName: '' });
                                      return;
                                    }
                                    if (val.startsWith('__legacy__:')) return;
                                    const picked = users.find((u) => u.id === val);
                                    if (picked) {
                                      patchTask(task.id, {
                                        assigneeId: picked.id,
                                        assigneeName: picked.name,
                                      });
                                    }
                                  }}
                                  className="w-full px-2 py-1 text-xs bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded truncate"
                                >
                                  <option value="">Unassigned</option>
                                  {task.assigneeName && !matchedRegisteredUser && (
                                    <option value={`__legacy__:${task.assigneeName}`}>
                                      {task.assigneeName} (Legacy)
                                    </option>
                                  )}
                                  {users.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="truncate block">
                                  {task.assigneeName || 'Unassigned'}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono text-[#334155] dark:text-[#CBD5E1] whitespace-nowrap tabular-nums">
                              {formatShortDate(task.startDate)} → {formatShortDate(task.endDate)}{' '}
                              <span className="text-[#64748B] dark:text-[#94A3B8]">
                                ({durationDays}d)
                              </span>
                            </td>
                            <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                              <select
                                value={task.status}
                                disabled={!taskEditable}
                                onChange={(e) =>
                                  patchTask(task.id, { status: e.target.value as TaskStatus })
                                }
                                className={`w-full px-2 py-1 text-xs font-medium rounded border bg-white dark:bg-[#0F172A] disabled:opacity-60 disabled:cursor-not-allowed ${
                                  task.status === 'completed'
                                    ? 'text-[#16A34A] dark:text-[#4ADE80] border-[#86EFAC] dark:border-[#16A34A]'
                                    : task.status === 'blocked'
                                    ? 'text-[#DC2626] dark:text-[#F87171] border-[#FECACA] dark:border-[#DC2626]'
                                    : task.status === 'in_progress'
                                    ? 'text-[#1D4ED8] dark:text-[#60A5FA] border-[#BFDBFE] dark:border-[#2563EB]'
                                    : 'text-[#475569] dark:text-[#CBD5E1] border-[#CBD5E1] dark:border-[#334155]'
                                }`}
                              >
                                <option value="not_started">Not Started</option>
                                <option value="in_progress">In Progress</option>
                                <option value="blocked">Blocked</option>
                                <option value="completed">Completed</option>
                              </select>
                            </td>
                            <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-2">
                                <select
                                  value={task.progress}
                                  disabled={!taskEditable}
                                  onChange={(e) => {
                                    const nextProg = Number(e.target.value);
                                    const nextStatus =
                                      nextProg === 100 && task.status !== 'completed'
                                        ? 'completed'
                                        : nextProg > 0 &&
                                          nextProg < 100 &&
                                          task.status === 'not_started'
                                        ? 'in_progress'
                                        : undefined;
                                    patchTask(task.id, {
                                      progress: nextProg,
                                      ...(nextStatus ? { status: nextStatus } : {}),
                                    });
                                  }}
                                  className="px-2 py-1 font-mono text-xs bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  {progressChoices.map((pct) => (
                                    <option key={pct} value={pct}>
                                      {pct}%
                                    </option>
                                  ))}
                                </select>
                                <div className="flex-1 h-1.5 bg-[#E2E8F0] dark:bg-[#1E293B] rounded-sm overflow-hidden min-w-[44px]">
                                  <div
                                    className={`h-full ${
                                      task.status === 'completed'
                                        ? 'bg-[#16A34A]'
                                        : isBlocked
                                        ? 'bg-[#DC2626]'
                                        : 'bg-[#1D4ED8] dark:bg-[#3B82F6]'
                                    }`}
                                    style={{ width: `${task.progress}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-[#475569] dark:text-[#94A3B8] truncate">
                              {formatCycleLabel(task.linkedCycle, true)}
                            </td>
                            <td
                              className="py-3 px-4 text-right whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setSelectedTaskId(task.id)}
                                  title="Open activity details, history & comments"
                                  className="p-1.5 text-[#64748B] dark:text-[#94A3B8] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#1E3A8A]/35 rounded"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                {task.status !== 'completed' ? (
                                  taskEditable && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        patchTask(task.id, { status: 'completed', progress: 100 })
                                      }
                                      title="Mark activity completed"
                                      className="p-1.5 text-[#64748B] dark:text-[#94A3B8] hover:text-[#16A34A] dark:hover:text-[#4ADE80] hover:bg-[#F0FDF4] dark:hover:bg-[#14532D]/35 rounded"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                    </button>
                                  )
                                ) : (
                                  <span className="p-1.5 text-[#16A34A] dark:text-[#4ADE80]">
                                    <Check className="w-3.5 h-3.5" />
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Direct Manipulation Hint Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[#64748B] dark:text-[#94A3B8]">
                <div className="hidden sm:block">
                  Hover any activity for quick info · Drag column or split-pane dividers to resize ·
                  Drag bar edges/body to schedule · Drag ports to link dependencies
                </div>
                <div className="sm:hidden">
                  Tap an activity to edit, or swipe the timeline horizontally
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-[#DC2626] inline-block" />
                    <span>Active Blocker</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-0.5 border-t-2 border-dashed border-[#D97706] inline-block" />
                    <span>Overridden</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-0.5 border-t border-dashed border-[#94A3B8] inline-block" />
                    <span>Cleared</span>
                  </span>
                </div>
              </div>

              {/* Split MS Project Workspace: Resizable Activity Table + Interactive Gantt Timeline */}
              <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden">
                {visibleTasks.length === 0 ? (
                  <div className="py-14 px-6 text-center">
                    <p className="text-sm text-[#475569] dark:text-[#94A3B8]">
                      {blockersOnly
                        ? 'No blocked activities or active blocker chains in this project.'
                        : useWbs
                        ? 'No WBS activities scheduled yet for this project.'
                        : 'No activities scheduled yet for this project.'}
                    </p>
                    {(blockersOnly || canManageProjects) && (
                      <button
                        type="button"
                        onClick={() =>
                          blockersOnly ? setBlockersOnly(false) : setShowNewTaskModal(true)
                        }
                        className="mt-3 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] rounded-md"
                      >
                        {blockersOnly ? 'Show All Activities' : 'Add First Activity'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col lg:flex-row">
                    {/* Left Pane: Resizable Activity Grid */}
                    <div
                      style={{ '--wbs-pane-width': `${effectiveWbsPaneWidth}px` } as React.CSSProperties}
                      className="w-full lg:w-[var(--wbs-pane-width)] shrink-0 overflow-x-auto border-b lg:border-b-0 border-[#E2E8F0] dark:border-[#1E293B]"
                    >
                      <div style={{ minWidth: totalWbsWidth }}>
                        <div
                          style={{ height: HEADER_HEIGHT }}
                          className="flex items-center bg-[#F8FAFC] dark:bg-[#0F172A] border-b border-[#E2E8F0] dark:border-[#1E293B] text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] select-none"
                        >
                          {useWbs && (
                            <div
                              style={{ width: wbsCols.wbs }}
                              className="relative h-full flex items-center px-3 shrink-0"
                            >
                              <span className="truncate">WBS</span>
                              <div
                                onPointerDown={(e) => startWbsColumnResize('wbs', e)}
                                title="Drag to resize WBS column"
                                className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#1D4ED8]/30 dark:hover:bg-[#60A5FA]/35 active:bg-[#1D4ED8]/50"
                              />
                            </div>
                          )}
                          <div
                            style={{ width: wbsCols.activity }}
                            className="relative h-full flex items-center px-3 shrink-0"
                          >
                            <span className="truncate">Activity &amp; Blocker Status</span>
                            <div
                              onPointerDown={(e) => startWbsColumnResize('activity', e)}
                              title="Drag to resize Activity column"
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#1D4ED8]/30 dark:hover:bg-[#60A5FA]/35 active:bg-[#1D4ED8]/50"
                            />
                          </div>
                          <div
                            style={{ width: wbsCols.dates }}
                            className="relative h-full flex items-center justify-end px-3 shrink-0"
                          >
                            <span className="truncate">Dates</span>
                            <div
                              onPointerDown={(e) => startWbsColumnResize('dates', e)}
                              title="Drag to resize Dates column"
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#1D4ED8]/30 dark:hover:bg-[#60A5FA]/35 active:bg-[#1D4ED8]/50"
                            />
                          </div>
                          <div
                            style={{ width: wbsCols.progress }}
                            className="relative h-full flex items-center justify-end px-3 shrink-0"
                          >
                            <span className="truncate">Progress</span>
                            <div
                              onPointerDown={(e) => startWbsColumnResize('progress', e)}
                              title="Drag to resize Progress column"
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#1D4ED8]/30 dark:hover:bg-[#60A5FA]/35 active:bg-[#1D4ED8]/50"
                            />
                          </div>
                        </div>

                        <div className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B]">
                          {visibleTasks.map((task) => {
                            const activeUpstream = activeBlockersByBlockedId.get(task.id) ?? [];
                            const isBlocked = task.status === 'blocked';
                            const hasActiveUpstream = activeUpstream.length > 0;
                            const isSelected = selectedTaskId === task.id;
                            const firstBlockerTask = activeUpstream[0]
                              ? taskById.get(activeUpstream[0].blockerTaskId)
                              : null;

                            return (
                              <div
                                key={task.id}
                                style={{ height: ROW_HEIGHT }}
                                onClick={() => setSelectedTaskId(task.id)}
                                onMouseEnter={(e) => handleTaskHoverEnter(task.id, e)}
                                onMouseMove={(e) => handleTaskHoverMove(task.id, e)}
                                onMouseLeave={handleTaskHoverLeave}
                                className={`flex items-center cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/35'
                                    : isBlocked
                                    ? 'bg-[#FEF2F2]/40 dark:bg-[#7F1D1D]/20 hover:bg-[#FEF2F2]/70 dark:hover:bg-[#7F1D1D]/30'
                                    : 'hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/60'
                                }`}
                              >
                                {useWbs && (
                                  <div
                                    style={{ width: wbsCols.wbs }}
                                    className="px-3 font-mono text-xs text-[#475569] dark:text-[#CBD5E1] tabular-nums truncate shrink-0"
                                  >
                                    {task.wbsCode}
                                  </div>
                                )}

                                <div
                                  style={{ width: wbsCols.activity }}
                                  className={`px-3 min-w-0 shrink-0 ${task.parentId ? 'pl-6' : ''}`}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {task.taskType === 'milestone' && (
                                      <Diamond className="w-3 h-3 text-[#D97706] shrink-0 fill-[#D97706]/20" />
                                    )}
                                    <span
                                      className={`text-xs truncate ${
                                        task.taskType === 'phase'
                                          ? 'font-bold text-[#0F172A] dark:text-[#F8FAFC]'
                                          : 'font-medium text-[#0F172A] dark:text-[#F8FAFC]'
                                      }`}
                                    >
                                      {task.title}
                                    </span>
                                  </div>
                                  {firstBlockerTask && isBlocked ? (
                                    <div className="text-[11px] text-[#DC2626] dark:text-[#F87171] truncate flex items-center gap-1">
                                      <Ban className="w-2.5 h-2.5 shrink-0" />
                                      <span className="truncate">
                                        Blocked by {useWbs ? `${firstBlockerTask.wbsCode} ` : ''}
                                        {firstBlockerTask.title}
                                      </span>
                                    </div>
                                  ) : firstBlockerTask && task.manualOverride ? (
                                    <div className="text-[11px] text-[#B45309] dark:text-[#FBBF24] truncate flex items-center gap-1">
                                      <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                      <span className="truncate">
                                        Override · Dep:{' '}
                                        {useWbs ? firstBlockerTask.wbsCode : firstBlockerTask.title}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                                      {task.assigneeName || 'Unassigned'}
                                      <span aria-hidden="true"> · </span>
                                      <span>{formatTaskStatusLabel(task.status)}</span>
                                      {hasActiveUpstream && (
                                        <>
                                          <span aria-hidden="true"> · </span>
                                          <span className="text-[#D97706] dark:text-[#FBBF24]">
                                            Dep active
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div
                                  style={{ width: wbsCols.dates }}
                                  className="px-3 text-right font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums truncate shrink-0"
                                >
                                  {task.startDate.slice(5)}–{task.endDate.slice(5)}
                                </div>

                                <div
                                  style={{ width: wbsCols.progress }}
                                  className="px-3 flex items-center justify-end gap-1.5 shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span
                                    className={`font-mono text-xs font-medium tabular-nums ${
                                      task.status === 'completed'
                                        ? 'text-[#16A34A] dark:text-[#4ADE80]'
                                        : isBlocked
                                        ? 'text-[#DC2626] dark:text-[#F87171]'
                                        : task.manualOverride
                                        ? 'text-[#B45309] dark:text-[#FBBF24]'
                                        : 'text-[#0F172A] dark:text-[#F8FAFC]'
                                    }`}
                                  >
                                    {task.progress}%
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedTaskId(task.id)}
                                    title="Edit activity, history & comments"
                                    className="p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#1E3A8A]/35 rounded"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  {task.status !== 'completed' ? (
                                    canEditTask(task) && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          patchTask(task.id, { status: 'completed', progress: 100 })
                                        }
                                        title="Mark activity completed"
                                        className="p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#16A34A] dark:hover:text-[#4ADE80] hover:bg-[#F0FDF4] dark:hover:bg-[#14532D]/35 rounded"
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                      </button>
                                    )
                                  ) : (
                                    <span className="p-1 text-[#16A34A] dark:text-[#4ADE80]">
                                      <Check className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Draggable Split-Pane Divider (Desktop) */}
                    <div
                      onPointerDown={startSplitPaneResize}
                      title="Drag to resize WBS & Gantt split width"
                      className="hidden lg:flex w-1.5 shrink-0 cursor-col-resize bg-[#E2E8F0] dark:bg-[#1E293B] hover:bg-[#1D4ED8]/40 active:bg-[#1D4ED8]/60 transition-colors items-center justify-center"
                    >
                      <div className="w-0.5 h-8 bg-[#94A3B8]/60 dark:bg-[#475569] rounded-full" />
                    </div>

                    {/* Right Pane: Interactive Drag-and-Drop SVG + HTML Gantt Timeline */}
                    <div className="flex-1 min-w-0 overflow-x-auto bg-white dark:bg-[#111827] select-none">
                      <div style={{ width: timelineMeta.totalWidth }} className="relative min-w-full">
                        {/* Calendar Scale Header */}
                        <div
                          style={{ height: HEADER_HEIGHT }}
                          className="relative flex border-b border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0F172A]"
                        >
                          {timelineMeta.ticks.map((tick, idx) => (
                            <div
                              key={idx}
                              style={{ width: tick.widthPx }}
                              className="shrink-0 border-r border-[#E2E8F0] dark:border-[#1E293B] px-2 flex flex-col justify-center"
                            >
                              <span className="font-mono text-[11px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                                {tick.label}
                              </span>
                              <span className="font-mono text-[10px] text-[#64748B] dark:text-[#94A3B8] truncate">
                                {tick.subLabel}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Gantt Canvas Rows + SVG Dependency Connectors */}
                        <div
                          ref={ganttCanvasRef}
                          className="relative"
                          style={{ height: visibleTasks.length * ROW_HEIGHT }}
                        >
                          {/* Vertical Grid Lines */}
                          <div className="pointer-events-none absolute inset-0 flex">
                            {timelineMeta.ticks.map((tick, idx) => (
                              <div
                                key={idx}
                                style={{ width: tick.widthPx }}
                                className="shrink-0 border-r border-[#F1F5F9] dark:border-[#1E293B]/70 h-full"
                              />
                            ))}
                          </div>

                          {/* Today Vertical Line */}
                          {timelineMeta.todayPx !== null && (
                            <div
                              style={{ left: timelineMeta.todayPx }}
                              className="pointer-events-none absolute top-0 bottom-0 w-px bg-[#1D4ED8] dark:bg-[#60A5FA] z-10"
                            >
                              <span className="absolute -top-5 -translate-x-1/2 px-1.5 py-0.5 bg-[#1D4ED8] text-white font-mono text-[9px] rounded-xs">
                                Today
                              </span>
                            </div>
                          )}

                          {/* Horizontal Row Stripes & Draggable Bars */}
                          {visibleTasks.map((task, idx) => {
                            const { left, width, startDate, endDate } = getBarGeometry(task);
                            const isBlocked = task.status === 'blocked';
                            const isSelected = selectedTaskId === task.id;
                            const isDropTarget = linkDrag?.hoverTargetTaskId === task.id;
                            const isDraggingThisBar = barDrag?.taskId === task.id && barDrag.moved;

                            const taskEditable = canEditTask(task);

                            return (
                              <div
                                key={task.id}
                                style={{ top: idx * ROW_HEIGHT, height: ROW_HEIGHT }}
                                className={`group absolute left-0 right-0 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center ${
                                  isDropTarget
                                    ? 'bg-[#DBEAFE]/55 dark:bg-[#1E3A8A]/45'
                                    : isSelected
                                    ? 'bg-[#EFF6FF]/60 dark:bg-[#1E3A8A]/25'
                                    : ''
                                }`}
                              >
                                {task.taskType === 'milestone' ? (
                                  <div
                                    style={{ left }}
                                    onMouseEnter={(e) => handleTaskHoverEnter(task.id, e)}
                                    onMouseMove={(e) => handleTaskHoverMove(task.id, e)}
                                    onMouseLeave={handleTaskHoverLeave}
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      setHoverCard(null);
                                      if (!taskEditable) {
                                        setSelectedTaskId(task.id);
                                        return;
                                      }
                                      setBarDrag({
                                        taskId: task.id,
                                        mode: 'move',
                                        originClientX: e.clientX,
                                        origStartDate: task.startDate,
                                        origEndDate: task.endDate,
                                        deltaDays: 0,
                                        moved: false,
                                      });
                                    }}
                                    className={`absolute flex items-center gap-2 z-20 ${
                                      taskEditable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                                    } ${isDropTarget ? 'ring-2 ring-[#1D4ED8] rounded px-1' : ''}`}
                                  >
                                    {canManageProjects && (
                                      <button
                                        type="button"
                                        onPointerDown={(e) =>
                                          startLinkDrag(e, task, 'start', idx, left, width)
                                        }
                                        title="Drag from Start port to link dependency"
                                        className={`w-2.5 h-2.5 rounded-full bg-white dark:bg-[#0F172A] border-2 border-[#1D4ED8] dark:border-[#60A5FA] -ml-3 transition-opacity ${
                                          linkDrag ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                        }`}
                                      />
                                    )}
                                    <div
                                      className={`w-4 h-4 rotate-45 border-2 shrink-0 ${
                                        task.status === 'completed'
                                          ? 'bg-[#16A34A] border-[#15803D]'
                                          : isBlocked
                                          ? 'bg-[#FEE2E2] border-[#DC2626]'
                                          : 'bg-[#FEF3C7] border-[#D97706]'
                                      }`}
                                    />
                                    {canManageProjects && (
                                      <button
                                        type="button"
                                        onPointerDown={(e) =>
                                          startLinkDrag(e, task, 'end', idx, left, width)
                                        }
                                        title="Drag from End port to link dependency"
                                        className={`w-2.5 h-2.5 rounded-full bg-white dark:bg-[#0F172A] border-2 border-[#1D4ED8] dark:border-[#60A5FA] transition-opacity ${
                                          linkDrag ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                        }`}
                                      />
                                    )}
                                    <span className="text-[11px] font-medium text-[#334155] dark:text-[#CBD5E1] whitespace-nowrap">
                                      {useWbs ? `${task.wbsCode} ` : ''}{task.title}
                                    </span>
                                  </div>
                                ) : (
                                  <div
                                    style={{ left, width }}
                                    onMouseEnter={(e) => handleTaskHoverEnter(task.id, e)}
                                    onMouseMove={(e) => handleTaskHoverMove(task.id, e)}
                                    onMouseLeave={handleTaskHoverLeave}
                                    className={`absolute flex items-center z-20 ${
                                      isDropTarget ? 'ring-2 ring-[#1D4ED8] rounded-sm' : ''
                                    }`}
                                  >
                                    {/* Left Connector Port (SS) */}
                                    {canManageProjects && (
                                      <button
                                        type="button"
                                        onPointerDown={(e) =>
                                          startLinkDrag(e, task, 'start', idx, left, width)
                                        }
                                        title="Drag to link Start-to-Start dependency"
                                        className={`absolute -left-3 w-2.5 h-2.5 rounded-full bg-white dark:bg-[#0F172A] border-2 border-[#1D4ED8] dark:border-[#60A5FA] cursor-crosshair z-30 transition-opacity ${
                                          linkDrag ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                        }`}
                                      />
                                    )}

                                    {/* Main Bar Body */}
                                    <div
                                      onPointerDown={(e) => {
                                        e.stopPropagation();
                                        setHoverCard(null);
                                        if (!taskEditable) {
                                          setSelectedTaskId(task.id);
                                          return;
                                        }
                                        setBarDrag({
                                          taskId: task.id,
                                          mode: 'move',
                                          originClientX: e.clientX,
                                          origStartDate: task.startDate,
                                          origEndDate: task.endDate,
                                          deltaDays: 0,
                                          moved: false,
                                        });
                                      }}
                                      className={`relative w-full overflow-hidden flex items-center ${
                                        taskEditable
                                          ? 'cursor-grab active:cursor-grabbing'
                                          : 'cursor-pointer'
                                      } ${
                                        task.taskType === 'phase'
                                          ? 'h-4 bg-[#CBD5E1] dark:bg-[#334155] rounded-xs border border-[#64748B]'
                                          : task.status === 'completed'
                                          ? 'h-6 bg-[#DCFCE7] dark:bg-[#14532D]/50 border border-[#16A34A] rounded-sm'
                                          : isBlocked
                                          ? 'h-6 bg-[#FEE2E2] dark:bg-[#7F1D1D]/50 border border-[#DC2626] rounded-sm'
                                          : task.manualOverride
                                          ? 'h-6 bg-[#FEF3C7] dark:bg-[#78350F]/50 border border-[#D97706] rounded-sm'
                                          : 'h-6 bg-[#DBEAFE] dark:bg-[#1E3A8A]/50 border border-[#3B82F6] rounded-sm'
                                      }`}
                                    >
                                      {/* Left Resize Handle */}
                                      {taskEditable && (
                                        <div
                                          onPointerDown={(e) => {
                                            e.stopPropagation();
                                            setBarDrag({
                                              taskId: task.id,
                                              mode: 'resize-start',
                                              originClientX: e.clientX,
                                              origStartDate: task.startDate,
                                              origEndDate: task.endDate,
                                              deltaDays: 0,
                                              moved: true,
                                            });
                                          }}
                                          title="Drag left edge to adjust start date"
                                          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-[#0F172A]/20 z-20"
                                        />
                                      )}

                                      <div
                                        style={{ width: `${task.progress}%` }}
                                        className={`h-full transition-all duration-150 ${
                                          task.taskType === 'phase'
                                            ? 'bg-[#334155] dark:bg-[#64748B]'
                                            : task.status === 'completed'
                                            ? 'bg-[#16A34A]'
                                            : isBlocked
                                            ? 'bg-[#DC2626]'
                                            : task.manualOverride
                                            ? 'bg-[#D97706]'
                                            : 'bg-[#1D4ED8] dark:bg-[#2563EB]'
                                        }`}
                                      />

                                      {task.taskType !== 'phase' && (
                                        <span
                                          className={`relative z-10 px-2.5 font-mono text-[10px] font-semibold whitespace-nowrap pointer-events-none ${
                                            task.progress > 45
                                              ? 'text-white'
                                              : 'text-[#0F172A] dark:text-[#F8FAFC]'
                                          }`}
                                        >
                                          {task.progress}%
                                        </span>
                                      )}

                                      {/* Right Resize Handle */}
                                      {taskEditable && (
                                        <div
                                          onPointerDown={(e) => {
                                            e.stopPropagation();
                                            setBarDrag({
                                              taskId: task.id,
                                              mode: 'resize-end',
                                              originClientX: e.clientX,
                                              origStartDate: task.startDate,
                                              origEndDate: task.endDate,
                                              deltaDays: 0,
                                              moved: true,
                                            });
                                          }}
                                          title="Drag right edge to adjust end date"
                                          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-[#0F172A]/20 z-20"
                                        />
                                      )}
                                    </div>

                                    {/* Right Connector Port (FS) */}
                                    {canManageProjects && (
                                      <button
                                        type="button"
                                        onPointerDown={(e) =>
                                          startLinkDrag(e, task, 'end', idx, left, width)
                                        }
                                        title="Drag to another bar to create Finish-to-Start dependency"
                                        className={`absolute -right-3 w-2.5 h-2.5 rounded-full bg-white dark:bg-[#0F172A] border-2 border-[#1D4ED8] dark:border-[#60A5FA] cursor-crosshair z-30 transition-opacity ${
                                          linkDrag ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                        }`}
                                      />
                                    )}

                                    {/* Live Drag Date Preview Badge */}
                                    {isDraggingThisBar && (
                                      <div className="pointer-events-none absolute -top-7 left-0 px-2 py-0.5 bg-[#0F172A] text-white font-mono text-[10px] rounded-xs whitespace-nowrap shadow-sm z-40">
                                        {startDate} → {endDate}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* SVG Blocker & Dependency Connectors + Live Rubber-Band Line */}
                          <svg
                            width={timelineMeta.totalWidth}
                            height={visibleTasks.length * ROW_HEIGHT}
                            className="pointer-events-none absolute inset-0 z-10"
                          >
                            <defs>
                              <marker
                                id="arrow-blocked"
                                viewBox="0 0 10 10"
                                refX="8"
                                refY="5"
                                markerWidth="6"
                                markerHeight="6"
                                orient="auto-start-reverse"
                              >
                                <path d="M 0 1 L 10 5 L 0 9 z" fill="#DC2626" />
                              </marker>
                              <marker
                                id="arrow-overridden"
                                viewBox="0 0 10 10"
                                refX="8"
                                refY="5"
                                markerWidth="6"
                                markerHeight="6"
                                orient="auto-start-reverse"
                              >
                                <path d="M 0 1 L 10 5 L 0 9 z" fill="#D97706" />
                              </marker>
                              <marker
                                id="arrow-resolved"
                                viewBox="0 0 10 10"
                                refX="8"
                                refY="5"
                                markerWidth="6"
                                markerHeight="6"
                                orient="auto-start-reverse"
                              >
                                <path d="M 0 1 L 10 5 L 0 9 z" fill="#94A3B8" />
                              </marker>
                              <marker
                                id="arrow-linking"
                                viewBox="0 0 10 10"
                                refX="8"
                                refY="5"
                                markerWidth="6"
                                markerHeight="6"
                                orient="auto-start-reverse"
                              >
                                <path d="M 0 1 L 10 5 L 0 9 z" fill="#3B82F6" />
                              </marker>
                            </defs>

                            {projectBlockers.map((b) => {
                              const upIdx = rowIndexMap.get(b.blockerTaskId);
                              const downIdx = rowIndexMap.get(b.blockedTaskId);
                              if (upIdx === undefined || downIdx === undefined) return null;
                              const upTask = visibleTasks[upIdx];
                              const downTask = visibleTasks[downIdx];
                              const upBar = getBarGeometry(upTask);
                              const downBar = getBarGeometry(downTask);

                              const startX =
                                b.dependencyType === 'SS' ? upBar.left : upBar.left + upBar.width;
                              const startY = upIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                              const endX = downBar.left;
                              const endY = downIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                              const midX = startX + 14;

                              const pathD =
                                endX >= startX + 16
                                  ? `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`
                                  : `M ${startX} ${startY} L ${startX + 12} ${startY} L ${startX + 12} ${
                                      startY + (endY > startY ? 18 : -18)
                                    } L ${endX - 12} ${startY + (endY > startY ? 18 : -18)} L ${
                                      endX - 12
                                    } ${endY} L ${endX} ${endY}`;

                              const isOverridden = !b.isResolved && downTask.manualOverride;
                              const strokeColor = b.isResolved
                                ? '#94A3B8'
                                : isOverridden
                                ? '#D97706'
                                : '#DC2626';
                              const marker = b.isResolved
                                ? 'url(#arrow-resolved)'
                                : isOverridden
                                ? 'url(#arrow-overridden)'
                                : 'url(#arrow-blocked)';

                              return (
                                <path
                                  key={b.id}
                                  d={pathD}
                                  fill="none"
                                  stroke={strokeColor}
                                  strokeWidth={b.isResolved ? 1.25 : 1.75}
                                  strokeDasharray={b.isResolved || isOverridden ? '4 3' : undefined}
                                  markerEnd={marker}
                                />
                              );
                            })}

                            {/* Live Drag-to-Link Rubber-Band Connector */}
                            {linkDrag && (
                              <line
                                x1={linkDrag.startX}
                                y1={linkDrag.startY}
                                x2={linkDrag.currentX}
                                y2={linkDrag.currentY}
                                stroke="#3B82F6"
                                strokeWidth={2}
                                strokeDasharray="4 3"
                                markerEnd="url(#arrow-linking)"
                              />
                            )}
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Activity Blocker Matrix */}
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  Activity Blocker Matrix
                </h3>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                  Click any activity to manage blockers, audit history, or comments
                </p>
              </div>
              {canManageProjects && (
                <button
                  type="button"
                  onClick={() => setShowNewBlockerModal(true)}
                  disabled={projectTasks.length < 2}
                  className="text-xs font-medium text-[#1D4ED8] dark:text-[#60A5FA] hover:underline whitespace-nowrap shrink-0"
                >
                  + Link New Blocker
                </button>
              )}
            </div>

            {/* Mobile Compact Blocker Cards */}
            <div className="md:hidden divide-y divide-[#E2E8F0] dark:divide-[#1E293B]">
              {projectBlockers.length === 0 ? (
                <div className="py-8 px-4 text-center text-xs text-[#64748B] dark:text-[#94A3B8]">
                  No blocker links defined yet. Tap an activity to add blockers.
                </div>
              ) : (
                projectBlockers.map((b) => {
                  const upstream = taskById.get(b.blockerTaskId);
                  const downstream = taskById.get(b.blockedTaskId);
                  if (!upstream || !downstream) return null;

                  return (
                    <div key={b.id} className="p-4 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                          {b.dependencyType === 'FS' ? 'Finish → Start' : 'Start → Start'}
                        </span>
                        {b.isResolved ? (
                          <span className="text-[#16A34A] dark:text-[#4ADE80] font-semibold">
                            Cleared
                          </span>
                        ) : downstream.manualOverride ? (
                          <span className="text-[#B45309] dark:text-[#FBBF24] font-semibold">
                            Manual Override
                          </span>
                        ) : (
                          <span className="text-[#DC2626] dark:text-[#F87171] font-semibold">
                            Active Blocker
                          </span>
                        )}
                      </div>

                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => setSelectedTaskId(upstream.id)}
                          className="text-left block w-full font-semibold text-[#0F172A] dark:text-[#F8FAFC]"
                        >
                          Upstream: {useWbs ? `${upstream.wbsCode} ` : ''}{upstream.title} ({upstream.progress}%)
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedTaskId(downstream.id)}
                          className="text-left block w-full text-[#334155] dark:text-[#CBD5E1]"
                        >
                          Blocks: {useWbs ? `${downstream.wbsCode} ` : ''}{downstream.title}
                        </button>
                      </div>

                      {b.blockerReason && (
                        <div className="text-[#64748B] dark:text-[#94A3B8]">{b.blockerReason}</div>
                      )}

                      {canManageProjects && (
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => resolveOrRemoveBlocker(b, 'resolve')}
                            className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-[#1D4ED8] dark:text-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 rounded-md"
                          >
                            {b.isResolved ? 'Re-open' : 'Mark Cleared'}
                          </button>
                          <button
                            type="button"
                            onClick={() => resolveOrRemoveBlocker(b, 'delete')}
                            className="min-h-[38px] px-2.5 py-1.5 text-[#DC2626] dark:text-[#F87171] bg-[#FEF2F2] dark:bg-[#7F1D1D]/25 rounded-md"
                            title="Remove dependency"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full table-fixed text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0F172A] text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                    <ResizableTh
                      width={blockerCols.upstream}
                      onStartResize={(e) => resizeBlockerCol('upstream', e)}
                      className="py-2.5 px-4"
                    >
                      Blocking Activity (Upstream)
                    </ResizableTh>
                    <ResizableTh
                      width={blockerCols.type}
                      onStartResize={(e) => resizeBlockerCol('type', e)}
                      className="py-2.5 px-4"
                    >
                      Type
                    </ResizableTh>
                    <ResizableTh
                      width={blockerCols.downstream}
                      onStartResize={(e) => resizeBlockerCol('downstream', e)}
                      className="py-2.5 px-4"
                    >
                      Blocked Activity (Downstream)
                    </ResizableTh>
                    <ResizableTh
                      width={blockerCols.reason}
                      onStartResize={(e) => resizeBlockerCol('reason', e)}
                      className="py-2.5 px-4"
                    >
                      Blocker Reason
                    </ResizableTh>
                    <ResizableTh
                      width={blockerCols.state}
                      onStartResize={(e) => resizeBlockerCol('state', e)}
                      className="py-2.5 px-4"
                    >
                      State
                    </ResizableTh>
                    <ResizableTh
                      width={blockerCols.actions}
                      onStartResize={(e) => resizeBlockerCol('actions', e)}
                      align="right"
                      className="py-2.5 px-4"
                    >
                      Actions
                    </ResizableTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B] text-xs">
                  {projectBlockers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-8 px-4 text-center text-[#64748B] dark:text-[#94A3B8]"
                      >
                        No blocker links defined yet. Drag a bar port on the Gantt chart or click an
                        activity to add blockers.
                      </td>
                    </tr>
                  ) : (
                    projectBlockers.map((b) => {
                      const upstream = taskById.get(b.blockerTaskId);
                      const downstream = taskById.get(b.blockedTaskId);
                      if (!upstream || !downstream) return null;

                      return (
                        <tr
                          key={b.id}
                          className="hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/60"
                        >
                          <td className="py-3 px-4 min-w-0">
                            <button
                              type="button"
                              onClick={() => setSelectedTaskId(upstream.id)}
                              className="font-medium text-[#0F172A] dark:text-[#F8FAFC] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA] text-left block w-full truncate"
                            >
                              {useWbs && (
                                <span className="font-mono text-[#475569] dark:text-[#94A3B8]">
                                  {upstream.wbsCode}{' '}
                                </span>
                              )}
                              {upstream.title}
                            </button>
                            <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-mono truncate">
                              {upstream.progress}% · {formatTaskStatusLabel(upstream.status)}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-[#475569] dark:text-[#94A3B8] truncate">
                            {b.dependencyType === 'FS' ? 'Finish → Start' : 'Start → Start'}
                          </td>
                          <td className="py-3 px-4 min-w-0">
                            <button
                              type="button"
                              onClick={() => setSelectedTaskId(downstream.id)}
                              className="font-medium text-[#0F172A] dark:text-[#F8FAFC] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA] text-left block w-full truncate"
                            >
                              {useWbs && (
                                <span className="font-mono text-[#475569] dark:text-[#94A3B8]">
                                  {downstream.wbsCode}{' '}
                                </span>
                              )}
                              {downstream.title}
                            </button>
                            <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-mono truncate">
                              Start {formatShortDate(downstream.startDate)}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-[#475569] dark:text-[#CBD5E1] break-words">
                            {b.blockerReason}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {b.isResolved ? (
                              <span className="text-[#16A34A] dark:text-[#4ADE80] font-medium">
                                Cleared
                              </span>
                            ) : downstream.manualOverride ? (
                              <span className="text-[#B45309] dark:text-[#FBBF24] font-medium">
                                Manual Override
                              </span>
                            ) : (
                              <span className="text-[#DC2626] dark:text-[#F87171] font-medium">
                                Active Blocker
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {canManageProjects ? (
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => resolveOrRemoveBlocker(b, 'resolve')}
                                  className="text-xs font-medium text-[#1D4ED8] dark:text-[#60A5FA] hover:underline"
                                >
                                  {b.isResolved ? 'Re-open' : 'Mark Cleared'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => resolveOrRemoveBlocker(b, 'delete')}
                                  title="Remove dependency"
                                  className="p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#DC2626] dark:hover:text-[#F87171] rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-[#94A3B8]">—</span>
                            )}
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
      )}

      {/* Activity Hover Quick-Info Popover */}
      {hoveredTask && hoverCard && !barDrag && !linkDrag && (
        <ActivityHoverPopover
          task={hoveredTask}
          useWbs={useWbs}
          x={hoverCard.x}
          y={hoverCard.y}
          incomingBlockers={activeBlockersByBlockedId.get(hoveredTask.id) ?? []}
          outgoingBlockers={activeBlockersByBlockerId.get(hoveredTask.id) ?? []}
          taskById={taskById}
        />
      )}

      {/* Task & Blocker Inspector Drawer (Details, Blockers, Change History & Comments) */}
      {selectedTask && (
        <TaskInspectorDrawer
          task={selectedTask}
          useWbs={useWbs}
          allTasks={projectTasks}
          blockers={projectBlockers}
          historyEntries={taskHistory.filter((h) => h.taskId === selectedTask.id)}
          comments={taskComments.filter((c) => c.taskId === selectedTask.id)}
          libraryItems={libraryItems}
          users={users}
          onOpenAssetVisual={onOpenAssetVisual}
          currentUser={currentUser}
          token={token}
          onClose={() => setSelectedTaskId(null)}
          onSave={(updates) => patchTask(selectedTask.id, updates)}
          onDelete={() => deleteTask(selectedTask.id)}
          onSelectTask={setSelectedTaskId}
          onCreateBlocker={createBlockerLink}
          onUpdateBlocker={updateBlockerLink}
          onRemoveBlocker={(b) => resolveOrRemoveBlocker(b, 'delete')}
          onSyncComplete={onSyncComplete}
          onNotify={onNotify}
        />
      )}

      {/* Modals */}
      {showNewProjectModal && canManageProjects && (
        <NewProjectModal
          token={token}
          onClose={() => setShowNewProjectModal(false)}
          onCreated={async (id) => {
            setShowNewProjectModal(false);
            await onSyncComplete();
            setSelectedProjectId(id);
            onNotify('Created new maintenance project schedule.');
          }}
          onNotify={onNotify}
        />
      )}

      {showProjectSettingsModal && activeProject && canManageProjects && (
        <ProjectSettingsModal
          project={activeProject}
          token={token}
          onClose={() => setShowProjectSettingsModal(false)}
          onUpdated={async () => {
            setShowProjectSettingsModal(false);
            await onSyncComplete();
            onNotify('Updated project settings.');
          }}
          onNotify={onNotify}
        />
      )}

      {showNewTaskModal && activeProject && canManageProjects && (
        <NewTaskModal
          project={activeProject}
          existingTasks={projectTasks}
          users={users}
          currentUser={currentUser}
          token={token}
          onClose={() => setShowNewTaskModal(false)}
          onCreated={async () => {
            setShowNewTaskModal(false);
            await onSyncComplete();
            onNotify(
              useWbs
                ? 'Added new WBS activity to project schedule.'
                : 'Added new activity to project schedule.'
            );
          }}
          onNotify={onNotify}
        />
      )}

      {showNewBlockerModal && activeProject && (
        <NewBlockerModal
          projectId={activeProject.id}
          useWbs={useWbs}
          tasks={projectTasks}
          token={token}
          onClose={() => setShowNewBlockerModal(false)}
          onCreated={async () => {
            setShowNewBlockerModal(false);
            await onSyncComplete();
            onNotify('Linked activity blocker dependency on project schedule.');
          }}
          onNotify={onNotify}
        />
      )}

      {/* Manual Override Warning Dialog */}
      {overridePrompt && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/45 dark:bg-black/75 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded-lg max-w-md w-full p-6 shadow-lg space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                  Blocked Activity Override Warning
                </h3>
                <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-1 leading-relaxed">
                  {overridePrompt.message}
                </p>
              </div>
            </div>

            <div className="bg-[#FEF2F2] dark:bg-[#7F1D1D]/30 border border-[#FECACA] dark:border-[#B91C1C] rounded-md p-3 space-y-1.5">
              <div className="text-[11px] font-semibold text-[#991B1B] dark:text-[#FCA5A5]">
                Unfinished Blocking Parent / Predecessor Activities:
              </div>
              {overridePrompt.blockingTasks.map((bt) => (
                <button
                  key={bt.id}
                  type="button"
                  onClick={() => {
                    setSelectedTaskId(bt.id);
                    setOverridePrompt(null);
                  }}
                  className="w-full text-left flex items-center justify-between text-xs text-[#7F1D1D] dark:text-[#FECACA] hover:underline"
                >
                  <span>
                    {useWbs && <span className="font-mono">{bt.wbs_code} </span>}
                    {bt.title}
                    {bt.status && (
                      <span className="ml-1.5 text-[10px] opacity-80">
                        ({formatTaskStatusLabel(bt.status)})
                      </span>
                    )}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>

            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              If you override manually, this activity status will update while keeping its
              dependency line visible on the schedule.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setOverridePrompt(null)}
                className="px-3.5 py-2 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
              >
                Keep Blocked
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = overridePrompt.taskId;
                  const updates = overridePrompt.pendingUpdates;
                  setOverridePrompt(null);
                  patchTask(id, { ...updates, forceOverride: true });
                }}
                className="px-3.5 py-2 text-xs font-medium text-white bg-[#D97706] hover:bg-[#B45309] rounded-md"
              >
                Confirm Manual Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type DrawerTab = 'details' | 'history' | 'comments';

function TaskInspectorDrawer({
  task,
  useWbs,
  allTasks,
  blockers,
  historyEntries,
  comments,
  libraryItems,
  users,
  onOpenAssetVisual,
  currentUser,
  token,
  onClose,
  onSave,
  onDelete,
  onSelectTask,
  onCreateBlocker,
  onUpdateBlocker,
  onRemoveBlocker,
  onSyncComplete,
  onNotify,
}: {
  task: ProjectTask;
  useWbs: boolean;
  allTasks: ProjectTask[];
  blockers: TaskBlocker[];
  historyEntries: TaskHistoryEntry[];
  comments: TaskComment[];
  libraryItems: LibraryItem[];
  users: User[];
  onOpenAssetVisual?: (assetId: string) => void;
  currentUser: User;
  token: string;
  onClose: () => void;
  onSave: (updates: Partial<ProjectTask>) => Promise<boolean>;
  onDelete: () => Promise<void>;
  onSelectTask: (id: string) => void;
  onCreateBlocker: (params: {
    blockerTaskId: string;
    blockedTaskId: string;
    dependencyType: DependencyType;
    blockerReason?: string;
  }) => Promise<boolean>;
  onUpdateBlocker: (
    blockerId: string,
    updates: Partial<{
      blockerTaskId: string;
      dependencyType: DependencyType;
      blockerReason: string;
      isResolved: boolean;
    }>
  ) => Promise<boolean>;
  onRemoveBlocker: (b: TaskBlocker) => Promise<void>;
  onSyncComplete: () => Promise<void>;
  onNotify: (message: string, kind?: 'info' | 'error') => void;
}) {
  const isAdmin = hasAnyRole(currentUser, 'admin');
  const canManageProjects = hasAnyRole(currentUser, 'admin', 'approver');
  const isAssignedToMe =
    (Boolean(task.assigneeId) && task.assigneeId === currentUser.id) ||
    (Boolean(task.assigneeName) &&
      task.assigneeName.trim().toLowerCase() === currentUser.name.trim().toLowerCase());
  const canEditThisTask =
    task.status === 'completed' ? isAdmin : canManageProjects || isAssignedToMe;
  const canManageBlockersOnTask = canManageProjects && (task.status !== 'completed' || isAdmin);

  const [drawerTab, setDrawerTab] = useState<DrawerTab>('details');
  const [title, setTitle] = useState(task.title);
  const [wbsCode, setWbsCode] = useState(task.wbsCode);
  const [assigneeId, setAssigneeId] = useState<string>(task.assigneeId ?? '');
  const [assigneeName, setAssigneeName] = useState(task.assigneeName);
  const [startDate, setStartDate] = useState(task.startDate);
  const [endDate, setEndDate] = useState(task.endDate);
  const [progress, setProgress] = useState(task.progress);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [linkedCycle, setLinkedCycle] = useState<CycleType | 'none'>(task.linkedCycle);
  const [notes, setNotes] = useState(task.notes);

  // In-activity blocker add & edit state
  const [showAddBlocker, setShowAddBlocker] = useState(false);
  const [addDirection, setAddDirection] = useState<'upstream' | 'downstream'>('upstream');
  const [otherTaskId, setOtherTaskId] = useState<string>('');
  const [newDepType, setNewDepType] = useState<DependencyType>('FS');
  const [newReason, setNewReason] = useState('');

  const [editingBlockerId, setEditingBlockerId] = useState<string | null>(null);
  const [editDepType, setEditDepType] = useState<DependencyType>('FS');
  const [editReason, setEditReason] = useState('');
  const [editResolved, setEditResolved] = useState(false);

  // Comments state
  const [commentBody, setCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  useEffect(() => {
    setTitle(task.title);
    setWbsCode(task.wbsCode);
    const matchedUser = users.find(
      (u) =>
        (task.assigneeId && u.id === task.assigneeId) ||
        (!task.assigneeId &&
          task.assigneeName &&
          u.name.toLowerCase() === task.assigneeName.toLowerCase())
    );
    setAssigneeId(matchedUser?.id ?? task.assigneeId ?? '');
    setAssigneeName(task.assigneeName);
    setStartDate(task.startDate);
    setEndDate(task.endDate);
    setProgress(task.progress);
    setStatus(task.status);
    setLinkedCycle(task.linkedCycle);
    setNotes(task.notes);
    setShowAddBlocker(false);
    setEditingBlockerId(null);
  }, [task, users]);

  const taskById = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);
  const parentTask = task.parentId ? taskById.get(task.parentId) ?? null : null;

  const incomingBlockers = blockers.filter((b) => b.blockedTaskId === task.id);
  const outgoingBlockers = blockers.filter((b) => b.blockerTaskId === task.id);
  const parentBlockerLink = parentTask
    ? incomingBlockers.find((b) => b.blockerTaskId === parentTask.id) ?? null
    : null;

  const candidateTasks = allTasks.filter((t) => t.id !== task.id);

  async function handleAddBlockerInsideActivity(e: React.FormEvent) {
    e.preventDefault();
    const targetId = otherTaskId || candidateTasks[0]?.id;
    if (!targetId) return;
    const ok = await onCreateBlocker({
      blockerTaskId: addDirection === 'upstream' ? targetId : task.id,
      blockedTaskId: addDirection === 'upstream' ? task.id : targetId,
      dependencyType: newDepType,
      blockerReason: newReason,
    });
    if (ok) {
      setShowAddBlocker(false);
      setNewReason('');
    }
  }

  function startEditBlocker(b: TaskBlocker) {
    setEditingBlockerId(b.id);
    setEditDepType(b.dependencyType);
    setEditReason(b.blockerReason);
    setEditResolved(b.isResolved);
  }

  async function saveEditBlocker(b: TaskBlocker) {
    const ok = await onUpdateBlocker(b.id, {
      dependencyType: editDepType,
      blockerReason: editReason,
      isResolved: editResolved,
    });
    if (ok) {
      setEditingBlockerId(null);
    }
  }

  async function handlePostComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setPostingComment(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify(data.error ?? 'Failed to add comment.', 'error');
        return;
      }
      setCommentBody('');
      await onSyncComplete();
      onNotify(`Posted comment on ${useWbs ? task.wbsCode : task.title}.`);
    } catch {
      onNotify('Network error posting comment.', 'error');
    } finally {
      setPostingComment(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments/${commentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        onNotify(data.error ?? 'Cannot delete comment.', 'error');
        return;
      }
      await onSyncComplete();
      onNotify('Deleted activity comment.');
    } catch {
      onNotify('Network error deleting comment.', 'error');
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-[#0F172A]/25 dark:bg-black/60 flex justify-end"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#111827] w-full max-w-lg h-full border-l border-[#E2E8F0] dark:border-[#1E293B] shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="font-mono text-xs text-[#1D4ED8] dark:text-[#60A5FA] font-semibold">
              {useWbs ? `WBS ${task.wbsCode} · ` : ''}
              {task.taskType}
              {task.manualOverride && (
                <span className="ml-2 text-[#B45309] dark:text-[#FBBF24]">· Manual Override</span>
              )}
            </div>
            <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC] truncate">
              {task.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Navigation Tabs */}
        <div className="px-6 py-2.5 bg-[#F8FAFC] dark:bg-[#0F172A] border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setDrawerTab('details')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              drawerTab === 'details'
                ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
            }`}
          >
            Details &amp; Blockers
          </button>
          <button
            type="button"
            onClick={() => setDrawerTab('history')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              drawerTab === 'history'
                ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Change History</span>
            <span className="font-mono text-[10px] opacity-80">({historyEntries.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setDrawerTab('comments')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              drawerTab === 'comments'
                ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Comments</span>
            <span className="font-mono text-[10px] opacity-80">({comments.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        {drawerTab === 'details' ? (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {!canEditThisTask && (
                <div className="p-3 rounded-md border border-[#FDE68A] dark:border-[#B45309] bg-[#FFFBEB] dark:bg-[#78350F]/30 text-xs text-[#92400E] dark:text-[#FCD34D]">
                  {task.status === 'completed'
                    ? 'This activity is Completed and locked. Only Administrators can modify completed activities.'
                    : 'Read-only view. Only Admins, Approvers, or the assigned user can edit this activity.'}
                </div>
              )}

              <div className={useWbs ? 'grid grid-cols-3 gap-3' : 'grid grid-cols-1 gap-3'}>
                {useWbs && (
                  <div>
                    <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                      WBS
                    </label>
                    <input
                      type="text"
                      disabled={!canEditThisTask || !canManageProjects}
                      value={wbsCode}
                      onChange={(e) => setWbsCode(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-sm font-mono bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md disabled:opacity-65"
                    />
                  </div>
                )}
                <div className={useWbs ? 'col-span-2' : ''}>
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Assignee (Registered User)
                  </label>
                  <select
                    disabled={!canEditThisTask || !canManageProjects}
                    value={
                      assigneeId && users.some((u) => u.id === assigneeId)
                        ? assigneeId
                        : assigneeName
                        ? `__legacy__:${assigneeName}`
                        : ''
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setAssigneeId('');
                        setAssigneeName('');
                        return;
                      }
                      if (val.startsWith('__legacy__:')) return;
                      const picked = users.find((u) => u.id === val);
                      if (picked) {
                        setAssigneeId(picked.id);
                        setAssigneeName(picked.name);
                      }
                    }}
                    className="w-full px-2.5 py-1.5 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md disabled:opacity-65"
                  >
                    <option value="">Unassigned</option>
                    {assigneeName && !users.some((u) => u.id === assigneeId) && (
                      <option value={`__legacy__:${assigneeName}`}>
                        {assigneeName} (Legacy)
                      </option>
                    )}
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {(u.roles ?? [u.role]).map(formatRoleLabel).join(' + ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Activity Title
                </label>
                <input
                  type="text"
                  disabled={!canEditThisTask || !canManageProjects}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md disabled:opacity-65"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    disabled={!canEditThisTask}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm font-mono bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md disabled:opacity-65"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    disabled={!canEditThisTask}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm font-mono bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md disabled:opacity-65"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Status
                  </label>
                  <select
                    disabled={!canEditThisTask}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaskStatus)}
                    className="w-full px-2.5 py-1.5 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md disabled:opacity-65"
                  >
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Linked Inspection
                  </label>
                  <select
                    disabled={!canEditThisTask}
                    value={linkedCycle}
                    onChange={(e) => setLinkedCycle(e.target.value as CycleType | 'none')}
                    className="w-full px-2.5 py-1.5 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md disabled:opacity-65"
                  >
                    <option value="none">None</option>
                    <option value="routine">Routine Inspection</option>
                    <option value="yearly">Yearly Maintenance</option>
                    <option value="eventual">Eventual Inspection</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  <span>Work Progress</span>
                  <span className="font-mono font-semibold">{progress}%</span>
                </div>
                <input
                  type="range"
                  disabled={!canEditThisTask}
                  min={0}
                  max={100}
                  step={5}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  className="w-full accent-[#1D4ED8] disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Execution Notes
                </label>
                <textarea
                  rows={2}
                  disabled={!canEditThisTask}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md disabled:opacity-65"
                />
              </div>

              {/* In-Activity Blocker & Dependency Editor */}
              <div className="border-t border-[#E2E8F0] dark:border-[#1E293B] pt-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    Activity Dependencies &amp; Blockers
                  </div>
                  {canManageBlockersOnTask && (
                    <button
                      type="button"
                      onClick={() => {
                        setOtherTaskId(candidateTasks[0]?.id ?? '');
                        setShowAddBlocker((v) => !v);
                      }}
                      disabled={candidateTasks.length === 0}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#1D4ED8] dark:text-[#93C5FD] bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 hover:bg-[#DBEAFE] rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Blocker / Link</span>
                    </button>
                  )}
                </div>

                {/* Quick Parent Dependency Toggle */}
                {parentTask && (
                  <div className="p-2.5 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-md flex items-center justify-between gap-3">
                    <div className="text-xs min-w-0">
                      <div className="font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                        Parent: {useWbs ? `${parentTask.wbsCode} ` : ''}
                        {parentTask.title}
                      </div>
                      <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                        Status: {formatTaskStatusLabel(parentTask.status)}
                        {parentBlockerLink
                          ? ' · Auto-blocks child while unfinished'
                          : ' · Independent of parent completion'}
                      </div>
                    </div>
                    {canManageBlockersOnTask && (
                      <button
                        type="button"
                        onClick={() => {
                          if (parentBlockerLink) {
                            onRemoveBlocker(parentBlockerLink);
                          } else {
                            onCreateBlocker({
                              blockerTaskId: parentTask.id,
                              blockedTaskId: task.id,
                              dependencyType: 'FS',
                              blockerReason: `Depends on parent ${useWbs ? `${parentTask.wbsCode} ` : ''}${parentTask.title}`,
                            });
                          }
                        }}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded border whitespace-nowrap shrink-0 ${
                          parentBlockerLink
                            ? 'bg-[#FEF2F2] dark:bg-[#7F1D1D]/40 text-[#B91C1C] dark:text-[#FCA5A5] border-[#FECACA] dark:border-[#B91C1C]'
                            : 'bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border-[#CBD5E1] dark:border-[#334155] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B]'
                        }`}
                      >
                        {parentBlockerLink ? 'Unlink Parent' : 'Depend on Parent'}
                      </button>
                    )}
                  </div>
                )}

                {/* Inline Add Blocker Form inside this Activity */}
                {showAddBlocker && (
                  <form
                    onSubmit={handleAddBlockerInsideActivity}
                    className="p-3 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md space-y-2.5"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAddDirection('upstream')}
                        className={`px-2 py-1.5 text-[11px] font-medium rounded border ${
                          addDirection === 'upstream'
                            ? 'bg-white dark:bg-[#1E293B] border-[#1D4ED8] text-[#1D4ED8] dark:text-[#60A5FA]'
                            : 'bg-transparent border-[#E2E8F0] dark:border-[#334155] text-[#475569] dark:text-[#94A3B8]'
                        }`}
                      >
                        Blocked By (Upstream)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddDirection('downstream')}
                        className={`px-2 py-1.5 text-[11px] font-medium rounded border ${
                          addDirection === 'downstream'
                            ? 'bg-white dark:bg-[#1E293B] border-[#1D4ED8] text-[#1D4ED8] dark:text-[#60A5FA]'
                            : 'bg-transparent border-[#E2E8F0] dark:border-[#334155] text-[#475569] dark:text-[#94A3B8]'
                        }`}
                      >
                        Blocks (Downstream)
                      </button>
                    </div>

                    <select
                      value={otherTaskId}
                      onChange={(e) => setOtherTaskId(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded"
                    >
                      {candidateTasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {useWbs ? `${t.wbsCode} · ` : ''}
                          {t.title} ({formatTaskStatusLabel(t.status)})
                        </option>
                      ))}
                    </select>

                    <select
                      value={newDepType}
                      onChange={(e) => setNewDepType(e.target.value as DependencyType)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded"
                    >
                      <option value="FS">Finish-to-Start (FS)</option>
                      <option value="SS">Start-to-Start (SS)</option>
                    </select>

                    <input
                      type="text"
                      value={newReason}
                      onChange={(e) => setNewReason(e.target.value)}
                      placeholder="Blocker reason or dependency note..."
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded"
                    />

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddBlocker(false)}
                        className="px-2.5 py-1 text-xs text-[#475569] dark:text-[#94A3B8]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1 text-xs font-medium text-white bg-[#1D4ED8] rounded"
                      >
                        Add Dependency
                      </button>
                    </div>
                  </form>
                )}

                {/* Incoming Blockers List (Editable Inline) */}
                <div className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                  Blocked By ({incomingBlockers.length})
                </div>
                {incomingBlockers.length === 0 ? (
                  <div className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                    No upstream blockers assigned.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {incomingBlockers.map((b) => {
                      const up = taskById.get(b.blockerTaskId);
                      if (!up) return null;
                      const isEditing = editingBlockerId === b.id;

                      return (
                        <div
                          key={b.id}
                          className="p-2.5 border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0F172A] rounded-md text-xs space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onSelectTask(up.id)}
                                className="font-medium text-[#0F172A] dark:text-[#F8FAFC] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA] text-left"
                              >
                                {useWbs ? `${up.wbsCode} ` : ''}
                                {up.title}
                              </button>
                              <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-mono">
                                {b.dependencyType} · {formatTaskStatusLabel(up.status)} ({up.progress}%)
                                {b.isResolved ? ' · Cleared' : ' · Active'}
                              </div>
                            </div>
                            {canManageBlockersOnTask && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    isEditing ? setEditingBlockerId(null) : startEditBlocker(b)
                                  }
                                  className="p-1 text-[#475569] dark:text-[#94A3B8] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA]"
                                  title="Edit blocker"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRemoveBlocker(b)}
                                  className="p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#DC2626] dark:hover:text-[#F87171]"
                                  title="Unlink blocker"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>

                          {isEditing ? (
                            <div className="space-y-2 pt-1 border-t border-[#E2E8F0] dark:border-[#334155]">
                              <div className="grid grid-cols-2 gap-2">
                                <select
                                  value={editDepType}
                                  onChange={(e) => setEditDepType(e.target.value as DependencyType)}
                                  className="px-2 py-1 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded"
                                >
                                  <option value="FS">Finish-to-Start (FS)</option>
                                  <option value="SS">Start-to-Start (SS)</option>
                                </select>
                                <label className="inline-flex items-center gap-1.5 text-xs text-[#334155] dark:text-[#CBD5E1]">
                                  <input
                                    type="checkbox"
                                    checked={editResolved}
                                    onChange={(e) => setEditResolved(e.target.checked)}
                                  />
                                  <span>Cleared</span>
                                </label>
                              </div>
                              <input
                                type="text"
                                value={editReason}
                                onChange={(e) => setEditReason(e.target.value)}
                                className="w-full px-2 py-1 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingBlockerId(null)}
                                  className="px-2 py-1 text-[11px] text-[#64748B] dark:text-[#94A3B8]"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => saveEditBlocker(b)}
                                  className="px-2.5 py-1 text-[11px] font-medium text-white bg-[#1D4ED8] rounded"
                                >
                                  Save Blocker
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-[11px] text-[#475569] dark:text-[#CBD5E1]">
                              {b.blockerReason}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Outgoing Blockers List */}
                <div className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] pt-1">
                  Blocking Downstream ({outgoingBlockers.length})
                </div>
                {outgoingBlockers.length === 0 ? (
                  <div className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                    No downstream activities depend on this task.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {outgoingBlockers.map((b) => {
                      const down = taskById.get(b.blockedTaskId);
                      if (!down) return null;
                      const isEditing = editingBlockerId === b.id;

                      return (
                        <div
                          key={b.id}
                          className="p-2.5 border border-[#E2E8F0] dark:border-[#334155] bg-[#FEF2F2]/40 dark:bg-[#7F1D1D]/20 rounded-md text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onSelectTask(down.id)}
                                className="font-medium text-[#0F172A] dark:text-[#F8FAFC] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA] text-left"
                              >
                                {useWbs ? `${down.wbsCode} ` : ''}
                                {down.title}
                              </button>
                              <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-mono">
                                {b.dependencyType} ·{' '}
                                {b.isResolved
                                  ? 'Cleared'
                                  : down.manualOverride
                                  ? 'Manual Override'
                                  : 'Blocked'}
                              </div>
                            </div>
                            {canManageBlockersOnTask && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    isEditing ? setEditingBlockerId(null) : startEditBlocker(b)
                                  }
                                  className="p-1 text-[#475569] dark:text-[#94A3B8] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA]"
                                  title="Edit blocker"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRemoveBlocker(b)}
                                  className="p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#DC2626] dark:hover:text-[#F87171]"
                                  title="Unlink blocker"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>

                          {isEditing && (
                            <div className="space-y-2 pt-1 border-t border-[#E2E8F0] dark:border-[#334155]">
                              <div className="grid grid-cols-2 gap-2">
                                <select
                                  value={editDepType}
                                  onChange={(e) => setEditDepType(e.target.value as DependencyType)}
                                  className="px-2 py-1 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded"
                                >
                                  <option value="FS">Finish-to-Start (FS)</option>
                                  <option value="SS">Start-to-Start (SS)</option>
                                </select>
                                <label className="inline-flex items-center gap-1.5 text-xs text-[#334155] dark:text-[#CBD5E1]">
                                  <input
                                    type="checkbox"
                                    checked={editResolved}
                                    onChange={(e) => setEditResolved(e.target.checked)}
                                  />
                                  <span>Cleared</span>
                                </label>
                              </div>
                              <input
                                type="text"
                                value={editReason}
                                onChange={(e) => setEditReason(e.target.value)}
                                className="w-full px-2 py-1 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingBlockerId(null)}
                                  className="px-2 py-1 text-[11px] text-[#64748B] dark:text-[#94A3B8]"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => saveEditBlocker(b)}
                                  className="px-2.5 py-1 text-[11px] font-medium text-white bg-[#1D4ED8] rounded"
                                >
                                  Save Blocker
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Linked Asset Visual Pins */}
              {(() => {
                const linkedPins = libraryItems.flatMap((asset) =>
                  (asset.pins ?? [])
                    .filter((p) => p.linkedTaskId === task.id)
                    .map((pin) => ({ asset, pin }))
                );
                if (linkedPins.length === 0) return null;
                return (
                  <div className="border-t border-[#E2E8F0] dark:border-[#1E293B] pt-4 space-y-2.5">
                    <div className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#2DD4BF]" />
                      <span>Linked Asset Visual Pins ({linkedPins.length})</span>
                    </div>
                    <div className="space-y-2">
                      {linkedPins.map(({ asset, pin }) => (
                        <div
                          key={pin.id}
                          className="p-2.5 border border-[#CCFBF1] dark:border-[#115E59] bg-[#F0FDFA]/60 dark:bg-[#134E4A]/20 rounded-md text-xs flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-mono text-[11px] font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
                              {asset.code} · Pin #{pin.pinNumber}
                            </div>
                            <div className="font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                              {pin.label}
                            </div>
                            <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                              {asset.title}
                            </div>
                          </div>
                          {onOpenAssetVisual && (
                            <button
                              type="button"
                              onClick={() => onOpenAssetVisual(asset.id)}
                              className="px-2.5 py-1 text-[11px] font-medium text-[#1D4ED8] dark:text-[#60A5FA] hover:underline shrink-0"
                            >
                              View Map
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="px-6 py-4 border-t border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0F172A] flex items-center justify-between shrink-0">
              {canManageBlockersOnTask ? (
                <button
                  type="button"
                  onClick={onDelete}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#DC2626] dark:text-[#F87171] hover:underline"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Activity</span>
                </button>
              ) : (
                <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  {canEditThisTask ? 'Assignee edit mode' : 'View only'}
                </span>
              )}

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 text-xs font-medium text-[#475569] dark:text-[#CBD5E1] bg-white dark:bg-[#111827] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                >
                  {canEditThisTask ? 'Cancel' : 'Close'}
                </button>
                {canEditThisTask && (
                  <button
                    type="button"
                    onClick={() =>
                      onSave({
                        wbsCode,
                        title,
                        assigneeId: assigneeId || null,
                        assigneeName,
                        startDate,
                        endDate,
                        progress,
                        status,
                        linkedCycle,
                        notes,
                      })
                    }
                    className="px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md"
                  >
                    Save Changes
                  </button>
                )}
              </div>
            </div>
          </>
        ) : drawerTab === 'history' ? (
          /* Change History Tab */
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            <div className="text-xs text-[#64748B] dark:text-[#94A3B8]">
              Automatic audit trail of progress, status, schedule, and assignment changes.
            </div>
            {historyEntries.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#64748B] dark:text-[#94A3B8]">
                No edits recorded for this activity yet.
              </div>
            ) : (
              <div className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-md bg-[#F8FAFC] dark:bg-[#0F172A]">
                {historyEntries.map((entry) => (
                  <div key={entry.id} className="p-3.5 space-y-1">
                    <div className="text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] leading-relaxed">
                      {entry.summary}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                      <span>
                        By <span className="font-medium text-[#334155] dark:text-[#CBD5E1]">{entry.actorName}</span>{' '}
                        <span className="capitalize">({entry.actorRole})</span>
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatAuditTimestamp(entry.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Comments Tab */
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {comments.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#64748B] dark:text-[#94A3B8]">
                  No comments yet. Share field updates, hold points, or coordination notes below.
                </div>
              ) : (
                comments.map((comment) => {
                  const canDelete =
                    comment.authorId === currentUser.id || hasAnyRole(currentUser, 'admin');
                  return (
                    <div
                      key={comment.id}
                      className="p-3.5 border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0F172A] rounded-md space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <div className="font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                          {comment.authorName}{' '}
                          <span className="text-[#64748B] dark:text-[#94A3B8] font-normal capitalize">
                            · {comment.authorRole}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                            {formatAuditTimestamp(comment.createdAt)}
                          </span>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(comment.id)}
                              title="Delete comment"
                              className="text-[#64748B] dark:text-[#94A3B8] hover:text-[#DC2626] dark:hover:text-[#F87171]"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-[#334155] dark:text-[#CBD5E1] leading-relaxed whitespace-pre-wrap">
                        {comment.body}
                      </p>
                    </div>
                  );
                })
              )}
            </div>

            <form
              onSubmit={handlePostComment}
              className="p-4 border-t border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0F172A] space-y-2.5 shrink-0"
            >
              <textarea
                rows={2}
                required
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Add timestamped coordination note or activity update..."
                className="w-full px-3 py-2 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Posting as {currentUser.name}
                </span>
                <button
                  type="submit"
                  disabled={postingComment || !commentBody.trim()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md"
                >
                  <Send className="w-3 h-3" />
                  <span>{postingComment ? 'Posting...' : 'Post Comment'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function NewProjectModal({
  token,
  onClose,
  onCreated,
  onNotify,
}: {
  token: string;
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
  onNotify: (m: string, k?: 'info' | 'error') => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState('');
  const [code, setCode] = useState('PRJ-2026');
  const [cycleType, setCycleType] = useState<CycleType>('yearly');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDaysStr(today, 30));
  const [useWbs, setUseWbs] = useState(true);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, code, cycleType, startDate, endDate, useWbs, description }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        onNotify(data.error ?? 'Failed to create project.', 'error');
        return;
      }
      await onCreated(data.id);
    } catch {
      onNotify('Network error creating project.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/45 dark:bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded-lg max-w-lg w-full shadow-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between shrink-0">
          <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
            New Maintenance Project Schedule
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Code
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Cycle
              </label>
              <select
                value={cycleType}
                onChange={(e) => setCycleType(e.target.value as CycleType)}
                className="w-full px-3 py-2 text-sm border border-[#CBD5E1] dark:border-[#334155] rounded-md bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC]"
              >
                <option value="yearly">Yearly Maintenance</option>
                <option value="routine">Routine Cycle</option>
                <option value="eventual">Eventual Inspection</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
              Project Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q4 Cooling Tower Overhaul"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Start Date
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                End Date
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
              />
            </div>
          </div>

          <div className="p-3 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-md space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Enable WBS Code Numbering?
              </span>
              <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                Changeable later
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setUseWbs(true)}
                className={`text-left px-3 py-2 rounded-md border transition-colors ${
                  useWbs
                    ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/35 border-[#1D4ED8] dark:border-[#60A5FA] text-[#0F172A] dark:text-[#F8FAFC]'
                    : 'bg-white dark:bg-[#111827] border-[#E2E8F0] dark:border-[#334155] text-[#475569] dark:text-[#94A3B8]'
                }`}
              >
                <div className="text-xs font-semibold">Yes — WBS Codes (1.0, 1.1)</div>
                <div className="text-[11px] opacity-80">Structured work breakdown numbering</div>
              </button>
              <button
                type="button"
                onClick={() => setUseWbs(false)}
                className={`text-left px-3 py-2 rounded-md border transition-colors ${
                  !useWbs
                    ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/35 border-[#1D4ED8] dark:border-[#60A5FA] text-[#0F172A] dark:text-[#F8FAFC]'
                    : 'bg-white dark:bg-[#111827] border-[#E2E8F0] dark:border-[#334155] text-[#475569] dark:text-[#94A3B8]'
                }`}
              >
                <div className="text-xs font-semibold">No — Simple Activity List</div>
                <div className="text-[11px] opacity-80">Hide WBS column &amp; codes</div>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[#475569] dark:text-[#CBD5E1] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] rounded-md"
            >
              {saving ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProjectSettingsModal({
  project,
  token,
  onClose,
  onUpdated,
  onNotify,
}: {
  project: Project;
  token: string;
  onClose: () => void;
  onUpdated: () => Promise<void>;
  onNotify: (m: string, k?: 'info' | 'error') => void;
}) {
  const [name, setName] = useState(project.name);
  const [code, setCode] = useState(project.code);
  const [cycleType, setCycleType] = useState<CycleType>(project.cycleType);
  const [startDate, setStartDate] = useState(project.startDate);
  const [endDate, setEndDate] = useState(project.endDate);
  const [useWbs, setUseWbs] = useState(project.useWbs ?? true);
  const [description, setDescription] = useState(project.description);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          code,
          cycleType,
          startDate,
          endDate,
          useWbs,
          description,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify(data.error ?? 'Failed to update project settings.', 'error');
        return;
      }
      await onUpdated();
    } catch {
      onNotify('Network error updating project settings.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/45 dark:bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded-lg max-w-lg w-full shadow-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between shrink-0">
          <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
            Project Settings · {project.code}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Code
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Cycle
              </label>
              <select
                value={cycleType}
                onChange={(e) => setCycleType(e.target.value as CycleType)}
                className="w-full px-3 py-2 text-sm border border-[#CBD5E1] dark:border-[#334155] rounded-md bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC]"
              >
                <option value="yearly">Yearly Maintenance</option>
                <option value="routine">Routine Cycle</option>
                <option value="eventual">Eventual Inspection</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
              Project Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Start Date
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                End Date
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
              />
            </div>
          </div>

          <label className="flex items-start justify-between gap-4 p-3.5 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-md cursor-pointer">
            <div>
              <div className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Enable WBS Code Numbering
              </div>
              <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                Show WBS columns, prefixes, and manual WBS inputs on activities. Existing stored WBS codes remain safely preserved when hidden.
              </div>
            </div>
            <input
              type="checkbox"
              checked={useWbs}
              onChange={(e) => setUseWbs(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-[#CBD5E1] text-[#1D4ED8]"
            />
          </label>

          <div>
            <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[#475569] dark:text-[#CBD5E1] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewTaskModal({
  project,
  existingTasks,
  users,
  currentUser,
  token,
  onClose,
  onCreated,
  onNotify,
}: {
  project: Project;
  existingTasks: ProjectTask[];
  users: User[];
  currentUser: User;
  token: string;
  onClose: () => void;
  onCreated: () => Promise<void>;
  onNotify: (m: string, k?: 'info' | 'error') => void;
}) {
  const useWbs = project.useWbs ?? true;
  const [wbsCode, setWbsCode] = useState(`${existingTasks.length + 1}.0`);
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('task');
  const [parentId, setParentId] = useState<string>('');
  const [dependsOnParent, setDependsOnParent] = useState(true);
  const [assigneeId, setAssigneeId] = useState<string>(currentUser.id);
  const [startDate, setStartDate] = useState(project.startDate);
  const [endDate, setEndDate] = useState(addDaysStr(project.startDate, 4));
  const [linkedCycle, setLinkedCycle] = useState<CycleType | 'none'>('yearly');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const parentCandidates = existingTasks.filter((t) => t.taskType !== 'milestone');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const pickedUser = users.find((u) => u.id === assigneeId);
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId: project.id,
          parentId: parentId || null,
          dependsOnParent: Boolean(parentId) && dependsOnParent,
          wbsCode: useWbs ? wbsCode : '',
          title,
          taskType,
          assigneeId: pickedUser ? pickedUser.id : assigneeId || null,
          assigneeName: pickedUser ? pickedUser.name : '',
          startDate,
          endDate: taskType === 'milestone' ? startDate : endDate,
          linkedCycle,
          notes,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify(data.error ?? 'Failed to add activity.', 'error');
        return;
      }
      await onCreated();
    } catch {
      onNotify('Network error adding activity.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/45 dark:bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded-lg max-w-lg w-full shadow-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between shrink-0">
          <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
            {useWbs ? 'Add Project WBS Activity' : 'Add Project Activity'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4 overflow-y-auto">
          <div className={useWbs ? 'grid grid-cols-1 sm:grid-cols-3 gap-3' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
            {useWbs && (
              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  WBS Code
                </label>
                <input
                  type="text"
                  required
                  value={wbsCode}
                  onChange={(e) => setWbsCode(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Type
              </label>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as TaskType)}
                className="w-full px-3 py-2 text-sm border border-[#CBD5E1] dark:border-[#334155] rounded-md bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC]"
              >
                <option value="task">Task</option>
                <option value="phase">Summary Phase</option>
                <option value="milestone">Milestone</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Parent Activity
              </label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#CBD5E1] dark:border-[#334155] rounded-md bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC]"
              >
                <option value="">Top Level</option>
                {parentCandidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {useWbs ? `${p.wbsCode} ` : ''}
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {parentId && (
            <label className="flex items-center gap-2 text-xs text-[#0F172A] dark:text-[#F8FAFC] bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-md px-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={dependsOnParent}
                onChange={(e) => setDependsOnParent(e.target.checked)}
                className="rounded border-[#CBD5E1] text-[#1D4ED8]"
              />
              <span>
                Child depends on parent (auto-set status to Blocked while parent is unfinished)
              </span>
            </label>
          )}

          <div>
            <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
              Activity Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Hydraulic Valve Pressure Verification"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Assignee (Registered User)
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
              >
                {users.length === 0 ? (
                  <option value={currentUser.id}>{currentUser.name}</option>
                ) : (
                  <>
                    <option value="">Unassigned (Self)</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {(u.roles ?? [u.role]).map(formatRoleLabel).join(' + ')}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Linked Inspection
              </label>
              <select
                value={linkedCycle}
                onChange={(e) => setLinkedCycle(e.target.value as CycleType | 'none')}
                className="w-full px-3 py-2 text-sm border border-[#CBD5E1] dark:border-[#334155] rounded-md bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC]"
              >
                <option value="none">None</option>
                <option value="routine">Routine Inspection</option>
                <option value="yearly">Yearly Maintenance</option>
                <option value="eventual">Eventual Inspection</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                Start Date
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                End Date
              </label>
              <input
                type="date"
                required
                disabled={taskType === 'milestone'}
                value={taskType === 'milestone' ? startDate : endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
              Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[#475569] dark:text-[#CBD5E1] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] rounded-md"
            >
              {saving ? 'Adding...' : 'Add Activity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewBlockerModal({
  projectId,
  useWbs,
  tasks,
  token,
  onClose,
  onCreated,
  onNotify,
}: {
  projectId: string;
  useWbs: boolean;
  tasks: ProjectTask[];
  token: string;
  onClose: () => void;
  onCreated: () => Promise<void>;
  onNotify: (m: string, k?: 'info' | 'error') => void;
}) {
  const [blockerTaskId, setBlockerTaskId] = useState(tasks[0]?.id ?? '');
  const [blockedTaskId, setBlockedTaskId] = useState(tasks[1]?.id ?? '');
  const [dependencyType, setDependencyType] = useState<DependencyType>('FS');
  const [blockerReason, setBlockerReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/blockers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId,
          blockerTaskId,
          blockedTaskId,
          dependencyType,
          blockerReason,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify(data.error ?? 'Could not create blocker link.', 'error');
        return;
      }
      await onCreated();
    } catch {
      onNotify('Network error creating blocker.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/45 dark:bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded-lg max-w-lg w-full shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
            Link Activity Blocker Dependency
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
              Blocking Activity (Upstream Prerequisite)
            </label>
            <select
              value={blockerTaskId}
              onChange={(e) => setBlockerTaskId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#CBD5E1] dark:border-[#334155] rounded-md bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC]"
            >
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {useWbs ? `${t.wbsCode} · ` : ''}
                  {t.title} ({t.progress}%)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
              Blocked Activity (Downstream Task Waiting)
            </label>
            <select
              value={blockedTaskId}
              onChange={(e) => setBlockedTaskId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#CBD5E1] dark:border-[#334155] rounded-md bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC]"
            >
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {useWbs ? `${t.wbsCode} · ` : ''}
                  {t.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
              Dependency Rule
            </label>
            <select
              value={dependencyType}
              onChange={(e) => setDependencyType(e.target.value as DependencyType)}
              className="w-full px-3 py-2 text-sm border border-[#CBD5E1] dark:border-[#334155] rounded-md bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC]"
            >
              <option value="FS">Finish-to-Start (FS) — Blocked until prerequisite finishes</option>
              <option value="SS">Start-to-Start (SS) — Blocked until prerequisite starts</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
              Blocker Explanation
            </label>
            <textarea
              rows={2}
              value={blockerReason}
              onChange={(e) => setBlockerReason(e.target.value)}
              placeholder="Explain why this activity is blocked and what clearance is needed..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[#475569] dark:text-[#CBD5E1] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-md"
            >
              {saving ? 'Linking...' : 'Save Blocker Link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ActivityHoverPopover({
  task,
  useWbs,
  x,
  y,
  incomingBlockers,
  outgoingBlockers,
  taskById,
}: {
  task: ProjectTask;
  useWbs: boolean;
  x: number;
  y: number;
  incomingBlockers: TaskBlocker[];
  outgoingBlockers: TaskBlocker[];
  taskById: Map<string, ProjectTask>;
}) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const cardWidth = 320;
  const cardHeight = 230;

  const left = x + 16 + cardWidth > vw - 16 ? Math.max(12, x - cardWidth - 14) : x + 16;
  const top = y + 16 + cardHeight > vh - 16 ? Math.max(12, vh - cardHeight - 16) : y + 14;
  const duration = getDurationDays(task.startDate, task.endDate);

  return (
    <div
      style={{ left, top, width: cardWidth }}
      className="pointer-events-none fixed z-50 bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-lg shadow-xl p-3.5 text-xs space-y-2.5"
    >
      <div className="flex items-start justify-between gap-2 border-b border-[#F1F5F9] dark:border-[#334155] pb-2">
        <div className="min-w-0">
          <div className="font-mono text-[11px] font-semibold text-[#1D4ED8] dark:text-[#60A5FA] flex items-center gap-1.5">
            {useWbs && (
              <>
                <span>WBS {task.wbsCode}</span>
                <span className="text-[#CBD5E1] dark:text-[#475569]">·</span>
              </>
            )}
            <span className="uppercase text-[#64748B] dark:text-[#94A3B8]">{task.taskType}</span>
          </div>
          <div className="font-semibold text-[#0F172A] dark:text-[#F8FAFC] text-xs mt-0.5 leading-snug">
            {task.title}
          </div>
        </div>
        <span
          className={`font-semibold text-[11px] shrink-0 ${
            task.status === 'completed'
              ? 'text-[#16A34A] dark:text-[#4ADE80]'
              : task.status === 'blocked'
              ? 'text-[#DC2626] dark:text-[#F87171]'
              : task.manualOverride
              ? 'text-[#B45309] dark:text-[#FBBF24]'
              : 'text-[#1D4ED8] dark:text-[#60A5FA]'
          }`}
        >
          {formatTaskStatusLabel(task.status)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        <div>
          <span className="text-[#64748B] dark:text-[#94A3B8]">Schedule: </span>
          <span className="font-mono text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
            {formatShortDate(task.startDate)} – {formatShortDate(task.endDate)}
          </span>
        </div>
        <div>
          <span className="text-[#64748B] dark:text-[#94A3B8]">Progress: </span>
          <span className="font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
            {task.progress}% ({duration}d)
          </span>
        </div>
        <div>
          <span className="text-[#64748B] dark:text-[#94A3B8]">Assignee: </span>
          <span className="text-[#0F172A] dark:text-[#F8FAFC]">
            {task.assigneeName || 'Unassigned'}
          </span>
        </div>
        <div>
          <span className="text-[#64748B] dark:text-[#94A3B8]">Linked Cycle: </span>
          <span className="text-[#0F172A] dark:text-[#F8FAFC]">
            {formatCycleLabel(task.linkedCycle, true)}
          </span>
        </div>
      </div>

      {task.manualOverride && (
        <div className="text-[11px] text-[#B45309] dark:text-[#FBBF24] bg-[#FFFBEB] dark:bg-[#78350F]/35 border border-[#FDE68A] dark:border-[#B45309] rounded px-2 py-1">
          Manual override active — dependency remains tracked.
        </div>
      )}

      {incomingBlockers.length > 0 && (
        <div className="bg-[#FEF2F2] dark:bg-[#7F1D1D]/35 border border-[#FECACA] dark:border-[#B91C1C] rounded px-2.5 py-1.5 space-y-1">
          <div className="text-[10px] font-semibold text-[#991B1B] dark:text-[#FCA5A5] uppercase tracking-wider">
            Blocked By ({incomingBlockers.length})
          </div>
          {incomingBlockers.slice(0, 2).map((b) => {
            const up = taskById.get(b.blockerTaskId);
            return (
              <div key={b.id} className="text-[11px] text-[#7F1D1D] dark:text-[#FECACA] truncate">
                {up
                  ? `${useWbs ? `${up.wbsCode} ` : ''}${up.title} (${up.progress}%)`
                  : b.blockerReason}
              </div>
            );
          })}
        </div>
      )}

      {outgoingBlockers.length > 0 && (
        <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
          <span className="font-medium text-[#0F172A] dark:text-[#F8FAFC]">
            Blocks {outgoingBlockers.length} downstream:
          </span>{' '}
          {outgoingBlockers
            .slice(0, 2)
            .map((b) => {
              const down = taskById.get(b.blockedTaskId);
              return down ? `${useWbs ? `${down.wbsCode} ` : ''}${down.title}` : '';
            })
            .filter(Boolean)
            .join(', ')}
        </div>
      )}

      {task.notes && (
        <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] line-clamp-2 border-t border-[#F1F5F9] dark:border-[#334155] pt-1.5">
          {task.notes}
        </div>
      )}
    </div>
  );
}
