/**
 * IndSpectora — SQLite Schema & Persistence Layer
 * @author Aoraki CreaLabs
 */
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ActivityLog,
  ApprovalStepStatus,
  AssetParameter,
  AssetPin,
  BootstrapPayload,
  ConditionStatus,
  CriticalityLevel,
  CustomParameterType,
  CycleType,
  DependencyType,
  DeveloperDatasetCounts,
  DeveloperSettingsState,
  EntryEditHistoryItem,
  EntryVisualPin,
  FacilityArea,
  InspectionEntry,
  InspectionParameterValue,
  InspectionPhoto,
  InspectionPinResult,
  InspectionReport,
  LandingTabPreference,
  LibraryItem,
  NotificationType,
  Project,
  ProjectTask,
  ReportApprovalStep,
  ReportComment,
  ReportFootprint,
  ReportStatus,
  TableDensity,
  TaskBlocker,
  TaskComment,
  TaskHistoryEntry,
  TaskStatus,
  TaskType,
  TourPageKey,
  User,
  UserNotification,
  UserPreferences,
  UserRole,
  WorkspaceDefaults,
} from '../src/types.ts';
import { getDataDir } from './portablePaths.ts';

const DATA_DIR = getDataDir();
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const LEGACY_DB_PATH = path.join(DATA_DIR, 'opsledger.db');
const DB_PATH = path.join(DATA_DIR, 'indspectora.db');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

if (!fs.existsSync(DB_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
  fs.renameSync(LEGACY_DB_PATH, DB_PATH);
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(`${LEGACY_DB_PATH}${suffix}`)) {
      fs.renameSync(`${LEGACY_DB_PATH}${suffix}`, `${DB_PATH}${suffix}`);
    }
  }
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, originalHash] = stored.split(':');
  if (!salt || !originalHash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const originalBuf = Buffer.from(originalHash, 'hex');
  if (derived.length !== originalBuf.length) return false;
  return crypto.timingSafeEqual(derived, originalBuf);
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function normalizeRoleValue(value: unknown): UserRole {
  if (value === 'admin' || value === 'approver' || value === 'user') {
    return value;
  }
  return 'user';
}

export function normalizeRoles(rawRoles: unknown, fallbackRole?: unknown): UserRole[] {
  let list: unknown[] = [];
  if (Array.isArray(rawRoles)) {
    list = rawRoles;
  } else if (typeof rawRoles === 'string' && rawRoles.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(rawRoles);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  const set = new Set<UserRole>();
  for (const r of list) {
    if (r === 'admin' || r === 'approver' || r === 'user') {
      set.add(r);
    } else if (r === 'inspector') {
      set.add('user');
    }
  }
  if (set.size === 0 && fallbackRole !== undefined) {
    set.add(normalizeRoleValue(fallbackRole));
  }
  if (set.size === 0) {
    set.add('user');
  }
  const order: UserRole[] = ['admin', 'approver', 'user'];
  return order.filter((r) => set.has(r));
}

export function getPrimaryRole(roles: UserRole[]): UserRole {
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('approver')) return 'approver';
  return 'user';
}

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'approver', 'user')) DEFAULT 'user',
      roles_json TEXT NOT NULL DEFAULT '["user"]',
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS facility_areas (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      building TEXT NOT NULL DEFAULT '',
      risk_level TEXT NOT NULL CHECK(risk_level IN ('low', 'medium', 'high')) DEFAULT 'medium',
      description TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS library_items (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      criteria TEXT NOT NULL DEFAULT '',
      facility_area_id TEXT,
      facility_area_name TEXT NOT NULL DEFAULT '',
      cycle_type TEXT DEFAULT 'routine',
      require_photo INTEGER NOT NULL DEFAULT 0,
      criticality TEXT NOT NULL CHECK(criticality IN ('low', 'medium', 'high')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      drawing_url TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (facility_area_id) REFERENCES facility_areas(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS asset_parameters (
      id TEXT PRIMARY KEY,
      library_item_id TEXT NOT NULL,
      label TEXT NOT NULL,
      param_type TEXT NOT NULL CHECK(param_type IN ('text', 'number', 'boolean')) DEFAULT 'text',
      unit TEXT NOT NULL DEFAULT '',
      is_required INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (library_item_id) REFERENCES library_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cycle_type TEXT NOT NULL CHECK(cycle_type IN ('routine', 'yearly', 'eventual')),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      use_wbs INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      parent_id TEXT,
      wbs_code TEXT NOT NULL,
      title TEXT NOT NULL,
      task_type TEXT NOT NULL CHECK(task_type IN ('phase', 'task', 'milestone')),
      assignee_id TEXT,
      assignee_name TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('not_started', 'in_progress', 'blocked', 'completed')),
      manual_override INTEGER NOT NULL DEFAULT 0,
      linked_cycle TEXT NOT NULL CHECK(linked_cycle IN ('routine', 'yearly', 'eventual', 'none')) DEFAULT 'none',
      notes TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS asset_pins (
      id TEXT PRIMARY KEY,
      library_item_id TEXT NOT NULL,
      pin_number INTEGER NOT NULL,
      label TEXT NOT NULL,
      guidance TEXT NOT NULL DEFAULT '',
      x_percent REAL NOT NULL,
      y_percent REAL NOT NULL,
      linked_task_id TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (library_item_id) REFERENCES library_items(id) ON DELETE CASCADE,
      FOREIGN KEY (linked_task_id) REFERENCES project_tasks(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS inspection_reports (
      id TEXT PRIMARY KEY,
      report_number TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      cycle_type TEXT NOT NULL CHECK(cycle_type IN ('routine', 'yearly', 'eventual')),
      facility_area TEXT NOT NULL,
      inspector_id TEXT,
      inspector_name TEXT NOT NULL,
      inspector_title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('draft', 'pending_approval', 'sent_back', 'approved', 'submitted', 'reviewed')),
      overall_condition TEXT NOT NULL CHECK(overall_condition IN ('good', 'fair', 'needs_attention', 'critical', 'na')),
      summary_notes TEXT NOT NULL DEFAULT '',
      signature_data_url TEXT,
      signed_at TEXT,
      created_at TEXT NOT NULL,
      submitted_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (inspector_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS inspection_entries (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      library_item_id TEXT NOT NULL,
      item_code TEXT NOT NULL,
      item_title TEXT NOT NULL,
      category TEXT NOT NULL,
      criteria TEXT NOT NULL DEFAULT '',
      facility_area_name TEXT NOT NULL DEFAULT '',
      require_photo INTEGER NOT NULL DEFAULT 0,
      criticality TEXT NOT NULL CHECK(criticality IN ('low', 'medium', 'high')),
      condition TEXT NOT NULL CHECK(condition IN ('good', 'fair', 'needs_attention', 'critical', 'na')),
      condition_note TEXT NOT NULL DEFAULT '',
      item_remarks TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (report_id) REFERENCES inspection_reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inspection_photos (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      pin_id TEXT,
      file_url TEXT NOT NULL,
      file_name TEXT NOT NULL,
      caption TEXT NOT NULL DEFAULT '',
      uploaded_at TEXT NOT NULL,
      FOREIGN KEY (entry_id) REFERENCES inspection_entries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inspection_pin_results (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      pin_id TEXT NOT NULL,
      condition TEXT NOT NULL CHECK(condition IN ('good', 'fair', 'needs_attention', 'critical', 'na')) DEFAULT 'na',
      notes TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (entry_id) REFERENCES inspection_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (pin_id) REFERENCES asset_pins(id) ON DELETE CASCADE,
      UNIQUE(entry_id, pin_id)
    );

    CREATE TABLE IF NOT EXISTS inspection_parameter_values (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      parameter_id TEXT NOT NULL,
      label TEXT NOT NULL,
      param_type TEXT NOT NULL CHECK(param_type IN ('text', 'number', 'boolean')) DEFAULT 'text',
      unit TEXT NOT NULL DEFAULT '',
      value_text TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (entry_id) REFERENCES inspection_entries(id) ON DELETE CASCADE,
      UNIQUE(entry_id, parameter_id)
    );

    CREATE TABLE IF NOT EXISTS report_approval_steps (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      step_order INTEGER NOT NULL,
      approver_id TEXT NOT NULL,
      approver_name TEXT NOT NULL,
      approver_title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('waiting', 'pending', 'approved', 'sent_back')) DEFAULT 'waiting',
      decision_note TEXT NOT NULL DEFAULT '',
      acted_at TEXT,
      FOREIGN KEY (report_id) REFERENCES inspection_reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS report_comments (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      entry_id TEXT,
      author_id TEXT,
      author_name TEXT NOT NULL,
      author_roles_json TEXT NOT NULL DEFAULT '["user"]',
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (report_id) REFERENCES inspection_reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS report_footprints (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      actor_id TEXT,
      actor_name TEXT NOT NULL,
      actor_roles_json TEXT NOT NULL DEFAULT '["user"]',
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (report_id) REFERENCES inspection_reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS entry_edit_history (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      report_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      actor_roles_json TEXT NOT NULL DEFAULT '["user"]',
      field_name TEXT NOT NULL,
      old_value TEXT NOT NULL DEFAULT '',
      new_value TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (entry_id) REFERENCES inspection_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (report_id) REFERENCES inspection_reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      report_id TEXT NOT NULL,
      report_number TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_tour_progress (
      user_id TEXT NOT NULL,
      page_key TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      PRIMARY KEY (user_id, page_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_blockers (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      blocker_task_id TEXT NOT NULL,
      blocked_task_id TEXT NOT NULL,
      dependency_type TEXT NOT NULL CHECK(dependency_type IN ('FS', 'SS')) DEFAULT 'FS',
      blocker_reason TEXT NOT NULL DEFAULT '',
      is_resolved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (blocker_task_id) REFERENCES project_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (blocked_task_id) REFERENCES project_tasks(id) ON DELETE CASCADE,
      UNIQUE(blocker_task_id, blocked_task_id)
    );

    CREATE TABLE IF NOT EXISTS task_history (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      field_name TEXT NOT NULL,
      old_value TEXT NOT NULL,
      new_value TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      author_id TEXT,
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      event_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY,
      table_density TEXT NOT NULL CHECK(table_density IN ('comfortable', 'compact')) DEFAULT 'comfortable',
      default_landing_tab TEXT NOT NULL CHECK(default_landing_tab IN ('dashboard', 'inspections', 'library', 'gantt')) DEFAULT 'dashboard',
      toast_notifications INTEGER NOT NULL DEFAULT 1,
      approval_alerts INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  const getTableSql = (name: string): string => {
    const row = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(name) as { sql?: string } | undefined;
    return row?.sql ?? '';
  };

  // Safe column additions on existing tables
  const userCols = db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[];
  const needsUserRolesMigration =
    getTableSql('users').includes("'inspector'") ||
    !getTableSql('users').includes("'approver'") ||
    !userCols.some((c) => c.name === 'roles_json');

  const libCols = db.prepare(`PRAGMA table_info(library_items)`).all() as { name: string }[];
  const needsLibraryMigration =
    !libCols.some((c) => c.name === 'facility_area_id') ||
    !libCols.some((c) => c.name === 'facility_area_name') ||
    !getTableSql('library_items').includes('facility_area_id');

  const needsReportStatusMigration =
    !getTableSql('inspection_reports').includes("'pending_approval'") ||
    !getTableSql('inspection_reports').includes("'sent_back'") ||
    !getTableSql('inspection_reports').includes("'approved'");

  const entryCols = db.prepare(`PRAGMA table_info(inspection_entries)`).all() as { name: string }[];
  if (!entryCols.some((c) => c.name === 'facility_area_name')) {
    db.exec(`ALTER TABLE inspection_entries ADD COLUMN facility_area_name TEXT NOT NULL DEFAULT ''`);
  }

  const taskCols = db.prepare(`PRAGMA table_info(project_tasks)`).all() as { name: string }[];
  if (!taskCols.some((c) => c.name === 'manual_override')) {
    db.exec(`ALTER TABLE project_tasks ADD COLUMN manual_override INTEGER NOT NULL DEFAULT 0`);
  }
  if (!taskCols.some((c) => c.name === 'assignee_id')) {
    db.exec(`ALTER TABLE project_tasks ADD COLUMN assignee_id TEXT`);
  }

  const photoCols = db.prepare(`PRAGMA table_info(inspection_photos)`).all() as { name: string }[];
  if (!photoCols.some((c) => c.name === 'pin_id')) {
    db.exec(`ALTER TABLE inspection_photos ADD COLUMN pin_id TEXT`);
  }

  const pinCols = db.prepare(`PRAGMA table_info(asset_pins)`).all() as { name: string }[];
  if (!pinCols.some((c) => c.name === 'linked_task_id')) {
    db.exec(`ALTER TABLE asset_pins ADD COLUMN linked_task_id TEXT`);
  }

  const projectCols = db.prepare(`PRAGMA table_info(projects)`).all() as { name: string }[];
  if (!projectCols.some((c) => c.name === 'use_wbs')) {
    db.exec(`ALTER TABLE projects ADD COLUMN use_wbs INTEGER NOT NULL DEFAULT 1`);
  }

  if (needsUserRolesMigration || needsLibraryMigration || needsReportStatusMigration) {
    db.pragma('foreign_keys = OFF');
    const migrate = db.transaction(() => {
      if (needsUserRolesMigration) {
        const existingUsers = db.prepare(`SELECT * FROM users`).all() as Record<string, unknown>[];
        db.exec(`
          CREATE TABLE users_new (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'approver', 'user')) DEFAULT 'user',
            roles_json TEXT NOT NULL DEFAULT '["user"]',
            title TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
          );
        `);
        const insertNew = db.prepare(`
          INSERT INTO users_new (id, name, email, password_hash, role, roles_json, title, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const u of existingUsers) {
          const roles = normalizeRoles(u.roles_json, u.role);
          // Give seeded Alex Mercer approver + admin if still default single admin
          if (String(u.id) === 'usr_admin_01' && roles.length === 1 && roles[0] === 'admin') {
            roles.push('approver');
          }
          const primary = getPrimaryRole(roles);
          insertNew.run(
            String(u.id),
            String(u.name),
            String(u.email),
            String(u.password_hash),
            primary,
            JSON.stringify(roles),
            String(u.title ?? ''),
            String(u.created_at)
          );
        }
        db.exec(`DROP TABLE users; ALTER TABLE users_new RENAME TO users;`);
      }

      if (needsLibraryMigration) {
        db.exec(`
          CREATE TABLE library_items_new (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            criteria TEXT NOT NULL DEFAULT '',
            facility_area_id TEXT,
            facility_area_name TEXT NOT NULL DEFAULT '',
            cycle_type TEXT DEFAULT 'routine',
            require_photo INTEGER NOT NULL DEFAULT 0,
            criticality TEXT NOT NULL CHECK(criticality IN ('low', 'medium', 'high')),
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            drawing_url TEXT,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (facility_area_id) REFERENCES facility_areas(id) ON DELETE SET NULL
          );
          INSERT INTO library_items_new
            (id, code, category, title, description, criteria, facility_area_id, facility_area_name, cycle_type, require_photo, criticality, sort_order, is_active, drawing_url, updated_at)
          SELECT
            id, code, category, title, description, criteria, NULL, '', cycle_type, require_photo, criticality, sort_order, is_active, drawing_url, updated_at
          FROM library_items;
          DROP TABLE library_items;
          ALTER TABLE library_items_new RENAME TO library_items;
        `);
      }

      if (needsReportStatusMigration) {
        db.exec(`
          CREATE TABLE inspection_reports_new (
            id TEXT PRIMARY KEY,
            report_number TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            cycle_type TEXT NOT NULL CHECK(cycle_type IN ('routine', 'yearly', 'eventual')),
            facility_area TEXT NOT NULL,
            inspector_id TEXT,
            inspector_name TEXT NOT NULL,
            inspector_title TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL CHECK(status IN ('draft', 'pending_approval', 'sent_back', 'approved', 'submitted', 'reviewed')),
            overall_condition TEXT NOT NULL CHECK(overall_condition IN ('good', 'fair', 'needs_attention', 'critical', 'na')),
            summary_notes TEXT NOT NULL DEFAULT '',
            signature_data_url TEXT,
            signed_at TEXT,
            created_at TEXT NOT NULL,
            submitted_at TEXT,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (inspector_id) REFERENCES users(id) ON DELETE SET NULL
          );
          INSERT INTO inspection_reports_new
            (id, report_number, title, cycle_type, facility_area, inspector_id, inspector_name, inspector_title, status, overall_condition, summary_notes, signature_data_url, signed_at, created_at, submitted_at, updated_at)
          SELECT
            id, report_number, title, cycle_type, facility_area, inspector_id, inspector_name, inspector_title, status, overall_condition, summary_notes, signature_data_url, signed_at, created_at, submitted_at, updated_at
          FROM inspection_reports;
          DROP TABLE inspection_reports;
          ALTER TABLE inspection_reports_new RENAME TO inspection_reports;
        `);
      }
    });
    migrate();
    db.pragma('foreign_keys = ON');
  }
  if (!db.prepare('SELECT id FROM users WHERE email = ?').get('admin@indspectora.local')) {
    db.prepare('UPDATE users SET email = ? WHERE email = ?').run('admin@indspectora.local', 'admin@opsledger.local');
  }
  if (!db.prepare('SELECT id FROM users WHERE email = ?').get('inspector@indspectora.local')) {
    db.prepare('UPDATE users SET email = ? WHERE email = ?').run('inspector@indspectora.local', 'inspector@opsledger.local');
  }

  // Ensure every domain table carries non-destructive is_mock tagging
  const mockTaggedTables = [
    'users',
    'facility_areas',
    'library_items',
    'asset_parameters',
    'asset_pins',
    'projects',
    'project_tasks',
    'task_blockers',
    'task_history',
    'task_comments',
    'inspection_reports',
    'inspection_entries',
    'inspection_photos',
    'inspection_pin_results',
    'inspection_parameter_values',
    'report_approval_steps',
    'report_comments',
    'report_footprints',
    'entry_edit_history',
    'user_notifications',
    'activity_logs',
  ];
  for (const tbl of mockTaggedTables) {
    const cols = db.prepare(`PRAGMA table_info(${tbl})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === 'is_mock')) {
      db.exec(`ALTER TABLE ${tbl} ADD COLUMN is_mock INTEGER NOT NULL DEFAULT 0`);
    }
  }
}

export function hasAnyNonMockAdminUser(): boolean {
  const rows = db
    .prepare(`SELECT role, roles_json FROM users WHERE COALESCE(is_mock, 0) = 0`)
    .all() as { role: string; roles_json: string }[];
  return rows.some((r) => {
    const roles = normalizeRoles(r.roles_json, r.role);
    return roles.includes('admin');
  });
}

export function seedDatabaseIfEmpty(): void {
  // Fresh databases start with zero hardcoded user credentials;
  // the first deployer claims the initial Admin account via /api/auth/setup-admin.
}

export function logActivity(
  actorName: string,
  actorRole: UserRole,
  eventType: string,
  summary: string
): ActivityLog {
  const entry: ActivityLog = {
    id: createId('log'),
    actorName,
    actorRole,
    eventType,
    summary,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO activity_logs (id, actor_name, actor_role, event_type, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(entry.id, entry.actorName, entry.actorRole, entry.eventType, entry.summary, entry.createdAt);
  return entry;
}

export function recordReportFootprint(
  reportId: string,
  actorId: string | null,
  actorName: string,
  actorRoles: UserRole[],
  action: string,
  summary: string,
  createdAt = new Date().toISOString()
): void {
  db.prepare(
    `INSERT INTO report_footprints (id, report_id, actor_id, actor_name, actor_roles_json, action, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(createId('rfp'), reportId, actorId, actorName, JSON.stringify(actorRoles), action, summary, createdAt);
}

export function recordEntryEditHistory(
  entryId: string,
  reportId: string,
  actorName: string,
  actorRoles: UserRole[],
  fieldName: string,
  oldValue: string,
  newValue: string,
  summary: string,
  createdAt = new Date().toISOString()
): void {
  db.prepare(
    `INSERT INTO entry_edit_history (id, entry_id, report_id, actor_name, actor_roles_json, field_name, old_value, new_value, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    createId('ehst'),
    entryId,
    reportId,
    actorName,
    JSON.stringify(actorRoles),
    fieldName,
    oldValue,
    newValue,
    summary,
    createdAt
  );
}

export function createNotification(
  userId: string,
  type: NotificationType,
  reportId: string,
  reportNumber: string,
  title: string,
  message: string
): UserNotification {
  const notif: UserNotification = {
    id: createId('ntf'),
    userId,
    type,
    reportId,
    reportNumber,
    title,
    message,
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO user_notifications (id, user_id, type, report_id, report_number, title, message, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(notif.id, notif.userId, notif.type, notif.reportId, notif.reportNumber, notif.title, notif.message, notif.createdAt);
  return notif;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  tableDensity: 'comfortable',
  defaultLandingTab: 'dashboard',
  toastNotifications: true,
  approvalAlerts: true,
};

export const DEFAULT_WORKSPACE_DEFAULTS: WorkspaceDefaults = {
  organizationName: 'IndSpectora Operations',
  defaultCycleType: 'routine',
  defaultCriticality: 'medium',
  defaultRequirePhoto: true,
};

export function getWorkspaceSetting(key: string): string | null {
  const row = db.prepare(`SELECT value_json FROM workspace_settings WHERE key = ?`).get(key) as
    | { value_json: string }
    | undefined;
  return row ? row.value_json : null;
}

export function setWorkspaceSetting(key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO workspace_settings (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value), new Date().toISOString());
}

export function getWorkspaceSettingBoolean(key: string, fallback = false): boolean {
  const raw = getWorkspaceSetting(key);
  if (raw === null) return fallback;
  try {
    return Boolean(JSON.parse(raw));
  } catch {
    return raw === 'true';
  }
}

export function getWorkspaceDefaults(): WorkspaceDefaults {
  const raw = getWorkspaceSetting('workspace_defaults');
  if (!raw) return { ...DEFAULT_WORKSPACE_DEFAULTS };
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceDefaults>;
    return {
      organizationName:
        typeof parsed.organizationName === 'string' && parsed.organizationName.trim()
          ? parsed.organizationName.trim()
          : DEFAULT_WORKSPACE_DEFAULTS.organizationName,
      defaultCycleType:
        parsed.defaultCycleType === 'routine' ||
        parsed.defaultCycleType === 'yearly' ||
        parsed.defaultCycleType === 'eventual'
          ? parsed.defaultCycleType
          : DEFAULT_WORKSPACE_DEFAULTS.defaultCycleType,
      defaultCriticality:
        parsed.defaultCriticality === 'low' ||
        parsed.defaultCriticality === 'medium' ||
        parsed.defaultCriticality === 'high'
          ? parsed.defaultCriticality
          : DEFAULT_WORKSPACE_DEFAULTS.defaultCriticality,
      defaultRequirePhoto:
        typeof parsed.defaultRequirePhoto === 'boolean'
          ? parsed.defaultRequirePhoto
          : DEFAULT_WORKSPACE_DEFAULTS.defaultRequirePhoto,
    };
  } catch {
    return { ...DEFAULT_WORKSPACE_DEFAULTS };
  }
}

export function setWorkspaceDefaults(input: Partial<WorkspaceDefaults>): WorkspaceDefaults {
  const cur = getWorkspaceDefaults();
  const next: WorkspaceDefaults = {
    organizationName:
      typeof input.organizationName === 'string' && input.organizationName.trim()
        ? input.organizationName.trim().slice(0, 80)
        : cur.organizationName,
    defaultCycleType:
      input.defaultCycleType === 'routine' ||
      input.defaultCycleType === 'yearly' ||
      input.defaultCycleType === 'eventual'
        ? input.defaultCycleType
        : cur.defaultCycleType,
    defaultCriticality:
      input.defaultCriticality === 'low' ||
      input.defaultCriticality === 'medium' ||
      input.defaultCriticality === 'high'
        ? input.defaultCriticality
        : cur.defaultCriticality,
    defaultRequirePhoto:
      typeof input.defaultRequirePhoto === 'boolean'
        ? input.defaultRequirePhoto
        : cur.defaultRequirePhoto,
  };
  setWorkspaceSetting('workspace_defaults', next);
  return next;
}

export function getUserPreferences(userId?: string): UserPreferences {
  if (!userId) return { ...DEFAULT_USER_PREFERENCES };
  const row = db.prepare(`SELECT * FROM user_preferences WHERE user_id = ?`).get(userId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return { ...DEFAULT_USER_PREFERENCES };
  const density: TableDensity = row.table_density === 'compact' ? 'compact' : 'comfortable';
  const landing: LandingTabPreference =
    row.default_landing_tab === 'inspections' ||
    row.default_landing_tab === 'library' ||
    row.default_landing_tab === 'gantt'
      ? (row.default_landing_tab as LandingTabPreference)
      : 'dashboard';
  return {
    tableDensity: density,
    defaultLandingTab: landing,
    toastNotifications: Boolean(row.toast_notifications),
    approvalAlerts: Boolean(row.approval_alerts),
  };
}

export function setUserPreferences(
  userId: string,
  patch: Partial<UserPreferences>
): UserPreferences {
  const cur = getUserPreferences(userId);
  const next: UserPreferences = {
    tableDensity:
      patch.tableDensity === 'compact' || patch.tableDensity === 'comfortable'
        ? patch.tableDensity
        : cur.tableDensity,
    defaultLandingTab:
      patch.defaultLandingTab === 'dashboard' ||
      patch.defaultLandingTab === 'inspections' ||
      patch.defaultLandingTab === 'library' ||
      patch.defaultLandingTab === 'gantt'
        ? patch.defaultLandingTab
        : cur.defaultLandingTab,
    toastNotifications:
      typeof patch.toastNotifications === 'boolean'
        ? patch.toastNotifications
        : cur.toastNotifications,
    approvalAlerts:
      typeof patch.approvalAlerts === 'boolean' ? patch.approvalAlerts : cur.approvalAlerts,
  };
  db.prepare(
    `INSERT INTO user_preferences (user_id, table_density, default_landing_tab, toast_notifications, approval_alerts, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       table_density = excluded.table_density,
       default_landing_tab = excluded.default_landing_tab,
       toast_notifications = excluded.toast_notifications,
       approval_alerts = excluded.approval_alerts,
       updated_at = excluded.updated_at`
  ).run(
    userId,
    next.tableDensity,
    next.defaultLandingTab,
    next.toastNotifications ? 1 : 0,
    next.approvalAlerts ? 1 : 0,
    new Date().toISOString()
  );
  return next;
}

function countByMock(table: string): { manual: number; mock: number } {
  const rows = db
    .prepare(`SELECT COALESCE(is_mock, 0) AS is_mock, COUNT(*) AS cnt FROM ${table} GROUP BY COALESCE(is_mock, 0)`)
    .all() as { is_mock: number; cnt: number }[];
  let manual = 0;
  let mock = 0;
  for (const r of rows) {
    if (Number(r.is_mock) === 1) mock += Number(r.cnt);
    else manual += Number(r.cnt);
  }
  return { manual, mock };
}

export function getDeveloperSettingsState(): DeveloperSettingsState {
  const zones = countByMock('facility_areas');
  const assets = countByMock('library_items');
  const projects = countByMock('projects');
  const tasks = countByMock('project_tasks');
  const reports = countByMock('inspection_reports');
  const users = countByMock('users');

  const counts: DeveloperDatasetCounts = {
    manualZones: zones.manual,
    mockZones: zones.mock,
    manualAssets: assets.manual,
    mockAssets: assets.mock,
    manualProjects: projects.manual,
    mockProjects: projects.mock,
    manualTasks: tasks.manual,
    mockTasks: tasks.mock,
    manualReports: reports.manual,
    mockReports: reports.mock,
    manualUsers: users.manual,
    mockUsers: users.mock,
  };

  const developerMode = getWorkspaceSettingBoolean('developer_mode', false);
  const mockDataEnabled = getWorkspaceSettingBoolean('mock_data_enabled', false);
  const loginTemplatesEnabled =
    developerMode && getWorkspaceSettingBoolean('login_templates_enabled', false);

  return {
    developerMode,
    mockDataEnabled,
    loginTemplatesEnabled,
    counts,
  };
}

export function getFullReportById(reportId: string): InspectionReport | null {
  const row = db.prepare(`SELECT * FROM inspection_reports WHERE id = ?`).get(reportId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;

  const entryRows = db
    .prepare(`SELECT * FROM inspection_entries WHERE report_id = ? ORDER BY sort_order ASC`)
    .all(reportId) as Record<string, unknown>[];

  const photoStmt = db.prepare(`SELECT * FROM inspection_photos WHERE entry_id = ? ORDER BY uploaded_at ASC`);
  const pinStmt = db.prepare(`
    SELECT ap.*, pt.wbs_code AS linked_task_wbs, pt.title AS linked_task_title,
           pt.status AS linked_task_status, pt.progress AS linked_task_progress,
           pt.project_id AS linked_project_id, prj.name AS linked_project_name
    FROM asset_pins ap
    LEFT JOIN project_tasks pt ON pt.id = ap.linked_task_id
    LEFT JOIN projects prj ON prj.id = pt.project_id
    WHERE ap.library_item_id = ?
    ORDER BY ap.pin_number ASC
  `);
  const pinResultStmt = db.prepare(`SELECT * FROM inspection_pin_results WHERE entry_id = ?`);
  const assetParamStmt = db.prepare(`SELECT * FROM asset_parameters WHERE library_item_id = ? ORDER BY sort_order ASC`);
  const entryParamValStmt = db.prepare(`SELECT * FROM inspection_parameter_values WHERE entry_id = ?`);
  const entryEditHistoryStmt = db.prepare(
    `SELECT * FROM entry_edit_history WHERE entry_id = ? ORDER BY created_at DESC`
  );

  const allReportComments = (
    db.prepare(`SELECT * FROM report_comments WHERE report_id = ? ORDER BY created_at ASC`).all(reportId) as Record<
      string,
      unknown
    >[]
  ).map(
    (c): ReportComment => ({
      id: String(c.id),
      reportId: String(c.report_id),
      entryId: c.entry_id ? String(c.entry_id) : null,
      authorId: c.author_id ? String(c.author_id) : null,
      authorName: String(c.author_name),
      authorRoles: normalizeRoles(c.author_roles_json, 'user'),
      body: String(c.body),
      createdAt: String(c.created_at),
    })
  );

  const approvalSteps: ReportApprovalStep[] = (
    db
      .prepare(`SELECT * FROM report_approval_steps WHERE report_id = ? ORDER BY step_order ASC`)
      .all(reportId) as Record<string, unknown>[]
  ).map((s) => ({
    id: String(s.id),
    reportId: String(s.report_id),
    stepOrder: Number(s.step_order),
    approverId: String(s.approver_id),
    approverName: String(s.approver_name),
    approverTitle: String(s.approver_title),
    status: String(s.status) as ApprovalStepStatus,
    decisionNote: String(s.decision_note),
    actedAt: s.acted_at ? String(s.acted_at) : null,
  }));

  const footprints: ReportFootprint[] = (
    db
      .prepare(`SELECT * FROM report_footprints WHERE report_id = ? ORDER BY created_at DESC`)
      .all(reportId) as Record<string, unknown>[]
  ).map((fp) => ({
    id: String(fp.id),
    reportId: String(fp.report_id),
    actorId: fp.actor_id ? String(fp.actor_id) : null,
    actorName: String(fp.actor_name),
    actorRoles: normalizeRoles(fp.actor_roles_json, 'user'),
    action: String(fp.action),
    summary: String(fp.summary),
    createdAt: String(fp.created_at),
  }));

  const entries: InspectionEntry[] = entryRows.map((er) => {
    const entryId = String(er.id);
    const libraryItemId = String(er.library_item_id);

    const photos = (photoStmt.all(entryId) as Record<string, unknown>[]).map(
      (pr): InspectionPhoto => ({
        id: String(pr.id),
        entryId: String(pr.entry_id),
        pinId: pr.pin_id ? String(pr.pin_id) : null,
        fileUrl: String(pr.file_url),
        fileName: String(pr.file_name),
        caption: String(pr.caption),
        uploadedAt: String(pr.uploaded_at),
      })
    );

    const libItem = db
      .prepare(`SELECT drawing_url, facility_area_name FROM library_items WHERE id = ?`)
      .get(libraryItemId) as { drawing_url: string | null; facility_area_name?: string } | undefined;

    const pinResultRows = pinResultStmt.all(entryId) as Record<string, unknown>[];
    const resultByPinId = new Map<string, InspectionPinResult>();
    for (const rr of pinResultRows) {
      resultByPinId.set(String(rr.pin_id), {
        id: String(rr.id),
        entryId: String(rr.entry_id),
        pinId: String(rr.pin_id),
        condition: String(rr.condition) as ConditionStatus,
        notes: String(rr.notes),
        updatedBy: String(rr.updated_by),
        updatedAt: String(rr.updated_at),
      });
    }

    const visualPins: EntryVisualPin[] = (pinStmt.all(libraryItemId) as Record<string, unknown>[]).map((pr) => {
      const pinId = String(pr.id);
      return {
        id: pinId,
        libraryItemId: String(pr.library_item_id),
        pinNumber: Number(pr.pin_number),
        label: String(pr.label),
        guidance: String(pr.guidance),
        xPercent: Number(pr.x_percent),
        yPercent: Number(pr.y_percent),
        linkedTaskId: pr.linked_task_id && pr.linked_task_title ? String(pr.linked_task_id) : null,
        linkedTaskWbs: pr.linked_task_wbs ? String(pr.linked_task_wbs) : null,
        linkedTaskTitle: pr.linked_task_title ? String(pr.linked_task_title) : null,
        linkedTaskStatus: pr.linked_task_status ? (String(pr.linked_task_status) as TaskStatus) : null,
        linkedTaskProgress:
          pr.linked_task_progress !== null && pr.linked_task_progress !== undefined
            ? Number(pr.linked_task_progress)
            : null,
        linkedProjectId: pr.linked_project_id ? String(pr.linked_project_id) : null,
        linkedProjectName: pr.linked_project_name ? String(pr.linked_project_name) : null,
        updatedAt: String(pr.updated_at),
        result: resultByPinId.get(pinId) ?? null,
        photos: photos.filter((p) => p.pinId === pinId),
      };
    });

    // Hydrate custom parameter values: merge recorded values + live asset parameters so missing values show up
    const storedVals = entryParamValStmt.all(entryId) as Record<string, unknown>[];
    const storedByParamId = new Map<string, InspectionParameterValue>();
    for (const sv of storedVals) {
      storedByParamId.set(String(sv.parameter_id), {
        id: String(sv.id),
        entryId: String(sv.entry_id),
        parameterId: String(sv.parameter_id),
        label: String(sv.label),
        paramType: String(sv.param_type) as CustomParameterType,
        unit: String(sv.unit),
        valueText: String(sv.value_text),
        updatedBy: String(sv.updated_by),
        updatedAt: String(sv.updated_at),
      });
    }

    const assetParams = assetParamStmt.all(libraryItemId) as Record<string, unknown>[];
    const parameterValues: InspectionParameterValue[] = [];
    const seenParamIds = new Set<string>();
    for (const ap of assetParams) {
      const pId = String(ap.id);
      seenParamIds.add(pId);
      const existingVal = storedByParamId.get(pId);
      if (existingVal) {
        parameterValues.push(existingVal);
      } else {
        parameterValues.push({
          id: `virt_${entryId}_${pId}`,
          entryId,
          parameterId: pId,
          label: String(ap.label),
          paramType: String(ap.param_type) as CustomParameterType,
          unit: String(ap.unit),
          valueText: '',
          updatedBy: '',
          updatedAt: String(er.updated_at),
        });
      }
    }
    for (const [pId, sv] of storedByParamId.entries()) {
      if (!seenParamIds.has(pId)) {
        parameterValues.push(sv);
      }
    }

    const editHistory: EntryEditHistoryItem[] = (
      entryEditHistoryStmt.all(entryId) as Record<string, unknown>[]
    ).map((eh) => ({
      id: String(eh.id),
      entryId: String(eh.entry_id),
      reportId: String(eh.report_id),
      actorName: String(eh.actor_name),
      actorRoles: normalizeRoles(eh.actor_roles_json, 'user'),
      fieldName: String(eh.field_name),
      oldValue: String(eh.old_value),
      newValue: String(eh.new_value),
      summary: String(eh.summary),
      createdAt: String(eh.created_at),
    }));

    return {
      id: entryId,
      reportId: String(er.report_id),
      libraryItemId,
      itemCode: String(er.item_code),
      itemTitle: String(er.item_title),
      category: String(er.category),
      criteria: String(er.criteria),
      facilityAreaName: String(er.facility_area_name || libItem?.facility_area_name || ''),
      requirePhoto: Boolean(er.require_photo),
      criticality: String(er.criticality) as CriticalityLevel,
      condition: String(er.condition) as ConditionStatus,
      conditionNote: String(er.condition_note),
      itemRemarks: String(er.item_remarks),
      drawingUrl: libItem?.drawing_url ? String(libItem.drawing_url) : null,
      visualPins,
      photos,
      parameterValues,
      comments: allReportComments.filter((c) => c.entryId === entryId),
      editHistory,
      updatedAt: String(er.updated_at),
    };
  });

  return {
    id: String(row.id),
    reportNumber: String(row.report_number),
    title: String(row.title),
    cycleType: String(row.cycle_type) as CycleType,
    facilityArea: String(row.facility_area),
    inspectorId: row.inspector_id ? String(row.inspector_id) : null,
    inspectorName: String(row.inspector_name),
    inspectorTitle: String(row.inspector_title),
    status: String(row.status) as ReportStatus,
    overallCondition: String(row.overall_condition) as ConditionStatus,
    summaryNotes: String(row.summary_notes),
    createdAt: String(row.created_at),
    submittedAt: row.submitted_at ? String(row.submitted_at) : null,
    updatedAt: String(row.updated_at),
    entries,
    approvalSteps,
    comments: allReportComments.filter((c) => c.entryId === null),
    footprints,
    isMock: Boolean(row.is_mock),
  };
}

export function getBootstrapData(userId?: string): BootstrapPayload {
  const allPins = (
    db
      .prepare(
        `SELECT ap.*, pt.wbs_code AS linked_task_wbs, pt.title AS linked_task_title,
                pt.status AS linked_task_status, pt.progress AS linked_task_progress,
                pt.project_id AS linked_project_id, prj.name AS linked_project_name
         FROM asset_pins ap
         LEFT JOIN project_tasks pt ON pt.id = ap.linked_task_id
         LEFT JOIN projects prj ON prj.id = pt.project_id
         ORDER BY ap.pin_number ASC`
      )
      .all() as Record<string, unknown>[]
  ).map(
    (r): AssetPin => ({
      id: String(r.id),
      libraryItemId: String(r.library_item_id),
      pinNumber: Number(r.pin_number),
      label: String(r.label),
      guidance: String(r.guidance),
      xPercent: Number(r.x_percent),
      yPercent: Number(r.y_percent),
      linkedTaskId: r.linked_task_id && r.linked_task_title ? String(r.linked_task_id) : null,
      linkedTaskWbs: r.linked_task_wbs ? String(r.linked_task_wbs) : null,
      linkedTaskTitle: r.linked_task_title ? String(r.linked_task_title) : null,
      linkedTaskStatus: r.linked_task_status ? (String(r.linked_task_status) as TaskStatus) : null,
      linkedTaskProgress:
        r.linked_task_progress !== null && r.linked_task_progress !== undefined
          ? Number(r.linked_task_progress)
          : null,
      linkedProjectId: r.linked_project_id ? String(r.linked_project_id) : null,
      linkedProjectName: r.linked_project_name ? String(r.linked_project_name) : null,
      updatedAt: String(r.updated_at),
    })
  );
  const pinsByAsset = new Map<string, AssetPin[]>();
  for (const pin of allPins) {
    const list = pinsByAsset.get(pin.libraryItemId) ?? [];
    list.push(pin);
    pinsByAsset.set(pin.libraryItemId, list);
  }

  const allParams = (
    db.prepare(`SELECT * FROM asset_parameters ORDER BY sort_order ASC, label ASC`).all() as Record<
      string,
      unknown
    >[]
  ).map(
    (r): AssetParameter => ({
      id: String(r.id),
      libraryItemId: String(r.library_item_id),
      label: String(r.label),
      paramType: String(r.param_type) as CustomParameterType,
      unit: String(r.unit),
      isRequired: Boolean(r.is_required),
      sortOrder: Number(r.sort_order),
      updatedAt: String(r.updated_at),
    })
  );
  const paramsByAsset = new Map<string, AssetParameter[]>();
  for (const param of allParams) {
    const list = paramsByAsset.get(param.libraryItemId) ?? [];
    list.push(param);
    paramsByAsset.set(param.libraryItemId, list);
  }

  const facilityAreas = (
    db.prepare(`SELECT * FROM facility_areas ORDER BY code ASC, name ASC`).all() as Record<string, unknown>[]
  ).map(
    (r): FacilityArea => ({
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      building: String(r.building),
      riskLevel: String(r.risk_level) as CriticalityLevel,
      description: String(r.description),
      isActive: Boolean(r.is_active),
      isMock: Boolean(r.is_mock),
      updatedAt: String(r.updated_at),
    })
  );
  const facById = new Map(facilityAreas.map((f) => [f.id, f]));

  const libraryItems = (
    db.prepare(`SELECT * FROM library_items ORDER BY sort_order ASC, code ASC`).all() as Record<string, unknown>[]
  ).map((r): LibraryItem => {
    const facId = r.facility_area_id ? String(r.facility_area_id) : null;
    const matchedFac = facId ? facById.get(facId) : undefined;
    const facLabel = matchedFac
      ? `${matchedFac.code} — ${matchedFac.name}`
      : String(r.facility_area_name ?? '');
    return {
      id: String(r.id),
      code: String(r.code),
      category: String(r.category),
      title: String(r.title),
      description: String(r.description),
      criteria: String(r.criteria),
      facilityAreaId: matchedFac ? matchedFac.id : facId,
      facilityAreaName: facLabel,
      cycleType: r.cycle_type ? (String(r.cycle_type) as CycleType) : null,
      requirePhoto: Boolean(r.require_photo),
      criticality: String(r.criticality) as CriticalityLevel,
      sortOrder: Number(r.sort_order),
      isActive: Boolean(r.is_active),
      drawingUrl: r.drawing_url ? String(r.drawing_url) : null,
      pins: pinsByAsset.get(String(r.id)) ?? [],
      parameters: paramsByAsset.get(String(r.id)) ?? [],
      isMock: Boolean(r.is_mock),
      updatedAt: String(r.updated_at),
    };
  });

  const reportIds = (
    db.prepare(`SELECT id FROM inspection_reports ORDER BY created_at DESC`).all() as { id: string }[]
  ).map((r) => r.id);

  const reports = reportIds
    .map((id) => getFullReportById(id))
    .filter((r): r is InspectionReport => r !== null);

  const projects = (
    db.prepare(`SELECT * FROM projects ORDER BY created_at DESC`).all() as Record<string, unknown>[]
  ).map(
    (r): Project => ({
      id: String(r.id),
      name: String(r.name),
      code: String(r.code),
      description: String(r.description),
      cycleType: String(r.cycle_type) as CycleType,
      startDate: String(r.start_date),
      endDate: String(r.end_date),
      useWbs: r.use_wbs === undefined || r.use_wbs === null ? true : Boolean(r.use_wbs),
      createdAt: String(r.created_at),
    })
  );

  const users = (
    db
      .prepare(`SELECT id, name, email, role, roles_json, title, is_mock, created_at FROM users ORDER BY name ASC`)
      .all() as Record<string, unknown>[]
  ).map(mapUserRow);
  const userById = new Map(users.map((u) => [u.id, u]));

  const tasks = (
    db.prepare(`SELECT * FROM project_tasks ORDER BY sort_order ASC, start_date ASC`).all() as Record<string, unknown>[]
  ).map((r): ProjectTask => {
    const assigneeId = r.assignee_id ? String(r.assignee_id) : null;
    const matchedUser = assigneeId ? userById.get(assigneeId) : undefined;
    return {
      id: String(r.id),
      projectId: String(r.project_id),
      parentId: r.parent_id ? String(r.parent_id) : null,
      wbsCode: String(r.wbs_code),
      title: String(r.title),
      taskType: String(r.task_type) as TaskType,
      assigneeId,
      assigneeName: matchedUser ? matchedUser.name : String(r.assignee_name),
      startDate: String(r.start_date),
      endDate: String(r.end_date),
      progress: Number(r.progress),
      status: String(r.status) as TaskStatus,
      manualOverride: Boolean(r.manual_override),
      linkedCycle: String(r.linked_cycle) as CycleType | 'none',
      notes: String(r.notes),
      sortOrder: Number(r.sort_order),
      isMock: Boolean(r.is_mock),
      updatedAt: String(r.updated_at),
    };
  });

  const blockers = (
    db.prepare(`SELECT * FROM task_blockers ORDER BY created_at ASC`).all() as Record<string, unknown>[]
  ).map(
    (r): TaskBlocker => ({
      id: String(r.id),
      projectId: String(r.project_id),
      blockerTaskId: String(r.blocker_task_id),
      blockedTaskId: String(r.blocked_task_id),
      dependencyType: String(r.dependency_type) as DependencyType,
      blockerReason: String(r.blocker_reason),
      isResolved: Boolean(r.is_resolved),
      createdAt: String(r.created_at),
    })
  );

  const taskHistory = (
    db.prepare(`SELECT * FROM task_history ORDER BY created_at DESC`).all() as Record<string, unknown>[]
  ).map(
    (r): TaskHistoryEntry => ({
      id: String(r.id),
      taskId: String(r.task_id),
      projectId: String(r.project_id),
      actorName: String(r.actor_name),
      actorRole: normalizeRoleValue(r.actor_role),
      fieldName: String(r.field_name),
      oldValue: String(r.old_value),
      newValue: String(r.new_value),
      summary: String(r.summary),
      createdAt: String(r.created_at),
    })
  );

  const taskComments = (
    db.prepare(`SELECT * FROM task_comments ORDER BY created_at ASC`).all() as Record<string, unknown>[]
  ).map(
    (r): TaskComment => ({
      id: String(r.id),
      taskId: String(r.task_id),
      projectId: String(r.project_id),
      authorId: r.author_id ? String(r.author_id) : null,
      authorName: String(r.author_name),
      authorRole: normalizeRoleValue(r.author_role),
      body: String(r.body),
      createdAt: String(r.created_at),
    })
  );

  const activityLogs = (
    db.prepare(`SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 30`).all() as Record<string, unknown>[]
  ).map(
    (r): ActivityLog => ({
      id: String(r.id),
      actorName: String(r.actor_name),
      actorRole: normalizeRoleValue(r.actor_role),
      eventType: String(r.event_type),
      summary: String(r.summary),
      createdAt: String(r.created_at),
    })
  );

  const notifications: UserNotification[] = userId
    ? (
        db
          .prepare(`SELECT * FROM user_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`)
          .all(userId) as Record<string, unknown>[]
      ).map((r) => ({
        id: String(r.id),
        userId: String(r.user_id),
        type: String(r.type) as NotificationType,
        reportId: String(r.report_id),
        reportNumber: String(r.report_number),
        title: String(r.title),
        message: String(r.message),
        isRead: Boolean(r.is_read),
        createdAt: String(r.created_at),
      }))
    : [];

  const completedTours: TourPageKey[] = userId
    ? (
        db.prepare(`SELECT page_key FROM user_tour_progress WHERE user_id = ?`).all(userId) as {
          page_key: string;
        }[]
      ).map((r) => String(r.page_key) as TourPageKey)
    : [];

  return {
    libraryItems,
    facilityAreas,
    reports,
    projects,
    tasks,
    blockers,
    taskHistory,
    taskComments,
    activityLogs,
    users,
    notifications,
    completedTours,
    userPreferences: getUserPreferences(userId),
    workspaceDefaults: getWorkspaceDefaults(),
    developerState: getDeveloperSettingsState(),
  };
}

export function mapUserRow(row: Record<string, unknown>): User {
  const roles = normalizeRoles(row.roles_json, row.role);
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: getPrimaryRole(roles),
    roles,
    title: String(row.title ?? ''),
    isMock: Boolean(row.is_mock),
    createdAt: String(row.created_at),
  };
}
