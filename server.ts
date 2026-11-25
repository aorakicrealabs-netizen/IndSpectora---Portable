/**
 * IndSpectora — Inspection & Project Operations Server
 * @author Aoraki CreaLabs
 */
import 'dotenv/config';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { WebSocket, WebSocketServer } from 'ws';
import {
  getDataDir,
  getPortableExecutablePath,
  isPortableExeRuntime,
  isPortableExecutableReady,
  readSeaAssetBuffer,
} from './server/portablePaths.ts';
import {
  UPLOADS_DIR,
  createId,
  createNotification,
  db,
  getBootstrapData,
  getDeveloperSettingsState,
  getFullReportById,
  getPrimaryRole,
  getUserPreferences,
  getWorkspaceDefaults,
  getWorkspaceSettingBoolean,
  hasAnyNonMockAdminUser,
  hashPassword,
  initSchema,
  logActivity,
  mapUserRow,
  normalizeRoles,
  recordEntryEditHistory,
  recordReportFootprint,
  seedDatabaseIfEmpty,
  setUserPreferences,
  setWorkspaceDefaults,
  setWorkspaceSetting,
  verifyPassword,
} from './server/db.ts';
import {
  cleanupDevDemoUsersIfMockOff,
  ensureDevDemoUsers,
  purgeMockData,
  seedMockData,
} from './server/mockData.ts';
import type {
  ActivityLog,
  ConditionStatus,
  CriticalityLevel,
  CustomParameterType,
  CycleType,
  DemoAccountSummary,
  DependencyType,
  RealtimeEventType,
  RealtimeMessage,
  TaskStatus,
  TaskType,
  TourPageKey,
  User,
  UserRole,
} from './src/types.ts';

initSchema();
seedDatabaseIfEmpty();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

app.use(express.json({ limit: '15mb' }));
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    setHeaders: (res, filePath) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (filePath.toLowerCase().endsWith('.svg')) {
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; style-src 'unsafe-inline'"
        );
      }
    },
  })
);

const ALLOWED_UPLOAD_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.bmp',
  '.avif',
  '.heic',
  '.heif',
  '.tif',
  '.tiff',
]);

function resolveUploadExtension(file: Express.Multer.File): string {
  const rawExt = path.extname(file.originalname || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  if (ALLOWED_UPLOAD_EXTS.has(rawExt)) {
    return rawExt;
  }
  const mime = (file.mimetype || '').toLowerCase();
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/svg+xml') return '.svg';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'image/bmp') return '.bmp';
  if (mime === 'image/avif') return '.avif';
  if (mime === 'image/heic') return '.heic';
  if (mime === 'image/heif') return '.heif';
  return '.jpg';
}

function sanitizeUploadedSvg(file: Express.Multer.File | undefined): boolean {
  if (!file) return true;
  const ext = path.extname(file.filename).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  if (ext !== '.svg' && mime !== 'image/svg+xml') {
    return true;
  }
  try {
    const raw = fs.readFileSync(file.path, 'utf8');
    if (!/<svg[\s>]/i.test(raw)) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return false;
    }
    const cleaned = raw
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<script[^>]*\/>/gi, '')
      .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s(xlink:href|href)\s*=\s*(["'])\s*(?:javascript|vbscript):[\s\S]*?\2/gi, '');
    fs.writeFileSync(file.path, cleaned, 'utf8');
    return true;
  } catch {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    return false;
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const safeExt = resolveUploadExtension(file);
    cb(null, `insp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    const isImageMime = mime.startsWith('image/');
    const isFallbackMimeWithValidExt =
      (!mime ||
        mime === 'application/octet-stream' ||
        mime === 'text/xml' ||
        mime === 'application/xml') &&
      ALLOWED_UPLOAD_EXTS.has(ext);
    if (isImageMime || isFallbackMimeWithValidExt) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Unsupported file "${file.originalname}". Permitted formats: PNG, JPG, WebP, SVG, GIF, and HEIC.`
        )
      );
    }
  },
});

interface AuthenticatedRequest extends Request {
  user?: User;
  sessionToken?: string;
}

function userHasAnyRole(user: User | undefined, ...required: UserRole[]): boolean {
  if (!user) return false;
  const roles = user.roles.length > 0 ? user.roles : [user.role];
  return required.some((r) => roles.includes(r));
}

function getSessionUser(token: string | undefined): User | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, new Date().toISOString()) as Record<string, unknown> | undefined;
  return row ? mapUserRow(row) : null;
}

const SESSION_COOKIE_NAME = 'indspectora_sid';

function parseSessionCookie(req: Request): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === SESSION_COOKIE_NAME) {
      const val = part.slice(idx + 1).trim();
      return val ? decodeURIComponent(val) : undefined;
    }
  }
  return undefined;
}

function isHttpsRequest(req: Request): boolean {
  const forwarded = String(req.headers['x-forwarded-proto'] ?? '').toLowerCase();
  return req.secure || forwarded.includes('https');
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'Max-Age=604800',
  ];
  if (isHttpsRequest(req)) {
    attrs.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    attrs.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(req: Request, res: Response): void {
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/',
    'Max-Age=0',
  ];
  if (isHttpsRequest(req)) {
    attrs.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    attrs.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function extractToken(req: Request, allowCookie = false): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (allowCookie) {
    return parseSessionCookie(req);
  }
  return undefined;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req, false);
  const user = getSessionUser(token);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  req.user = user;
  req.sessionToken = token;
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!userHasAnyRole(req.user, 'admin')) {
    res.status(403).json({ error: 'Administrator privileges required for this action.' });
    return;
  }
  next();
}

function requireAssetEditor(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!userHasAnyRole(req.user, 'admin', 'approver')) {
    res.status(403).json({ error: 'Admin or Approver role is required to edit Asset Library & Facility Zones.' });
    return;
  }
  next();
}

function requireProjectManager(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!userHasAnyRole(req.user, 'admin', 'approver')) {
    res.status(403).json({ error: 'Admin or Approver role is required to create or manage Projects.' });
    return;
  }
  next();
}

const activeClients = new Set<WebSocket>();

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname !== '/ws') {
    return;
  }
  const token = url.searchParams.get('token') ?? undefined;
  const user = getSessionUser(token);
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  activeClients.add(ws);
  const welcome: RealtimeMessage = {
    type: 'connected',
    timestamp: new Date().toISOString(),
  };
  ws.send(JSON.stringify(welcome));

  ws.on('close', () => {
    activeClients.delete(ws);
  });
  ws.on('error', () => {
    activeClients.delete(ws);
  });
});

function broadcastRealtime(
  type: RealtimeEventType,
  summary?: string,
  activityLog?: ActivityLog,
  targetUserId?: string
): void {
  const msg: RealtimeMessage = {
    type,
    summary,
    activityLog,
    targetUserId,
    timestamp: new Date().toISOString(),
  };
  const serialized = JSON.stringify(msg);
  for (const client of activeClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serialized);
    }
  }
}

function bootstrapFor(req: AuthenticatedRequest) {
  return getBootstrapData(req.user?.id);
}

// --- Auth & First-Run Setup Routes ---

app.get('/api/auth/status', (_req: Request, res: Response) => {
  const needsFirstAdminSetup = !hasAnyNonMockAdminUser();
  const developerMode = getWorkspaceSettingBoolean('developer_mode', false);
  const loginTemplatesEnabled =
    !needsFirstAdminSetup &&
    developerMode &&
    getWorkspaceSettingBoolean('login_templates_enabled', false);

  let demoAccounts: DemoAccountSummary[] = [];
  if (loginTemplatesEnabled) {
    ensureDevDemoUsers();
    const rows = db
      .prepare(
        `SELECT id, name, email, title, role, roles_json
         FROM users
         WHERE COALESCE(is_mock, 0) = 1
         ORDER BY created_at ASC`
      )
      .all() as {
      id: string;
      name: string;
      email: string;
      title: string;
      role: string;
      roles_json: string;
    }[];

    demoAccounts = rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        title: row.title,
        roles: normalizeRoles(row.roles_json, row.role),
      }))
      .filter((acc) => !acc.roles.includes('admin'));
  }

  res.json({
    needsFirstAdminSetup,
    loginTemplatesEnabled,
    demoAccounts,
    portableExeMode: isPortableExeRuntime(),
    portableExeAvailable: !isPortableExeRuntime() && isPortableExecutableReady(),
  });
});

const PORTABLE_CHUNK_SIZE = 6 * 1024 * 1024;

app.get('/api/portable/manifest', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  if (isPortableExeRuntime()) {
    res.json({ available: false, filename: 'IndSpectora-Portable.exe', sizeBytes: 0, chunkSize: PORTABLE_CHUNK_SIZE, totalChunks: 0 });
    return;
  }
  const exePath = getPortableExecutablePath();
  if (!fs.existsSync(exePath)) {
    res.json({ available: false, filename: 'IndSpectora-Portable.exe', sizeBytes: 0, chunkSize: PORTABLE_CHUNK_SIZE, totalChunks: 0 });
    return;
  }
  const sizeBytes = fs.statSync(exePath).size;
  const totalChunks = Math.ceil(sizeBytes / PORTABLE_CHUNK_SIZE);
  res.json({
    available: true,
    filename: 'IndSpectora-Portable.exe',
    sizeBytes,
    chunkSize: PORTABLE_CHUNK_SIZE,
    totalChunks,
  });
});

app.get('/api/portable/chunk/:index', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const exePath = getPortableExecutablePath();
  if (isPortableExeRuntime() || !fs.existsSync(exePath)) {
    res.status(404).json({ error: 'Portable Windows executable is not built yet.' });
    return;
  }
  const idx = Number.parseInt(String(req.params.index), 10);
  const sizeBytes = fs.statSync(exePath).size;
  const totalChunks = Math.ceil(sizeBytes / PORTABLE_CHUNK_SIZE);
  if (!Number.isFinite(idx) || idx < 0 || idx >= totalChunks) {
    res.status(400).json({ error: 'Invalid chunk index.' });
    return;
  }
  const start = idx * PORTABLE_CHUNK_SIZE;
  const length = Math.min(PORTABLE_CHUNK_SIZE, sizeBytes - start);
  const buf = Buffer.allocUnsafe(length);
  const fd = fs.openSync(exePath, 'r');
  try {
    fs.readSync(fd, buf, 0, length, start);
  } finally {
    fs.closeSync(fd);
  }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', String(length));
  res.send(buf);
});

app.get('/api/portable/download', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const exePath = getPortableExecutablePath();
  if (isPortableExeRuntime() || !fs.existsSync(exePath)) {
    res.status(404).json({
      error: 'Portable Windows executable has not been built yet. Run npm run build:portable on the server.',
    });
    return;
  }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="IndSpectora-Portable.exe"');
  res.sendFile(exePath);
});

app.post('/api/auth/setup-admin', (req: Request, res: Response) => {
  const { name, email, password, title } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    title?: string;
  };

  const cleanName = (name ?? '').trim();
  const cleanEmail = (email ?? '').trim().toLowerCase();
  const cleanTitle = (title ?? '').trim() || 'Operations Administrator';

  if (!cleanName || !cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    res.status(400).json({ error: 'Valid full name and email address are required.' });
    return;
  }
  if (!password || password.length < 8) {
    res.status(400).json({ error: 'Administrator password must be at least 8 characters long.' });
    return;
  }

  type BootstrapOutcome =
    | { ok: true; token: string; user: User }
    | { ok: false; status: number; error: string };

  const runBootstrap = db.transaction((): BootstrapOutcome => {
    if (hasAnyNonMockAdminUser()) {
      return {
        ok: false,
        status: 409,
        error: 'Initial administrator account has already been configured. Please sign in.',
      };
    }

    const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(cleanEmail);
    if (existing) {
      return {
        ok: false,
        status: 409,
        error: 'An account with this email already exists.',
      };
    }

    const userId = createId('usr');
    const now = new Date().toISOString();
    const roles: UserRole[] = ['admin', 'approver'];
    db.prepare(
      `INSERT INTO users (id, name, email, password_hash, role, roles_json, title, is_mock, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).run(
      userId,
      cleanName,
      cleanEmail,
      hashPassword(password),
      'admin',
      JSON.stringify(roles),
      cleanTitle,
      now
    );

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    db.prepare(`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`).run(
      token,
      userId,
      now,
      expiresAt
    );

    const userRow = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as Record<string, unknown>;
    return {
      ok: true,
      token,
      user: mapUserRow(userRow),
    };
  });

  const outcome = runBootstrap();
  if (!outcome.ok) {
    res.status(outcome.status).json({ error: outcome.error });
    return;
  }

  setSessionCookie(req, res, outcome.token);
  const log = logActivity(
    outcome.user.name,
    outcome.user.role,
    'user:admin_bootstrap',
    'Completed first-run initial Administrator setup.'
  );
  broadcastRealtime('state:sync', log.summary, log);

  res.status(201).json({ token: outcome.token, user: outcome.user });
});

app.post('/api/auth/register', (req: Request, res: Response) => {
  if (!hasAnyNonMockAdminUser()) {
    res.status(403).json({
      error: 'Initial Administrator setup must be completed before standard account registration is enabled.',
    });
    return;
  }

  const { name, email, password, title } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    title?: string;
  };

  const cleanName = (name ?? '').trim();
  const cleanEmail = (email ?? '').trim().toLowerCase();
  const cleanTitle = (title ?? '').trim() || 'Field Operator';
  const roles: UserRole[] = ['user'];

  if (!cleanName || !cleanEmail || !password || password.length < 6) {
    res.status(400).json({ error: 'Name, valid email, and password (min 6 characters) are required.' });
    return;
  }

  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(cleanEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const userId = createId('usr');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, roles_json, title, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, cleanName, cleanEmail, hashPassword(password), 'user', JSON.stringify(roles), cleanTitle, now);

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  db.prepare(`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`).run(
    token,
    userId,
    now,
    expiresAt
  );

  const userRow = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as Record<string, unknown>;
  const user = mapUserRow(userRow);
  const log = logActivity(user.name, user.role, 'user:registered', `Registered local User account.`);
  broadcastRealtime('state:sync', log.summary, log);

  setSessionCookie(req, res, token);
  res.status(201).json({ token, user });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  const cleanEmail = (email ?? '').trim().toLowerCase();
  if (!cleanEmail || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const userRow = db.prepare(`SELECT * FROM users WHERE email = ?`).get(cleanEmail) as
    | Record<string, unknown>
    | undefined;
  if (!userRow || !verifyPassword(password, String(userRow.password_hash))) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  db.prepare(`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`).run(
    token,
    String(userRow.id),
    now,
    expiresAt
  );

  setSessionCookie(req, res, token);
  res.json({ token, user: mapUserRow(userRow) });
});

app.post('/api/auth/dev-login', (req: Request, res: Response) => {
  if (!hasAnyNonMockAdminUser()) {
    res.status(403).json({ error: 'Initial Administrator setup must be completed first.' });
    return;
  }
  const developerMode = getWorkspaceSettingBoolean('developer_mode', false);
  const loginTemplatesEnabled = getWorkspaceSettingBoolean('login_templates_enabled', false);
  if (!developerMode || !loginTemplatesEnabled) {
    res.status(403).json({
      error: 'Developer Mode non-admin quick-login is currently disabled by your Administrator.',
    });
    return;
  }

  const { userId } = req.body as { userId?: string };
  const cleanUserId = (userId ?? '').trim();
  if (!cleanUserId) {
    res.status(400).json({ error: 'Demo account userId is required.' });
    return;
  }

  ensureDevDemoUsers();
  const userRow = db.prepare(`SELECT * FROM users WHERE id = ?`).get(cleanUserId) as
    | Record<string, unknown>
    | undefined;
  if (!userRow) {
    res.status(404).json({ error: 'Selected sandbox demo account was not found.' });
    return;
  }
  if (Number(userRow.is_mock ?? 0) !== 1) {
    res.status(403).json({ error: 'Only sandbox demo accounts may use quick-login.' });
    return;
  }
  const roles = normalizeRoles(String(userRow.roles_json ?? '[]'), String(userRow.role ?? 'user'));
  if (roles.includes('admin')) {
    res.status(403).json({
      error: 'Administrator accounts are excluded from quick-login templates for security.',
    });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  db.prepare(`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`).run(
    token,
    String(userRow.id),
    now,
    expiresAt
  );

  const user = mapUserRow(userRow);
  const log = logActivity(
    user.name,
    user.role,
    'user:dev_quick_login',
    `Signed in via Developer Mode non-admin demo access.`
  );
  broadcastRealtime('state:sync', log.summary, log);

  setSessionCookie(req, res, token);
  res.json({ token, user });
});

app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (req.sessionToken) {
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(req.sessionToken);
  }
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  const token = extractToken(req, true);
  const user = getSessionUser(token);
  if (!user || !token) {
    clearSessionCookie(req, res);
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  res.json({ user, token });
});

function normalizeCycleType(value: unknown, fallback: CycleType = 'routine'): CycleType {
  if (value === 'routine' || value === 'yearly' || value === 'eventual') {
    return value;
  }
  return fallback;
}

// --- Bootstrap ---

app.get('/api/bootstrap', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json(bootstrapFor(req));
});

// --- Notifications & Interactive Tours ---

app.post('/api/notifications/mark-read', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id, all } = req.body as { id?: string; all?: boolean };
  if (all) {
    db.prepare(`UPDATE user_notifications SET is_read = 1 WHERE user_id = ?`).run(req.user!.id);
  } else if (id) {
    db.prepare(`UPDATE user_notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).run(id, req.user!.id);
  }
  res.json({ bootstrap: bootstrapFor(req) });
});

const VALID_TOUR_KEYS = new Set<TourPageKey>([
  'dashboard',
  'inspections',
  'library',
  'history',
  'gantt',
  'users',
  'settings',
  'howto',
]);

app.post('/api/tours/:pageKey/complete', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const pageKey = req.params.pageKey as TourPageKey;
  if (!VALID_TOUR_KEYS.has(pageKey)) {
    res.status(400).json({ error: 'Invalid tour page key.' });
    return;
  }
  db.prepare(
    `INSERT INTO user_tour_progress (user_id, page_key, completed_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id, page_key) DO UPDATE SET completed_at = excluded.completed_at`
  ).run(req.user!.id, pageKey, new Date().toISOString());

  res.json({ bootstrap: bootstrapFor(req) });
});

app.delete('/api/tours', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  db.prepare(`DELETE FROM user_tour_progress WHERE user_id = ?`).run(req.user!.id);
  res.json({ bootstrap: bootstrapFor(req) });
});

// --- Self-Service Account, Security & Preferences ---

function hashSessionId(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
}

function listActiveUserSessions(userId: string, currentToken?: string) {
  const now = new Date().toISOString();
  const rows = db
    .prepare(
      `SELECT token, created_at, expires_at FROM sessions
       WHERE user_id = ? AND expires_at > ?
       ORDER BY created_at DESC`
    )
    .all(userId, now) as { token: string; created_at: string; expires_at: string }[];

  return rows.map((r) => ({
    sessionId: hashSessionId(r.token),
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    isCurrent: Boolean(currentToken && r.token === currentToken),
  }));
}

app.patch('/api/account/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { name, title } = req.body as { name?: string; title?: string };
  const cleanName = (name ?? '').trim();
  const cleanTitle = (title ?? '').trim();

  if (!cleanName) {
    res.status(400).json({ error: 'Full name cannot be empty.' });
    return;
  }

  db.prepare(`UPDATE users SET name = ?, title = ? WHERE id = ?`).run(
    cleanName,
    cleanTitle,
    req.user!.id
  );
  db.prepare(`UPDATE project_tasks SET assignee_name = ? WHERE assignee_id = ?`).run(
    cleanName,
    req.user!.id
  );

  const updatedRow = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user!.id) as Record<
    string,
    unknown
  >;
  const updatedUser = mapUserRow(updatedRow);
  const log = logActivity(
    updatedUser.name,
    updatedUser.role,
    'account:profile_updated',
    `Updated personal profile settings.`
  );
  broadcastRealtime('user:changed', undefined, log);

  res.json({ user: updatedUser, bootstrap: bootstrapFor(req) });
});

app.post('/api/account/password', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    res
      .status(400)
      .json({ error: 'Current password and new password (min 6 characters) are required.' });
    return;
  }

  const row = db
    .prepare(`SELECT password_hash FROM users WHERE id = ?`)
    .get(req.user!.id) as { password_hash: string } | undefined;
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    res.status(400).json({ error: 'Current password is incorrect.' });
    return;
  }

  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(
    hashPassword(newPassword),
    req.user!.id
  );
  if (req.sessionToken) {
    db.prepare(`DELETE FROM sessions WHERE user_id = ? AND token != ?`).run(
      req.user!.id,
      req.sessionToken
    );
  }

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'account:password_changed',
    `Changed account password and invalidated other active sessions.`
  );
  res.json({ ok: true, log, sessions: listActiveUserSessions(req.user!.id, req.sessionToken) });
});

app.get('/api/account/sessions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ sessions: listActiveUserSessions(req.user!.id, req.sessionToken) });
});

app.delete(
  '/api/account/sessions/:sessionId',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const { sessionId } = req.params;
    const rows = db
      .prepare(`SELECT token FROM sessions WHERE user_id = ?`)
      .all(req.user!.id) as { token: string }[];
    const match = rows.find((r) => hashSessionId(r.token) === sessionId);
    if (!match) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    if (req.sessionToken && match.token === req.sessionToken) {
      res.status(400).json({ error: 'Use Sign Out to close your current active session.' });
      return;
    }
    db.prepare(`DELETE FROM sessions WHERE token = ? AND user_id = ?`).run(match.token, req.user!.id);
    res.json({ sessions: listActiveUserSessions(req.user!.id, req.sessionToken) });
  }
);

app.delete('/api/account/sessions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (req.sessionToken) {
    db.prepare(`DELETE FROM sessions WHERE user_id = ? AND token != ?`).run(
      req.user!.id,
      req.sessionToken
    );
  }
  res.json({ sessions: listActiveUserSessions(req.user!.id, req.sessionToken) });
});

app.put('/api/account/preferences', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as Partial<{
    tableDensity: 'comfortable' | 'compact';
    defaultLandingTab: 'dashboard' | 'inspections' | 'library' | 'gantt';
    toastNotifications: boolean;
    approvalAlerts: boolean;
  }>;
  const userPreferences = setUserPreferences(req.user!.id, body);
  res.json({ userPreferences, bootstrap: bootstrapFor(req) });
});

// --- Admin Workspace Settings, Backup & Developer Mock Data ---

app.put(
  '/api/admin/workspace-defaults',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const body = req.body as Partial<{
      organizationName: string;
      defaultCycleType: CycleType;
      defaultCriticality: CriticalityLevel;
      defaultRequirePhoto: boolean;
    }>;

    if (body.organizationName !== undefined && !body.organizationName.trim()) {
      res.status(400).json({ error: 'Workspace organization name cannot be empty.' });
      return;
    }

    const workspaceDefaults = setWorkspaceDefaults(body);
    const log = logActivity(
      req.user!.name,
      req.user!.role,
      'settings:workspace_defaults',
      `Updated workspace defaults (${workspaceDefaults.organizationName}).`
    );
    broadcastRealtime('state:sync', log.summary, log);

    res.json({ workspaceDefaults, bootstrap: bootstrapFor(req) });
  }
);

app.get('/api/admin/backup', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const payload = getBootstrapData(req.user!.id);
  const dateTag = new Date().toISOString().slice(0, 10);
  const backup = {
    app: 'IndSpectora',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: {
      id: req.user!.id,
      name: req.user!.name,
      email: req.user!.email,
    },
    workspaceDefaults: payload.workspaceDefaults,
    developerState: payload.developerState,
    data: {
      users: payload.users,
      facilityAreas: payload.facilityAreas,
      libraryItems: payload.libraryItems,
      projects: payload.projects,
      tasks: payload.tasks,
      blockers: payload.blockers,
      taskHistory: payload.taskHistory,
      taskComments: payload.taskComments,
      reports: payload.reports,
      activityLogs: payload.activityLogs,
    },
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="indspectora-backup-${dateTag}.json"`);
  res.send(JSON.stringify(backup, null, 2));
});

app.put(
  '/api/admin/developer-mode',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const { enabled } = req.body as { enabled?: boolean };
    const nextEnabled = Boolean(enabled);
    setWorkspaceSetting('developer_mode', nextEnabled);
    if (!nextEnabled) {
      setWorkspaceSetting('login_templates_enabled', false);
      cleanupDevDemoUsersIfMockOff();
    }
    const developerState = getDeveloperSettingsState();
    broadcastRealtime('state:sync');
    res.json({ developerState, bootstrap: bootstrapFor(req) });
  }
);

app.put(
  '/api/admin/developer-mode/login-templates',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const { enabled } = req.body as { enabled?: boolean };
    const nextEnabled = Boolean(enabled);

    if (nextEnabled && !getWorkspaceSettingBoolean('developer_mode', false)) {
      res.status(400).json({
        error: 'Turn Developer Mode ON before enabling login-page demo access.',
      });
      return;
    }

    setWorkspaceSetting('login_templates_enabled', nextEnabled);
    if (nextEnabled) {
      ensureDevDemoUsers();
    } else {
      cleanupDevDemoUsersIfMockOff();
    }

    const log = logActivity(
      req.user!.name,
      req.user!.role,
      'developer:login_templates_updated',
      nextEnabled
        ? 'Enabled Login Page Non-Admin Quick-Login templates in Developer Mode.'
        : 'Disabled Login Page Non-Admin Quick-Login templates and revoked sandbox sessions.'
    );
    broadcastRealtime('state:sync', log.summary, log);

    res.json({
      developerState: getDeveloperSettingsState(),
      bootstrap: bootstrapFor(req),
    });
  }
);

app.post(
  '/api/admin/mock-data/toggle',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const { enabled } = req.body as { enabled?: boolean };
    const nextEnabled = Boolean(enabled);

    if (nextEnabled) {
      setWorkspaceSetting('developer_mode', true);
      seedMockData(req.user!.id);
      const log = logActivity(
        req.user!.name,
        req.user!.role,
        'developer:mock_enabled',
        'Enabled Developer Mock Data pack (fresh baseline loaded; manual data preserved).'
      );
      broadcastRealtime('state:sync', log.summary, log);
    } else {
      purgeMockData(req.user!.id);
      setWorkspaceSetting('mock_data_enabled', false);
      setWorkspaceSetting('login_templates_enabled', false);
      const log = logActivity(
        req.user!.name,
        req.user!.role,
        'developer:mock_disabled',
        'Disabled Developer Mock Data pack and purged sample & modified mock items.'
      );
      broadcastRealtime('state:sync', log.summary, log);
    }

    res.json({
      developerState: getDeveloperSettingsState(),
      bootstrap: bootstrapFor(req),
    });
  }
);

app.post(
  '/api/admin/mock-data/reset',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    setWorkspaceSetting('developer_mode', true);
    seedMockData(req.user!.id);
    const log = logActivity(
      req.user!.name,
      req.user!.role,
      'developer:mock_reset',
      'Reset Developer Mock Data pack to canonical baseline while preserving manual items.'
    );
    broadcastRealtime('state:sync', log.summary, log);

    res.json({
      developerState: getDeveloperSettingsState(),
      bootstrap: bootstrapFor(req),
    });
  }
);

// --- Admin User Management (Multi-Role Full CRUD) ---

app.post('/api/users', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { name, email, password, role, roles, title } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    roles?: UserRole[];
    title?: string;
  };

  const cleanName = (name ?? '').trim();
  const cleanEmail = (email ?? '').trim().toLowerCase();
  const normalizedRoles = normalizeRoles(roles, role ?? 'user');
  const primaryRole = getPrimaryRole(normalizedRoles);
  const cleanTitle =
    (title ?? '').trim() ||
    (normalizedRoles.includes('admin')
      ? 'Operations Admin'
      : normalizedRoles.includes('approver')
      ? 'Lead Approver'
      : 'Field Operator');

  if (!cleanName || !cleanEmail || !password || password.length < 6) {
    res.status(400).json({ error: 'Name, valid email, and password (min 6 characters) are required.' });
    return;
  }

  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(cleanEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const id = createId('usr');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, roles_json, title, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    cleanName,
    cleanEmail,
    hashPassword(password),
    primaryRole,
    JSON.stringify(normalizedRoles),
    cleanTitle,
    now
  );

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'user:created',
    `Created account for ${cleanName} with roles [${normalizedRoles.join(', ')}].`
  );
  broadcastRealtime('user:changed', log.summary, log);

  res.status(201).json({ id, bootstrap: bootstrapFor(req) });
});

app.patch('/api/users/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'User account not found.' });
    return;
  }

  const body = req.body as Partial<{
    name: string;
    email: string;
    role: string;
    roles: UserRole[];
    title: string;
  }>;

  const currentRoles = normalizeRoles(existing.roles_json, existing.role);
  const nextRoles =
    body.roles !== undefined
      ? normalizeRoles(body.roles)
      : body.role !== undefined
      ? normalizeRoles([body.role])
      : currentRoles;
  const nextPrimaryRole = getPrimaryRole(nextRoles);

  const nextName = body.name !== undefined ? body.name.trim() : String(existing.name);
  const nextEmail = body.email !== undefined ? body.email.trim().toLowerCase() : String(existing.email);
  const nextTitle = body.title !== undefined ? body.title.trim() : String(existing.title);

  if (!nextName || !nextEmail) {
    res.status(400).json({ error: 'Full name and email cannot be empty.' });
    return;
  }

  const dup = db.prepare(`SELECT id FROM users WHERE email = ? AND id != ?`).get(nextEmail, id);
  if (dup) {
    res.status(409).json({ error: 'Another account already uses this email address.' });
    return;
  }

  if (currentRoles.includes('admin') && !nextRoles.includes('admin')) {
    if (req.user!.id === id) {
      res.status(400).json({ error: 'You cannot remove the admin role from your own active account.' });
      return;
    }
    const allUsers = db.prepare(`SELECT id, role, roles_json FROM users`).all() as Record<string, unknown>[];
    const remainingAdmins = allUsers.filter(
      (u) => String(u.id) !== id && normalizeRoles(u.roles_json, u.role).includes('admin')
    );
    if (remainingAdmins.length === 0) {
      res.status(400).json({ error: 'At least one administrator account must remain active.' });
      return;
    }
  }

  db.prepare(`UPDATE users SET name = ?, email = ?, role = ?, roles_json = ?, title = ? WHERE id = ?`).run(
    nextName,
    nextEmail,
    nextPrimaryRole,
    JSON.stringify(nextRoles),
    nextTitle,
    id
  );

  // Sync assignee_name on tasks linked to assignee_id
  db.prepare(`UPDATE project_tasks SET assignee_name = ? WHERE assignee_id = ?`).run(nextName, id);

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'user:updated',
    `Updated ${nextName} (roles: ${nextRoles.join(', ')}).`
  );
  broadcastRealtime('user:changed', log.summary, log);

  res.json({ bootstrap: bootstrapFor(req) });
});

app.post(
  '/api/users/:id/reset-password',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { password } = req.body as { password?: string };
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters long.' });
      return;
    }

    const existing = db.prepare(`SELECT id, name FROM users WHERE id = ?`).get(id) as
      | { id: string; name: string }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hashPassword(password), id);
    if (id !== req.user!.id) {
      db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(id);
    }

    const log = logActivity(
      req.user!.name,
      req.user!.role,
      'user:password_reset',
      `Reset local password for ${existing.name}.`
    );
    broadcastRealtime('user:changed', log.summary, log);

    res.json({ bootstrap: bootstrapFor(req) });
  }
);

app.delete('/api/users/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (id === req.user!.id) {
    res.status(400).json({ error: 'You cannot delete your own active session account.' });
    return;
  }

  const existing = db.prepare(`SELECT id, name, email, role, roles_json FROM users WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'User account not found.' });
    return;
  }

  const existingRoles = normalizeRoles(existing.roles_json, existing.role);
  if (existingRoles.includes('admin')) {
    const allUsers = db.prepare(`SELECT id, role, roles_json FROM users`).all() as Record<string, unknown>[];
    const remainingAdmins = allUsers.filter(
      (u) => String(u.id) !== id && normalizeRoles(u.roles_json, u.role).includes('admin')
    );
    if (remainingAdmins.length === 0) {
      res.status(400).json({ error: 'Cannot delete the last remaining administrator account.' });
      return;
    }
  }

  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(id);
  db.prepare(`DELETE FROM users WHERE id = ?`).run(id);

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'user:deleted',
    `Deleted user account ${String(existing.name)} (${String(existing.email)}).`
  );
  broadcastRealtime('user:changed', log.summary, log);

  res.json({ bootstrap: bootstrapFor(req) });
});

// --- Asset Library & Custom Parameters & CSV Import ---

interface InputAssetParameter {
  id?: string;
  label?: string;
  paramType?: CustomParameterType;
  unit?: string;
  isRequired?: boolean;
}

function syncAssetParameters(libraryItemId: string, params: InputAssetParameter[] | undefined): void {
  if (!Array.isArray(params)) return;
  const now = new Date().toISOString();
  const existingRows = db
    .prepare(`SELECT id FROM asset_parameters WHERE library_item_id = ?`)
    .all(libraryItemId) as { id: string }[];
  const existingIds = new Set(existingRows.map((r) => r.id));
  const keptIds = new Set<string>();

  const updateStmt = db.prepare(
    `UPDATE asset_parameters SET label = ?, param_type = ?, unit = ?, is_required = ?, sort_order = ?, updated_at = ? WHERE id = ?`
  );
  const insertStmt = db.prepare(
    `INSERT INTO asset_parameters (id, library_item_id, label, param_type, unit, is_required, sort_order, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  params.forEach((p, idx) => {
    const cleanLabel = (p.label ?? '').trim();
    if (!cleanLabel) return;
    const paramType: CustomParameterType =
      p.paramType === 'number' || p.paramType === 'boolean' ? p.paramType : 'text';
    const unit = paramType === 'number' ? (p.unit ?? '').trim() : '';
    const isRequired = p.isRequired ? 1 : 0;

    if (p.id && existingIds.has(p.id)) {
      keptIds.add(p.id);
      updateStmt.run(cleanLabel, paramType, unit, isRequired, idx + 1, now, p.id);
    } else {
      const newId = createId('prm');
      keptIds.add(newId);
      insertStmt.run(newId, libraryItemId, cleanLabel, paramType, unit, isRequired, idx + 1, now);
    }
  });

  for (const oldId of existingIds) {
    if (!keptIds.has(oldId)) {
      db.prepare(`DELETE FROM asset_parameters WHERE id = ?`).run(oldId);
    }
  }
}

function resolveFacilityLink(
  facilityAreaId?: string | null,
  fallbackName?: string
): { id: string | null; name: string } {
  if (facilityAreaId && facilityAreaId.trim()) {
    const fac = db
      .prepare(`SELECT id, code, name FROM facility_areas WHERE id = ?`)
      .get(facilityAreaId.trim()) as { id: string; code: string; name: string } | undefined;
    if (fac) {
      return { id: fac.id, name: `${fac.code} — ${fac.name}` };
    }
  }
  return { id: null, name: (fallbackName ?? '').trim() };
}

app.post('/api/library', requireAuth, requireAssetEditor, (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as {
    code?: string;
    category?: string;
    title?: string;
    description?: string;
    criteria?: string;
    facilityAreaId?: string | null;
    facilityAreaName?: string;
    requirePhoto?: boolean;
    criticality?: CriticalityLevel;
    sortOrder?: number;
    isActive?: boolean;
    parameters?: InputAssetParameter[];
  };

  if (!body.code?.trim() || !body.category?.trim() || !body.title?.trim()) {
    res.status(400).json({ error: 'Asset code, category, and title are required.' });
    return;
  }

  const cleanCode = body.code.trim().toUpperCase();
  const facLink = resolveFacilityLink(body.facilityAreaId, body.facilityAreaName);
  const id = createId('lib');
  const now = new Date().toISOString();
  const maxOrderRow = db.prepare(`SELECT COALESCE(MAX(sort_order), 0) as max_order FROM library_items`).get() as {
    max_order: number;
  };

  db.prepare(
    `INSERT INTO library_items
     (id, code, category, title, description, criteria, facility_area_id, facility_area_name, cycle_type, require_photo, criticality, sort_order, is_active, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'routine', ?, ?, ?, ?, ?)`
  ).run(
    id,
    cleanCode,
    body.category.trim(),
    body.title.trim(),
    (body.description ?? '').trim(),
    (body.criteria ?? '').trim(),
    facLink.id,
    facLink.name,
    body.requirePhoto ? 1 : 0,
    body.criticality === 'low' || body.criticality === 'high' ? body.criticality : 'medium',
    typeof body.sortOrder === 'number' ? body.sortOrder : maxOrderRow.max_order + 1,
    body.isActive === false ? 0 : 1,
    now
  );

  syncAssetParameters(id, body.parameters);

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'library:created',
    `Added asset ${cleanCode} — ${body.title.trim()}.`
  );
  broadcastRealtime('library:changed', log.summary, log);

  res.status(201).json({ id, bootstrap: bootstrapFor(req) });
});

app.post('/api/library/import-csv', requireAuth, requireAssetEditor, (req: AuthenticatedRequest, res: Response) => {
  const { rows } = req.body as {
    rows?: {
      code?: string;
      category?: string;
      title?: string;
      facilityCode?: string;
      description?: string;
      criteria?: string;
      criticality?: CriticalityLevel;
      requirePhoto?: boolean;
      isActive?: boolean;
      parameters?: InputAssetParameter[];
    }[];
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: 'No valid CSV asset rows provided for import.' });
    return;
  }

  const facilities = db.prepare(`SELECT id, code, name FROM facility_areas`).all() as {
    id: string;
    code: string;
    name: string;
  }[];
  const facByCode = new Map(facilities.map((f) => [f.code.trim().toUpperCase(), f]));

  const now = new Date().toISOString();
  let createdCount = 0;
  let updatedCount = 0;

  const runImport = db.transaction(() => {
    let maxOrder = (
      db.prepare(`SELECT COALESCE(MAX(sort_order), 0) as max_order FROM library_items`).get() as {
        max_order: number;
      }
    ).max_order;

    for (const row of rows) {
      const cleanCode = (row.code ?? '').trim().toUpperCase();
      const cleanCat = (row.category ?? '').trim();
      const cleanTitle = (row.title ?? '').trim();
      if (!cleanCode || !cleanCat || !cleanTitle) continue;

      const facCode = (row.facilityCode ?? '').trim().toUpperCase();
      const matchedFac = facCode ? facByCode.get(facCode) : undefined;
      const facilityAreaId = matchedFac ? matchedFac.id : null;
      const facilityAreaName = matchedFac ? `${matchedFac.code} — ${matchedFac.name}` : facCode;

      const crit: CriticalityLevel =
        row.criticality === 'low' || row.criticality === 'high' ? row.criticality : 'medium';
      const reqPhoto = row.requirePhoto ? 1 : 0;
      const isActive = row.isActive === false ? 0 : 1;

      const existing = db.prepare(`SELECT id FROM library_items WHERE code = ?`).get(cleanCode) as
        | { id: string }
        | undefined;

      if (existing) {
        db.prepare(
          `UPDATE library_items
           SET category = ?, title = ?, description = ?, criteria = ?, facility_area_id = ?,
               facility_area_name = ?, require_photo = ?, criticality = ?, is_active = ?, updated_at = ?
           WHERE id = ?`
        ).run(
          cleanCat,
          cleanTitle,
          (row.description ?? '').trim(),
          (row.criteria ?? '').trim(),
          facilityAreaId,
          facilityAreaName,
          reqPhoto,
          crit,
          isActive,
          now,
          existing.id
        );
        if (Array.isArray(row.parameters)) {
          syncAssetParameters(existing.id, row.parameters);
        }
        updatedCount += 1;
      } else {
        maxOrder += 1;
        const newId = createId('lib');
        db.prepare(
          `INSERT INTO library_items
           (id, code, category, title, description, criteria, facility_area_id, facility_area_name, cycle_type, require_photo, criticality, sort_order, is_active, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'routine', ?, ?, ?, ?, ?)`
        ).run(
          newId,
          cleanCode,
          cleanCat,
          cleanTitle,
          (row.description ?? '').trim(),
          (row.criteria ?? '').trim(),
          facilityAreaId,
          facilityAreaName,
          reqPhoto,
          crit,
          maxOrder,
          isActive,
          now
        );
        if (Array.isArray(row.parameters)) {
          syncAssetParameters(newId, row.parameters);
        }
        createdCount += 1;
      }
    }
  });

  runImport();

  if (createdCount === 0 && updatedCount === 0) {
    res.status(400).json({ error: 'All CSV rows were missing required Asset Code, Category, or Title.' });
    return;
  }

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'library:csv_imported',
    `Imported CSV assets (${createdCount} created, ${updatedCount} updated).`
  );
  broadcastRealtime('library:changed', log.summary, log);

  res.status(201).json({
    createdCount,
    updatedCount,
    bootstrap: bootstrapFor(req),
  });
});

app.patch('/api/library/:id', requireAuth, requireAssetEditor, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare(`SELECT * FROM library_items WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Asset not found.' });
    return;
  }

  const body = req.body as Partial<{
    code: string;
    category: string;
    title: string;
    description: string;
    criteria: string;
    facilityAreaId: string | null;
    facilityAreaName: string;
    requirePhoto: boolean;
    criticality: CriticalityLevel;
    sortOrder: number;
    isActive: boolean;
    parameters: InputAssetParameter[];
  }>;

  const now = new Date().toISOString();
  const nextCode = body.code !== undefined ? body.code.trim().toUpperCase() : String(existing.code);
  const nextCategory = body.category !== undefined ? body.category.trim() : String(existing.category);
  const nextTitle = body.title !== undefined ? body.title.trim() : String(existing.title);
  const nextDesc = body.description !== undefined ? body.description.trim() : String(existing.description);
  const nextCriteria = body.criteria !== undefined ? body.criteria.trim() : String(existing.criteria);
  const facLink =
    body.facilityAreaId !== undefined || body.facilityAreaName !== undefined
      ? resolveFacilityLink(body.facilityAreaId, body.facilityAreaName)
      : {
          id: existing.facility_area_id ? String(existing.facility_area_id) : null,
          name: String(existing.facility_area_name ?? ''),
        };
  const nextReqPhoto = body.requirePhoto !== undefined ? (body.requirePhoto ? 1 : 0) : Number(existing.require_photo);
  const nextCriticality = body.criticality !== undefined ? body.criticality : String(existing.criticality);
  const nextSort = body.sortOrder !== undefined ? body.sortOrder : Number(existing.sort_order);
  const nextActive = body.isActive !== undefined ? (body.isActive ? 1 : 0) : Number(existing.is_active);

  db.prepare(
    `UPDATE library_items
     SET code = ?, category = ?, title = ?, description = ?, criteria = ?, facility_area_id = ?, facility_area_name = ?,
         require_photo = ?, criticality = ?, sort_order = ?, is_active = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    nextCode,
    nextCategory,
    nextTitle,
    nextDesc,
    nextCriteria,
    facLink.id,
    facLink.name,
    nextReqPhoto,
    nextCriticality,
    nextSort,
    nextActive,
    now,
    id
  );

  if (body.parameters !== undefined) {
    syncAssetParameters(id, body.parameters);
  }

  // Automatically sync open draft inspection entries referencing this asset
  db.prepare(
    `UPDATE inspection_entries
     SET item_code = ?, item_title = ?, category = ?, criteria = ?, facility_area_name = ?, require_photo = ?, criticality = ?, updated_at = ?
     WHERE library_item_id = ?
       AND report_id IN (SELECT id FROM inspection_reports WHERE status = 'draft')`
  ).run(nextCode, nextTitle, nextCategory, nextCriteria, facLink.name, nextReqPhoto, nextCriticality, now, id);

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'library:updated',
    `Updated asset ${nextCode} — ${nextTitle}.`
  );
  broadcastRealtime('library:changed', log.summary, log);

  res.json({ bootstrap: bootstrapFor(req) });
});

app.delete('/api/library/:id', requireAuth, requireAssetEditor, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare(`SELECT code, title FROM library_items WHERE id = ?`).get(id) as
    | { code: string; title: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Asset not found.' });
    return;
  }

  db.prepare(`DELETE FROM library_items WHERE id = ?`).run(id);
  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'library:deleted',
    `Removed asset ${existing.code} — ${existing.title}.`
  );
  broadcastRealtime('library:changed', log.summary, log);

  res.json({ bootstrap: bootstrapFor(req) });
});

// --- Asset Visual Drawings & Inspection Pins ---

app.post(
  '/api/library/:id/drawing',
  requireAuth,
  requireAssetEditor,
  upload.single('drawing'),
  (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const existing = db.prepare(`SELECT id, code, drawing_url FROM library_items WHERE id = ?`).get(id) as
      | { id: string; code: string; drawing_url: string | null }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Asset not found.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No valid image or drawing file uploaded.' });
      return;
    }
    if (!sanitizeUploadedSvg(req.file)) {
      res.status(400).json({ error: 'Uploaded SVG file was malformed or invalid.' });
      return;
    }

    if (
      existing.drawing_url &&
      existing.drawing_url.startsWith('/uploads/') &&
      !existing.drawing_url.includes('seed-')
    ) {
      const oldPath = path.join(UPLOADS_DIR, path.basename(existing.drawing_url));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const drawingUrl = `/uploads/${req.file.filename}`;
    const now = new Date().toISOString();
    db.prepare(`UPDATE library_items SET drawing_url = ?, updated_at = ? WHERE id = ?`).run(
      drawingUrl,
      now,
      id
    );

    const log = logActivity(
      req.user!.name,
      req.user!.role,
      'asset:drawing_updated',
      `Uploaded visual drawing for asset ${existing.code}.`
    );
    broadcastRealtime('library:changed', log.summary, log);

    res.status(201).json({ drawingUrl, bootstrap: bootstrapFor(req) });
  }
);

app.delete(
  '/api/library/:id/drawing',
  requireAuth,
  requireAssetEditor,
  (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const existing = db.prepare(`SELECT id, code, drawing_url FROM library_items WHERE id = ?`).get(id) as
      | { id: string; code: string; drawing_url: string | null }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Asset not found.' });
      return;
    }

    if (
      existing.drawing_url &&
      existing.drawing_url.startsWith('/uploads/') &&
      !existing.drawing_url.includes('seed-')
    ) {
      const oldPath = path.join(UPLOADS_DIR, path.basename(existing.drawing_url));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    db.prepare(`UPDATE library_items SET drawing_url = NULL, updated_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      id
    );

    const log = logActivity(
      req.user!.name,
      req.user!.role,
      'asset:drawing_removed',
      `Removed visual drawing from asset ${existing.code}.`
    );
    broadcastRealtime('library:changed', log.summary, log);

    res.json({ bootstrap: bootstrapFor(req) });
  }
);

app.post('/api/library/:id/pins', requireAuth, requireAssetEditor, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const asset = db.prepare(`SELECT id, code FROM library_items WHERE id = ?`).get(id) as
    | { id: string; code: string }
    | undefined;
  if (!asset) {
    res.status(404).json({ error: 'Asset not found.' });
    return;
  }

  const { label, guidance, xPercent, yPercent, pinNumber, linkedTaskId } = req.body as {
    label?: string;
    guidance?: string;
    xPercent?: number;
    yPercent?: number;
    pinNumber?: number;
    linkedTaskId?: string | null;
  };

  const cleanLabel = (label ?? '').trim();
  if (!cleanLabel) {
    res.status(400).json({ error: 'Inspection point label is required.' });
    return;
  }

  let resolvedTaskId: string | null = null;
  let linkedTaskWbs: string | null = null;
  if (linkedTaskId && linkedTaskId.trim()) {
    const taskRow = db
      .prepare(`SELECT id, wbs_code FROM project_tasks WHERE id = ?`)
      .get(linkedTaskId.trim()) as { id: string; wbs_code: string } | undefined;
    if (!taskRow) {
      res.status(404).json({ error: 'Selected inspection task does not exist.' });
      return;
    }
    resolvedTaskId = taskRow.id;
    linkedTaskWbs = taskRow.wbs_code;
  }

  const maxRow = db
    .prepare(`SELECT COALESCE(MAX(pin_number), 0) as max_num FROM asset_pins WHERE library_item_id = ?`)
    .get(id) as { max_num: number };

  const pinId = createId('pin');
  const nextNum = typeof pinNumber === 'number' && pinNumber > 0 ? Math.round(pinNumber) : maxRow.max_num + 1;
  const clamp = (v: unknown, def: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(2, Math.min(98, Math.round(n * 10) / 10));
  };
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO asset_pins (id, library_item_id, pin_number, label, guidance, x_percent, y_percent, linked_task_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    pinId,
    id,
    nextNum,
    cleanLabel,
    (guidance ?? '').trim(),
    clamp(xPercent, 50),
    clamp(yPercent, 50),
    resolvedTaskId,
    now
  );

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'asset:pin_added',
    `Added inspection point #${nextNum} (${cleanLabel}) on asset ${asset.code}${
      linkedTaskWbs ? ` linked to Task ${linkedTaskWbs}` : ''
    }.`
  );
  broadcastRealtime('library:changed', log.summary, log);

  res.status(201).json({ id: pinId, bootstrap: bootstrapFor(req) });
});

app.patch('/api/pins/:pinId', requireAuth, requireAssetEditor, (req: AuthenticatedRequest, res: Response) => {
  const { pinId } = req.params;
  const existing = db.prepare(`SELECT * FROM asset_pins WHERE id = ?`).get(pinId) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Inspection pin not found.' });
    return;
  }

  const body = req.body as Partial<{
    label: string;
    guidance: string;
    pinNumber: number;
    xPercent: number;
    yPercent: number;
    linkedTaskId: string | null;
  }>;

  const nextLabel = body.label !== undefined ? body.label.trim() : String(existing.label);
  if (!nextLabel) {
    res.status(400).json({ error: 'Inspection point label cannot be empty.' });
    return;
  }

  let nextLinkedTaskId: string | null = existing.linked_task_id ? String(existing.linked_task_id) : null;
  if (body.linkedTaskId !== undefined) {
    if (body.linkedTaskId === null || body.linkedTaskId === '') {
      nextLinkedTaskId = null;
    } else {
      const taskRow = db
        .prepare(`SELECT id FROM project_tasks WHERE id = ?`)
        .get(body.linkedTaskId.trim()) as { id: string } | undefined;
      if (!taskRow) {
        res.status(404).json({ error: 'Selected inspection task does not exist.' });
        return;
      }
      nextLinkedTaskId = taskRow.id;
    }
  }

  const clamp = (v: unknown, fallback: number) => {
    if (v === undefined) return fallback;
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(2, Math.min(98, Math.round(n * 10) / 10));
  };

  db.prepare(
    `UPDATE asset_pins SET pin_number = ?, label = ?, guidance = ?, x_percent = ?, y_percent = ?, linked_task_id = ?, updated_at = ? WHERE id = ?`
  ).run(
    body.pinNumber !== undefined ? Math.max(1, Math.round(Number(body.pinNumber))) : Number(existing.pin_number),
    nextLabel,
    body.guidance !== undefined ? body.guidance.trim() : String(existing.guidance),
    clamp(body.xPercent, Number(existing.x_percent)),
    clamp(body.yPercent, Number(existing.y_percent)),
    nextLinkedTaskId,
    new Date().toISOString(),
    pinId
  );

  broadcastRealtime('library:changed');
  res.json({ bootstrap: bootstrapFor(req) });
});

app.delete('/api/pins/:pinId', requireAuth, requireAssetEditor, (req: AuthenticatedRequest, res: Response) => {
  const { pinId } = req.params;
  const existing = db.prepare(`SELECT id, label FROM asset_pins WHERE id = ?`).get(pinId) as
    | { id: string; label: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Inspection pin not found.' });
    return;
  }

  db.prepare(`DELETE FROM asset_pins WHERE id = ?`).run(pinId);
  db.prepare(`UPDATE inspection_photos SET pin_id = NULL WHERE pin_id = ?`).run(pinId);

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'asset:pin_deleted',
    `Removed visual inspection point "${existing.label}".`
  );
  broadcastRealtime('library:changed', log.summary, log);

  res.json({ bootstrap: bootstrapFor(req) });
});

// --- Facility / Zone Area Library ---

app.post('/api/facilities', requireAuth, requireAssetEditor, (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as {
    code?: string;
    name?: string;
    building?: string;
    riskLevel?: CriticalityLevel;
    description?: string;
    isActive?: boolean;
  };

  const cleanCode = (body.code ?? '').trim().toUpperCase();
  const cleanName = (body.name ?? '').trim();
  if (!cleanCode || !cleanName) {
    res.status(400).json({ error: 'Facility code and zone name are required.' });
    return;
  }

  const dup = db.prepare(`SELECT id FROM facility_areas WHERE code = ?`).get(cleanCode);
  if (dup) {
    res.status(409).json({ error: `Facility zone code ${cleanCode} already exists.` });
    return;
  }

  const id = createId('fac');
  const now = new Date().toISOString();
  const risk: CriticalityLevel =
    body.riskLevel === 'low' || body.riskLevel === 'high' ? body.riskLevel : 'medium';

  db.prepare(
    `INSERT INTO facility_areas (id, code, name, building, risk_level, description, is_active, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    cleanCode,
    cleanName,
    (body.building ?? '').trim(),
    risk,
    (body.description ?? '').trim(),
    body.isActive === false ? 0 : 1,
    now
  );

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'facility:created',
    `Added facility zone ${cleanCode} — ${cleanName}.`
  );
  broadcastRealtime('facility:changed', log.summary, log);

  res.status(201).json({ id, bootstrap: bootstrapFor(req) });
});

app.patch('/api/facilities/:id', requireAuth, requireAssetEditor, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare(`SELECT * FROM facility_areas WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Facility zone not found.' });
    return;
  }

  const body = req.body as Partial<{
    code: string;
    name: string;
    building: string;
    riskLevel: CriticalityLevel;
    description: string;
    isActive: boolean;
  }>;

  const nextCode = body.code !== undefined ? body.code.trim().toUpperCase() : String(existing.code);
  const nextName = body.name !== undefined ? body.name.trim() : String(existing.name);
  if (!nextCode || !nextName) {
    res.status(400).json({ error: 'Facility code and zone name cannot be empty.' });
    return;
  }

  const dup = db.prepare(`SELECT id FROM facility_areas WHERE code = ? AND id != ?`).get(nextCode, id);
  if (dup) {
    res.status(409).json({ error: `Facility zone code ${nextCode} already exists.` });
    return;
  }

  const nextBuilding = body.building !== undefined ? body.building.trim() : String(existing.building);
  const nextRisk =
    body.riskLevel === 'low' || body.riskLevel === 'medium' || body.riskLevel === 'high'
      ? body.riskLevel
      : (String(existing.risk_level) as CriticalityLevel);
  const nextDescription =
    body.description !== undefined ? body.description.trim() : String(existing.description);
  const nextActive = body.isActive !== undefined ? (body.isActive ? 1 : 0) : Number(existing.is_active);
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE facility_areas
     SET code = ?, name = ?, building = ?, risk_level = ?, description = ?, is_active = ?, updated_at = ?
     WHERE id = ?`
  ).run(nextCode, nextName, nextBuilding, nextRisk, nextDescription, nextActive, now, id);

  db.prepare(`UPDATE library_items SET facility_area_name = ? WHERE facility_area_id = ?`).run(
    `${nextCode} — ${nextName}`,
    id
  );

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'facility:updated',
    `Updated facility zone ${nextCode} — ${nextName}.`
  );
  broadcastRealtime('facility:changed', log.summary, log);

  res.json({ bootstrap: bootstrapFor(req) });
});

app.delete('/api/facilities/:id', requireAuth, requireAssetEditor, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare(`SELECT code, name FROM facility_areas WHERE id = ?`).get(id) as
    | { code: string; name: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Facility zone not found.' });
    return;
  }

  db.prepare(`DELETE FROM facility_areas WHERE id = ?`).run(id);
  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'facility:deleted',
    `Removed facility zone ${existing.code} — ${existing.name}.`
  );
  broadcastRealtime('facility:changed', log.summary, log);

  res.json({ bootstrap: bootstrapFor(req) });
});

// --- Inspection Reports, Sequential Approvals, Custom Parameter Values & Footprints ---

function canEditReportRecord(reportStatus: string, user: User): boolean {
  if (userHasAnyRole(user, 'admin')) return true;
  return reportStatus === 'draft' || reportStatus === 'sent_back';
}

app.post('/api/reports', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { title, cycleType, facilityArea, libraryItemIds } = req.body as {
    title?: string;
    cycleType?: CycleType;
    facilityArea?: string;
    libraryItemIds?: string[];
  };

  const resolvedCycle: CycleType = normalizeCycleType(cycleType, 'routine');
  const cleanTitle =
    (title ?? '').trim() ||
    (resolvedCycle === 'yearly'
      ? 'Yearly Preventive Maintenance Audit'
      : resolvedCycle === 'eventual'
      ? 'Eventual Asset Inspection'
      : 'Routine Asset Inspection');
  const cleanArea = (facilityArea ?? '').trim() || 'Main Facility Zone';

  const now = new Date().toISOString();
  const reportId = createId('rep');
  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM inspection_reports`).get() as { cnt: number };
  const prefix =
    resolvedCycle === 'yearly' ? 'MAINT' : resolvedCycle === 'eventual' ? 'EVT' : 'INSP';
  const reportNumber = `${prefix}-${new Date().getFullYear()}-${String(countRow.cnt + 42).padStart(3, '0')}`;

  db.prepare(
    `INSERT INTO inspection_reports
     (id, report_number, title, cycle_type, facility_area, inspector_id, inspector_name, inspector_title,
      status, overall_condition, summary_notes, signature_data_url, signed_at, created_at, submitted_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'good', '', NULL, NULL, ?, NULL, ?)`
  ).run(
    reportId,
    reportNumber,
    cleanTitle,
    resolvedCycle,
    cleanArea,
    req.user!.id,
    req.user!.name,
    req.user!.title,
    now,
    now
  );

  let items = db
    .prepare(`SELECT * FROM library_items WHERE is_active = 1 ORDER BY sort_order ASC`)
    .all() as Record<string, unknown>[];

  if (Array.isArray(libraryItemIds) && libraryItemIds.length > 0) {
    const allowed = new Set(libraryItemIds);
    items = items.filter((item) => allowed.has(String(item.id)));
  } else if (cleanArea) {
    const facFiltered = items.filter(
      (item) =>
        String(item.facility_area_name ?? '').toLowerCase() === cleanArea.toLowerCase() ||
        String(item.facility_area_name ?? '')
          .toLowerCase()
          .includes(cleanArea.toLowerCase())
    );
    if (facFiltered.length > 0) items = facFiltered;
  }

  const insertEntry = db.prepare(`
    INSERT INTO inspection_entries
      (id, report_id, library_item_id, item_code, item_title, category, criteria, facility_area_name, require_photo, criticality, condition, condition_note, item_remarks, sort_order, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'na', '', '', ?, ?)
  `);

  items.forEach((item, index) => {
    insertEntry.run(
      createId('ent'),
      reportId,
      String(item.id),
      String(item.code),
      String(item.title),
      String(item.category),
      String(item.criteria),
      String(item.facility_area_name ?? ''),
      Number(item.require_photo),
      String(item.criticality),
      index + 1,
      now
    );
  });

  recordReportFootprint(
    reportId,
    req.user!.id,
    req.user!.name,
    req.user!.roles,
    'created',
    `Created draft "${cleanTitle}" (${reportNumber}) with ${items.length} asset(s).`,
    now
  );

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'report:created',
    `Started ${resolvedCycle} report ${reportNumber} with ${items.length} assets.`
  );
  broadcastRealtime('report:changed', log.summary, log);

  res.status(201).json({ report: getFullReportById(reportId), bootstrap: bootstrapFor(req) });
});

app.post('/api/reports/:id/sync-library', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const report = db.prepare(`SELECT * FROM inspection_reports WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!report) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }
  if (!canEditReportRecord(String(report.status), req.user!)) {
    res.status(403).json({ error: 'Report is locked for editing.' });
    return;
  }

  const existingEntries = db
    .prepare(
      `SELECT library_item_id, COALESCE(MAX(sort_order), 0) as max_sort FROM inspection_entries WHERE report_id = ?`
    )
    .all(id) as { library_item_id: string; max_sort: number }[];
  const existingSet = new Set(existingEntries.map((e) => e.library_item_id));
  let nextSort = existingEntries.reduce((acc, e) => Math.max(acc, e.max_sort), 0);

  const allActive = db
    .prepare(`SELECT * FROM library_items WHERE is_active = 1 ORDER BY sort_order ASC`)
    .all() as Record<string, unknown>[];
  const facName = String(report.facility_area ?? '').toLowerCase();
  const facMatches = allActive.filter(
    (item) => facName && String(item.facility_area_name ?? '').toLowerCase() === facName
  );
  const candidateItems = facMatches.length > 0 ? facMatches : allActive;

  const now = new Date().toISOString();
  const insertEntry = db.prepare(`
    INSERT INTO inspection_entries
      (id, report_id, library_item_id, item_code, item_title, category, criteria, facility_area_name, require_photo, criticality, condition, condition_note, item_remarks, sort_order, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'na', '', '', ?, ?)
  `);

  let added = 0;
  for (const item of candidateItems) {
    if (!existingSet.has(String(item.id))) {
      nextSort += 1;
      added += 1;
      insertEntry.run(
        createId('ent'),
        id,
        String(item.id),
        String(item.code),
        String(item.title),
        String(item.category),
        String(item.criteria),
        String(item.facility_area_name ?? ''),
        Number(item.require_photo),
        String(item.criticality),
        nextSort,
        now
      );
    }
  }

  if (added > 0) {
    recordReportFootprint(
      id,
      req.user!.id,
      req.user!.name,
      req.user!.roles,
      'library_synced',
      `Synced ${added} additional active asset(s) into report.`,
      now
    );
    const log = logActivity(
      req.user!.name,
      req.user!.role,
      'report:synced',
      `Synced ${added} active asset(s) into ${String(report.report_number)}.`
    );
    broadcastRealtime('report:changed', log.summary, log);
  }

  res.json({ added, report: getFullReportById(id), bootstrap: bootstrapFor(req) });
});

app.patch('/api/reports/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare(`SELECT * FROM inspection_reports WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }

  const currentStatus = String(existing.status);
  const isAdmin = userHasAnyRole(req.user, 'admin');
  if (!canEditReportRecord(currentStatus, req.user!)) {
    res.status(403).json({ error: 'Only Administrators can edit pending or approved reports.' });
    return;
  }

  const body = req.body as Partial<{
    title: string;
    facilityArea: string;
    summaryNotes: string;
    overallCondition: ConditionStatus;
  }>;

  const now = new Date().toISOString();
  const nextTitle = body.title !== undefined ? body.title.trim() || String(existing.title) : String(existing.title);
  const nextArea =
    body.facilityArea !== undefined ? body.facilityArea.trim() : String(existing.facility_area);
  const nextNotes =
    body.summaryNotes !== undefined ? body.summaryNotes.trim() : String(existing.summary_notes);
  const nextOverall = body.overallCondition ?? (String(existing.overall_condition) as ConditionStatus);

  db.prepare(
    `UPDATE inspection_reports
     SET title = ?, facility_area = ?, summary_notes = ?, overall_condition = ?, updated_at = ?
     WHERE id = ?`
  ).run(nextTitle, nextArea, nextNotes, nextOverall, now, id);

  const changes: string[] = [];
  if (nextTitle !== String(existing.title)) changes.push(`Title "${String(existing.title)}" → "${nextTitle}"`);
  if (nextArea !== String(existing.facility_area)) changes.push(`Facility "${String(existing.facility_area)}" → "${nextArea}"`);
  if (nextOverall !== String(existing.overall_condition))
    changes.push(`Overall Condition ${String(existing.overall_condition)} → ${nextOverall}`);
  if (nextNotes !== String(existing.summary_notes)) changes.push('Executive Summary updated');

  if (changes.length > 0) {
    recordReportFootprint(
      id,
      req.user!.id,
      req.user!.name,
      req.user!.roles,
      isAdmin && currentStatus !== 'draft' && currentStatus !== 'sent_back' ? 'admin_edited' : 'updated',
      changes.join('; '),
      now
    );
  }

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'report:updated',
    `Updated report ${String(existing.report_number)}.`
  );
  broadcastRealtime('report:changed', log.summary, log);

  res.json({ report: getFullReportById(id), bootstrap: bootstrapFor(req) });
});

app.post('/api/reports/:id/submit', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare(`SELECT * FROM inspection_reports WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }

  const currentStatus = String(existing.status);
  if (currentStatus !== 'draft' && currentStatus !== 'sent_back' && !userHasAnyRole(req.user, 'admin')) {
    res.status(400).json({ error: 'Only Draft or Sent Back reports can be submitted for approval.' });
    return;
  }

  const { approverIds } = req.body as { approverIds?: string[] };
  if (!Array.isArray(approverIds) || approverIds.length < 1 || approverIds.length > 6) {
    res.status(400).json({ error: 'Select between 1 and 6 sequential approvers before submitting.' });
    return;
  }

  const uniqueIds = new Set(approverIds);
  if (uniqueIds.size !== approverIds.length) {
    res.status(400).json({ error: 'Each sequential approval step must be assigned to a distinct approver.' });
    return;
  }

  const allUsers = db.prepare(`SELECT * FROM users`).all() as Record<string, unknown>[];
  const userById = new Map(allUsers.map((u) => [String(u.id), mapUserRow(u)]));

  const resolvedApprovers: User[] = [];
  for (const appId of approverIds) {
    const u = userById.get(appId);
    if (!u) {
      res.status(404).json({ error: 'One or more selected approvers no longer exist.' });
      return;
    }
    if (!u.roles.includes('approver')) {
      res.status(400).json({ error: `${u.name} does not hold the Approver role.` });
      return;
    }
    resolvedApprovers.push(u);
  }

  // Verify photo-required assets and required custom parameters
  const entries = db
    .prepare(`SELECT id, library_item_id, item_code, require_photo FROM inspection_entries WHERE report_id = ?`)
    .all(id) as { id: string; library_item_id: string; item_code: string; require_photo: number }[];
  const photoCountStmt = db.prepare(`SELECT COUNT(*) as cnt FROM inspection_photos WHERE entry_id = ?`);
  const missingPhotoCodes: string[] = [];
  const missingParamItems: string[] = [];

  for (const ent of entries) {
    if (ent.require_photo === 1) {
      const cnt = (photoCountStmt.get(ent.id) as { cnt: number }).cnt;
      if (cnt === 0) missingPhotoCodes.push(ent.item_code);
    }
    const reqParams = db
      .prepare(`SELECT id, label FROM asset_parameters WHERE library_item_id = ? AND is_required = 1`)
      .all(ent.library_item_id) as { id: string; label: string }[];
    for (const rp of reqParams) {
      const valRow = db
        .prepare(`SELECT value_text FROM inspection_parameter_values WHERE entry_id = ? AND parameter_id = ?`)
        .get(ent.id, rp.id) as { value_text?: string } | undefined;
      if (!valRow?.value_text?.trim()) {
        missingParamItems.push(`${ent.item_code} (${rp.label})`);
      }
    }
  }

  if (missingPhotoCodes.length > 0) {
    res.status(400).json({
      error: `Photo evidence is required for asset(s): ${missingPhotoCodes.join(', ')}.`,
    });
    return;
  }
  if (missingParamItems.length > 0) {
    res.status(400).json({
      error: `Required custom inspection parameter missing on: ${missingParamItems.join(', ')}.`,
    });
    return;
  }

  const now = new Date().toISOString();
  const isResubmit = currentStatus === 'sent_back';

  const runSubmit = db.transaction(() => {
    db.prepare(`DELETE FROM report_approval_steps WHERE report_id = ?`).run(id);
    const insertStep = db.prepare(
      `INSERT INTO report_approval_steps (id, report_id, step_order, approver_id, approver_name, approver_title, status, decision_note, acted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', NULL)`
    );
    resolvedApprovers.forEach((appUser, idx) => {
      insertStep.run(
        createId('astp'),
        id,
        idx + 1,
        appUser.id,
        appUser.name,
        appUser.title,
        idx === 0 ? 'pending' : 'waiting'
      );
    });

    db.prepare(
      `UPDATE inspection_reports
       SET status = 'pending_approval', submitted_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(now, now, id);

    const chainSummary = resolvedApprovers.map((u, idx) => `${idx + 1}. ${u.name}`).join(' → ');
    recordReportFootprint(
      id,
      req.user!.id,
      req.user!.name,
      req.user!.roles,
      isResubmit ? 'resubmitted' : 'submitted',
      `${isResubmit ? 'Resubmitted' : 'Submitted'} for ${resolvedApprovers.length}-step sequential approval (${chainSummary}).`,
      now
    );
  });

  runSubmit();

  const firstApprover = resolvedApprovers[0];
  createNotification(
    firstApprover.id,
    'approval_requested',
    id,
    String(existing.report_number),
    `Approval Needed (Step 1/${resolvedApprovers.length})`,
    `${req.user!.name} submitted "${String(existing.title)}" (${String(existing.report_number)}) for your Step 1 review.`
  );

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'report:submitted',
    `${isResubmit ? 'Resubmitted' : 'Submitted'} ${String(existing.report_number)} to ${firstApprover.name} (Step 1/${resolvedApprovers.length}).`
  );
  broadcastRealtime('report:changed', log.summary, log);
  broadcastRealtime('notification:changed', `Approval requested: ${String(existing.report_number)}`, undefined, firstApprover.id);

  res.json({ report: getFullReportById(id), bootstrap: bootstrapFor(req) });
});

app.post('/api/reports/:id/approve-step', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!userHasAnyRole(req.user, 'approver')) {
    res.status(403).json({ error: 'Only users holding the Approver role can approve inspection steps.' });
    return;
  }

  const report = db.prepare(`SELECT * FROM inspection_reports WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!report || String(report.status) !== 'pending_approval') {
    res.status(400).json({ error: 'Report is not currently awaiting sequential approval.' });
    return;
  }

  const activeStep = db
    .prepare(
      `SELECT * FROM report_approval_steps WHERE report_id = ? AND status = 'pending' ORDER BY step_order ASC LIMIT 1`
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!activeStep || String(activeStep.approver_id) !== req.user!.id) {
    res.status(403).json({ error: 'You are not the active sequential approver for this report step.' });
    return;
  }

  const { note } = req.body as { note?: string };
  const cleanNote = (note ?? '').trim();
  const now = new Date().toISOString();
  const stepOrder = Number(activeStep.step_order);

  const nextStep = db
    .prepare(
      `SELECT * FROM report_approval_steps WHERE report_id = ? AND step_order > ? AND status = 'waiting' ORDER BY step_order ASC LIMIT 1`
    )
    .get(id, stepOrder) as Record<string, unknown> | undefined;

  const totalSteps = (
    db.prepare(`SELECT COUNT(*) as cnt FROM report_approval_steps WHERE report_id = ?`).get(id) as { cnt: number }
  ).cnt;

  const runApprove = db.transaction(() => {
    db.prepare(
      `UPDATE report_approval_steps SET status = 'approved', decision_note = ?, acted_at = ? WHERE id = ?`
    ).run(cleanNote, now, String(activeStep.id));

    if (nextStep) {
      db.prepare(`UPDATE report_approval_steps SET status = 'pending' WHERE id = ?`).run(String(nextStep.id));
      db.prepare(`UPDATE inspection_reports SET updated_at = ? WHERE id = ?`).run(now, id);
      recordReportFootprint(
        id,
        req.user!.id,
        req.user!.name,
        req.user!.roles,
        'step_approved',
        `Approved Step ${stepOrder}/${totalSteps}${cleanNote ? `: "${cleanNote}"` : ''}. Routed to Step ${Number(nextStep.step_order)} (${String(nextStep.approver_name)}).`,
        now
      );
    } else {
      db.prepare(`UPDATE inspection_reports SET status = 'approved', updated_at = ? WHERE id = ?`).run(now, id);
      recordReportFootprint(
        id,
        req.user!.id,
        req.user!.name,
        req.user!.roles,
        'approved',
        `Final Approval completed at Step ${stepOrder}/${totalSteps}${cleanNote ? `: "${cleanNote}"` : ''}.`,
        now
      );
    }
  });

  runApprove();

  if (nextStep) {
    const nextApproverId = String(nextStep.approver_id);
    createNotification(
      nextApproverId,
      'approval_requested',
      id,
      String(report.report_number),
      `Approval Needed (Step ${Number(nextStep.step_order)}/${totalSteps})`,
      `${req.user!.name} approved Step ${stepOrder}. "${String(report.title)}" (${String(report.report_number)}) now awaits your review.`
    );
    broadcastRealtime(
      'notification:changed',
      `Step ${Number(nextStep.step_order)} approval needed for ${String(report.report_number)}`,
      undefined,
      nextApproverId
    );
  } else if (report.inspector_id) {
    createNotification(
      String(report.inspector_id),
      'report_approved',
      id,
      String(report.report_number),
      `Inspection Report Approved`,
      `Your inspection report "${String(report.title)}" (${String(report.report_number)}) passed all ${totalSteps} approval step(s).`
    );
    broadcastRealtime(
      'notification:changed',
      `Report ${String(report.report_number)} fully approved`,
      undefined,
      String(report.inspector_id)
    );
  }

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'report:approved_step',
    nextStep
      ? `Approved Step ${stepOrder}/${totalSteps} on ${String(report.report_number)}; routed to ${String(nextStep.approver_name)}.`
      : `Final approved ${String(report.report_number)} (Step ${stepOrder}/${totalSteps}).`
  );
  broadcastRealtime('report:changed', log.summary, log);

  res.json({ report: getFullReportById(id), bootstrap: bootstrapFor(req) });
});

app.post('/api/reports/:id/send-back', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!userHasAnyRole(req.user, 'approver')) {
    res.status(403).json({ error: 'Only users holding the Approver role can send back inspection reports.' });
    return;
  }

  const report = db.prepare(`SELECT * FROM inspection_reports WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!report || String(report.status) !== 'pending_approval') {
    res.status(400).json({ error: 'Report is not currently awaiting approval.' });
    return;
  }

  const activeStep = db
    .prepare(
      `SELECT * FROM report_approval_steps WHERE report_id = ? AND status = 'pending' ORDER BY step_order ASC LIMIT 1`
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!activeStep || String(activeStep.approver_id) !== req.user!.id) {
    res.status(403).json({ error: 'You are not the active sequential approver for this step.' });
    return;
  }

  const { note } = req.body as { note?: string };
  const cleanNote = (note ?? '').trim();
  if (!cleanNote) {
    res.status(400).json({ error: 'Please provide a revision reason before sending the report back.' });
    return;
  }

  const now = new Date().toISOString();
  const stepOrder = Number(activeStep.step_order);

  const runSendBack = db.transaction(() => {
    db.prepare(
      `UPDATE report_approval_steps SET status = 'sent_back', decision_note = ?, acted_at = ? WHERE id = ?`
    ).run(cleanNote, now, String(activeStep.id));

    db.prepare(`UPDATE inspection_reports SET status = 'sent_back', updated_at = ? WHERE id = ?`).run(now, id);

    recordReportFootprint(
      id,
      req.user!.id,
      req.user!.name,
      req.user!.roles,
      'sent_back',
      `Sent back at Step ${stepOrder}: "${cleanNote}".`,
      now
    );
  });

  runSendBack();

  if (report.inspector_id) {
    createNotification(
      String(report.inspector_id),
      'report_sent_back',
      id,
      String(report.report_number),
      `Revision Needed — Sent Back`,
      `${req.user!.name} sent back "${String(report.title)}" (${String(report.report_number)}): ${cleanNote}`
    );
    broadcastRealtime(
      'notification:changed',
      `Revision requested on ${String(report.report_number)}`,
      undefined,
      String(report.inspector_id)
    );
  }

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'report:sent_back',
    `Sent back ${String(report.report_number)} at Step ${stepOrder} for revision.`
  );
  broadcastRealtime('report:changed', log.summary, log);

  res.json({ report: getFullReportById(id), bootstrap: bootstrapFor(req) });
});

app.post('/api/reports/:id/comments', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const report = db.prepare(`SELECT id, report_number FROM inspection_reports WHERE id = ?`).get(id) as
    | { id: string; report_number: string }
    | undefined;
  if (!report) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }

  const { entryId, body } = req.body as { entryId?: string | null; body?: string };
  const cleanBody = (body ?? '').trim();
  if (!cleanBody) {
    res.status(400).json({ error: 'Comment text cannot be empty.' });
    return;
  }

  let validEntryCode: string | null = null;
  if (entryId) {
    const entry = db
      .prepare(`SELECT id, item_code FROM inspection_entries WHERE id = ? AND report_id = ?`)
      .get(entryId, id) as { id: string; item_code: string } | undefined;
    if (!entry) {
      res.status(404).json({ error: 'Target inspection asset entry not found.' });
      return;
    }
    validEntryCode = entry.item_code;
  }

  const commentId = createId('rcmt');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO report_comments (id, report_id, entry_id, author_id, author_name, author_roles_json, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    commentId,
    id,
    entryId ?? null,
    req.user!.id,
    req.user!.name,
    JSON.stringify(req.user!.roles),
    cleanBody,
    now
  );

  recordReportFootprint(
    id,
    req.user!.id,
    req.user!.name,
    req.user!.roles,
    'commented',
    validEntryCode
      ? `Commented on Asset ${validEntryCode}: "${cleanBody.slice(0, 80)}${cleanBody.length > 80 ? '…' : ''}"`
      : `Added report comment: "${cleanBody.slice(0, 80)}${cleanBody.length > 80 ? '…' : ''}"`,
    now
  );

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'report:commented',
    `Commented on ${report.report_number}${validEntryCode ? ` (${validEntryCode})` : ''}.`
  );
  broadcastRealtime('report:changed', log.summary, log);

  res.status(201).json({ id: commentId, report: getFullReportById(id), bootstrap: bootstrapFor(req) });
});

app.delete('/api/reports/:reportId/comments/:commentId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { reportId, commentId } = req.params;
  const existing = db
    .prepare(`SELECT id, author_id FROM report_comments WHERE id = ? AND report_id = ?`)
    .get(commentId, reportId) as { id: string; author_id: string | null } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Comment not found.' });
    return;
  }
  if (!userHasAnyRole(req.user, 'admin') && existing.author_id !== req.user!.id) {
    res.status(403).json({ error: 'You can only delete your own comments.' });
    return;
  }

  db.prepare(`DELETE FROM report_comments WHERE id = ?`).run(commentId);
  broadcastRealtime('report:changed');
  res.json({ report: getFullReportById(reportId), bootstrap: bootstrapFor(req) });
});

app.delete('/api/reports/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare(`SELECT report_number, status FROM inspection_reports WHERE id = ?`).get(id) as
    | { report_number: string; status: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }
  if (existing.status !== 'draft' && !userHasAnyRole(req.user, 'admin')) {
    res.status(403).json({ error: 'Only Administrators can delete submitted or approved reports.' });
    return;
  }

  db.prepare(`DELETE FROM inspection_reports WHERE id = ?`).run(id);
  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'report:deleted',
    `Deleted inspection report ${existing.report_number}.`
  );
  broadcastRealtime('report:changed', log.summary, log);

  res.json({ bootstrap: bootstrapFor(req) });
});

app.patch('/api/entries/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare(`SELECT * FROM inspection_entries WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Inspection entry not found.' });
    return;
  }

  const report = db
    .prepare(`SELECT id, status FROM inspection_reports WHERE id = ?`)
    .get(String(existing.report_id)) as { id: string; status: string } | undefined;
  if (!report || !canEditReportRecord(report.status, req.user!)) {
    res.status(403).json({ error: 'Only Administrators can edit entries on locked or approved reports.' });
    return;
  }

  const body = req.body as Partial<{
    condition: ConditionStatus;
    conditionNote: string;
    itemRemarks: string;
  }>;

  const now = new Date().toISOString();
  const oldCondition = String(existing.condition) as ConditionStatus;
  const oldCondNote = String(existing.condition_note);
  const oldRemarks = String(existing.item_remarks);

  const nextCondition = body.condition ?? oldCondition;
  const nextCondNote = body.conditionNote !== undefined ? body.conditionNote : oldCondNote;
  const nextRemarks = body.itemRemarks !== undefined ? body.itemRemarks : oldRemarks;

  db.prepare(
    `UPDATE inspection_entries
     SET condition = ?, condition_note = ?, item_remarks = ?, updated_at = ?
     WHERE id = ?`
  ).run(nextCondition, nextCondNote, nextRemarks, now, id);

  const changes: string[] = [];
  if (oldCondition !== nextCondition) {
    recordEntryEditHistory(
      id,
      report.id,
      req.user!.name,
      req.user!.roles,
      'condition',
      oldCondition,
      nextCondition,
      `Condition ${oldCondition} → ${nextCondition}`,
      now
    );
    changes.push(`Condition ${oldCondition} → ${nextCondition}`);
  }
  if (oldCondNote !== nextCondNote) {
    recordEntryEditHistory(
      id,
      report.id,
      req.user!.name,
      req.user!.roles,
      'condition_note',
      oldCondNote || 'Empty',
      nextCondNote || 'Cleared',
      `Condition Note updated`,
      now
    );
    changes.push('Condition Note');
  }
  if (oldRemarks !== nextRemarks) {
    recordEntryEditHistory(
      id,
      report.id,
      req.user!.name,
      req.user!.roles,
      'item_remarks',
      oldRemarks || 'Empty',
      nextRemarks || 'Cleared',
      `Asset Remarks updated`,
      now
    );
    changes.push('Remarks');
  }

  if (changes.length > 0) {
    recordReportFootprint(
      report.id,
      req.user!.id,
      req.user!.name,
      req.user!.roles,
      'entry_edited',
      `Updated ${String(existing.item_code)}: ${changes.join(', ')}.`,
      now
    );
  }

  db.prepare(`UPDATE inspection_reports SET updated_at = ? WHERE id = ?`).run(now, report.id);

  broadcastRealtime('report:changed');
  res.json({ report: getFullReportById(report.id), bootstrap: bootstrapFor(req) });
});

app.put('/api/entries/:id/values', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare(`SELECT * FROM inspection_entries WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Inspection entry not found.' });
    return;
  }

  const report = db
    .prepare(`SELECT id, status FROM inspection_reports WHERE id = ?`)
    .get(String(existing.report_id)) as { id: string; status: string } | undefined;
  if (!report || !canEditReportRecord(report.status, req.user!)) {
    res.status(403).json({ error: 'Only Administrators can modify parameters on locked reports.' });
    return;
  }

  const { values } = req.body as {
    values?: { parameterId: string; valueText: string }[];
  };
  if (!Array.isArray(values)) {
    res.status(400).json({ error: 'Parameter values array is required.' });
    return;
  }

  const now = new Date().toISOString();
  const assetParams = db
    .prepare(`SELECT * FROM asset_parameters WHERE library_item_id = ?`)
    .all(String(existing.library_item_id)) as Record<string, unknown>[];
  const paramById = new Map(assetParams.map((p) => [String(p.id), p]));

  const changes: string[] = [];

  const saveTx = db.transaction(() => {
    for (const item of values) {
      const def = paramById.get(item.parameterId);
      if (!def) continue;
      const cleanVal = String(item.valueText ?? '').trim();
      const prevRow = db
        .prepare(`SELECT id, value_text FROM inspection_parameter_values WHERE entry_id = ? AND parameter_id = ?`)
        .get(id, item.parameterId) as { id: string; value_text: string } | undefined;
      const oldVal = prevRow?.value_text ?? '';

      if (prevRow) {
        db.prepare(
          `UPDATE inspection_parameter_values
           SET label = ?, param_type = ?, unit = ?, value_text = ?, updated_by = ?, updated_at = ?
           WHERE id = ?`
        ).run(
          String(def.label),
          String(def.param_type),
          String(def.unit),
          cleanVal,
          req.user!.name,
          now,
          prevRow.id
        );
      } else {
        db.prepare(
          `INSERT INTO inspection_parameter_values
           (id, entry_id, parameter_id, label, param_type, unit, value_text, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          createId('pval'),
          id,
          item.parameterId,
          String(def.label),
          String(def.param_type),
          String(def.unit),
          cleanVal,
          req.user!.name,
          now
        );
      }

      if (oldVal !== cleanVal) {
        const unitSuffix = String(def.param_type) === 'number' && def.unit ? ` ${String(def.unit)}` : '';
        const summary = `${String(def.label)}: ${oldVal || 'Empty'}${oldVal ? unitSuffix : ''} → ${
          cleanVal || 'Cleared'
        }${cleanVal ? unitSuffix : ''}`;
        recordEntryEditHistory(
          id,
          report.id,
          req.user!.name,
          req.user!.roles,
          `param:${String(def.label)}`,
          oldVal,
          cleanVal,
          summary,
          now
        );
        changes.push(summary);
      }
    }

    if (changes.length > 0) {
      recordReportFootprint(
        report.id,
        req.user!.id,
        req.user!.name,
        req.user!.roles,
        'parameters_updated',
        `${String(existing.item_code)} parameters: ${changes.join('; ')}.`,
        now
      );
      db.prepare(`UPDATE inspection_entries SET updated_at = ? WHERE id = ?`).run(now, id);
      db.prepare(`UPDATE inspection_reports SET updated_at = ? WHERE id = ?`).run(now, report.id);
    }
  });

  saveTx();
  broadcastRealtime('report:changed');
  res.json({ report: getFullReportById(report.id), bootstrap: bootstrapFor(req) });
});

app.put('/api/entries/:id/pins/:pinId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id, pinId } = req.params;
  const entry = db.prepare(`SELECT * FROM inspection_entries WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!entry) {
    res.status(404).json({ error: 'Inspection entry not found.' });
    return;
  }
  const report = db
    .prepare(`SELECT id, status FROM inspection_reports WHERE id = ?`)
    .get(String(entry.report_id)) as { id: string; status: string } | undefined;
  if (!report || !canEditReportRecord(report.status, req.user!)) {
    res.status(403).json({ error: 'Only Administrators can edit visual pin findings on locked reports.' });
    return;
  }

  const pin = db.prepare(`SELECT id, pin_number, label FROM asset_pins WHERE id = ?`).get(pinId) as
    | { id: string; pin_number: number; label: string }
    | undefined;
  if (!pin) {
    res.status(404).json({ error: 'Inspection point not found.' });
    return;
  }

  const { condition, notes } = req.body as {
    condition?: ConditionStatus;
    notes?: string;
  };
  const validConditions: ConditionStatus[] = ['good', 'fair', 'needs_attention', 'critical', 'na'];
  const resolvedCondition: ConditionStatus =
    condition && validConditions.includes(condition) ? condition : 'na';
  const cleanNotes = (notes ?? '').trim();
  const now = new Date().toISOString();

  const existingResult = db
    .prepare(`SELECT id, condition, notes FROM inspection_pin_results WHERE entry_id = ? AND pin_id = ?`)
    .get(id, pinId) as { id: string; condition: string; notes: string } | undefined;

  if (existingResult) {
    db.prepare(
      `UPDATE inspection_pin_results SET condition = ?, notes = ?, updated_by = ?, updated_at = ? WHERE id = ?`
    ).run(resolvedCondition, cleanNotes, req.user!.name, now, existingResult.id);
  } else {
    db.prepare(
      `INSERT INTO inspection_pin_results (id, entry_id, pin_id, condition, notes, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(createId('pres'), id, pinId, resolvedCondition, cleanNotes, req.user!.name, now);
  }

  const prevCond = existingResult?.condition ?? 'na';
  const prevNotes = existingResult?.notes ?? '';
  if (prevCond !== resolvedCondition || prevNotes !== cleanNotes) {
    recordEntryEditHistory(
      id,
      report.id,
      req.user!.name,
      req.user!.roles,
      `pin:${pin.pin_number}`,
      `${prevCond}${prevNotes ? ` (${prevNotes})` : ''}`,
      `${resolvedCondition}${cleanNotes ? ` (${cleanNotes})` : ''}`,
      `Pin #${pin.pin_number} (${pin.label}): ${prevCond} → ${resolvedCondition}`,
      now
    );
    recordReportFootprint(
      report.id,
      req.user!.id,
      req.user!.name,
      req.user!.roles,
      'pin_updated',
      `${String(entry.item_code)} Pin #${pin.pin_number} (${pin.label}) set to ${resolvedCondition}.`,
      now
    );
  }

  db.prepare(`UPDATE inspection_entries SET updated_at = ? WHERE id = ?`).run(now, id);
  db.prepare(`UPDATE inspection_reports SET updated_at = ? WHERE id = ?`).run(now, report.id);

  broadcastRealtime('report:changed');
  res.json({ report: getFullReportById(report.id), bootstrap: bootstrapFor(req) });
});

app.post(
  '/api/entries/:id/photos',
  requireAuth,
  upload.array('photos', 8),
  (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const entry = db.prepare(`SELECT * FROM inspection_entries WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!entry) {
      res.status(404).json({ error: 'Inspection entry not found.' });
      return;
    }

    const report = db
      .prepare(`SELECT id, status FROM inspection_reports WHERE id = ?`)
      .get(String(entry.report_id)) as { id: string; status: string } | undefined;
    if (!report || !canEditReportRecord(report.status, req.user!)) {
      res.status(403).json({ error: 'Only Administrators can upload photos to locked reports.' });
      return;
    }

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      res.status(400).json({ error: 'No valid image files received.' });
      return;
    }
    for (const file of files) {
      if (!sanitizeUploadedSvg(file)) {
        res.status(400).json({ error: `Uploaded SVG "${file.originalname}" is invalid.` });
        return;
      }
    }

    const captionInput = typeof req.body.caption === 'string' ? req.body.caption.trim() : '';
    const pinIdInput =
      typeof req.body.pinId === 'string' && req.body.pinId.trim() ? req.body.pinId.trim() : null;
    const now = new Date().toISOString();
    const insertPhoto = db.prepare(
      `INSERT INTO inspection_photos (id, entry_id, pin_id, file_url, file_name, caption, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (const file of files) {
      insertPhoto.run(
        createId('pho'),
        id,
        pinIdInput,
        `/uploads/${file.filename}`,
        file.originalname,
        captionInput,
        now
      );
    }

    recordEntryEditHistory(
      id,
      report.id,
      req.user!.name,
      req.user!.roles,
      'photos',
      '—',
      `+${files.length} photo(s)`,
      `Uploaded ${files.length} evidence photo(s)`,
      now
    );

    const log = logActivity(
      req.user!.name,
      req.user!.role,
      'photo:uploaded',
      `Uploaded ${files.length} photo(s) for asset ${String(entry.item_code)}.`
    );
    broadcastRealtime('report:changed', log.summary, log);

    res.status(201).json({ report: getFullReportById(report.id), bootstrap: bootstrapFor(req) });
  }
);

app.patch('/api/photos/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const photo = db
    .prepare(
      `SELECT p.*, e.report_id, r.status AS report_status FROM inspection_photos p
       JOIN inspection_entries e ON e.id = p.entry_id
       JOIN inspection_reports r ON r.id = e.report_id
       WHERE p.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!photo) {
    res.status(404).json({ error: 'Photo not found.' });
    return;
  }
  if (!canEditReportRecord(String(photo.report_status), req.user!)) {
    res.status(403).json({ error: 'Report is locked for editing.' });
    return;
  }

  const caption = typeof req.body.caption === 'string' ? req.body.caption : '';
  db.prepare(`UPDATE inspection_photos SET caption = ? WHERE id = ?`).run(caption, id);
  broadcastRealtime('report:changed');

  res.json({ report: getFullReportById(String(photo.report_id)), bootstrap: bootstrapFor(req) });
});

app.delete('/api/photos/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const photo = db
    .prepare(
      `SELECT p.*, e.report_id, r.status AS report_status FROM inspection_photos p
       JOIN inspection_entries e ON e.id = p.entry_id
       JOIN inspection_reports r ON r.id = e.report_id
       WHERE p.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!photo) {
    res.status(404).json({ error: 'Photo not found.' });
    return;
  }
  if (!canEditReportRecord(String(photo.report_status), req.user!)) {
    res.status(403).json({ error: 'Report is locked for editing.' });
    return;
  }

  const fileUrl = String(photo.file_url);
  if (fileUrl.startsWith('/uploads/') && !fileUrl.includes('seed-')) {
    const filePath = path.join(UPLOADS_DIR, path.basename(fileUrl));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  db.prepare(`DELETE FROM inspection_photos WHERE id = ?`).run(id);
  recordEntryEditHistory(
    String(photo.entry_id),
    String(photo.report_id),
    req.user!.name,
    req.user!.roles,
    'photos',
    String(photo.file_name),
    'Removed',
    `Removed photo "${String(photo.file_name)}"`,
    new Date().toISOString()
  );

  broadcastRealtime('report:changed');
  res.json({ report: getFullReportById(String(photo.report_id)), bootstrap: bootstrapFor(req) });
});

// --- Project Monitoring, Gantt Tasks & Blocker Engine ---

function formatTaskStatusLabelServer(status: string): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'in_progress':
      return 'In Progress';
    case 'blocked':
      return 'Blocked';
    default:
      return 'Not Started';
  }
}

function recordTaskHistory(
  taskId: string,
  projectId: string,
  actorName: string,
  actorRole: UserRole,
  fieldName: string,
  oldValue: string,
  newValue: string,
  summary: string,
  createdAt: string
): void {
  db.prepare(
    `INSERT INTO task_history (id, task_id, project_id, actor_name, actor_role, field_name, old_value, new_value, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    createId('thst'),
    taskId,
    projectId,
    actorName,
    actorRole,
    fieldName,
    oldValue,
    newValue,
    summary,
    createdAt
  );
}

function recalculateBlockerStatesForTask(changedTaskId: string): void {
  const changedTask = db.prepare(`SELECT id, status FROM project_tasks WHERE id = ?`).get(changedTaskId) as
    | { id: string; status: TaskStatus }
    | undefined;
  if (!changedTask) return;

  const isDone = changedTask.status === 'completed';
  db.prepare(`UPDATE task_blockers SET is_resolved = ? WHERE blocker_task_id = ?`).run(
    isDone ? 1 : 0,
    changedTaskId
  );

  const downstreamRows = db
    .prepare(`SELECT DISTINCT blocked_task_id FROM task_blockers WHERE blocker_task_id = ?`)
    .all(changedTaskId) as { blocked_task_id: string }[];

  const now = new Date().toISOString();
  for (const row of downstreamRows) {
    const targetTask = db
      .prepare(`SELECT id, project_id, status, progress, manual_override FROM project_tasks WHERE id = ?`)
      .get(row.blocked_task_id) as
      | { id: string; project_id: string; status: TaskStatus; progress: number; manual_override: number }
      | undefined;
    if (!targetTask) continue;

    const unresolvedCount = (
      db
        .prepare(`SELECT COUNT(*) as cnt FROM task_blockers WHERE blocked_task_id = ? AND is_resolved = 0`)
        .get(targetTask.id) as { cnt: number }
    ).cnt;

    if (unresolvedCount > 0) {
      if (targetTask.manual_override === 0 && targetTask.status !== 'completed' && targetTask.status !== 'blocked') {
        db.prepare(`UPDATE project_tasks SET status = 'blocked' WHERE id = ?`).run(targetTask.id);
        recordTaskHistory(
          targetTask.id,
          targetTask.project_id,
          'Dependency Engine',
          'admin',
          'status',
          formatTaskStatusLabelServer(targetTask.status),
          'Blocked',
          `Status ${formatTaskStatusLabelServer(targetTask.status)}→Blocked (dependency active)`,
          now
        );
      }
    } else {
      if (targetTask.manual_override === 1) {
        db.prepare(`UPDATE project_tasks SET manual_override = 0 WHERE id = ?`).run(targetTask.id);
      }
      if (targetTask.status === 'blocked') {
        const nextStatus: TaskStatus = targetTask.progress > 0 ? 'in_progress' : 'not_started';
        db.prepare(`UPDATE project_tasks SET status = ? WHERE id = ?`).run(nextStatus, targetTask.id);
        recordTaskHistory(
          targetTask.id,
          targetTask.project_id,
          'Dependency Engine',
          'admin',
          'status',
          'Blocked',
          formatTaskStatusLabelServer(nextStatus),
          `Status Blocked→${formatTaskStatusLabelServer(nextStatus)} (blocker cleared)`,
          now
        );
      }
    }
  }
}

function wouldCreateCycle(blockerTaskId: string, blockedTaskId: string): boolean {
  if (blockerTaskId === blockedTaskId) return true;
  const edges = db.prepare(`SELECT blocker_task_id, blocked_task_id FROM task_blockers`).all() as {
    blocker_task_id: string;
    blocked_task_id: string;
  }[];

  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    const list = adjacency.get(e.blocker_task_id) ?? [];
    list.push(e.blocked_task_id);
    adjacency.set(e.blocker_task_id, list);
  }

  const visited = new Set<string>();
  const queue = [blockedTaskId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === blockerTaskId) return true;
    if (visited.has(curr)) continue;
    visited.add(curr);
    for (const next of adjacency.get(curr) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  return false;
}

function resolveTaskAssignee(assigneeId?: string | null, fallbackName?: string): { id: string | null; name: string } {
  if (assigneeId && assigneeId.trim()) {
    const u = db.prepare(`SELECT id, name FROM users WHERE id = ?`).get(assigneeId.trim()) as
      | { id: string; name: string }
      | undefined;
    if (u) {
      return { id: u.id, name: u.name };
    }
  }
  return { id: null, name: (fallbackName ?? '').trim() };
}

app.post('/api/projects', requireAuth, requireProjectManager, (req: AuthenticatedRequest, res: Response) => {
  const { name, code, description, cycleType, startDate, endDate, useWbs } = req.body as {
    name?: string;
    code?: string;
    description?: string;
    cycleType?: CycleType;
    startDate?: string;
    endDate?: string;
    useWbs?: boolean;
  };

  if (!name?.trim() || !startDate || !endDate) {
    res.status(400).json({ error: 'Project name, start date, and end date are required.' });
    return;
  }

  const id = createId('prj');
  const now = new Date().toISOString();
  const useWbsFlag = useWbs === false ? 0 : 1;
  db.prepare(
    `INSERT INTO projects (id, name, code, description, cycle_type, start_date, end_date, use_wbs, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    name.trim(),
    (code ?? '').trim().toUpperCase() || `PRJ-${Math.floor(100 + Math.random() * 900)}`,
    (description ?? '').trim(),
    normalizeCycleType(cycleType, 'yearly'),
    startDate,
    endDate < startDate ? startDate : endDate,
    useWbsFlag,
    now
  );

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'project:created',
    `Created project ${name.trim()} (${useWbsFlag ? 'WBS enabled' : 'WBS disabled'}).`
  );
  broadcastRealtime('project:changed', log.summary, log);

  res.status(201).json({ id, bootstrap: bootstrapFor(req) });
});

app.patch('/api/projects/:id', requireAuth, requireProjectManager, (req: AuthenticatedRequest, res: Response) => {
  const existing = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }

  const body = req.body as {
    name?: string;
    code?: string;
    description?: string;
    cycleType?: CycleType;
    startDate?: string;
    endDate?: string;
    useWbs?: boolean;
  };

  const nextName = typeof body.name === 'string' ? body.name.trim() : String(existing.name);
  if (!nextName) {
    res.status(400).json({ error: 'Project name cannot be empty.' });
    return;
  }
  const nextCode =
    typeof body.code === 'string' && body.code.trim()
      ? body.code.trim().toUpperCase()
      : String(existing.code);
  const nextDesc =
    typeof body.description === 'string' ? body.description.trim() : String(existing.description ?? '');
  const nextCycle =
    body.cycleType !== undefined
      ? normalizeCycleType(body.cycleType, String(existing.cycle_type) as CycleType)
      : (String(existing.cycle_type) as CycleType);
  const nextStart = typeof body.startDate === 'string' && body.startDate ? body.startDate : String(existing.start_date);
  const rawEnd = typeof body.endDate === 'string' && body.endDate ? body.endDate : String(existing.end_date);
  const nextEnd = rawEnd < nextStart ? nextStart : rawEnd;
  const nextUseWbs =
    typeof body.useWbs === 'boolean'
      ? body.useWbs
        ? 1
        : 0
      : Number(existing.use_wbs ?? 1);

  db.prepare(
    `UPDATE projects
     SET name = ?, code = ?, description = ?, cycle_type = ?, start_date = ?, end_date = ?, use_wbs = ?
     WHERE id = ?`
  ).run(nextName, nextCode, nextDesc, nextCycle, nextStart, nextEnd, nextUseWbs, req.params.id);

  const wbsToggled =
    typeof body.useWbs === 'boolean' && (body.useWbs ? 1 : 0) !== Number(existing.use_wbs ?? 1);
  const summary = wbsToggled
    ? `${body.useWbs ? 'Enabled' : 'Disabled'} WBS numbering for project ${nextCode} · ${nextName}.`
    : `Updated project settings for ${nextCode} · ${nextName}.`;

  const log = logActivity(req.user!.name, req.user!.role, 'project:updated', summary);
  broadcastRealtime('project:changed', summary, log);

  res.json({ id: req.params.id, bootstrap: bootstrapFor(req) });
});

app.post('/api/tasks', requireAuth, requireProjectManager, (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as {
    projectId?: string;
    parentId?: string | null;
    wbsCode?: string;
    title?: string;
    taskType?: TaskType;
    assigneeId?: string | null;
    assigneeName?: string;
    startDate?: string;
    endDate?: string;
    progress?: number;
    status?: TaskStatus;
    linkedCycle?: CycleType | 'none';
    notes?: string;
    dependsOnParent?: boolean;
  };

  if (!body.projectId || !body.title?.trim() || !body.startDate || !body.endDate) {
    res.status(400).json({ error: 'Project, task title, start date, and end date are required.' });
    return;
  }

  const resolvedAssignee = body.assigneeId
    ? resolveTaskAssignee(body.assigneeId, body.assigneeName)
    : body.assigneeName?.trim()
    ? resolveTaskAssignee(null, body.assigneeName)
    : { id: req.user!.id, name: req.user!.name };

  const maxOrderRow = db
    .prepare(`SELECT COALESCE(MAX(sort_order), 0) as max_order FROM project_tasks WHERE project_id = ?`)
    .get(body.projectId) as { max_order: number };

  const id = createId('tsk');
  const now = new Date().toISOString();
  const progress = Math.max(0, Math.min(100, Number(body.progress ?? 0)));
  let status: TaskStatus =
    body.status ?? (progress === 100 ? 'completed' : progress > 0 ? 'in_progress' : 'not_started');

  let parentRow: { id: string; wbs_code: string; title: string; status: TaskStatus } | undefined;
  if (body.dependsOnParent && body.parentId) {
    parentRow = db
      .prepare(`SELECT id, wbs_code, title, status FROM project_tasks WHERE id = ?`)
      .get(body.parentId) as { id: string; wbs_code: string; title: string; status: TaskStatus } | undefined;
    if (parentRow && parentRow.status !== 'completed' && status !== 'completed') {
      status = 'blocked';
    }
  }

  db.prepare(
    `INSERT INTO project_tasks
     (id, project_id, parent_id, wbs_code, title, task_type, assignee_id, assignee_name, start_date, end_date, progress, status, manual_override, linked_cycle, notes, sort_order, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
  ).run(
    id,
    body.projectId,
    body.parentId || null,
    (body.wbsCode ?? '').trim() || `${maxOrderRow.max_order + 1}`,
    body.title.trim(),
    body.taskType === 'phase' || body.taskType === 'milestone' ? body.taskType : 'task',
    resolvedAssignee.id,
    resolvedAssignee.name,
    body.startDate,
    body.endDate < body.startDate ? body.startDate : body.endDate,
    progress,
    status,
    body.linkedCycle === 'routine' || body.linkedCycle === 'yearly' || body.linkedCycle === 'eventual'
      ? body.linkedCycle
      : 'none',
    (body.notes ?? '').trim(),
    maxOrderRow.max_order + 1,
    now
  );

  if (parentRow) {
    db.prepare(
      `INSERT INTO task_blockers
       (id, project_id, blocker_task_id, blocked_task_id, dependency_type, blocker_reason, is_resolved, created_at)
       VALUES (?, ?, ?, ?, 'FS', ?, ?, ?)`
    ).run(
      createId('blk'),
      body.projectId,
      parentRow.id,
      id,
      `Depends on parent ${parentRow.wbs_code} ${parentRow.title}`,
      parentRow.status === 'completed' ? 1 : 0,
      now
    );
  }

  recordTaskHistory(
    id,
    body.projectId,
    req.user!.name,
    req.user!.role,
    'created',
    '—',
    `${progress}%`,
    `Activity created (${progress}%, ${formatTaskStatusLabelServer(status)})`,
    now
  );

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'task:created',
    `Added WBS activity "${body.title.trim()}" assigned to ${resolvedAssignee.name}.`
  );
  broadcastRealtime('task:changed', log.summary, log);

  res.status(201).json({ id, bootstrap: bootstrapFor(req) });
});

app.patch('/api/tasks/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare(`SELECT * FROM project_tasks WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }

  const isAdmin = userHasAnyRole(req.user, 'admin');
  const isApprover = userHasAnyRole(req.user, 'approver');
  const isAssignee =
    (existing.assignee_id && String(existing.assignee_id) === req.user!.id) ||
    String(existing.assignee_name).toLowerCase() === req.user!.name.toLowerCase();

  if (!isAdmin && !isApprover && !isAssignee) {
    res.status(403).json({
      error: 'Only Admins, Approvers, or the assigned user can update this activity.',
    });
    return;
  }

  if (String(existing.status) === 'completed' && !isAdmin) {
    res.status(403).json({
      error: 'Completed activities are locked. Only Administrators can edit finalized items.',
    });
    return;
  }

  const body = req.body as Partial<{
    parentId: string | null;
    wbsCode: string;
    title: string;
    taskType: TaskType;
    assigneeId: string | null;
    assigneeName: string;
    startDate: string;
    endDate: string;
    progress: number;
    status: TaskStatus;
    manualOverride: boolean;
    linkedCycle: CycleType | 'none';
    notes: string;
    forceOverride: boolean;
  }>;

  let nextProgress =
    body.progress !== undefined ? Math.max(0, Math.min(100, body.progress)) : Number(existing.progress);
  let nextStatus: TaskStatus = body.status ?? (String(existing.status) as TaskStatus);

  if (body.status === 'completed' && body.progress === undefined) {
    nextProgress = 100;
  } else if (body.progress === 100 && body.status === undefined) {
    nextStatus = 'completed';
  } else if (body.progress !== undefined && body.progress > 0 && body.progress < 100 && body.status === undefined) {
    if (String(existing.status) === 'not_started' || String(existing.status) === 'completed') {
      nextStatus = 'in_progress';
    }
  }

  const blockingRows = db
    .prepare(
      `SELECT pt.id, pt.wbs_code, pt.title, pt.status
       FROM task_blockers tb
       JOIN project_tasks pt ON pt.id = tb.blocker_task_id
       WHERE tb.blocked_task_id = ? AND tb.is_resolved = 0 AND pt.status != 'completed'`
    )
    .all(id) as { id: string; wbs_code: string; title: string; status: string }[];

  const isStatusChangeAttempt =
    (body.status !== undefined && body.status !== String(existing.status) && body.status !== 'blocked') ||
    (String(existing.status) === 'blocked' &&
      (nextStatus !== 'blocked' || (body.progress !== undefined && body.progress > Number(existing.progress))));

  if (blockingRows.length > 0 && isStatusChangeAttempt && !body.forceOverride) {
    res.status(409).json({
      error: `"${String(existing.title)}" is blocked because ${blockingRows
        .map((b) => `${b.wbs_code} ${b.title}`)
        .join(', ')} is not yet completed. Confirm manual override to proceed anyway.`,
      blockingTasks: blockingRows,
    });
    return;
  }

  let nextManualOverride = Number(existing.manual_override ?? 0);
  if (nextStatus === 'blocked' || blockingRows.length === 0) {
    nextManualOverride = 0;
  } else if (body.forceOverride && blockingRows.length > 0) {
    nextManualOverride = 1;
  } else if (body.manualOverride !== undefined) {
    nextManualOverride = body.manualOverride ? 1 : 0;
  }

  const nextStart = body.startDate ?? String(existing.start_date);
  let nextEnd = body.endDate ?? String(existing.end_date);
  if (nextEnd < nextStart) nextEnd = nextStart;

  const nextWbs = body.wbsCode !== undefined ? body.wbsCode.trim() : String(existing.wbs_code);
  const nextTitle = body.title !== undefined ? body.title.trim() : String(existing.title);

  let nextAssigneeId: string | null = existing.assignee_id ? String(existing.assignee_id) : null;
  let nextAssigneeName = String(existing.assignee_name);
  if (body.assigneeId !== undefined || body.assigneeName !== undefined) {
    const resolved = resolveTaskAssignee(
      body.assigneeId !== undefined ? body.assigneeId : nextAssigneeId,
      body.assigneeName !== undefined ? body.assigneeName : nextAssigneeName
    );
    nextAssigneeId = resolved.id;
    nextAssigneeName = resolved.name;
  }

  const nextLinkedCycle =
    body.linkedCycle !== undefined
      ? body.linkedCycle === 'routine' || body.linkedCycle === 'yearly' || body.linkedCycle === 'eventual'
        ? body.linkedCycle
        : 'none'
      : String(existing.linked_cycle);
  const nextNotes = body.notes !== undefined ? body.notes : String(existing.notes);

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE project_tasks
     SET parent_id = ?, wbs_code = ?, title = ?, task_type = ?, assignee_id = ?, assignee_name = ?,
         start_date = ?, end_date = ?, progress = ?, status = ?, manual_override = ?, linked_cycle = ?, notes = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    body.parentId !== undefined ? body.parentId : existing.parent_id ? String(existing.parent_id) : null,
    nextWbs,
    nextTitle,
    body.taskType ?? String(existing.task_type),
    nextAssigneeId,
    nextAssigneeName,
    nextStart,
    nextEnd,
    nextProgress,
    nextStatus,
    nextManualOverride,
    nextLinkedCycle,
    nextNotes,
    now,
    id
  );

  const projId = String(existing.project_id);
  const oldProgress = Number(existing.progress);
  const oldStatus = String(existing.status);
  const oldStart = String(existing.start_date);
  const oldEnd = String(existing.end_date);
  const oldAssignee = String(existing.assignee_name);
  const oldTitle = String(existing.title);
  const oldWbs = String(existing.wbs_code);
  const oldNotes = String(existing.notes);

  if (oldProgress !== nextProgress) {
    recordTaskHistory(
      id,
      projId,
      req.user!.name,
      req.user!.role,
      'progress',
      `${oldProgress}%`,
      `${nextProgress}%`,
      `Work Progress ${oldProgress}%→${nextProgress}%`,
      now
    );
  }
  if (oldStatus !== nextStatus) {
    recordTaskHistory(
      id,
      projId,
      req.user!.name,
      req.user!.role,
      'status',
      formatTaskStatusLabelServer(oldStatus),
      formatTaskStatusLabelServer(nextStatus),
      `Status ${formatTaskStatusLabelServer(oldStatus)}→${formatTaskStatusLabelServer(nextStatus)}${
        nextManualOverride ? ' (Manual Override)' : ''
      }`,
      now
    );
  }
  if (oldStart !== nextStart || oldEnd !== nextEnd) {
    recordTaskHistory(
      id,
      projId,
      req.user!.name,
      req.user!.role,
      'schedule',
      `${oldStart} → ${oldEnd}`,
      `${nextStart} → ${nextEnd}`,
      `Schedule ${oldStart}..${oldEnd}→${nextStart}..${nextEnd}`,
      now
    );
  }
  if (oldAssignee !== nextAssigneeName) {
    recordTaskHistory(
      id,
      projId,
      req.user!.name,
      req.user!.role,
      'assignee',
      oldAssignee || 'Unassigned',
      nextAssigneeName || 'Unassigned',
      `Assignee ${oldAssignee || 'Unassigned'}→${nextAssigneeName || 'Unassigned'}`,
      now
    );
  }
  if (oldTitle !== nextTitle) {
    recordTaskHistory(
      id,
      projId,
      req.user!.name,
      req.user!.role,
      'title',
      oldTitle,
      nextTitle,
      `Title "${oldTitle}"→"${nextTitle}"`,
      now
    );
  }
  if (oldWbs !== nextWbs) {
    recordTaskHistory(
      id,
      projId,
      req.user!.name,
      req.user!.role,
      'wbs',
      oldWbs,
      nextWbs,
      `WBS ${oldWbs}→${nextWbs}`,
      now
    );
  }
  if (oldNotes !== nextNotes) {
    recordTaskHistory(
      id,
      projId,
      req.user!.name,
      req.user!.role,
      'notes',
      oldNotes ? 'Previous notes' : 'Empty',
      nextNotes ? 'Updated notes' : 'Cleared',
      'Execution Notes updated',
      now
    );
  }

  recalculateBlockerStatesForTask(id);

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'task:updated',
    `Updated "${nextTitle}" (${nextProgress}%, ${nextStatus.replace('_', ' ')}${
      nextManualOverride ? ', manual override' : ''
    }).`
  );
  broadcastRealtime('task:changed', log.summary, log);

  res.json({ bootstrap: bootstrapFor(req) });
});

app.post('/api/tasks/:id/comments', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const task = db.prepare(`SELECT id, project_id, wbs_code, title FROM project_tasks WHERE id = ?`).get(id) as
    | { id: string; project_id: string; wbs_code: string; title: string }
    | undefined;
  if (!task) {
    res.status(404).json({ error: 'Activity not found.' });
    return;
  }

  const { body } = req.body as { body?: string };
  const cleanBody = (body ?? '').trim();
  if (!cleanBody) {
    res.status(400).json({ error: 'Comment text cannot be empty.' });
    return;
  }

  const commentId = createId('tcmt');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO task_comments (id, task_id, project_id, author_id, author_name, author_role, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(commentId, id, task.project_id, req.user!.id, req.user!.name, req.user!.role, cleanBody, now);

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'task:commented',
    `Commented on ${task.wbs_code} "${task.title}".`
  );
  broadcastRealtime('task:changed', log.summary, log);

  res.status(201).json({ id: commentId, bootstrap: bootstrapFor(req) });
});

app.delete(
  '/api/tasks/:taskId/comments/:commentId',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const { taskId, commentId } = req.params;
    const existing = db
      .prepare(`SELECT id, author_id FROM task_comments WHERE id = ? AND task_id = ?`)
      .get(commentId, taskId) as { id: string; author_id: string | null } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Comment not found.' });
      return;
    }
    if (!userHasAnyRole(req.user, 'admin') && existing.author_id !== req.user!.id) {
      res.status(403).json({ error: 'You can only remove your own comments.' });
      return;
    }

    db.prepare(`DELETE FROM task_comments WHERE id = ?`).run(commentId);
    broadcastRealtime('task:changed');
    res.json({ bootstrap: bootstrapFor(req) });
  }
);

app.delete('/api/tasks/:id', requireAuth, requireProjectManager, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare(`SELECT title FROM project_tasks WHERE id = ?`).get(id) as
    | { title: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }

  const impactedDownstream = db
    .prepare(`SELECT blocked_task_id FROM task_blockers WHERE blocker_task_id = ?`)
    .all(id) as { blocked_task_id: string }[];

  db.prepare(`DELETE FROM project_tasks WHERE id = ?`).run(id);

  for (const row of impactedDownstream) {
    const remainingBlockers = (
      db
        .prepare(`SELECT COUNT(*) as cnt FROM task_blockers WHERE blocked_task_id = ? AND is_resolved = 0`)
        .get(row.blocked_task_id) as { cnt: number }
    ).cnt;
    if (remainingBlockers === 0) {
      const target = db
        .prepare(`SELECT status, progress FROM project_tasks WHERE id = ?`)
        .get(row.blocked_task_id) as { status: TaskStatus; progress: number } | undefined;
      if (target && target.status === 'blocked') {
        db.prepare(`UPDATE project_tasks SET status = ? WHERE id = ?`).run(
          target.progress > 0 ? 'in_progress' : 'not_started',
          row.blocked_task_id
        );
      }
    }
  }

  const log = logActivity(req.user!.name, req.user!.role, 'task:deleted', `Removed task "${existing.title}".`);
  broadcastRealtime('task:changed', log.summary, log);

  res.json({ bootstrap: bootstrapFor(req) });
});

app.post('/api/blockers', requireAuth, requireProjectManager, (req: AuthenticatedRequest, res: Response) => {
  const { projectId, blockerTaskId, blockedTaskId, dependencyType, blockerReason } = req.body as {
    projectId?: string;
    blockerTaskId?: string;
    blockedTaskId?: string;
    dependencyType?: DependencyType;
    blockerReason?: string;
  };

  if (!projectId || !blockerTaskId || !blockedTaskId) {
    res.status(400).json({ error: 'Upstream blocker activity and downstream blocked activity are required.' });
    return;
  }

  if (blockerTaskId === blockedTaskId) {
    res.status(400).json({ error: 'An activity cannot block itself.' });
    return;
  }

  if (wouldCreateCycle(blockerTaskId, blockedTaskId)) {
    res.status(400).json({ error: 'Circular dependency detected. This link would create an infinite blocker loop.' });
    return;
  }

  const upstream = db.prepare(`SELECT id, wbs_code, title, status FROM project_tasks WHERE id = ?`).get(blockerTaskId) as
    | { id: string; wbs_code: string; title: string; status: TaskStatus }
    | undefined;
  const downstream = db
    .prepare(`SELECT id, wbs_code, title, status, manual_override FROM project_tasks WHERE id = ?`)
    .get(blockedTaskId) as
    | { id: string; wbs_code: string; title: string; status: TaskStatus; manual_override: number }
    | undefined;

  if (!upstream || !downstream) {
    res.status(404).json({ error: 'One or both selected tasks do not exist.' });
    return;
  }

  const duplicate = db
    .prepare(`SELECT id FROM task_blockers WHERE blocker_task_id = ? AND blocked_task_id = ?`)
    .get(blockerTaskId, blockedTaskId);
  if (duplicate) {
    res.status(409).json({ error: 'This blocker relationship already exists.' });
    return;
  }

  const isResolved = upstream.status === 'completed' ? 1 : 0;
  const id = createId('blk');
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO task_blockers
     (id, project_id, blocker_task_id, blocked_task_id, dependency_type, blocker_reason, is_resolved, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    projectId,
    blockerTaskId,
    blockedTaskId,
    dependencyType === 'SS' ? 'SS' : 'FS',
    (blockerReason ?? '').trim() || `Waiting on ${upstream.wbs_code} ${upstream.title}`,
    isResolved,
    now
  );

  if (isResolved === 0 && downstream.status !== 'completed' && downstream.manual_override === 0) {
    db.prepare(`UPDATE project_tasks SET status = 'blocked', updated_at = ? WHERE id = ?`).run(now, blockedTaskId);
  }

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'blocker:created',
    `Flagged ${downstream.wbs_code} "${downstream.title}" as blocked by ${upstream.wbs_code} "${upstream.title}".`
  );
  broadcastRealtime('blocker:changed', log.summary, log);

  res.status(201).json({ id, bootstrap: bootstrapFor(req) });
});

app.patch('/api/blockers/:id', requireAuth, requireProjectManager, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare(`SELECT * FROM task_blockers WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Blocker record not found.' });
    return;
  }

  const { blockerTaskId, dependencyType, blockerReason, isResolved } = req.body as {
    blockerTaskId?: string;
    dependencyType?: DependencyType;
    blockerReason?: string;
    isResolved?: boolean;
  };

  const currentBlockedTaskId = String(existing.blocked_task_id);
  const nextBlockerTaskId = blockerTaskId ?? String(existing.blocker_task_id);

  if (nextBlockerTaskId !== String(existing.blocker_task_id)) {
    if (nextBlockerTaskId === currentBlockedTaskId) {
      res.status(400).json({ error: 'An activity cannot block itself.' });
      return;
    }
    if (wouldCreateCycle(nextBlockerTaskId, currentBlockedTaskId)) {
      res.status(400).json({ error: 'Circular dependency detected.' });
      return;
    }
    const dup = db
      .prepare(`SELECT id FROM task_blockers WHERE blocker_task_id = ? AND blocked_task_id = ? AND id != ?`)
      .get(nextBlockerTaskId, currentBlockedTaskId, id);
    if (dup) {
      res.status(409).json({ error: 'This blocker relationship already exists.' });
      return;
    }
  }

  const nextType: DependencyType =
    dependencyType === 'SS' || dependencyType === 'FS'
      ? dependencyType
      : (String(existing.dependency_type) as DependencyType);
  const nextResolved = isResolved !== undefined ? (isResolved ? 1 : 0) : Number(existing.is_resolved);
  const nextReason = blockerReason !== undefined ? blockerReason.trim() : String(existing.blocker_reason);

  db.prepare(
    `UPDATE task_blockers
     SET blocker_task_id = ?, dependency_type = ?, blocker_reason = ?, is_resolved = ?
     WHERE id = ?`
  ).run(nextBlockerTaskId, nextType, nextReason, nextResolved, id);

  const remaining = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM task_blockers WHERE blocked_task_id = ? AND is_resolved = 0`)
      .get(currentBlockedTaskId) as { cnt: number }
  ).cnt;

  const target = db
    .prepare(`SELECT status, progress, manual_override FROM project_tasks WHERE id = ?`)
    .get(currentBlockedTaskId) as { status: TaskStatus; progress: number; manual_override: number } | undefined;

  if (target) {
    if (remaining > 0) {
      if (target.manual_override === 0 && target.status !== 'completed') {
        db.prepare(`UPDATE project_tasks SET status = 'blocked' WHERE id = ?`).run(currentBlockedTaskId);
      }
    } else {
      db.prepare(`UPDATE project_tasks SET manual_override = 0 WHERE id = ?`).run(currentBlockedTaskId);
      if (target.status === 'blocked') {
        db.prepare(`UPDATE project_tasks SET status = ? WHERE id = ?`).run(
          target.progress > 0 ? 'in_progress' : 'not_started',
          currentBlockedTaskId
        );
      }
    }
  }

  const log = logActivity(
    req.user!.name,
    req.user!.role,
    'blocker:updated',
    nextResolved ? 'Marked activity blocker cleared.' : 'Updated activity blocker details.'
  );
  broadcastRealtime('blocker:changed', log.summary, log);

  res.json({ bootstrap: bootstrapFor(req) });
});

app.delete('/api/blockers/:id', requireAuth, requireProjectManager, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare(`SELECT blocked_task_id FROM task_blockers WHERE id = ?`).get(id) as
    | { blocked_task_id: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Blocker record not found.' });
    return;
  }

  db.prepare(`DELETE FROM task_blockers WHERE id = ?`).run(id);

  const remaining = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM task_blockers WHERE blocked_task_id = ? AND is_resolved = 0`)
      .get(existing.blocked_task_id) as { cnt: number }
  ).cnt;
  if (remaining === 0) {
    const target = db.prepare(`SELECT status, progress FROM project_tasks WHERE id = ?`).get(existing.blocked_task_id) as
      | { status: TaskStatus; progress: number }
      | undefined;
    if (target && target.status === 'blocked') {
      db.prepare(`UPDATE project_tasks SET status = ? WHERE id = ?`).run(
        target.progress > 0 ? 'in_progress' : 'not_started',
        existing.blocked_task_id
      );
    }
  }

  const log = logActivity(req.user!.name, req.user!.role, 'blocker:deleted', 'Removed activity blocker link.');
  broadcastRealtime('blocker:changed', log.summary, log);

  res.json({ bootstrap: bootstrapFor(req) });
});

// Error handler for multer / unexpected route errors
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: 'Image file exceeds the 25 MB upload limit. Please use a smaller or compressed image.',
      });
      return;
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      res.status(400).json({
        error: 'Too many files uploaded at once (maximum 8 images per batch).',
      });
      return;
    }
    res.status(400).json({ error: err.message || 'File upload rejected.' });
    return;
  }
  res.status(400).json({ error: err.message || 'Unexpected server error.' });
});

const PORTABLE_MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

function listenWithPortableFallback(initialPort: number): Promise<number> {
  const allowPortFallback = isPortableExeRuntime();
  const maxAttempts = allowPortFallback ? 25 : 1;

  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryListen = (candidatePort: number) => {
      const onError = (err: NodeJS.ErrnoException) => {
        server.removeListener('listening', onListening);
        if (err.code === 'EADDRINUSE' && attempt + 1 < maxAttempts) {
          attempt += 1;
          tryListen(candidatePort + 1);
          return;
        }
        reject(err);
      };
      const onListening = () => {
        server.removeListener('error', onError);
        resolve(candidatePort);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(candidatePort, '0.0.0.0');
    };
    tryListen(initialPort);
  });
}

async function startServer(): Promise<void> {
  const initialPort = Number(process.env.PORT ?? 3000);
  if (isPortableExeRuntime()) {
    app.get('*', (req, res) => {
      const cleanPath = (req.path || '/').replace(/^\/+/, '');
      const candidates = cleanPath ? [`dist/${cleanPath}`, cleanPath] : ['dist/index.html'];
      for (const key of candidates) {
        const buf = readSeaAssetBuffer(key);
        if (buf) {
          const ext = path.extname(key).toLowerCase();
          res.setHeader('Content-Type', PORTABLE_MIME_TYPES[ext] ?? 'application/octet-stream');
          if (key.startsWith('dist/assets/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
          res.send(buf);
          return;
        }
      }
      const indexBuf = readSeaAssetBuffer('dist/index.html');
      if (indexBuf) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(indexBuf);
        return;
      }
      res.status(404).send('IndSpectora portable frontend bundle missing.');
    });
  } else if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const boundPort = await listenWithPortableFallback(initialPort);
  if (isPortableExeRuntime()) {
    const localUrl = `http://localhost:${boundPort}`;
    console.log('');
    console.log('============================================================');
    console.log('  IndSpectora Portable (Windows Standalone - No Admin Needed)');
    console.log(`  App URL     : ${localUrl}`);
    console.log(`  Data Folder : ${getDataDir()}`);
    console.log('  Status      : Running (Keep this window open; Ctrl+C stops)');
    console.log('============================================================');
    console.log('');
    if (process.platform === 'win32' && process.env.INDSPECTORA_NO_BROWSER !== '1') {
      execFile('cmd.exe', ['/c', 'start', '', localUrl], () => {
        // Ignore browser launch errors in restricted shells
      });
    }
  } else {
    console.log(`IndSpectora server listening on http://0.0.0.0:${boundPort}`);
  }
}

startServer();
