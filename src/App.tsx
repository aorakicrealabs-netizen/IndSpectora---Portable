/**
 * IndSpectora — Main Application Shell
 * @author Aoraki CreaLabs
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BookOpen,
  BookOpenCheck,
  CheckCheck,
  ClipboardCheck,
  GanttChartSquare,
  History,
  LayoutDashboard,
  LogOut,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { AssetHistoryPage } from './components/AssetHistoryPage.tsx';
import { AuthGate } from './components/AuthGate.tsx';
import { GanttMonitoring } from './components/GanttMonitoring.tsx';
import { HowToUsePage } from './components/HowToUsePage.tsx';
import {
  InspectionWorkspace,
  isReportNeedingUserAction,
} from './components/InspectionWorkspace.tsx';
import { LibraryManager } from './components/LibraryManager.tsx';
import { PageTourOverlay } from './components/PageTourOverlay.tsx';
import { SettingsPage, type SettingsSection } from './components/SettingsPage.tsx';
import type {
  BootstrapPayload,
  RealtimeMessage,
  TourPageKey,
  User,
  UserNotification,
} from './types.ts';
import { formatRoleLabel, hasAnyRole } from './types.ts';
import { formatDateTime } from './utils/export.ts';

type ActiveTab = Exclude<TourPageKey, 'users'>;
type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'indspectora_theme';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string>(new Date().toISOString());
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return (
        (localStorage.getItem('indspectora_sidebar_collapsed') ??
          localStorage.getItem('opsledger_sidebar_collapsed')) === 'true'
      );
    } catch {
      return false;
    }
  });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      return (localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem('opsledger_theme')) === 'dark'
        ? 'dark'
        : 'light';
    } catch {
      return 'light';
    }
  });
  const [focusTask, setFocusTask] = useState<{ projectId: string; taskId: string } | null>(null);
  const [focusAssetId, setFocusAssetId] = useState<string | null>(null);
  const [focusHistoryAssetId, setFocusHistoryAssetId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; kind: 'info' | 'error' } | null>(null);

  // Notifications & First-Time Tour state
  const [showNotifications, setShowNotifications] = useState(false);
  const notifContainerRef = useRef<HTMLDivElement | null>(null);
  const [tourDismissedSession, setTourDismissedSession] = useState<Set<TourPageKey>>(
    () => new Set()
  );
  const [forcedTourPage, setForcedTourPage] = useState<TourPageKey | null>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('profile');
  const appliedLandingForUserRef = useRef<string | null>(null);
  const toastNotificationsRef = useRef<boolean>(true);

  useEffect(() => {
    toastNotificationsRef.current = data?.userPreferences?.toastNotifications ?? true;
  }, [data?.userPreferences?.toastNotifications]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage quota errors
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.density =
      data?.userPreferences?.tableDensity ?? 'comfortable';
  }, [data?.userPreferences?.tableDensity]);

  useEffect(() => {
    if (!user || !data) return;
    if (appliedLandingForUserRef.current === user.id) return;
    appliedLandingForUserRef.current = user.id;
    const preferred = data.userPreferences?.defaultLandingTab;
    if (preferred) {
      setActiveTab(preferred);
    }
  }, [user, data]);

  useEffect(() => {
    if (!showNotifications) return;
    function handleOutsideClick(e: MouseEvent) {
      if (
        notifContainerRef.current &&
        !notifContainerRef.current.contains(e.target as Node)
      ) {
        setShowNotifications(false);
      }
    }
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [showNotifications]);

  function toggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  function toggleSidebarCollapse() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('indspectora_sidebar_collapsed', String(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  }

  const toastTimerRef = useRef<number | null>(null);

  const notify = useCallback((message: string, kind: 'info' | 'error' = 'info') => {
    setToast({ message, kind });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 4200);
  }, []);

  const fetchBootstrap = useCallback(async (activeToken: string) => {
    setLoadingData(true);
    try {
      const res = await fetch('/api/bootstrap', {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (res.status === 401) {
        setToken(null);
        setUser(null);
        return;
      }
      if (!res.ok) return;
      const payload = (await res.json()) as BootstrapPayload;
      setData(payload);
      setLastSyncAt(new Date().toISOString());
    } finally {
      setLoadingData(false);
    }
  }, []);

  // Verify HttpOnly session cookie on startup and hydrate Bearer token into React memory
  useEffect(() => {
    try {
      localStorage.removeItem('indspectora_session_token');
      localStorage.removeItem('opsledger_session_token');
    } catch {
      // Ignore storage access errors
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'include',
        });
        if (!res.ok) {
          if (!cancelled) {
            setToken(null);
            setUser(null);
          }
          return;
        }
        const body = (await res.json()) as { user?: User; token?: string };
        if (!cancelled && body.user && body.token) {
          setToken(body.token);
          setUser(body.user);
          await fetchBootstrap(body.token);
        }
      } catch {
        if (!cancelled) notify('Unable to verify session with local server.', 'error');
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchBootstrap, notify]);

  // Real-time WebSocket connection with automatic reconnect
  useEffect(() => {
    if (!token || !user) return;
    let closedByUser = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    function connect() {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token!)}`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as RealtimeMessage;
          if (msg.type !== 'connected') {
            setLastSyncAt(msg.timestamp || new Date().toISOString());
            fetchBootstrap(token!);
            const isRelevantToUser =
              !msg.targetUserId || msg.targetUserId === user!.id;
            if (msg.summary && isRelevantToUser && toastNotificationsRef.current) {
              notify(msg.summary, 'info');
            }
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!closedByUser) {
          reconnectTimer = window.setTimeout(connect, 2500);
        }
      };

      ws.onerror = () => {
        setWsConnected(false);
      };
    }

    connect();

    return () => {
      closedByUser = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [token, user, fetchBootstrap, notify]);

  function handleAuthenticated(nextToken: string, nextUser: User) {
    appliedLandingForUserRef.current = null;
    setToken(nextToken);
    setUser(nextUser);
    setTourDismissedSession(new Set());
    setForcedTourPage(null);
    setSettingsSection('profile');
    fetchBootstrap(nextToken);
  }

  async function handleLogout() {
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      }).catch(() => {});
    }
    try {
      localStorage.removeItem('indspectora_session_token');
      localStorage.removeItem('opsledger_session_token');
    } catch {
      // Ignore storage access errors
    }
    appliedLandingForUserRef.current = null;
    setToken(null);
    setUser(null);
    setData(null);
    setSelectedReportId(null);
    setShowNotifications(false);
    setForcedTourPage(null);
  }

  async function handleOpenNotification(notif: UserNotification) {
    setShowNotifications(false);
    setSelectedReportId(notif.reportId);
    setActiveTab('inspections');
    if (!notif.isRead && token) {
      try {
        const res = await fetch('/api/notifications/mark-read', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id: notif.id }),
        });
        if (res.ok) {
          const body = (await res.json()) as { bootstrap?: BootstrapPayload };
          if (body.bootstrap) setData(body.bootstrap);
        }
      } catch {
        // Non-blocking
      }
    }
  }

  async function handleMarkAllNotificationsRead() {
    if (!token) return;
    try {
      const res = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) {
        const body = (await res.json()) as { bootstrap?: BootstrapPayload };
        if (body.bootstrap) setData(body.bootstrap);
      }
    } catch {
      notify('Unable to mark notifications read.', 'error');
    }
  }

  async function handleCompleteTour(pageKey: TourPageKey) {
    setForcedTourPage(null);
    setTourDismissedSession((prev) => {
      const next = new Set(prev);
      next.add(pageKey);
      return next;
    });
    if (!token) return;
    try {
      const res = await fetch(`/api/tours/${pageKey}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const body = (await res.json()) as { bootstrap?: BootstrapPayload };
        if (body.bootstrap) setData(body.bootstrap);
      }
    } catch {
      // Non-blocking
    }
  }

  function handleDismissTour(pageKey: TourPageKey) {
    setForcedTourPage(null);
    setTourDismissedSession((prev) => {
      const next = new Set(prev);
      next.add(pageKey);
      return next;
    });
  }

  async function handleResetAllTours() {
    if (!token) return;
    try {
      const res = await fetch('/api/tours', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const body = (await res.json()) as { bootstrap?: BootstrapPayload };
        if (body.bootstrap) setData(body.bootstrap);
        setTourDismissedSession(new Set());
        notify('All page tours reset. Guided walkthroughs will display on your next visit.');
      }
    } catch {
      notify('Failed to reset walkthrough progress.', 'error');
    }
  }

  const needMyActionCount = useMemo(() => {
    if (!user || !data) return 0;
    return data.reports.filter((r) => isReportNeedingUserAction(r, user)).length;
  }, [data, user]);

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] flex items-center justify-center">
        <div className="text-sm text-[#475569] dark:text-[#94A3B8] font-medium">
          Connecting to local IndSpectora server...
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <AuthGate
        onAuthenticated={handleAuthenticated}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  const isAdmin = hasAnyRole(user, 'admin');
  const userRoleLabels = (user.roles && user.roles.length > 0 ? user.roles : [user.role])
    .map(formatRoleLabel)
    .join(' + ');

  const navItems: {
    key: ActiveTab;
    label: string;
    mobileLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { key: 'dashboard', label: 'Operations Dashboard', mobileLabel: 'Dashboard', icon: LayoutDashboard },
    { key: 'inspections', label: 'Inspections & Audits', mobileLabel: 'Inspect', icon: ClipboardCheck },
    { key: 'gantt', label: 'Projects', mobileLabel: 'Projects', icon: GanttChartSquare },
    { key: 'history', label: 'Asset History', mobileLabel: 'History', icon: History },
    { key: 'library', label: 'Asset Library', mobileLabel: 'Library', icon: BookOpenCheck },
    { key: 'settings', label: 'Settings', mobileLabel: 'Settings', icon: Settings },
    { key: 'howto', label: 'How to Use', mobileLabel: 'Guide', icon: BookOpen },
  ];

  const mobilePrimaryTabs: ActiveTab[] = ['dashboard', 'inspections', 'gantt', 'history'];
  const mobileSecondaryActive =
    activeTab === 'library' || activeTab === 'settings' || activeTab === 'howto';

  const workspaceTitle = data?.workspaceDefaults?.organizationName || 'Operations';

  const activeMobileTitle =
    activeTab === 'dashboard'
      ? 'Dashboard'
      : activeTab === 'inspections'
      ? selectedReportId
        ? 'Audit Sheet'
        : 'Inspections'
      : activeTab === 'gantt'
      ? 'Projects'
      : activeTab === 'history'
      ? 'Asset History'
      : activeTab === 'library'
      ? 'Asset Library'
      : activeTab === 'settings'
      ? 'Settings'
      : 'How to Use';

  const activeBreadcrumb =
    activeTab === 'dashboard'
      ? `${workspaceTitle} / Live Dashboard & Need My Action`
      : activeTab === 'library'
      ? `${workspaceTitle} / Asset & Facility Library`
      : activeTab === 'history'
      ? `${workspaceTitle} / Asset Inspection History & Compare`
      : activeTab === 'inspections'
      ? selectedReportId
        ? `${workspaceTitle} / Inspections / Audit Sheet`
        : `${workspaceTitle} / Routine, Yearly & Eventual Inspections`
      : activeTab === 'settings'
      ? 'Workspace / Settings, Preferences & Administration'
      : activeTab === 'howto'
      ? 'Knowledge Base / How to Use & Guided Tours'
      : 'Projects / Active Project & Blockers';

  const activeBlockedCount = (data?.blockers ?? []).filter((b) => !b.isResolved).length;
  const notifications = data?.notifications ?? [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const completedTours = data?.completedTours ?? [];

  const activeTourPage: TourPageKey | null = !data
    ? null
    : forcedTourPage ??
      (!tourDismissedSession.has(activeTab) && !completedTours.includes(activeTab)
        ? activeTab
        : null);

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] text-[#0F172A] dark:text-[#F8FAFC] flex">
      {/* Desktop Sidebar (256px expanded / 64px collapsed icon rail; mobile uses fixed Bottom Nav Bar) */}
      <aside
        className={`no-print hidden lg:flex sticky top-0 h-screen bg-white dark:bg-[#111827] border-r border-[#E2E8F0] dark:border-[#1E293B] flex-col justify-between transition-all duration-200 shrink-0 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div>
          <div
            className={`h-14 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center ${
              sidebarCollapsed ? 'justify-center px-2 gap-1' : 'px-4 justify-between gap-2'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/assets/aistudio/Gemini_Generated_Image_blqe01blqe01blqe_2a407c6c.jpg"
                alt="IndSpectora logo"
                className="w-8 h-8 rounded-lg object-cover border border-[#E2E8F0] dark:border-[#334155] shrink-0"
              />
              {!sidebarCollapsed && (
                <span className="font-display text-lg font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC] whitespace-nowrap truncate">
                  IndSpectora
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={toggleSidebarCollapse}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="inline-flex items-center justify-center p-1.5 text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] rounded-md transition-colors shrink-0"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          </div>

          <nav className={sidebarCollapsed ? 'p-2 space-y-1' : 'p-3 space-y-1'}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  title={item.label}
                  onClick={() => {
                    setActiveTab(item.key);
                    if (item.key !== 'inspections') setSelectedReportId(null);
                  }}
                  className={`relative w-full flex items-center text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                    sidebarCollapsed
                      ? 'justify-center px-0 py-2.5'
                      : 'justify-between px-3 py-2.5'
                  } ${
                    active
                      ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 text-[#1D4ED8] dark:text-[#93C5FD]'
                      : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </span>

                  {item.key === 'inspections' && needMyActionCount > 0 && (
                    <span
                      className={`inline-flex items-center justify-center rounded font-mono tabular-nums font-bold ${
                        sidebarCollapsed
                          ? 'absolute top-1 right-1 px-1 text-[9px] bg-[#DC2626] text-white'
                          : 'px-1.5 py-0.5 text-[10px] bg-[#DC2626] text-white'
                      }`}
                    >
                      {needMyActionCount}
                    </span>
                  )}

                  {item.key === 'gantt' && activeBlockedCount > 0 && (
                    <span
                      className={`font-mono text-[11px] text-[#DC2626] dark:text-[#F87171] tabular-nums ${
                        sidebarCollapsed
                          ? 'absolute top-1 right-1.5 text-[9px] font-bold'
                          : ''
                      }`}
                    >
                      {activeBlockedCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div
          className={`border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-2.5 ${
            sidebarCollapsed ? 'p-2' : 'p-4'
          }`}
        >
          {!sidebarCollapsed && (
            <div className="text-xs">
              <div className="font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                {user.name}
              </div>
              <div className="text-[#64748B] dark:text-[#94A3B8] truncate">
                {user.title || 'Operations Member'}
                <span aria-hidden="true"> · </span>
                <span>{userRoleLabels}</span>
              </div>
            </div>
          )}

          <button
            type="button"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            onClick={toggleTheme}
            className={`w-full inline-flex items-center justify-center gap-2 py-2 text-xs font-medium text-[#475569] dark:text-[#CBD5E1] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-md transition-colors ${
              sidebarCollapsed ? 'px-0' : 'px-3'
            }`}
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 shrink-0 text-[#FBBF24]" />
            ) : (
              <Moon className="w-3.5 h-3.5 shrink-0" />
            )}
            {!sidebarCollapsed && (
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            )}
          </button>

          <button
            type="button"
            title="Sign Out"
            onClick={handleLogout}
            className={`w-full inline-flex items-center justify-center gap-2 py-2 text-xs font-medium text-[#475569] dark:text-[#CBD5E1] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-md transition-colors ${
              sidebarCollapsed ? 'px-0' : 'px-3'
            }`}
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>

          {!sidebarCollapsed && (
            <div className="pt-0.5 text-[10px] tracking-wide text-[#64748B] dark:text-[#94A3B8] opacity-35 hover:opacity-85 transition-opacity duration-200 select-none">
              Created by Aoraki CreaLabs
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Sticky Compact Mobile Bar (52px) + Desktop Top Bar (56px) */}
        <header className="no-print sticky top-0 lg:static z-30 h-[52px] lg:h-14 bg-white/95 lg:bg-white dark:bg-[#111827]/95 lg:dark:bg-[#111827] backdrop-blur-md lg:backdrop-blur-none border-b border-[#E2E8F0] dark:border-[#1E293B] px-3.5 sm:px-6 flex items-center justify-between gap-3 sm:gap-6 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/assets/aistudio/Gemini_Generated_Image_blqe01blqe01blqe_2a407c6c.jpg"
              alt="IndSpectora"
              className="lg:hidden w-7 h-7 rounded-lg object-cover border border-[#E2E8F0] dark:border-[#334155] shrink-0"
            />
            <span className="lg:hidden font-display text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC] truncate">
              {activeMobileTitle}
            </span>
            <span className="hidden lg:inline text-xs font-medium text-[#475569] dark:text-[#94A3B8] truncate">
              {activeBreadcrumb}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-6 text-xs font-medium text-[#475569] dark:text-[#94A3B8] shrink-0">
            {data?.developerState?.mockDataEnabled && isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSettingsSection('developer');
                    setActiveTab('settings');
                  }}
                  className="font-mono text-[11px] font-semibold text-[#D97706] dark:text-[#FBBF24] hover:underline whitespace-nowrap"
                >
                  Mock Data Active
                </button>
                <span aria-hidden="true" className="text-[#CBD5E1] dark:text-[#334155]">|</span>
              </>
            )}
            <span className="whitespace-nowrap">
              {wsConnected ? (
                <span className="text-[#16A34A] dark:text-[#4ADE80]">Real-Time Sync Connected</span>
              ) : (
                <span className="text-[#D97706] dark:text-[#FBBF24]">Reconnecting Sync...</span>
              )}
            </span>
            <span aria-hidden="true" className="text-[#CBD5E1] dark:text-[#334155]">|</span>
            <span className="font-mono text-[#64748B] dark:text-[#94A3B8] whitespace-nowrap tabular-nums">
              {data?.libraryItems.filter((i) => i.isActive).length ?? 0} active assets
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Notification Bell + Dropdown */}
            <div ref={notifContainerRef} className="relative">
              <button
                type="button"
                onClick={() => setShowNotifications((v) => !v)}
                title="Approval & Revision Notifications"
                className="relative min-h-[40px] min-w-[40px] lg:min-h-0 lg:min-w-0 lg:p-1.5 flex items-center justify-center text-[#475569] dark:text-[#CBD5E1] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-lg lg:rounded-md transition-colors"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#DC2626] text-white font-mono text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-[calc(100vw-24px)] max-w-80 sm:w-96 bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded-xl lg:rounded-lg shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 bg-[#F8FAFC] dark:bg-[#0F172A] border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                      Notifications ({notifications.length})
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllNotificationsRead}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1D4ED8] dark:text-[#60A5FA] hover:underline"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Mark all read</span>
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-[#E2E8F0] dark:divide-[#1E293B]">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-xs text-[#64748B] dark:text-[#94A3B8]">
                        No notifications yet. Approval requests and send-back alerts appear here.
                      </div>
                    ) : (
                      notifications.slice(0, 20).map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => handleOpenNotification(n)}
                          className={`w-full text-left px-4 py-3 transition-colors flex items-start gap-2.5 ${
                            n.isRead
                              ? 'hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/60'
                              : 'bg-[#EFF6FF]/60 dark:bg-[#1E3A8A]/20 hover:bg-[#EFF6FF] dark:hover:bg-[#1E3A8A]/35'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                              n.isRead ? 'bg-transparent' : 'bg-[#1D4ED8] dark:bg-[#60A5FA]'
                            }`}
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                                {n.title}
                              </span>
                              <span className="font-mono text-[10px] text-[#1D4ED8] dark:text-[#60A5FA] shrink-0">
                                {n.reportNumber}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#475569] dark:text-[#CBD5E1] leading-snug line-clamp-2">
                              {n.message}
                            </p>
                            <div className="font-mono text-[10px] text-[#64748B] dark:text-[#94A3B8]">
                              {formatDateTime(n.createdAt)}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="hidden lg:inline-flex p-1.5 text-[#475569] dark:text-[#CBD5E1] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-md transition-colors"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-[#FBBF24]" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('inspections');
                setSelectedReportId(null);
              }}
              className="min-h-[40px] lg:min-h-0 inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg lg:rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 lg:hidden" />
              <span className="sm:hidden">Inspect</span>
              <span className="hidden sm:inline">New Inspection</span>
            </button>
          </div>
        </header>

        {/* Workspace Viewport */}
        <main className="flex-1 p-3.5 sm:p-5 lg:p-6 pb-24 lg:pb-6 max-w-[1440px] w-full mx-auto">
          {!data && loadingData ? (
            <div className="space-y-4">
              <div className="h-24 bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg animate-pulse" />
              <div className="h-72 bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg animate-pulse" />
            </div>
          ) : data ? (
            <>
              {activeTab === 'dashboard' && (
                <AdminDashboard
                  libraryItems={data.libraryItems}
                  reports={data.reports}
                  tasks={data.tasks}
                  blockers={data.blockers}
                  activityLogs={data.activityLogs}
                  currentUser={user}
                  lastSyncAt={lastSyncAt}
                  onOpenReport={(reportId) => {
                    setSelectedReportId(reportId);
                    setActiveTab('inspections');
                  }}
                  onNavigateTab={(tab) => {
                    if (tab === 'users') {
                      setSettingsSection('accounts');
                      setActiveTab('settings');
                      return;
                    }
                    setActiveTab(tab);
                  }}
                />
              )}

              {activeTab === 'inspections' && (
                <InspectionWorkspace
                  reports={data.reports}
                  libraryItems={data.libraryItems}
                  facilityAreas={data.facilityAreas ?? []}
                  users={data.users ?? []}
                  selectedReportId={selectedReportId}
                  onSelectReport={setSelectedReportId}
                  currentUser={user}
                  token={token}
                  onSyncComplete={() => fetchBootstrap(token)}
                  onNotify={notify}
                  onNavigateToTask={(projectId, taskId) => {
                    setFocusTask({ projectId, taskId });
                    setActiveTab('gantt');
                  }}
                  workspaceDefaults={data.workspaceDefaults}
                />
              )}

              {activeTab === 'gantt' && (
                <GanttMonitoring
                  projects={data.projects}
                  tasks={data.tasks}
                  blockers={data.blockers}
                  taskHistory={data.taskHistory ?? []}
                  taskComments={data.taskComments ?? []}
                  libraryItems={data.libraryItems}
                  users={data.users ?? []}
                  initialFocusTask={focusTask}
                  onClearInitialFocus={() => setFocusTask(null)}
                  onOpenAssetVisual={(assetId) => {
                    setFocusAssetId(assetId);
                    setActiveTab('library');
                  }}
                  currentUser={user}
                  token={token}
                  onSyncComplete={() => fetchBootstrap(token)}
                  onNotify={notify}
                />
              )}

              {activeTab === 'history' && (
                <AssetHistoryPage
                  libraryItems={data.libraryItems}
                  facilityAreas={data.facilityAreas ?? []}
                  reports={data.reports}
                  initialAssetId={focusHistoryAssetId}
                  onClearInitialAsset={() => setFocusHistoryAssetId(null)}
                  onOpenReport={(reportId) => {
                    setSelectedReportId(reportId);
                    setActiveTab('inspections');
                  }}
                />
              )}

              {activeTab === 'library' && (
                <LibraryManager
                  items={data.libraryItems}
                  facilityAreas={data.facilityAreas ?? []}
                  projects={data.projects}
                  tasks={data.tasks}
                  reports={data.reports}
                  currentUser={user}
                  token={token}
                  onSyncComplete={() => fetchBootstrap(token)}
                  onNotify={notify}
                  onNavigateToTask={(projectId, taskId) => {
                    setFocusTask({ projectId, taskId });
                    setActiveTab('gantt');
                  }}
                  onOpenReport={(reportId) => {
                    setSelectedReportId(reportId);
                    setActiveTab('inspections');
                  }}
                  onOpenAssetHistory={(assetId) => {
                    setFocusHistoryAssetId(assetId);
                    setActiveTab('history');
                  }}
                  initialVisualAssetId={focusAssetId}
                  onClearInitialVisualAsset={() => setFocusAssetId(null)}
                  workspaceDefaults={data.workspaceDefaults}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsPage
                  currentUser={user}
                  users={data.users ?? []}
                  token={token}
                  theme={theme}
                  onToggleTheme={toggleTheme}
                  userPreferences={data.userPreferences}
                  workspaceDefaults={data.workspaceDefaults}
                  developerState={data.developerState}
                  completedTours={completedTours}
                  initialSection={settingsSection}
                  onSectionChange={setSettingsSection}
                  onUpdateUser={setUser}
                  onSyncComplete={() => fetchBootstrap(token)}
                  onNotify={notify}
                  onStartTour={(pageKey) => {
                    if (pageKey === 'users' && !isAdmin) return;
                    setForcedTourPage(pageKey);
                  }}
                  onResetAllTours={handleResetAllTours}
                  onOpenHowTo={() => setActiveTab('howto')}
                />
              )}

              {activeTab === 'howto' && (
                <HowToUsePage
                  currentUser={user}
                  completedTours={completedTours}
                  onStartTour={(pageKey) => {
                    if (pageKey === 'users') {
                      if (!isAdmin) return;
                      setSettingsSection('accounts');
                      setActiveTab('settings');
                      setForcedTourPage('settings');
                      return;
                    }
                    setActiveTab(pageKey);
                    if (pageKey !== 'inspections') setSelectedReportId(null);
                    setForcedTourPage(pageKey);
                  }}
                  onResetAllTours={handleResetAllTours}
                />
              )}
            </>
          ) : (
            <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-10 text-center text-sm text-[#475569] dark:text-[#94A3B8]">
              Unable to load workspace data.{' '}
              <button
                type="button"
                onClick={() => fetchBootstrap(token)}
                className="text-[#1D4ED8] dark:text-[#60A5FA] font-medium hover:underline"
              >
                Retry
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar (< lg, 60px high) */}
      <nav
        aria-label="Mobile Primary Navigation"
        className="no-print lg:hidden fixed bottom-0 left-0 right-0 z-40 h-[60px] bg-white/95 dark:bg-[#111827]/95 backdrop-blur-md border-t border-[#E2E8F0] dark:border-[#1E293B] grid grid-cols-5 items-center px-1"
      >
        {mobilePrimaryTabs.map((key) => {
          const item = navItems.find((n) => n.key === key)!;
          const Icon = item.icon;
          const active = activeTab === item.key && !mobileMoreOpen;
          const badge =
            key === 'inspections' && needMyActionCount > 0
              ? needMyActionCount
              : key === 'gantt' && activeBlockedCount > 0
              ? activeBlockedCount
              : 0;

          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActiveTab(key);
                if (key !== 'inspections') setSelectedReportId(null);
                setMobileMoreOpen(false);
              }}
              className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
                active
                  ? 'text-[#1D4ED8] dark:text-[#60A5FA]'
                  : 'text-[#64748B] dark:text-[#94A3B8]'
              }`}
            >
              <div className="relative">
                <Icon className="w-[20px] h-[20px]" />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-[#DC2626] text-white font-mono text-[9px] font-bold flex items-center justify-center tabular-nums">
                    {badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium tracking-tight leading-none">
                {item.mobileLabel}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMobileMoreOpen((v) => !v)}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
            mobileMoreOpen || mobileSecondaryActive
              ? 'text-[#1D4ED8] dark:text-[#60A5FA]'
              : 'text-[#64748B] dark:text-[#94A3B8]'
          }`}
        >
          <MoreHorizontal className="w-[20px] h-[20px]" />
          <span className="text-[10px] font-medium tracking-tight leading-none">More</span>
        </button>
      </nav>

      {/* Mobile Bottom Sheet for Library, Settings, How to Use, Theme & Account */}
      {mobileMoreOpen && (
        <div
          className="no-print lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end"
          onClick={() => setMobileMoreOpen(false)}
        >
          <div
            className="w-full bg-white dark:bg-[#111827] border-t border-[#E2E8F0] dark:border-[#334155] rounded-t-2xl p-4 pb-6 space-y-4 shadow-2xl max-h-[82vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#CBD5E1] dark:bg-[#475569] rounded-full mx-auto" />

            <div className="flex items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src="/assets/aistudio/Gemini_Generated_Image_blqe01blqe01blqe_2a407c6c.jpg"
                  alt="IndSpectora"
                  className="w-9 h-9 rounded-lg object-cover border border-[#E2E8F0] dark:border-[#334155] shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                    {user.name}
                  </div>
                  <div className="text-xs text-[#64748B] dark:text-[#94A3B8] truncate">
                    {user.title || 'Operations Member'} · {userRoleLabels}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#64748B] dark:text-[#94A3B8] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              {(['library', 'settings', 'howto'] as ActiveTab[]).map((key) => {
                const item = navItems.find((n) => n.key === key)!;
                const Icon = item.icon;
                const active = activeTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setActiveTab(key);
                      setMobileMoreOpen(false);
                    }}
                    className={`w-full min-h-[48px] px-3.5 flex items-center justify-between rounded-xl border text-sm font-medium transition-colors ${
                      active
                        ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 border-[#BFDBFE] dark:border-[#1E40AF] text-[#1D4ED8] dark:text-[#93C5FD]'
                        : 'bg-[#F8FAFC] dark:bg-[#0F172A] border-[#E2E8F0] dark:border-[#334155] text-[#0F172A] dark:text-[#F8FAFC]'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  toggleTheme();
                }}
                className="min-h-[46px] inline-flex items-center justify-center gap-2 px-3 text-xs font-semibold text-[#334155] dark:text-[#CBD5E1] bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-xl"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-4 h-4 text-[#FBBF24]" />
                    <span>Light Mode</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-4 h-4" />
                    <span>Dark Mode</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMoreOpen(false);
                  handleLogout();
                }}
                className="min-h-[46px] inline-flex items-center justify-center gap-2 px-3 text-xs font-semibold text-[#DC2626] dark:text-[#F87171] bg-[#FEF2F2] dark:bg-[#7F1D1D]/25 border border-[#FECACA] dark:border-[#991B1B] rounded-xl"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>

            <div className="text-center text-[10px] tracking-wide text-[#64748B] dark:text-[#94A3B8] opacity-60 pt-1">
              Created by Aoraki CreaLabs
            </div>
          </div>
        </div>
      )}

      {/* First-Time / Replay Guided Tour Overlay */}
      {activeTourPage && (
        <PageTourOverlay
          pageKey={activeTourPage}
          onComplete={handleCompleteTour}
          onDismiss={() => handleDismissTour(activeTourPage)}
        />
      )}

      {/* Live Notification Toast */}
      {toast && (
        <div className="no-print fixed bottom-20 lg:bottom-5 left-3 right-3 sm:left-auto sm:right-5 z-50 sm:max-w-sm bg-[#0F172A] dark:bg-[#1E293B] text-white px-4 py-3 rounded-xl lg:rounded-md shadow-lg border border-[#334155] flex items-start justify-between gap-3">
          <div className="text-xs leading-relaxed">
            <span
              className={`font-semibold mr-1.5 ${
                toast.kind === 'error' ? 'text-[#FCA5A5]' : 'text-[#93C5FD]'
              }`}
            >
              {toast.kind === 'error' ? 'Error:' : 'Synced:'}
            </span>
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-[#94A3B8] hover:text-white shrink-0 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
