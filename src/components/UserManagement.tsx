import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Edit3,
  KeyRound,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import type { User, UserRole } from '../types.ts';
import { formatRoleLabel, hasAnyRole } from '../types.ts';
import { formatAuditTimestamp } from '../utils/export.ts';
import { ResizableTh, useResizableColumns } from './ResizableTable.tsx';

interface UserManagementProps {
  users: User[];
  currentUser: User;
  token: string;
  onSyncComplete: () => Promise<void>;
  onNotify: (message: string, kind?: 'info' | 'error') => void;
}

const ROLE_OPTIONS: {
  value: UserRole;
  label: string;
  description: string;
}[] = [
  {
    value: 'admin',
    label: 'Admin',
    description: 'Manage users/roles, edit approved reports & completed tasks, manage all modules.',
  },
  {
    value: 'approver',
    label: 'Approver',
    description: 'Approve or send back inspections, edit Asset Library & Facility Zones, create Projects.',
  },
  {
    value: 'user',
    label: 'User',
    description: 'Start & submit inspections, update own sent-back drafts, update assigned Project activities.',
  },
];

function getUserRoles(u: User): UserRole[] {
  return u.roles && u.roles.length > 0 ? u.roles : [u.role];
}

function renderRoleBadge(role: UserRole) {
  if (role === 'admin') {
    return (
      <span
        key={role}
        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 text-[#1D4ED8] dark:text-[#93C5FD] border border-[#BFDBFE] dark:border-[#1E40AF]"
      >
        <Shield className="w-3 h-3 shrink-0" />
        <span>{formatRoleLabel(role)}</span>
      </span>
    );
  }
  if (role === 'approver') {
    return (
      <span
        key={role}
        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-[#ECFDF5] dark:bg-[#064E3B]/40 text-[#15803D] dark:text-[#6EE7B7] border border-[#A7F3D0] dark:border-[#047857]"
      >
        <CheckCircle2 className="w-3 h-3 shrink-0" />
        <span>{formatRoleLabel(role)}</span>
      </span>
    );
  }
  return (
    <span
      key={role}
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-[#F1F5F9] dark:bg-[#1E293B] text-[#334155] dark:text-[#CBD5E1] border border-[#CBD5E1] dark:border-[#334155]"
    >
      <UserCheck className="w-3 h-3 shrink-0" />
      <span>{formatRoleLabel(role)}</span>
    </span>
  );
}

export function UserManagement({
  users,
  currentUser,
  token,
  onSyncComplete,
  onNotify,
}: UserManagementProps) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<{
    name: string;
    email: string;
    password: string;
    roles: UserRole[];
    title: string;
  }>({
    name: '',
    email: '',
    password: '',
    roles: ['user'],
    title: '',
  });
  const [creating, setCreating] = useState(false);

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    email: string;
    roles: UserRole[];
    title: string;
  }>({
    name: '',
    email: '',
    roles: ['user'],
    title: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const [resetUser, setResetUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { widths: cols, startResize } = useResizableColumns({
    name: 210,
    email: 220,
    title: 190,
    role: 210,
    created: 165,
    actions: 135,
  });

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && !hasAnyRole(u, roleFilter)) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.title || '').toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter]);

  const adminCount = useMemo(
    () => users.filter((u) => hasAnyRole(u, 'admin')).length,
    [users]
  );

  function toggleCreateRole(role: UserRole) {
    setCreateForm((prev) => {
      const exists = prev.roles.includes(role);
      if (exists) {
        if (prev.roles.length <= 1) return prev;
        return { ...prev, roles: prev.roles.filter((r) => r !== role) };
      }
      return { ...prev, roles: [...prev.roles, role] };
    });
  }

  function toggleEditRole(role: UserRole) {
    if (!editingUser) return;
    const isSelf = editingUser.id === currentUser.id;
    const wasAdmin = hasAnyRole(editingUser, 'admin');
    const isLastAdmin = wasAdmin && adminCount <= 1;

    setEditForm((prev) => {
      const exists = prev.roles.includes(role);
      if (exists) {
        if (prev.roles.length <= 1) return prev;
        if (role === 'admin' && (isSelf || isLastAdmin)) return prev;
        return { ...prev, roles: prev.roles.filter((r) => r !== role) };
      }
      return { ...prev, roles: [...prev.roles, role] };
    });
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (createForm.roles.length === 0) {
      onNotify('Select at least one role for the new user.', 'error');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: createForm.name,
          email: createForm.email,
          password: createForm.password,
          roles: createForm.roles,
          role: createForm.roles[0],
          title: createForm.title,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify(data.error ?? 'Failed to create user.', 'error');
        return;
      }
      setShowCreateModal(false);
      setCreateForm({
        name: '',
        email: '',
        password: '',
        roles: ['user'],
        title: '',
      });
      await onSyncComplete();
      onNotify(`Created local account for ${createForm.name}.`);
    } catch {
      onNotify('Network error creating user.', 'error');
    } finally {
      setCreating(false);
    }
  }

  function openEditModal(u: User) {
    setEditingUser(u);
    setEditForm({
      name: u.name,
      email: u.email,
      roles: getUserRoles(u),
      title: u.title,
    });
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    if (editForm.roles.length === 0) {
      onNotify('User must keep at least one assigned role.', 'error');
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editForm.name,
          email: editForm.email,
          roles: editForm.roles,
          role: editForm.roles[0],
          title: editForm.title,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify(data.error ?? 'Failed to update user.', 'error');
        return;
      }
      setEditingUser(null);
      await onSyncComplete();
      onNotify(`Updated user profile and roles for ${editForm.name}.`);
    } catch {
      onNotify('Network error updating user.', 'error');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUser) return;
    setResetting(true);
    try {
      const res = await fetch(`/api/users/${resetUser.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify(data.error ?? 'Failed to reset password.', 'error');
        return;
      }
      setResetUser(null);
      setNewPassword('');
      await onSyncComplete();
      onNotify(`Password reset for ${resetUser.name}. Active sessions revoked.`);
    } catch {
      onNotify('Network error resetting password.', 'error');
    } finally {
      setResetting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingUser) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/users/${deletingUser.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify(data.error ?? 'Could not delete user.', 'error');
        return;
      }
      const deletedName = deletingUser.name;
      setDeletingUser(null);
      await onSyncComplete();
      onNotify(`Removed user account for ${deletedName}.`);
    } catch {
      onNotify('Network error deleting user.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
          <div className="relative flex-1 min-w-[200px] sm:max-w-xs">
            <Search className="w-4 h-4 text-[#64748B] dark:text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, or job title..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8] dark:focus:border-[#60A5FA]"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] dark:bg-[#0F172A] rounded-md border border-[#E2E8F0] dark:border-[#1E293B] overflow-x-auto max-w-full">
            {(
              [
                { key: 'all', label: 'All Roles' },
                { key: 'admin', label: 'Admin' },
                { key: 'approver', label: 'Approver' },
                { key: 'user', label: 'User' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setRoleFilter(opt.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  roleFilter === opt.key
                    ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                    : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          <span className="text-xs text-[#64748B] dark:text-[#94A3B8] font-mono tabular-nums">
            {filteredUsers.length} of {users.length} accounts · {adminCount} admin
          </span>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add User</span>
          </button>
        </div>
      </div>

      {/* Users Cards (Mobile) & Resizable Table (Desktop) */}
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden">
        <div className="md:hidden divide-y divide-[#E2E8F0] dark:divide-[#1E293B]">
          {filteredUsers.length === 0 ? (
            <div className="py-10 px-4 text-center text-sm text-[#64748B] dark:text-[#94A3B8]">
              No local user accounts match your filter.
            </div>
          ) : (
            filteredUsers.map((u) => {
              const isSelf = u.id === currentUser.id;
              const roles = getUserRoles(u);
              const isLastAdmin = roles.includes('admin') && adminCount <= 1;

              return (
                <div key={u.id} className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                          {u.name}
                        </span>
                        {isSelf && (
                          <span className="font-mono text-[10px] text-[#1D4ED8] dark:text-[#60A5FA] shrink-0">
                            (You)
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-xs text-[#475569] dark:text-[#94A3B8] truncate">
                        {u.email}
                      </div>
                      {u.title && (
                        <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate mt-0.5">
                          {u.title}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {roles.map((r) => renderRoleBadge(r))}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#F1F5F9] dark:border-[#1E293B]">
                    <span className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                      {formatAuditTimestamp(u.createdAt)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditModal(u)}
                        className="inline-flex items-center justify-center min-h-[38px] min-w-[38px] text-[#475569] dark:text-[#94A3B8] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA] bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-md"
                        title="Edit profile & roles"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setResetUser(u);
                          setNewPassword('');
                        }}
                        className="inline-flex items-center justify-center min-h-[38px] min-w-[38px] text-[#475569] dark:text-[#94A3B8] hover:text-[#D97706] dark:hover:text-[#FBBF24] bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] rounded-md"
                        title="Reset password"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isSelf || isLastAdmin}
                        onClick={() => setDeletingUser(u)}
                        className="inline-flex items-center justify-center min-h-[38px] min-w-[38px] text-[#475569] dark:text-[#94A3B8] hover:text-[#DC2626] dark:hover:text-[#F87171] bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] disabled:opacity-35 rounded-md"
                        title="Delete account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
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
                  width={cols.name}
                  onStartResize={(e) => startResize('name', e)}
                  className="py-3 px-4"
                >
                  Full Name
                </ResizableTh>
                <ResizableTh
                  width={cols.email}
                  onStartResize={(e) => startResize('email', e)}
                  className="py-3 px-4"
                >
                  Email Address
                </ResizableTh>
                <ResizableTh
                  width={cols.title}
                  onStartResize={(e) => startResize('title', e)}
                  className="py-3 px-4"
                >
                  Job Title
                </ResizableTh>
                <ResizableTh
                  width={cols.role}
                  onStartResize={(e) => startResize('role', e)}
                  className="py-3 px-4"
                >
                  Assigned Roles
                </ResizableTh>
                <ResizableTh
                  width={cols.created}
                  onStartResize={(e) => startResize('created', e)}
                  className="py-3 px-4"
                >
                  Created
                </ResizableTh>
                <ResizableTh
                  width={cols.actions}
                  onStartResize={(e) => startResize('actions', e)}
                  align="right"
                  className="py-3 px-4"
                >
                  Actions
                </ResizableTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B] text-sm">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-10 px-4 text-center text-sm text-[#64748B] dark:text-[#94A3B8]"
                  >
                    No local user accounts match your filter.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isSelf = u.id === currentUser.id;
                  const roles = getUserRoles(u);
                  const isLastAdmin = roles.includes('admin') && adminCount <= 1;

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/60 transition-colors"
                    >
                      <td className="py-3 px-4 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                            {u.name}
                          </span>
                          {isSelf && (
                            <span className="font-mono text-[10px] text-[#1D4ED8] dark:text-[#60A5FA] shrink-0">
                              (You)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-[#334155] dark:text-[#CBD5E1] truncate">
                        {u.email}
                      </td>
                      <td className="py-3 px-4 text-xs text-[#475569] dark:text-[#94A3B8] truncate">
                        {u.title || '—'}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {roles.map((r) => renderRoleBadge(r))}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-[#64748B] dark:text-[#94A3B8] whitespace-nowrap tabular-nums">
                        {formatAuditTimestamp(u.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(u)}
                            title="Edit profile & roles"
                            className="p-1.5 text-[#475569] dark:text-[#94A3B8] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#1E3A8A]/30 rounded transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setResetUser(u);
                              setNewPassword('');
                            }}
                            title="Reset password"
                            className="p-1.5 text-[#475569] dark:text-[#94A3B8] hover:text-[#D97706] dark:hover:text-[#FBBF24] hover:bg-[#FFFBEB] dark:hover:bg-[#78350F]/30 rounded transition-colors"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isSelf || isLastAdmin}
                            onClick={() => setDeletingUser(u)}
                            title={
                              isSelf
                                ? 'Cannot delete your active account'
                                : isLastAdmin
                                ? 'Cannot delete the last Admin'
                                : 'Delete account'
                            }
                            className="p-1.5 text-[#475569] dark:text-[#94A3B8] hover:text-[#DC2626] dark:hover:text-[#F87171] hover:bg-[#FEF2F2] dark:hover:bg-[#7F1D1D]/30 disabled:opacity-35 disabled:cursor-not-allowed rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 dark:bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded-lg max-w-lg w-full shadow-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                Create Local User Account
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    placeholder="e.g. Morgan Lee"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Job Title
                  </label>
                  <input
                    type="text"
                    value={createForm.title}
                    onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                    placeholder="e.g. Reliability Lead"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    placeholder="morgan.lee@indspectora.local"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Initial Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="Minimum 6 characters"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-2">
                  Roles (Select one or more)
                </label>
                <div className="space-y-2">
                  {ROLE_OPTIONS.map((opt) => {
                    const checked = createForm.roles.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className={`flex items-start gap-3 p-3 border rounded-md cursor-pointer transition-colors ${
                          checked
                            ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 border-[#1D4ED8] dark:border-[#3B82F6]'
                            : 'bg-[#F8FAFC] dark:bg-[#0F172A] border-[#E2E8F0] dark:border-[#334155]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCreateRole(opt.value)}
                          className="mt-0.5 rounded border-[#CBD5E1] text-[#1D4ED8]"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                            {opt.label}
                          </div>
                          <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                            {opt.description}
                          </div>
                        </div>
                      </label>
                    );
                  })}
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
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{creating ? 'Creating...' : 'Create User'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Profile & Multi-Role Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 dark:bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded-lg max-w-lg w-full shadow-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                Edit User · {editingUser.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Job Title
                  </label>
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-2">
                  Assigned Roles (Multiple roles supported)
                </label>
                <div className="space-y-2">
                  {ROLE_OPTIONS.map((opt) => {
                    const checked = editForm.roles.includes(opt.value);
                    const isSelf = editingUser.id === currentUser.id;
                    const isLastAdmin =
                      hasAnyRole(editingUser, 'admin') && adminCount <= 1;
                    const lockAdmin = opt.value === 'admin' && checked && (isSelf || isLastAdmin);

                    return (
                      <label
                        key={opt.value}
                        className={`flex items-start gap-3 p-3 border rounded-md transition-colors ${
                          lockAdmin ? 'opacity-75 cursor-not-allowed' : 'cursor-pointer'
                        } ${
                          checked
                            ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 border-[#1D4ED8] dark:border-[#3B82F6]'
                            : 'bg-[#F8FAFC] dark:bg-[#0F172A] border-[#E2E8F0] dark:border-[#334155]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={lockAdmin}
                          onChange={() => toggleEditRole(opt.value)}
                          className="mt-0.5 rounded border-[#CBD5E1] text-[#1D4ED8]"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                            {opt.label}
                          </div>
                          <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                            {opt.description}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {editingUser.id === currentUser.id && (
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-1.5">
                    Your own Admin role cannot be unchecked during an active session.
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-xs font-medium text-[#475569] dark:text-[#CBD5E1] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{savingEdit ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 dark:bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded-lg max-w-md w-full shadow-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                Reset Password · {resetUser.name}
              </h3>
              <button
                type="button"
                onClick={() => setResetUser(null)}
                className="p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleResetPassword} className="p-6 space-y-4">
              <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                Setting a new password will immediately revoke any existing login sessions for{' '}
                <span className="font-mono text-[#0F172A] dark:text-[#F8FAFC]">{resetUser.email}</span>.
              </p>

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
                  placeholder="Minimum 6 characters"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setResetUser(null)}
                  className="px-4 py-2 text-xs font-medium text-[#475569] dark:text-[#CBD5E1] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetting}
                  className="px-4 py-2 text-xs font-medium text-white bg-[#D97706] hover:bg-[#B45309] disabled:opacity-60 rounded-md"
                >
                  {resetting ? 'Updating...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 dark:bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded-lg max-w-md w-full p-6 shadow-lg space-y-4">
            <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
              Delete User Account?
            </h3>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
              Remove <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">{deletingUser.name}</span>{' '}
              (<span className="font-mono">{deletingUser.email}</span>) from local authentication? Historical
              inspection reports and audit footprints created by this user are preserved.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="px-3.5 py-2 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#334155] rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-3.5 py-2 text-xs font-medium text-white bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-60 rounded-md"
              >
                {deleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
