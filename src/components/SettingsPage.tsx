/**
 * IndSpectora — Unified Settings, Preferences, Account Management & Developer Mock Engine
 * @author Aoraki CreaLabs
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  Code2,
  Compass,
  Database,
  Download,
  ExternalLink,
  HardDrive,
  KeyRound,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Shield,
  Sliders,
  Sun,
  Trash2,
  User as UserIcon,
  Users,
} from 'lucide-react';
import type {
  CriticalityLevel,
  CycleType,
  DeveloperSettingsState,
  LandingTabPreference,
  SessionInfo,
  TableDensity,
  TourPageKey,
  User,
  UserPreferences,
  WorkspaceDefaults,
} from '../types.ts';
import { formatRoleLabel, hasAnyRole } from '../types.ts';
import { formatAuditTimestamp, formatDateTime } from '../utils/export.ts';
import { parseApiResponse } from '../utils/imageUpload.ts';
import {
  downloadPortableWindowsExe,
  type PortableDownloadProgress,
} from '../utils/portableDownload.ts';
import { UserManagement } from './UserManagement.tsx';

export type SettingsSection = 'profile' | 'preferences' | 'accounts' | 'workspace' | 'developer';

interface SettingsPageProps {
  currentUser: User;
  users: User[];
  token: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  userPreferences: UserPreferences;
  workspaceDefaults: WorkspaceDefaults;
  developerState: DeveloperSettingsState;
  completedTours: TourPageKey[];
  initialSection?: SettingsSection;
  onSectionChange?: (section: SettingsSection) => void;
  onUpdateUser: (user: User) => void;
  onSyncComplete: () => Promise<void>;
  onNotify: (message: string, kind?: 'info' | 'error') => void;
  onStartTour: (pageKey: TourPageKey) => void;
  onResetAllTours: () => Promise<void>;
  onOpenHowTo: () => void;
}

export function SettingsPage({
  currentUser,
  users,
  token,
  theme,
  onToggleTheme,
  userPreferences,
  workspaceDefaults,
  developerState,
  completedTours,
  initialSection = 'profile',
  onSectionChange,
  onUpdateUser,
  onSyncComplete,
  onNotify,
  onStartTour,
  onResetAllTours,
  onOpenHowTo,
}: SettingsPageProps) {
  const isAdmin = hasAnyRole(currentUser, 'admin');
  const [section, setSection] = useState<SettingsSection>(initialSection);

  useEffect(() => {
    if (
      !isAdmin &&
      (initialSection === 'accounts' ||
        initialSection === 'workspace' ||
        initialSection === 'developer')
    ) {
      setSection('profile');
      return;
    }
    setSection(initialSection);
  }, [initialSection, isAdmin]);

  function selectSection(next: SettingsSection) {
    setSection(next);
    onSectionChange?.(next);
  }

  // --- Profile & Password & Sessions State ---
  const [profileName, setProfileName] = useState(currentUser.name);
  const [profileTitle, setProfileTitle] = useState(currentUser.title || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [revokingSessions, setRevokingSessions] = useState(false);

  useEffect(() => {
    setProfileName(currentUser.name);
    setProfileTitle(currentUser.title || '');
  }, [currentUser.name, currentUser.title]);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch('/api/account/sessions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const parsed = await parseApiResponse<{ sessions?: SessionInfo[]; error?: string }>(res);
      if (parsed.ok && parsed.data?.sessions) {
        setSessions(parsed.data.sessions);
      }
    } catch {
      // Non-blocking
    } finally {
      setLoadingSessions(false);
    }
  }, [token]);

  useEffect(() => {
    if (section === 'profile') {
      loadSessions();
    }
  }, [section, loadSessions]);

  // --- Preferences State ---
  const [prefsDraft, setPrefsDraft] = useState<UserPreferences>(userPreferences);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [resettingTours, setResettingTours] = useState(false);

  useEffect(() => {
    setPrefsDraft(userPreferences);
  }, [userPreferences]);

  // --- Workspace Defaults & Backup State ---
  const [wsDraft, setWsDraft] = useState<WorkspaceDefaults>(workspaceDefaults);
  const [savingWs, setSavingWs] = useState(false);
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [downloadingExe, setDownloadingExe] = useState(false);
  const [exeProgress, setExeProgress] = useState<PortableDownloadProgress | null>(null);
  const [exeError, setExeError] = useState<string | null>(null);

  useEffect(() => {
    setWsDraft(workspaceDefaults);
  }, [workspaceDefaults]);

  // --- Developer Mode & Mock Data State ---
  const [togglingDevMode, setTogglingDevMode] = useState(false);
  const [togglingLoginTemplates, setTogglingLoginTemplates] = useState(false);
  const [togglingMockData, setTogglingMockData] = useState(false);
  const [resettingMockData, setResettingMockData] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'disable_mock' | 'reset_mock' | null>(null);

  // --- Handlers: Profile & Security ---
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profileName.trim()) {
      onNotify('Full name cannot be empty.', 'error');
      return;
    }
    setSavingProfile(true);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: profileName, title: profileTitle }),
      });
      const parsed = await parseApiResponse<{ user?: User; error?: string }>(res);
      if (!parsed.ok || !parsed.data?.user) {
        onNotify(parsed.errorMessage ?? 'Failed to update profile.', 'error');
        return;
      }
      onUpdateUser(parsed.data.user);
      await onSyncComplete();
      onNotify('Personal profile updated.');
    } catch {
      onNotify('Network error updating profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      onNotify('New password must be at least 6 characters long.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      onNotify('New password and confirmation do not match.', 'error');
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const parsed = await parseApiResponse<{ sessions?: SessionInfo[]; error?: string }>(res);
      if (!parsed.ok) {
        onNotify(parsed.errorMessage ?? 'Unable to change password.', 'error');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (parsed.data?.sessions) setSessions(parsed.data.sessions);
      onNotify('Password updated. Other active sessions were signed out.');
    } catch {
      onNotify('Network error changing password.', 'error');
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleRevokeSession(sessionId: string) {
    setRevokingSessions(true);
    try {
      const res = await fetch(`/api/account/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const parsed = await parseApiResponse<{ sessions?: SessionInfo[]; error?: string }>(res);
      if (!parsed.ok) {
        onNotify(parsed.errorMessage ?? 'Could not revoke session.', 'error');
        return;
      }
      if (parsed.data?.sessions) setSessions(parsed.data.sessions);
      onNotify('Revoked remote login session.');
    } catch {
      onNotify('Network error revoking session.', 'error');
    } finally {
      setRevokingSessions(false);
    }
  }

  async function handleRevokeOtherSessions() {
    setRevokingSessions(true);
    try {
      const res = await fetch('/api/account/sessions', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const parsed = await parseApiResponse<{ sessions?: SessionInfo[]; error?: string }>(res);
      if (!parsed.ok) {
        onNotify(parsed.errorMessage ?? 'Could not revoke other sessions.', 'error');
        return;
      }
      if (parsed.data?.sessions) setSessions(parsed.data.sessions);
      onNotify('Signed out all other active sessions.');
    } catch {
      onNotify('Network error revoking sessions.', 'error');
    } finally {
      setRevokingSessions(false);
    }
  }

  // --- Handlers: Preferences ---
  async function savePreferencesPatch(patch: Partial<UserPreferences>, toastMsg?: string) {
    const nextState = { ...prefsDraft, ...patch };
    setPrefsDraft(nextState);
    if (patch.tableDensity) {
      document.documentElement.dataset.density = patch.tableDensity;
    }
    setSavingPrefs(true);
    try {
      const res = await fetch('/api/account/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });
      const parsed = await parseApiResponse<{ error?: string }>(res);
      if (!parsed.ok) {
        onNotify(parsed.errorMessage ?? 'Failed to save preferences.', 'error');
        return;
      }
      await onSyncComplete();
      if (toastMsg) onNotify(toastMsg);
    } catch {
      onNotify('Network error saving preferences.', 'error');
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleResetToursClick() {
    setResettingTours(true);
    try {
      await onResetAllTours();
    } finally {
      setResettingTours(false);
    }
  }

  // --- Handlers: Workspace Defaults & Backup ---
  async function handleSaveWorkspaceDefaults(e: React.FormEvent) {
    e.preventDefault();
    if (!wsDraft.organizationName.trim()) {
      onNotify('Workspace name cannot be empty.', 'error');
      return;
    }
    setSavingWs(true);
    try {
      const res = await fetch('/api/admin/workspace-defaults', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(wsDraft),
      });
      const parsed = await parseApiResponse<{ error?: string }>(res);
      if (!parsed.ok) {
        onNotify(parsed.errorMessage ?? 'Failed to update workspace defaults.', 'error');
        return;
      }
      await onSyncComplete();
      onNotify('Workspace defaults updated across IndSpectora.');
    } catch {
      onNotify('Network error saving workspace defaults.', 'error');
    } finally {
      setSavingWs(false);
    }
  }

  async function handleDownloadBackup() {
    setDownloadingBackup(true);
    try {
      const res = await fetch('/api/admin/backup', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        onNotify('Failed to generate JSON backup.', 'error');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `indspectora-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onNotify('Downloaded sanitized SQLite JSON backup.');
    } catch {
      onNotify('Network error downloading backup.', 'error');
    } finally {
      setDownloadingBackup(false);
    }
  }

  async function handleDownloadPortableExe() {
    setExeError(null);
    setExeProgress(null);
    setDownloadingExe(true);
    const result = await downloadPortableWindowsExe((prog) => setExeProgress(prog), token);
    setDownloadingExe(false);
    setExeProgress(null);
    if (result.ok) {
      onNotify('Downloaded IndSpectora-Portable.exe for Windows 10/11 (no Admin required).');
    } else {
      const msg = result.error || 'Could not download portable Windows executable.';
      setExeError(msg);
      onNotify(msg, 'error');
    }
  }

  // --- Handlers: Developer Mode & Mock Data ---
  async function handleToggleDeveloperMode(enabled: boolean) {
    setTogglingDevMode(true);
    try {
      const res = await fetch('/api/admin/developer-mode', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled }),
      });
      const parsed = await parseApiResponse<{ error?: string }>(res);
      if (!parsed.ok) {
        onNotify(parsed.errorMessage ?? 'Failed to update Developer Mode.', 'error');
        return;
      }
      await onSyncComplete();
      onNotify(enabled ? 'Developer Mode enabled.' : 'Developer Mode disabled.');
    } catch {
      onNotify('Network error toggling Developer Mode.', 'error');
    } finally {
      setTogglingDevMode(false);
    }
  }

  async function handleToggleLoginTemplates(enabled: boolean) {
    setTogglingLoginTemplates(true);
    try {
      const res = await fetch('/api/admin/developer-mode/login-templates', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled }),
      });
      const parsed = await parseApiResponse<{ error?: string }>(res);
      if (!parsed.ok) {
        onNotify(parsed.errorMessage ?? 'Failed to update login quick-demo setting.', 'error');
        return;
      }
      await onSyncComplete();
      onNotify(
        enabled
          ? 'Login-page non-admin quick-demo accounts are now visible while Developer Mode is ON.'
          : 'Login-page quick-demo accounts hidden and sandbox sessions terminated.'
      );
    } catch {
      onNotify('Network error updating login quick-demo setting.', 'error');
    } finally {
      setTogglingLoginTemplates(false);
    }
  }

  async function handleToggleMockData(enabled: boolean) {
    setTogglingMockData(true);
    setConfirmAction(null);
    try {
      const res = await fetch('/api/admin/mock-data/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled }),
      });
      const parsed = await parseApiResponse<{ error?: string }>(res);
      if (!parsed.ok) {
        onNotify(parsed.errorMessage ?? 'Failed to toggle Mock Data.', 'error');
        return;
      }
      await onSyncComplete();
      onNotify(
        enabled
          ? 'Mock Data Pack ON: sample zones, assets, schematics, projects, and reports loaded.'
          : 'Mock Data Pack OFF: sample and edited mock items purged. Manual items preserved.'
      );
    } catch {
      onNotify('Network error toggling Mock Data.', 'error');
    } finally {
      setTogglingMockData(false);
    }
  }

  async function handleResetMockData() {
    setResettingMockData(true);
    setConfirmAction(null);
    try {
      const res = await fetch('/api/admin/mock-data/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const parsed = await parseApiResponse<{ error?: string }>(res);
      if (!parsed.ok) {
        onNotify(parsed.errorMessage ?? 'Failed to reset Mock Data.', 'error');
        return;
      }
      await onSyncComplete();
      onNotify('Modified mock items reset to canonical sample state. Manual items kept untouched.');
    } catch {
      onNotify('Network error resetting Mock Data.', 'error');
    } finally {
      setResettingMockData(false);
    }
  }

  const navSections: {
    key: SettingsSection;
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
    adminOnly?: boolean;
  }[] = [
    {
      key: 'profile',
      label: 'Profile & Security',
      subtitle: 'Account info, password & sessions',
      icon: UserIcon,
    },
    {
      key: 'preferences',
      label: 'Appearance & Preferences',
      subtitle: 'Theme, density, alerts & tours',
      icon: Sliders,
    },
    ...(isAdmin
      ? [
          {
            key: 'accounts' as const,
            label: 'Account Management',
            subtitle: 'Users, multi-roles & resets',
            icon: Users,
            adminOnly: true,
          },
          {
            key: 'workspace' as const,
            label: 'Workspace & Backup',
            subtitle: 'Defaults & JSON snapshot',
            icon: Database,
            adminOnly: true,
          },
          {
            key: 'developer' as const,
            label: 'Developer Mode',
            subtitle: 'Mock data toggle & reset',
            icon: Code2,
            adminOnly: true,
          },
        ]
      : []),
  ];

  const datasetRows = [
    {
      label: 'Facility Zones',
      manual: developerState.counts.manualZones,
      mock: developerState.counts.mockZones,
    },
    {
      label: 'Assets & Schematics',
      manual: developerState.counts.manualAssets,
      mock: developerState.counts.mockAssets,
    },
    {
      label: 'Projects',
      manual: developerState.counts.manualProjects,
      mock: developerState.counts.mockProjects,
    },
    {
      label: 'WBS Tasks',
      manual: developerState.counts.manualTasks,
      mock: developerState.counts.mockTasks,
    },
    {
      label: 'Inspection Reports',
      manual: developerState.counts.manualReports,
      mock: developerState.counts.mockReports,
    },
    {
      label: 'User Accounts',
      manual: developerState.counts.manualUsers,
      mock: developerState.counts.mockUsers,
    },
  ];

  const userRolesList =
    currentUser.roles && currentUser.roles.length > 0 ? currentUser.roles : [currentUser.role];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#1D4ED8] dark:text-[#60A5FA] mb-1">
            Workspace Configuration &amp; Account Center
          </div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A] dark:text-[#F8FAFC] tracking-tight">
            Settings
          </h1>
          <p className="text-sm text-[#475569] dark:text-[#94A3B8] mt-1">
            Manage personal security, display preferences, guided tours
            {isAdmin ? ', user accounts, workspace defaults, and Developer Mock Data' : ''}.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onStartTour('settings')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <Compass className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-[#60A5FA]" />
          <span>Tour Settings</span>
        </button>
      </div>

      {/* Main Layout: Left Rail + Active Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <aside className="lg:col-span-3 bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-1.5 lg:p-2 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
          {navSections.map((item) => {
            const Icon = item.icon;
            const active = section === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => selectSection(item.key)}
                className={`lg:w-full text-left px-3 py-2 lg:py-2.5 rounded-md transition-colors flex items-center lg:items-start gap-2 shrink-0 lg:shrink min-h-[40px] ${
                  active
                    ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 text-[#1D4ED8] dark:text-[#93C5FD]'
                    : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/60'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0 lg:mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold whitespace-nowrap lg:truncate">
                      {item.label}
                    </span>
                    {item.key === 'developer' && developerState.mockDataEnabled && (
                      <span className="font-mono text-[10px] font-semibold text-[#D97706] dark:text-[#FBBF24] shrink-0">
                        MOCK ON
                      </span>
                    )}
                  </div>
                  <div className="hidden lg:block text-[11px] opacity-80 truncate">
                    {item.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </aside>

        <div className="lg:col-span-9 space-y-5 min-w-0">
          {/* 1. PROFILE & SECURITY */}
          {section === 'profile' && (
            <>
              <form
                onSubmit={handleSaveProfile}
                className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                      My Profile
                    </h2>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                      Your display name and job title appear on inspection Digital Footprints and WBS tasks.
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-[#475569] dark:text-[#94A3B8]">
                    {userRolesList.map(formatRoleLabel).join(' · ')}
                  </span>
                </div>

                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        required
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                        Job Title / Plant Role
                      </label>
                      <input
                        type="text"
                        value={profileTitle}
                        onChange={(e) => setProfileTitle(e.target.value)}
                        placeholder="e.g. Reliability Engineer"
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                        Login Email
                      </label>
                      <input
                        type="email"
                        readOnly
                        value={currentUser.email}
                        className="w-full px-3 py-2 text-sm font-mono bg-[#F8FAFC] dark:bg-[#0F172A]/70 text-[#64748B] dark:text-[#94A3B8] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                        Account Created
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={formatAuditTimestamp(currentUser.createdAt)}
                        className="w-full px-3 py-2 text-sm font-mono bg-[#F8FAFC] dark:bg-[#0F172A]/70 text-[#64748B] dark:text-[#94A3B8] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>

                <div className="px-6 py-3.5 bg-[#F8FAFC] dark:bg-[#0F172A] border-t border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{savingProfile ? 'Saving...' : 'Save Profile'}</span>
                  </button>
                </div>
              </form>

              <form
                onSubmit={handleChangePassword}
                className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center gap-2.5">
                  <KeyRound className="w-4 h-4 text-[#1D4ED8] dark:text-[#60A5FA]" />
                  <div>
                    <h2 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                      Change Password
                    </h2>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                      Updating your password automatically signs out any other active devices.
                    </p>
                  </div>
                </div>

                <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                      Current Password
                    </label>
                    <input
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                      New Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                    />
                  </div>
                </div>

                <div className="px-6 py-3.5 bg-[#F8FAFC] dark:bg-[#0F172A] border-t border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>{savingPassword ? 'Updating...' : 'Update Password'}</span>
                  </button>
                </div>
              </form>

              <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Monitor className="w-4 h-4 text-[#1D4ED8] dark:text-[#60A5FA]" />
                    <div>
                      <h2 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                        Active Sessions ({sessions.length})
                      </h2>
                      <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                        Browser tokens currently authenticated for your account.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={loadSessions}
                      disabled={loadingSessions}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] rounded-md whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingSessions ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>
                    {sessions.some((s) => !s.isCurrent) && (
                      <button
                        type="button"
                        disabled={revokingSessions}
                        onClick={handleRevokeOtherSessions}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#DC2626] dark:text-[#F87171] bg-[#FEF2F2] dark:bg-[#7F1D1D]/25 border border-[#FECACA] dark:border-[#991B1B] hover:bg-[#FEE2E2] dark:hover:bg-[#7F1D1D]/40 rounded-md whitespace-nowrap shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Revoke Other Sessions</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Mobile Sessions Cards */}
                <div className="md:hidden divide-y divide-[#E2E8F0] dark:divide-[#1E293B]">
                  {sessions.length === 0 ? (
                    <div className="py-6 px-4 text-center text-xs text-[#64748B] dark:text-[#94A3B8]">
                      {loadingSessions ? 'Loading active sessions...' : 'No active sessions found.'}
                    </div>
                  ) : (
                    sessions.map((s) => (
                      <div key={s.sessionId} className="p-3.5 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                            ses_{s.sessionId}
                          </span>
                          {s.isCurrent ? (
                            <span className="font-mono font-semibold text-[#16A34A] dark:text-[#4ADE80]">
                              Current Device
                            </span>
                          ) : (
                            <span className="text-[#64748B] dark:text-[#94A3B8]">Active</span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-[#475569] dark:text-[#94A3B8] tabular-nums">
                          In: {formatDateTime(s.createdAt)} · Exp: {formatDateTime(s.expiresAt)}
                        </div>
                        {!s.isCurrent && (
                          <div className="pt-1">
                            <button
                              type="button"
                              disabled={revokingSessions}
                              onClick={() => handleRevokeSession(s.sessionId)}
                              className="px-3 py-1.5 min-h-[36px] text-xs font-medium text-[#DC2626] dark:text-[#F87171] bg-[#FEF2F2] dark:bg-[#7F1D1D]/25 border border-[#FECACA] dark:border-[#991B1B] rounded"
                            >
                              Revoke Session
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#F8FAFC] dark:bg-[#0F172A] border-b border-[#E2E8F0] dark:border-[#1E293B] text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                        <th className="py-2.5 px-4">Session ID</th>
                        <th className="py-2.5 px-4">Signed In</th>
                        <th className="py-2.5 px-4">Expires</th>
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B] text-xs">
                      {sessions.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-6 px-4 text-center text-[#64748B] dark:text-[#94A3B8]"
                          >
                            {loadingSessions ? 'Loading active sessions...' : 'No active sessions found.'}
                          </td>
                        </tr>
                      ) : (
                        sessions.map((s) => (
                          <tr key={s.sessionId} className="hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/40">
                            <td className="py-2.5 px-4 font-mono text-[#0F172A] dark:text-[#F8FAFC]">
                              ses_{s.sessionId}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-[#475569] dark:text-[#94A3B8] tabular-nums">
                              {formatDateTime(s.createdAt)}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-[#475569] dark:text-[#94A3B8] tabular-nums">
                              {formatDateTime(s.expiresAt)}
                            </td>
                            <td className="py-2.5 px-4">
                              {s.isCurrent ? (
                                <span className="font-mono font-semibold text-[#16A34A] dark:text-[#4ADE80]">
                                  Current Device
                                </span>
                              ) : (
                                <span className="text-[#64748B] dark:text-[#94A3B8]">Active</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              {s.isCurrent ? (
                                <span className="text-[11px] text-[#94A3B8]">Active</span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={revokingSessions}
                                  onClick={() => handleRevokeSession(s.sessionId)}
                                  className="px-2.5 py-1 text-[11px] font-medium text-[#DC2626] dark:text-[#F87171] hover:bg-[#FEF2F2] dark:hover:bg-[#7F1D1D]/30 rounded transition-colors"
                                >
                                  Revoke
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* 2. APPEARANCE & PREFERENCES */}
          {section === 'preferences' && (
            <>
              <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B]">
                  <h2 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                    Display, Density &amp; Navigation
                  </h2>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                    Tailor interface theme, table row spacing, landing screen, and live alerts.
                  </p>
                </div>

                <div className="p-6 space-y-6">
                  {/* Theme Row */}
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#E2E8F0] dark:border-[#1E293B]">
                    <div>
                      <div className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                        Color Theme
                      </div>
                      <div className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                        Switch between Light Mode (high-clarity daytime plant view) and Dark Mode.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onToggleTheme}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md transition-colors whitespace-nowrap shrink-0"
                    >
                      {theme === 'dark' ? (
                        <Sun className="w-4 h-4 text-[#FBBF24]" />
                      ) : (
                        <Moon className="w-4 h-4 text-[#1D4ED8]" />
                      )}
                      <span>{theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
                    </button>
                  </div>

                  {/* Table Density */}
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#E2E8F0] dark:border-[#1E293B]">
                    <div>
                      <div className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                        Table Row Density
                      </div>
                      <div className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                        Choose standard Comfortable spacing or Compact high-density rows across all tables.
                      </div>
                    </div>
                    <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-md">
                      {(['comfortable', 'compact'] as TableDensity[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          disabled={savingPrefs}
                          onClick={() =>
                            savePreferencesPatch(
                              { tableDensity: mode },
                              `Table density set to ${mode}.`
                            )
                          }
                          className={`px-3 py-1.5 text-xs font-medium capitalize rounded transition-colors whitespace-nowrap shrink-0 ${
                            prefsDraft.tableDensity === mode
                              ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                              : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Default Landing Page */}
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#E2E8F0] dark:border-[#1E293B]">
                    <div>
                      <div className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                        Default Landing Workspace
                      </div>
                      <div className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                        Which module opens first after you sign in.
                      </div>
                    </div>
                    <select
                      value={prefsDraft.defaultLandingTab}
                      disabled={savingPrefs}
                      onChange={(e) =>
                        savePreferencesPatch(
                          { defaultLandingTab: e.target.value as LandingTabPreference },
                          'Default landing workspace updated.'
                        )
                      }
                      className="px-3 py-2 text-xs font-medium bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                    >
                      <option value="dashboard">Operations Dashboard</option>
                      <option value="inspections">Inspections &amp; Audits</option>
                      <option value="library">Asset Library</option>
                      <option value="gantt">Projects &amp; WBS</option>
                    </select>
                  </div>

                  {/* Notification Switches */}
                  <div className="space-y-3">
                    <label className="flex items-start justify-between gap-4 p-3.5 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md cursor-pointer">
                      <div>
                        <div className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                          Real-Time Sync Toast Popups
                        </div>
                        <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                          Show live background WebSocket sync toast banners in the bottom-right corner (errors still display always).
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={prefsDraft.toastNotifications}
                        onChange={(e) =>
                          savePreferencesPatch(
                            { toastNotifications: e.target.checked },
                            e.target.checked ? 'Sync toasts enabled.' : 'Sync toasts muted.'
                          )
                        }
                        className="mt-1 h-4 w-4 rounded border-[#CBD5E1] text-[#1D4ED8]"
                      />
                    </label>

                    <label className="flex items-start justify-between gap-4 p-3.5 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md cursor-pointer">
                      <div>
                        <div className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                          Approval &amp; Revision Queue Alerts
                        </div>
                        <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                          Highlight pending approvals and sent-back revisions inside the top-bar notification center.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={prefsDraft.approvalAlerts}
                        onChange={(e) =>
                          savePreferencesPatch(
                            { approvalAlerts: e.target.checked },
                            'Notification alert preference saved.'
                          )
                        }
                        className="mt-1 h-4 w-4 rounded border-[#CBD5E1] text-[#1D4ED8]"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Guided Onboarding Tours Card */}
              <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                    Guided Walkthroughs &amp; Onboarding Tours
                  </h2>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1">
                    You have completed{' '}
                    <span className="font-mono font-semibold tabular-nums text-[#0F172A] dark:text-[#F8FAFC]">
                      {completedTours.length}
                    </span>{' '}
                    page tour{completedTours.length === 1 ? '' : 's'}. Reset tours to replay first-time guidance on every workspace.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={onOpenHowTo}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] bg-white dark:bg-[#0F172A] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md whitespace-nowrap shrink-0"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Open How to Use</span>
                  </button>
                  <button
                    type="button"
                    disabled={resettingTours}
                    onClick={handleResetToursClick}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{resettingTours ? 'Resetting...' : 'Reset All Guided Tours'}</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* 3. ACCOUNT MANAGEMENT (ADMIN ONLY) */}
          {section === 'accounts' && isAdmin && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                    Account &amp; Role Management
                  </h2>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                    Create operator/approver accounts, assign composable multi-roles, and reset local passwords.
                  </p>
                </div>
                <span className="font-mono text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                  {users.length} registered accounts
                </span>
              </div>

              <UserManagement
                users={users}
                currentUser={currentUser}
                token={token}
                onSyncComplete={onSyncComplete}
                onNotify={onNotify}
              />
            </div>
          )}

          {/* 4. WORKSPACE DEFAULTS & JSON BACKUP (ADMIN ONLY) */}
          {section === 'workspace' && isAdmin && (
            <>
              <form
                onSubmit={handleSaveWorkspaceDefaults}
                className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B]">
                  <h2 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                    Workspace &amp; Operational Defaults
                  </h2>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                    Default values pre-selected when creating new Assets and starting Inspection Reports.
                  </p>
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                      Plant / Workspace Display Name
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={wsDraft.organizationName}
                      onChange={(e) =>
                        setWsDraft({ ...wsDraft, organizationName: e.target.value })
                      }
                      placeholder="IndSpectora Operations"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                        Default Inspection Cycle
                      </label>
                      <select
                        value={wsDraft.defaultCycleType}
                        onChange={(e) =>
                          setWsDraft({
                            ...wsDraft,
                            defaultCycleType: e.target.value as CycleType,
                          })
                        }
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                      >
                        <option value="routine">Routine Inspection</option>
                        <option value="yearly">Yearly Maintenance</option>
                        <option value="eventual">Eventual Inspection</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                        Default New Asset Criticality
                      </label>
                      <select
                        value={wsDraft.defaultCriticality}
                        onChange={(e) =>
                          setWsDraft({
                            ...wsDraft,
                            defaultCriticality: e.target.value as CriticalityLevel,
                          })
                        }
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>

                  <label className="flex items-start justify-between gap-4 p-3.5 bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md cursor-pointer">
                    <div>
                      <div className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                        Require Photo Evidence by Default on New Assets
                      </div>
                      <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                        Pre-checks the Require Photo option whenever an asset is added in Asset Library.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={wsDraft.defaultRequirePhoto}
                      onChange={(e) =>
                        setWsDraft({ ...wsDraft, defaultRequirePhoto: e.target.checked })
                      }
                      className="mt-1 h-4 w-4 rounded border-[#CBD5E1] text-[#1D4ED8]"
                    />
                  </label>
                </div>

                <div className="px-6 py-3.5 bg-[#F8FAFC] dark:bg-[#0F172A] border-t border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={savingWs}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{savingWs ? 'Saving...' : 'Save Workspace Defaults'}</span>
                  </button>
                </div>
              </form>

              <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-6 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 max-w-xl">
                  <h2 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                    Sanitized SQLite JSON Backup
                  </h2>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                    Export all Facility Zones, Assets, Custom Parameters, Pins, Projects, WBS Tasks, Blockers, Reports, and Activity Logs into a portable JSON archive. Password hashes and login session tokens are strictly omitted.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={downloadingBackup}
                  onClick={handleDownloadBackup}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{downloadingBackup ? 'Exporting...' : 'Download JSON Backup'}</span>
                </button>
              </div>

              <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-[#1D4ED8] dark:text-[#60A5FA]" />
                      <h2 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                        Windows Portable Executable (.exe · No Admin Required)
                      </h2>
                    </div>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                      Download a single standalone <span className="font-mono">IndSpectora-Portable.exe</span> for Windows 10/11 (x64). Includes bundled React UI, Express + WebSocket server, and SQLite persistence—runs directly from any user folder with zero Node.js, NPM, Docker Desktop, or Administrator installation.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={downloadingExe}
                    onClick={handleDownloadPortableExe}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {downloadingExe
                        ? exeProgress
                          ? `Downloading ${exeProgress.percent}% (${exeProgress.loadedMB}/${exeProgress.totalMB} MB)`
                          : 'Preparing .exe...'
                        : 'Download IndSpectora-Portable.exe'}
                    </span>
                  </button>
                </div>

                {exeError && (
                  <div className="px-3.5 py-3 bg-[#FEF2F2] dark:bg-[#7F1D1D]/30 border border-[#FECACA] dark:border-[#B91C1C] text-[#B91C1C] dark:text-[#FCA5A5] text-xs rounded-md space-y-2">
                    <div>{exeError}</div>
                    <a
                      href={typeof window !== 'undefined' ? window.location.origin : '/'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-[#111827] text-[#1D4ED8] dark:text-[#60A5FA] border border-[#BFDBFE] dark:border-[#1E40AF] rounded-md hover:bg-[#EFF6FF] dark:hover:bg-[#1E3A8A]/40 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open App in New Tab</span>
                    </a>
                  </div>
                )}
              </div>
            </>
          )}

          {/* 5. DEVELOPER MODE & MOCK DATA ENGINE (ADMIN ONLY) */}
          {section === 'developer' && isAdmin && (
            <>
              <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Code2 className="w-5 h-5 text-[#1D4ED8] dark:text-[#60A5FA] shrink-0 mt-0.5" />
                    <div>
                      <h2 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                        Developer Mode
                      </h2>
                      <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                        Unlock sandbox mock-data controls for testing workflows, visual pin diagrams, and approvals without affecting real manual data.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={developerState.developerMode}
                    disabled={togglingDevMode}
                    onClick={() => handleToggleDeveloperMode(!developerState.developerMode)}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                      developerState.developerMode
                        ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                        : 'bg-[#F8FAFC] dark:bg-[#0F172A] text-[#334155] dark:text-[#CBD5E1] border-[#CBD5E1] dark:border-[#334155]'
                    }`}
                  >
                    <span>
                      {togglingDevMode
                        ? 'Updating...'
                        : developerState.developerMode
                        ? 'Developer Mode: ON'
                        : 'Developer Mode: OFF'}
                    </span>
                  </button>
                </div>

                <div className="p-6 space-y-5">
                  <div className="p-4 rounded-md bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                      <div className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                        Mock Operations Dataset Pack
                      </div>
                      <p className="text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                        Loads realistic sample Facility Zones, Assets with SVG schematics &amp; pins, WBS Projects, Tasks, Reports, and Sample Users.{' '}
                        <strong className="text-[#0F172A] dark:text-[#F8FAFC]">
                          When toggled OFF, all mock items—including any edits made to mock items—disappear immediately and reset on next ON.
                        </strong>{' '}
                        Manually created items are never touched.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      {!developerState.mockDataEnabled ? (
                        <button
                          type="button"
                          disabled={!developerState.developerMode || togglingMockData}
                          onClick={() => handleToggleMockData(true)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-45 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          <span>{togglingMockData ? 'Loading Mock Data...' : 'Turn Mock Data ON'}</span>
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={resettingMockData || togglingMockData}
                            onClick={() => setConfirmAction('reset_mock')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] bg-white dark:bg-[#111827] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md transition-colors whitespace-nowrap shrink-0"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Reset Modified Mock Data</span>
                          </button>

                          <button
                            type="button"
                            disabled={togglingMockData || resettingMockData}
                            onClick={() => setConfirmAction('disable_mock')}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#D97706] hover:bg-[#B45309] rounded-md transition-colors whitespace-nowrap shrink-0"
                          >
                            <span>Turn Mock Data OFF</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded-md bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                      <div className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                        Login Page Non-Admin Quick-Login
                      </div>
                      <p className="text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                        Shows one-click sandbox login cards on the sign-in screen for{' '}
                        <strong className="text-[#0F172A] dark:text-[#F8FAFC]">
                          non-admin demo accounts only (Approver and User)
                        </strong>
                        . Admin accounts are always excluded and no passwords are sent to the browser. Turning Developer Mode OFF hides them automatically.
                      </p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={developerState.loginTemplatesEnabled}
                      disabled={!developerState.developerMode || togglingLoginTemplates}
                      onClick={() =>
                        handleToggleLoginTemplates(!developerState.loginTemplatesEnabled)
                      }
                      className={`inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed ${
                        developerState.loginTemplatesEnabled
                          ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                          : 'bg-white dark:bg-[#111827] text-[#334155] dark:text-[#CBD5E1] border-[#CBD5E1] dark:border-[#334155]'
                      }`}
                    >
                      <span>
                        {togglingLoginTemplates
                          ? 'Updating...'
                          : developerState.loginTemplatesEnabled
                          ? 'Quick-Login Cards: ON'
                          : 'Quick-Login Cards: OFF'}
                      </span>
                    </button>
                  </div>

                  {!developerState.developerMode && !developerState.mockDataEnabled && (
                    <div className="px-4 py-3 text-xs text-[#64748B] dark:text-[#94A3B8] border border-dashed border-[#CBD5E1] dark:border-[#334155] rounded-md">
                      Enable <strong className="text-[#0F172A] dark:text-[#F8FAFC]">Developer Mode</strong> above to manage login-page demo access or load the sandbox Mock Data pack.
                    </div>
                  )}

                  {confirmAction && (
                    <div className="p-4 rounded-md bg-[#FFFBEB] dark:bg-[#78350F]/25 border border-[#FDE68A] dark:border-[#B45309] flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-start gap-2.5 text-xs text-[#92400E] dark:text-[#FDE68A]">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          {confirmAction === 'disable_mock' ? (
                            <>
                              <strong>Confirm Turn Mock Data OFF:</strong> All sample mock records and any modifications made to them will be removed immediately. Your{' '}
                              <span className="font-mono font-semibold">
                                {developerState.counts.manualAssets} manual assets
                              </span>
                              ,{' '}
                              <span className="font-mono font-semibold">
                                {developerState.counts.manualReports} manual reports
                              </span>
                              , and{' '}
                              <span className="font-mono font-semibold">
                                {developerState.counts.manualProjects} manual projects
                              </span>{' '}
                              will remain intact.
                            </>
                          ) : (
                            <>
                              <strong>Confirm Reset Modified Mock Data:</strong> Restores all mock zones, assets, schematics, projects, and reports back to their clean sample defaults while keeping every manual item intact.
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setConfirmAction(null)}
                          className="px-3 py-1.5 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={togglingMockData || resettingMockData}
                          onClick={() =>
                            confirmAction === 'disable_mock'
                              ? handleToggleMockData(false)
                              : handleResetMockData()
                          }
                          className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#D97706] hover:bg-[#B45309] disabled:opacity-60 rounded-md whitespace-nowrap shrink-0"
                        >
                          {confirmAction === 'disable_mock'
                            ? togglingMockData
                              ? 'Purging Mock...'
                              : 'Confirm Turn OFF'
                            : resettingMockData
                            ? 'Resetting...'
                            : 'Confirm Reset Mock'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Manual vs Mock Live Dataset Breakdown */}
                  <div className="border border-[#E2E8F0] dark:border-[#1E293B] rounded-md overflow-hidden">
                    <div className="px-4 py-2.5 bg-[#F8FAFC] dark:bg-[#0F172A] border-b border-[#E2E8F0] dark:border-[#1E293B] flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                        Live Database Isolation Breakdown (Manual vs. Mock)
                      </span>
                      <span className="text-[11px] font-mono text-[#16A34A] dark:text-[#4ADE80]">
                        Manual records protected (is_mock = 0)
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#E2E8F0] dark:border-[#1E293B] text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                            <th className="py-2 px-3 sm:px-4">Entity Scope</th>
                            <th className="py-2 px-3 sm:px-4 text-right">Manual</th>
                            <th className="py-2 px-3 sm:px-4 text-right">Mock</th>
                            <th className="py-2 px-3 sm:px-4 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B] text-xs">
                          {datasetRows.map((row) => (
                            <tr key={row.label}>
                              <td className="py-2 px-3 sm:px-4 font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                                {row.label}
                              </td>
                              <td className="py-2 px-3 sm:px-4 text-right font-mono tabular-nums text-[#16A34A] dark:text-[#4ADE80]">
                                {row.manual}
                              </td>
                              <td className="py-2 px-3 sm:px-4 text-right font-mono tabular-nums text-[#D97706] dark:text-[#FBBF24]">
                                {row.mock}
                              </td>
                              <td className="py-2 px-3 sm:px-4 text-right font-mono tabular-nums font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                                {row.manual + row.mock}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
