import React, { useCallback, useEffect, useState } from 'react';
import {
  ClipboardCheck,
  Code2,
  Download,
  ExternalLink,
  GanttChartSquare,
  KeyRound,
  Lock,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import type { AuthStatusPayload, User } from '../types.ts';
import { formatRoleLabel } from '../types.ts';
import {
  downloadPortableWindowsExe,
  type PortableDownloadProgress,
} from '../utils/portableDownload.ts';

interface AuthGateProps {
  onAuthenticated: (token: string, user: User) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function AuthGate({ onAuthenticated, theme, onToggleTheme }: AuthGateProps) {
  const [authStatus, setAuthStatus] = useState<AuthStatusPayload | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [devLoginUserId, setDevLoginUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadingExe, setDownloadingExe] = useState(false);
  const [exeProgress, setExeProgress] = useState<PortableDownloadProgress | null>(null);
  const [exeError, setExeError] = useState<string | null>(null);

  const loadAuthStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const res = await fetch('/api/auth/status', { credentials: 'include' });
      if (!res.ok) {
        setStatusError('Unable to verify workspace initialization status.');
        return;
      }
      const data = (await res.json()) as AuthStatusPayload;
      setAuthStatus(data);
    } catch {
      setStatusError('Unable to reach local operations server.');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAuthStatus();
  }, [loadAuthStatus]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const isFirstRunSetup = Boolean(authStatus?.needsFirstAdminSetup);

    if (isFirstRunSetup) {
      if (password.length < 8) {
        setError('Administrator password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Password confirmation does not match.');
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint = isFirstRunSetup
        ? '/api/auth/setup-admin'
        : mode === 'login'
        ? '/api/auth/login'
        : '/api/auth/register';

      const payload = isFirstRunSetup
        ? { name, email, password, title }
        : mode === 'login'
        ? { email, password }
        : { name, email, password, title };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { token?: string; user?: User; error?: string };
      if (!res.ok || !data.token || !data.user) {
        setError(data.error ?? 'Authentication failed. Please verify your credentials.');
        if (res.status === 409 && isFirstRunSetup) {
          await loadAuthStatus();
        }
        return;
      }
      onAuthenticated(data.token, data.user);
    } catch {
      setError('Unable to reach local operations server.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDevDemoLogin(userId: string) {
    setError(null);
    setDevLoginUserId(userId);
    try {
      const res = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId }),
      });
      const data = (await res.json()) as { token?: string; user?: User; error?: string };
      if (!res.ok || !data.token || !data.user) {
        setError(data.error ?? 'Developer quick-login is unavailable.');
        await loadAuthStatus();
        return;
      }
      onAuthenticated(data.token, data.user);
    } catch {
      setError('Unable to reach local operations server.');
    } finally {
      setDevLoginUserId(null);
    }
  }

  const isFirstRunSetup = Boolean(authStatus?.needsFirstAdminSetup);
  const showDevAccounts =
    !isFirstRunSetup &&
    Boolean(authStatus?.loginTemplatesEnabled) &&
    (authStatus?.demoAccounts?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] text-[#0F172A] dark:text-[#F8FAFC] flex flex-col justify-center py-10 px-6 relative">
      <button
        type="button"
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        className="absolute top-5 right-6 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#475569] dark:text-[#CBD5E1] bg-white dark:bg-[#111827] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-md transition-colors min-h-[36px]"
      >
        {theme === 'dark' ? (
          <>
            <Sun className="w-3.5 h-3.5 text-[#FBBF24]" />
            <span>Light Mode</span>
          </>
        ) : (
          <>
            <Moon className="w-3.5 h-3.5 text-[#475569]" />
            <span>Dark Mode</span>
          </>
        )}
      </button>

      <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Context Column */}
        <div className="lg:col-span-6 bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl lg:rounded-lg p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#E2E8F0] dark:border-[#1E293B] pb-5 mb-6 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src="/assets/aistudio/Gemini_Generated_Image_blqe01blqe01blqe_2a407c6c.jpg"
                  alt="IndSpectora logo"
                  className="w-10 h-10 rounded-xl object-cover border border-[#E2E8F0] dark:border-[#334155] shrink-0"
                />
                <span className="font-display text-xl font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC] truncate">
                  IndSpectora
                </span>
              </div>
              <span className="font-mono text-xs text-[#64748B] dark:text-[#94A3B8] shrink-0">
                Local Operations
              </span>
            </div>

            <h1 className="font-display text-3xl font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC] leading-tight mb-4 max-w-md [text-wrap:balance]">
              Asset Inspection Reporting &amp; Project Operations Control
            </h1>
            <p className="text-[15px] text-[#475569] dark:text-[#94A3B8] leading-relaxed mb-8">
              Standardize asset inspections with visual checkpoint drawings, custom inspection
              parameters, multi-approver sequential routing, and immutable Digital Footprints,
              synchronized live with project schedules.
            </p>

            <div className="space-y-4 border-t border-[#E2E8F0] dark:border-[#1E293B] pt-6">
              <div className="flex items-start gap-3">
                <ClipboardCheck className="w-5 h-5 text-[#1D4ED8] dark:text-[#60A5FA] shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    Central Asset Library, Visual Pins &amp; Sequential Approvals
                  </div>
                  <div className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                    Facility-linked assets, CSV bulk import, custom inspection readings, 1–6 step
                    approvals, and full per-asset edit &amp; comparison histories.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <GanttChartSquare className="w-5 h-5 text-[#1D4ED8] dark:text-[#60A5FA] shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    Projects Scheduling &amp; Activity Blocker Chain
                  </div>
                  <div className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                    Optional WBS hierarchy, Gantt &amp; Table views, registered user assignees, change
                    audit history, and dependency guards.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {showDevAccounts ? (
            <div className="mt-8 pt-6 border-t border-[#E2E8F0] dark:border-[#1E293B]">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  <Code2 className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-[#60A5FA]" />
                  <span>Developer Mode · Non-Admin Demo Access</span>
                </div>
                <span className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Approver / User Only
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {authStatus!.demoAccounts.map((acc) => {
                  const isBusy = devLoginUserId === acc.id;
                  const roleSummary = acc.roles.map(formatRoleLabel).join(' + ');
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      disabled={Boolean(devLoginUserId) || loading}
                      onClick={() => handleDevDemoLogin(acc.id)}
                      className="text-left px-3.5 py-2.5 min-h-[44px] bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] disabled:opacity-60 border border-[#E2E8F0] dark:border-[#334155] rounded-md transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                          {isBusy ? 'Signing in...' : acc.name}
                        </span>
                        <span className="text-[11px] font-medium text-[#1D4ED8] dark:text-[#60A5FA] shrink-0">
                          {roleSummary}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate mt-0.5">
                        {acc.email}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-2.5">
                Controlled by your Administrator in Settings → Developer Mode. Admin accounts are
                excluded from quick-login templates.
              </p>
            </div>
          ) : (
            <div className="mt-8 pt-6 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-3">
              <div className="flex items-start gap-2.5 text-xs text-[#64748B] dark:text-[#94A3B8]">
                <ShieldCheck className="w-4 h-4 text-[#16A34A] dark:text-[#4ADE80] shrink-0 mt-0.5" />
                <span>
                  {isFirstRunSetup
                    ? 'Fresh database detected: zero preset accounts or hardcoded passwords exist. Complete the Administrator form to initialize your workspace.'
                    : 'Credentials are validated server-side against salted scrypt password hashes stored in your local SQLite database.'}
                </span>
              </div>

              {!authStatus?.portableExeMode && (
                <div className="pt-1 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                      Windows 10/11 without Admin, NPM, or Docker?
                    </span>
                    <button
                      type="button"
                      disabled={downloadingExe}
                      onClick={async () => {
                        setExeError(null);
                        setExeProgress(null);
                        setDownloadingExe(true);
                        const result = await downloadPortableWindowsExe((prog) => setExeProgress(prog));
                        setDownloadingExe(false);
                        setExeProgress(null);
                        if (!result.ok && result.error) {
                          setExeError(result.error);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1D4ED8] dark:text-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 hover:bg-[#DBEAFE] dark:hover:bg-[#1E3A8A]/50 disabled:opacity-60 border border-[#BFDBFE] dark:border-[#1E40AF] rounded-md transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {downloadingExe
                          ? exeProgress
                            ? `Downloading ${exeProgress.percent}% (${exeProgress.loadedMB}/${exeProgress.totalMB} MB)`
                            : 'Preparing Windows .exe...'
                          : 'Download Portable (.exe)'}
                      </span>
                    </button>
                  </div>
                  {exeError && (
                    <div className="px-3 py-2.5 bg-[#FEF2F2] dark:bg-[#7F1D1D]/30 border border-[#FECACA] dark:border-[#B91C1C] text-[#B91C1C] dark:text-[#FCA5A5] text-[11px] rounded-md space-y-2">
                      <div>{exeError}</div>
                      <a
                        href={typeof window !== 'undefined' ? window.location.origin : '/'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-white dark:bg-[#111827] text-[#1D4ED8] dark:text-[#60A5FA] border border-[#BFDBFE] dark:border-[#1E40AF] rounded hover:bg-[#EFF6FF] dark:hover:bg-[#1E3A8A]/40 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Open App in New Tab</span>
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Form Column */}
        <div className="lg:col-span-6 bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl lg:rounded-lg p-6 sm:p-8 flex flex-col justify-center">
          {statusLoading ? (
            <div className="py-12 text-center space-y-2">
              <div className="text-sm font-medium text-[#475569] dark:text-[#94A3B8]">
                Checking local IndSpectora workspace status...
              </div>
            </div>
          ) : statusError ? (
            <div className="py-8 space-y-4">
              <div className="px-3.5 py-2.5 bg-[#FEF2F2] dark:bg-[#7F1D1D]/30 border border-[#FECACA] dark:border-[#B91C1C] text-[#B91C1C] dark:text-[#FCA5A5] text-xs font-medium rounded-md">
                {statusError}
              </div>
              <button
                type="button"
                onClick={loadAuthStatus}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Connection</span>
              </button>
            </div>
          ) : isFirstRunSetup ? (
            <>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA] mb-2">
                <KeyRound className="w-3.5 h-3.5" />
                <span>First-Run Workspace Initialization</span>
              </div>

              <h2 className="font-display text-xl font-bold text-[#0F172A] dark:text-[#F8FAFC] mb-1">
                Create Initial Administrator Account
              </h2>
              <p className="text-sm text-[#64748B] dark:text-[#94A3B8] mb-6">
                This account receives <strong className="text-[#0F172A] dark:text-[#F8FAFC]">Admin + Approver</strong>{' '}
                privileges to manage team accounts, configure workspace defaults, and oversee approvals.
              </p>

              {error && (
                <div className="mb-5 px-3.5 py-2.5 bg-[#FEF2F2] dark:bg-[#7F1D1D]/30 border border-[#FECACA] dark:border-[#B91C1C] text-[#B91C1C] dark:text-[#FCA5A5] text-xs font-medium rounded-md">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Alex Mercer"
                      className="w-full px-3 py-2 min-h-[40px] text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1.5">
                      Job Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Operations Administrator"
                      className="w-full px-3 py-2 min-h-[40px] text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1.5">
                    Administrator Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@company.local"
                    className="w-full px-3 py-2 min-h-[40px] text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1.5">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="w-full px-3 py-2 min-h-[40px] text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1.5">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      className="w-full px-3 py-2 min-h-[40px] text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md transition-colors"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>{loading ? 'Initializing Workspace...' : 'Create Administrator & Enter Workspace'}</span>
                </button>
              </form>

              <div className="mt-6 pt-4 border-t border-[#E2E8F0] dark:border-[#1E293B] flex items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
                <ShieldCheck className="w-4 h-4 text-[#16A34A] dark:text-[#4ADE80] shrink-0" />
                <span>One-time setup locks automatically once the first Administrator is created.</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] dark:bg-[#0F172A] rounded-md mb-6 w-fit border border-[#E2E8F0] dark:border-[#1E293B]">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className={`px-4 py-1.5 min-h-[36px] text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    mode === 'login'
                      ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                      : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className={`px-4 py-1.5 min-h-[36px] text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    mode === 'register'
                      ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                      : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                  }`}
                >
                  Create Local Account
                </button>
              </div>

              <h2 className="font-display text-xl font-bold text-[#0F172A] dark:text-[#F8FAFC] mb-1">
                {mode === 'login' ? 'Sign in to local workspace' : 'Register a new local account'}
              </h2>
              <p className="text-sm text-[#64748B] dark:text-[#94A3B8] mb-6">
                {mode === 'login'
                  ? 'Authenticate against the local SQLite database to sync inspections and schedules.'
                  : 'New self-registered accounts start with the standard User role; Admins can grant Approver or Admin roles later.'}
              </p>

              {error && (
                <div className="mb-5 px-3.5 py-2.5 bg-[#FEF2F2] dark:bg-[#7F1D1D]/30 border border-[#FECACA] dark:border-[#B91C1C] text-[#B91C1C] dark:text-[#FCA5A5] text-xs font-medium rounded-md">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'register' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1.5">
                        Full Name
                      </label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Morgan Lee"
                        className="w-full px-3 py-2 min-h-[40px] text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1.5">
                        Job Title
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Plant Reliability Technician"
                        className="w-full px-3 py-2 min-h-[40px] text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.local"
                    className="w-full px-3 py-2 min-h-[40px] text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? 'Minimum 6 characters' : 'Enter password'}
                    className="w-full px-3 py-2 min-h-[40px] text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || Boolean(devLoginUserId)}
                  className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md transition-colors"
                >
                  {mode === 'login' ? (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>{loading ? 'Signing in...' : 'Sign In'}</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>{loading ? 'Creating account...' : 'Create Local Account'}</span>
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 pt-4 border-t border-[#E2E8F0] dark:border-[#1E293B] flex items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
                <ShieldCheck className="w-4 h-4 text-[#16A34A] dark:text-[#4ADE80] shrink-0" />
                <span>Passwords are salted and hashed with scrypt on your local server.</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
