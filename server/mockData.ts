/**
 * IndSpectora — Non-Destructive Developer Mock Data Engine
 * @author Aoraki CreaLabs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  UPLOADS_DIR,
  db,
  getWorkspaceSettingBoolean,
  hashPassword,
  normalizeRoles,
  setWorkspaceSetting,
} from './db.ts';

const MOCK_SVG_FILES = ['mock-rotary-dryer.svg', 'mock-switchgear-panel.svg'];

function writeMockSchematics(): void {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const dryerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 520" width="920" height="520">
  <rect width="920" height="520" fill="#f8fafc"/>
  <rect x="24" y="24" width="872" height="472" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <text x="48" y="60" font-family="monospace" font-size="16" font-weight="bold" fill="#0f172a">AST-M01 · ROTARY POWDER DRYER GENERAL ARRANGEMENT</text>
  <line x1="48" y1="74" x2="872" y2="74" stroke="#e2e8f0" stroke-width="1.5"/>
  <!-- Feed Hopper -->
  <polygon points="100,150 200,150 180,240 120,240" fill="#eff6ff" stroke="#1d4ed8" stroke-width="2.5"/>
  <text x="115" y="138" font-family="sans-serif" font-size="12" fill="#334155">Feed Hopper</text>
  <!-- Rotary Drum Shell -->
  <rect x="210" y="185" width="440" height="145" rx="12" fill="#f1f5f9" stroke="#334155" stroke-width="3"/>
  <line x1="320" y1="185" x2="320" y2="330" stroke="#94a3b8" stroke-dasharray="6,4" stroke-width="1.5"/>
  <line x1="430" y1="185" x2="430" y2="330" stroke="#94a3b8" stroke-dasharray="6,4" stroke-width="1.5"/>
  <line x1="540" y1="185" x2="540" y2="330" stroke="#94a3b8" stroke-dasharray="6,4" stroke-width="1.5"/>
  <text x="348" y="262" font-family="sans-serif" font-size="15" font-weight="bold" fill="#0f172a">ROTARY DRUM SHELL</text>
  <!-- Trunnion Supports -->
  <rect x="245" y="330" width="60" height="55" fill="#e2e8f0" stroke="#475569" stroke-width="2"/>
  <rect x="555" y="330" width="60" height="55" fill="#e2e8f0" stroke="#475569" stroke-width="2"/>
  <circle cx="275" cy="340" r="14" fill="#94a3b8" stroke="#1e293b" stroke-width="2"/>
  <circle cx="585" cy="340" r="14" fill="#94a3b8" stroke="#1e293b" stroke-width="2"/>
  <!-- Drive Motor & Gearbox -->
  <rect x="245" y="405" width="110" height="50" rx="4" fill="#dbeafe" stroke="#1d4ed8" stroke-width="2"/>
  <text x="262" y="435" font-family="sans-serif" font-size="12" font-weight="bold" fill="#1e40af">Drive Gearbox</text>
  <!-- Exhaust Cyclone -->
  <polygon points="695,130 815,130 785,290 725,290" fill="#fef3c7" stroke="#d97706" stroke-width="2.5"/>
  <rect x="738" y="85" width="34" height="45" fill="#fde68a" stroke="#d97706" stroke-width="2"/>
  <path d="M 650 230 L 708 230" stroke="#475569" stroke-width="5"/>
  <text x="698" y="315" font-family="sans-serif" font-size="12" fill="#334155">Exhaust Baghouse</text>
</svg>`;

  const switchgearSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 520" width="920" height="520">
  <rect width="920" height="520" fill="#f8fafc"/>
  <rect x="24" y="24" width="872" height="472" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <text x="48" y="60" font-family="monospace" font-size="16" font-weight="bold" fill="#0f172a">AST-M02 · 480V MAIN SWITCHGEAR &amp; MCC LINEUP</text>
  <line x1="48" y1="74" x2="872" y2="74" stroke="#e2e8f0" stroke-width="1.5"/>
  <!-- Busbar Header -->
  <rect x="75" y="105" width="770" height="52" rx="4" fill="#fef2f2" stroke="#dc2626" stroke-width="2"/>
  <text x="360" y="136" font-family="monospace" font-size="13" font-weight="bold" fill="#991b1b">MAIN 480V COPPER BUSBAR CHAMBER</text>
  <!-- Bay 1 -->
  <rect x="75" y="175" width="235" height="275" rx="4" fill="#f1f5f9" stroke="#334155" stroke-width="2"/>
  <rect x="115" y="205" width="155" height="65" fill="#e2e8f0" stroke="#475569" stroke-width="1.5"/>
  <text x="132" y="242" font-family="monospace" font-size="12" fill="#0f172a">INCOMER BREAKER</text>
  <circle cx="192" cy="340" r="24" fill="#dcfce7" stroke="#16a34a" stroke-width="2.5"/>
  <text x="172" y="344" font-family="monospace" font-size="11" font-weight="bold" fill="#166534">CLOSED</text>
  <!-- Bay 2 -->
  <rect x="342" y="175" width="235" height="275" rx="4" fill="#f1f5f9" stroke="#334155" stroke-width="2"/>
  <rect x="378" y="205" width="162" height="75" fill="#eff6ff" stroke="#1d4ed8" stroke-width="1.5"/>
  <text x="394" y="246" font-family="monospace" font-size="12" fill="#1e40af">DIGITAL METER</text>
  <rect x="378" y="310" width="162" height="100" fill="#ffffff" stroke="#64748b" stroke-width="1.5"/>
  <text x="396" y="365" font-family="sans-serif" font-size="12" fill="#334155">IR Viewing Window</text>
  <!-- Bay 3 -->
  <rect x="610" y="175" width="235" height="275" rx="4" fill="#f1f5f9" stroke="#334155" stroke-width="2"/>
  <rect x="646" y="205" width="162" height="105" fill="#fffbeb" stroke="#d97706" stroke-width="1.5"/>
  <text x="665" y="262" font-family="sans-serif" font-size="12" fill="#92400e">Feeder Relay Rack</text>
  <rect x="646" y="335" width="162" height="75" fill="#e2e8f0" stroke="#475569" stroke-width="1.5"/>
  <text x="664" y="378" font-family="sans-serif" font-size="12" fill="#0f172a">Ground Termination</text>
</svg>`;

  fs.writeFileSync(path.join(UPLOADS_DIR, 'mock-rotary-dryer.svg'), dryerSvg, 'utf8');
  fs.writeFileSync(path.join(UPLOADS_DIR, 'mock-switchgear-panel.svg'), switchgearSvg, 'utf8');
}

function removeMockSchematics(): void {
  try {
    const mockUrls = db
      .prepare(`SELECT drawing_url FROM library_items WHERE is_mock = 1 AND drawing_url IS NOT NULL`)
      .all() as { drawing_url: string }[];
    for (const row of mockUrls) {
      if (row.drawing_url.startsWith('/uploads/')) {
        const target = path.join(UPLOADS_DIR, path.basename(row.drawing_url));
        if (fs.existsSync(target)) fs.unlinkSync(target);
      }
    }
    const mockPhotos = db
      .prepare(`SELECT file_url FROM inspection_photos WHERE is_mock = 1`)
      .all() as { file_url: string }[];
    for (const row of mockPhotos) {
      if (row.file_url.startsWith('/uploads/')) {
        const target = path.join(UPLOADS_DIR, path.basename(row.file_url));
        if (fs.existsSync(target)) fs.unlinkSync(target);
      }
    }
    for (const fname of MOCK_SVG_FILES) {
      const target = path.join(UPLOADS_DIR, fname);
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
  } catch {
    // Best-effort cleanup
  }
}

export const DEV_SANDBOX_USER_IDS = ['usr_mock_app_01', 'usr_mock_ops_01'] as const;

function randomSandboxSecretHash(): string {
  return hashPassword(crypto.randomBytes(24).toString('hex'));
}

export function ensureDevDemoUsers(): void {
  const now = new Date().toISOString();
  const insertUser = db.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, password_hash, role, roles_json, title, is_mock, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
  );
  insertUser.run(
    'usr_mock_app_01',
    'Elena Rostova (Sample)',
    'elena.sample@indspectora.local',
    randomSandboxSecretHash(),
    'approver',
    JSON.stringify(['approver']),
    'EHS & Reliability Approver',
    now
  );
  insertUser.run(
    'usr_mock_ops_01',
    'Marcus Chen (Sample)',
    'marcus.sample@indspectora.local',
    randomSandboxSecretHash(),
    'user',
    JSON.stringify(['user']),
    'Lead Plant Technician',
    now
  );
}

export function cleanupDevDemoUsersIfMockOff(): void {
  const mockDataEnabled = getWorkspaceSettingBoolean('mock_data_enabled', false);
  const runCleanup = db.transaction(() => {
    // Always terminate active sandbox sessions when login quick-demo is disabled
    db.prepare(
      `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE COALESCE(is_mock, 0) = 1)`
    ).run();

    if (!mockDataEnabled) {
      db.prepare(
        `DELETE FROM users WHERE id IN ('usr_mock_app_01', 'usr_mock_ops_01') AND COALESCE(is_mock, 0) = 1`
      ).run();
    }
  });
  runCleanup();
}

export function purgeMockData(excludeUserId?: string): void {
  const runPurge = db.transaction(() => {
    removeMockSchematics();

    // Terminate active sessions of mock users before deleting them
    if (excludeUserId) {
      db.prepare(
        `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE COALESCE(is_mock, 0) = 1 AND id != ?)`
      ).run(excludeUserId);
    } else {
      db.prepare(
        `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE COALESCE(is_mock, 0) = 1)`
      ).run();
    }

    const tablesInOrder = [
      'user_notifications',
      'activity_logs',
      'entry_edit_history',
      'report_footprints',
      'report_comments',
      'report_approval_steps',
      'inspection_parameter_values',
      'inspection_pin_results',
      'inspection_photos',
      'inspection_entries',
      'inspection_reports',
      'task_comments',
      'task_history',
      'task_blockers',
      'project_tasks',
      'projects',
      'asset_pins',
      'asset_parameters',
      'library_items',
      'facility_areas',
    ];

    for (const tbl of tablesInOrder) {
      db.prepare(`DELETE FROM ${tbl} WHERE COALESCE(is_mock, 0) = 1`).run();
    }

    if (excludeUserId) {
      db.prepare(
        `DELETE FROM users WHERE COALESCE(is_mock, 0) = 1 AND id != ?`
      ).run(excludeUserId);
    } else {
      db.prepare(
        `DELETE FROM users WHERE COALESCE(is_mock, 0) = 1`
      ).run();
    }
  });

  runPurge();
}

function isoDateOffset(days: number): string {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

export function seedMockData(actorUserId?: string): void {
  const now = new Date().toISOString();

  const runSeed = db.transaction(() => {
    purgeMockData(actorUserId);
    writeMockSchematics();

    // 1. Mock sample non-admin team accounts (random server-only secrets; never overwrites manual accounts)
    const mockApproverId = 'usr_mock_app_01';
    const mockInspectorId = 'usr_mock_ops_01';
    ensureDevDemoUsers();

    // Resolve dynamic non-mock Admin / standard operator references so foreign keys never fail on fresh setups
    const realUsers = db
      .prepare(`SELECT id, name, title, role, roles_json FROM users WHERE COALESCE(is_mock, 0) = 0 ORDER BY created_at ASC`)
      .all() as { id: string; name: string; title: string; role: string; roles_json: string }[];

    const actorRow =
      (actorUserId ? realUsers.find((u) => u.id === actorUserId) : undefined) ??
      realUsers.find((u) => normalizeRoles(u.roles_json, u.role).includes('admin')) ??
      realUsers[0];

    const leadAdminId = actorRow?.id ?? mockApproverId;
    const leadAdminName = actorRow?.name ?? 'Elena Rostova (Sample)';
    const leadAdminTitle = actorRow?.title || 'Operations Administrator';

    const standardUserRow =
      realUsers.find((u) => {
        const roles = normalizeRoles(u.roles_json, u.role);
        return !roles.includes('admin') && !roles.includes('approver');
      }) ?? null;

    const fieldOperatorId = standardUserRow?.id ?? mockInspectorId;
    const fieldOperatorName = standardUserRow?.name ?? 'Marcus Chen (Sample)';
    const fieldOperatorTitle = standardUserRow?.title || 'Lead Plant Technician';

    // 2. Facility Zones
    const insertZone = db.prepare(
      `INSERT INTO facility_areas (id, code, name, building, risk_level, description, is_active, is_mock, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)`
    );
    insertZone.run(
      'fac_mock_01',
      'FAC-M01',
      'Thermal Processing Hall',
      'Plant North',
      'high',
      'Rotary drying drums, thermal heaters, and baghouse exhaust collection.',
      now
    );
    insertZone.run(
      'fac_mock_02',
      'FAC-M02',
      'Main Substation & MCC',
      'Utilities Annex',
      'high',
      '480V primary switchgear lineup, transformers, and emergency transfer panels.',
      now
    );
    insertZone.run(
      'fac_mock_03',
      'FAC-M03',
      'Packaging & Conveyor Line B',
      'Plant South',
      'medium',
      'Automated palletizing conveyors, safety light curtains, and emergency pull cords.',
      now
    );

    // 3. Projects & WBS Tasks
    const insertProject = db.prepare(
      `INSERT INTO projects (id, name, code, description, cycle_type, start_date, end_date, is_mock, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );
    insertProject.run(
      'prj_mock_01',
      'Annual Kiln & Switchgear Turnaround',
      'PRJ-M01',
      'Scheduled outage overhaul covering dryer bearing alignment, IR thermography, and safety interlock verification.',
      'yearly',
      isoDateOffset(-10),
      isoDateOffset(25),
      now
    );
    insertProject.run(
      'prj_mock_02',
      'Plant South Conveyor Safety Audit',
      'PRJ-M02',
      'Multi-zone compliance check on guarding, emergency stops, and fire suppression access.',
      'routine',
      isoDateOffset(-4),
      isoDateOffset(14),
      now
    );

    const insertTask = db.prepare(
      `INSERT INTO project_tasks
       (id, project_id, parent_id, wbs_code, title, task_type, assignee_id, assignee_name, start_date, end_date, progress, status, manual_override, linked_cycle, notes, sort_order, is_mock, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1, ?)`
    );

    insertTask.run(
      'tsk_mock_01',
      'prj_mock_01',
      null,
      '1',
      'Phase 1 · Mechanical Isolation & Preparation',
      'phase',
      leadAdminId,
      leadAdminName,
      isoDateOffset(-10),
      isoDateOffset(5),
      72,
      'in_progress',
      'yearly',
      'Parent phase for turnaround isolation & baseline mechanical checks.',
      1,
      now
    );
    insertTask.run(
      'tsk_mock_02',
      'prj_mock_01',
      'tsk_mock_01',
      '1.1',
      'Inspect & Grease Rotary Dryer Drive Gearbox',
      'task',
      mockInspectorId,
      'Marcus Chen (Sample)',
      isoDateOffset(-8),
      isoDateOffset(2),
      100,
      'completed',
      'yearly',
      'Completed vibration baseline and synthetic gear oil top-up.',
      2,
      now
    );
    insertTask.run(
      'tsk_mock_03',
      'prj_mock_01',
      'tsk_mock_01',
      '1.2',
      '480V Busbar IR Thermography Scan',
      'task',
      mockApproverId,
      'Elena Rostova (Sample)',
      isoDateOffset(0),
      isoDateOffset(7),
      35,
      'blocked',
      'yearly',
      'Awaiting final isolation clearance sign-off before opening IR ports.',
      3,
      now
    );
    insertTask.run(
      'tsk_mock_04',
      'prj_mock_01',
      null,
      '2',
      'Phase 2 · Baghouse & Exhaust Recommissioning',
      'phase',
      leadAdminId,
      leadAdminName,
      isoDateOffset(6),
      isoDateOffset(22),
      10,
      'not_started',
      'yearly',
      'Pulse-jet filter pressure check and return-to-service clearance.',
      4,
      now
    );
    insertTask.run(
      'tsk_mock_05',
      'prj_mock_01',
      'tsk_mock_04',
      '2.1',
      'Turnaround Sign-Off Milestone',
      'milestone',
      leadAdminId,
      leadAdminName,
      isoDateOffset(22),
      isoDateOffset(22),
      0,
      'not_started',
      'yearly',
      'Final engineering & safety sign-off.',
      5,
      now
    );

    insertTask.run(
      'tsk_mock_06',
      'prj_mock_02',
      null,
      '1',
      'Line B Light Curtain & E-Stop Verification',
      'task',
      fieldOperatorId,
      fieldOperatorName,
      isoDateOffset(-3),
      isoDateOffset(8),
      60,
      'in_progress',
      'routine',
      'Verifying response time across all 6 conveyor zones.',
      1,
      now
    );

    db.prepare(
      `INSERT INTO task_blockers (id, project_id, blocker_task_id, blocked_task_id, dependency_type, blocker_reason, is_resolved, is_mock, created_at)
       VALUES (?, ?, ?, ?, 'FS', ?, 0, 1, ?)`
    ).run(
      'blk_mock_01',
      'prj_mock_01',
      'tsk_mock_02',
      'tsk_mock_03',
      'Gearbox lockout tag must remain verified before IR busbar enclosure scan.',
      now
    );

    // 4. Assets + Custom Parameters + Drawings + Inspection Pins
    const insertAsset = db.prepare(
      `INSERT INTO library_items
       (id, code, category, title, description, criteria, facility_area_id, facility_area_name, cycle_type, require_photo, criticality, sort_order, is_active, drawing_url, is_mock, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'routine', ?, ?, ?, 1, ?, 1, ?)`
    );
    insertAsset.run(
      'lib_mock_01',
      'AST-M01',
      'Thermal Processing',
      'Rotary Powder Dryer #1',
      'Primary rotary thermal dryer shell, trunnion rollers, drive gearbox, and exhaust baghouse.',
      'Bearing vibration <= 4.5 mm/s RMS; shell skin <= 85 °C; zero structural cracks or oil leaks.',
      'fac_mock_01',
      'FAC-M01 — Thermal Processing Hall',
      1,
      'high',
      901,
      '/uploads/mock-rotary-dryer.svg',
      now
    );
    insertAsset.run(
      'lib_mock_02',
      'AST-M02',
      'Electrical Distribution',
      '480V Main Switchgear Lineup',
      'Primary incomer breaker, copper busbar chamber, IR viewing ports, and feeder relay rack.',
      'Max hotspot delta <= 10 °C above ambient; relay fault LEDs clear; ground continuity verified.',
      'fac_mock_02',
      'FAC-M02 — Main Substation & MCC',
      1,
      'high',
      902,
      '/uploads/mock-switchgear-panel.svg',
      now
    );
    insertAsset.run(
      'lib_mock_03',
      'AST-M03',
      'Material Handling',
      'Packaging Line B Infeed Conveyor',
      'Belt tracking, emergency pull-cord switch tension, and guard interlock switches.',
      'Pull-cord trips conveyor in < 1.5s; zero belt fray; all guards bolted.',
      'fac_mock_03',
      'FAC-M03 — Packaging & Conveyor Line B',
      0,
      'medium',
      903,
      null,
      now
    );
    insertAsset.run(
      'lib_mock_04',
      'AST-M04',
      'Safety & Fire',
      'Zone North CO2 Suppression Skid',
      'Cylinder manifold pressure gauges, manual pull station seal, and audible strobe.',
      'Manifold pressure within green band (55–62 bar); tamper seal intact.',
      'fac_mock_01',
      'FAC-M01 — Thermal Processing Hall',
      1,
      'high',
      904,
      null,
      now
    );

    const insertParam = db.prepare(
      `INSERT INTO asset_parameters (id, library_item_id, label, param_type, unit, is_required, sort_order, is_mock, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );
    insertParam.run('prm_mock_01', 'lib_mock_01', 'Gearbox Vibration RMS', 'number', 'mm/s', 1, 1, now);
    insertParam.run('prm_mock_02', 'lib_mock_01', 'Shell Max Surface Temp', 'number', '°C', 1, 2, now);
    insertParam.run('prm_mock_03', 'lib_mock_01', 'Oil Sight Glass Clear', 'boolean', '', 1, 3, now);
    insertParam.run('prm_mock_04', 'lib_mock_02', 'Busbar Peak IR Temp', 'number', '°C', 1, 1, now);
    insertParam.run('prm_mock_05', 'lib_mock_02', 'Arc-Flash Relay Clear', 'boolean', '', 1, 2, now);
    insertParam.run('prm_mock_06', 'lib_mock_03', 'E-Stop Stop Distance', 'number', 'm', 0, 1, now);
    insertParam.run('prm_mock_07', 'lib_mock_04', 'Manifold Pressure', 'number', 'bar', 1, 1, now);

    const insertPin = db.prepare(
      `INSERT INTO asset_pins (id, library_item_id, pin_number, label, guidance, x_percent, y_percent, linked_task_id, is_mock, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );
    insertPin.run(
      'pin_mock_01',
      'lib_mock_01',
      1,
      'Drive Motor & Gearbox',
      'Inspect oil level sight glass, listen for bearing knock, and log RMS vibration.',
      32.5,
      82.0,
      'tsk_mock_02',
      now
    );
    insertPin.run(
      'pin_mock_02',
      'lib_mock_01',
      2,
      'Drum Shell & Tire Ring',
      'Check shell runout and trunnion roller contact face for scoring.',
      46.5,
      49.0,
      null,
      now
    );
    insertPin.run(
      'pin_mock_03',
      'lib_mock_01',
      3,
      'Exhaust Baghouse Duct',
      'Verify flange gasket seal and differential pressure gauge.',
      81.5,
      41.0,
      'tsk_mock_04',
      now
    );
    insertPin.run(
      'pin_mock_04',
      'lib_mock_02',
      1,
      'IR Viewing Window',
      'Perform closed-door thermal scan across upper busbar lugs.',
      50.0,
      69.0,
      'tsk_mock_03',
      now
    );
    insertPin.run(
      'pin_mock_05',
      'lib_mock_02',
      2,
      'Main Incomer Breaker',
      'Confirm spring charge indicator and breaker counter reading.',
      21.0,
      65.0,
      null,
      now
    );

    // 5. Inspection Reports (Approved, Pending Approval, Sent Back)
    const insertReport = db.prepare(
      `INSERT INTO inspection_reports
       (id, report_number, title, cycle_type, facility_area, inspector_id, inspector_name, inspector_title, status, overall_condition, summary_notes, signature_data_url, signed_at, created_at, submitted_at, is_mock, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );

    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();

    insertReport.run(
      'rep_mock_01',
      'INSP-M001',
      'Thermal Processing Hall Yearly Audit',
      'yearly',
      'FAC-M01 — Thermal Processing Hall',
      fieldOperatorId,
      fieldOperatorName,
      fieldOperatorTitle,
      'approved',
      'good',
      'All thermal dryer bearings and CO2 suppression skid readings verified within engineering tolerance.',
      null,
      yesterday,
      twoDaysAgo,
      yesterday,
      yesterday
    );
    insertReport.run(
      'rep_mock_02',
      'INSP-M002',
      'Substation 480V Routine Walkdown',
      'routine',
      'FAC-M02 — Main Substation & MCC',
      mockInspectorId,
      'Marcus Chen (Sample)',
      'Lead Plant Technician',
      'pending_approval',
      'needs_attention',
      'Busbar thermal delta slightly elevated on Phase B (+6.4 °C). Submitted for approver review.',
      null,
      now,
      yesterday,
      now,
      now
    );
    insertReport.run(
      'rep_mock_03',
      'INSP-M003',
      'Packaging Line B Safety Sweep',
      'routine',
      'FAC-M03 — Packaging & Conveyor Line B',
      fieldOperatorId,
      fieldOperatorName,
      fieldOperatorTitle,
      'sent_back',
      'fair',
      'Need updated photo of E-stop reset switch before final sign-off.',
      null,
      null,
      twoDaysAgo,
      yesterday,
      now
    );

    const insertEntry = db.prepare(
      `INSERT INTO inspection_entries
       (id, report_id, library_item_id, item_code, item_title, category, criteria, facility_area_name, require_photo, criticality, condition, condition_note, item_remarks, sort_order, is_mock, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );
    insertEntry.run(
      'ent_mock_01',
      'rep_mock_01',
      'lib_mock_01',
      'AST-M01',
      'Rotary Powder Dryer #1',
      'Thermal Processing',
      'Bearing vibration <= 4.5 mm/s RMS; shell skin <= 85 °C; zero structural cracks or oil leaks.',
      'FAC-M01 — Thermal Processing Hall',
      1,
      'high',
      'good',
      'Gearbox RMS measured at 2.4 mm/s. Shell temperature nominal at 64 °C.',
      'Ready for sustained production run.',
      1,
      yesterday
    );
    insertEntry.run(
      'ent_mock_02',
      'rep_mock_01',
      'lib_mock_04',
      'AST-M04',
      'Zone North CO2 Suppression Skid',
      'Safety & Fire',
      'Manifold pressure within green band (55–62 bar); tamper seal intact.',
      'FAC-M01 — Thermal Processing Hall',
      1,
      'high',
      'good',
      'Gauge reads 58.5 bar; tamper pin sealed.',
      '',
      2,
      yesterday
    );
    insertEntry.run(
      'ent_mock_03',
      'rep_mock_02',
      'lib_mock_02',
      'AST-M02',
      '480V Main Switchgear Lineup',
      'Electrical Distribution',
      'Max hotspot delta <= 10 °C above ambient; relay fault LEDs clear; ground continuity verified.',
      'FAC-M02 — Main Substation & MCC',
      1,
      'high',
      'needs_attention',
      'Feeder lug B2 measured 44.2 °C vs 37.8 °C ambient; schedule torque check.',
      'Monitor weekly until outage window.',
      1,
      now
    );
    insertEntry.run(
      'ent_mock_04',
      'rep_mock_03',
      'lib_mock_03',
      'AST-M03',
      'Packaging Line B Infeed Conveyor',
      'Material Handling',
      'Pull-cord trips conveyor in < 1.5s; zero belt fray; all guards bolted.',
      'FAC-M03 — Packaging & Conveyor Line B',
      0,
      'medium',
      'fair',
      'Stop response measured at 1.1s; minor scuff on skirt rubber.',
      'Order replacement skirt seal.',
      1,
      now
    );

    const insertParamVal = db.prepare(
      `INSERT INTO inspection_parameter_values (id, entry_id, parameter_id, label, param_type, unit, value_text, updated_by, is_mock, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );
    insertParamVal.run('ipv_mock_01', 'ent_mock_01', 'prm_mock_01', 'Gearbox Vibration RMS', 'number', 'mm/s', '2.4', fieldOperatorName, yesterday);
    insertParamVal.run('ipv_mock_02', 'ent_mock_01', 'prm_mock_02', 'Shell Max Surface Temp', 'number', '°C', '64', fieldOperatorName, yesterday);
    insertParamVal.run('ipv_mock_03', 'ent_mock_01', 'prm_mock_03', 'Oil Sight Glass Clear', 'boolean', '', 'Yes', fieldOperatorName, yesterday);
    insertParamVal.run('ipv_mock_04', 'ent_mock_02', 'prm_mock_07', 'Manifold Pressure', 'number', 'bar', '58.5', fieldOperatorName, yesterday);
    insertParamVal.run('ipv_mock_05', 'ent_mock_03', 'prm_mock_04', 'Busbar Peak IR Temp', 'number', '°C', '44.2', 'Marcus Chen (Sample)', now);
    insertParamVal.run('ipv_mock_06', 'ent_mock_03', 'prm_mock_05', 'Arc-Flash Relay Clear', 'boolean', '', 'Yes', 'Marcus Chen (Sample)', now);

    const insertPinResult = db.prepare(
      `INSERT INTO inspection_pin_results (id, entry_id, pin_id, condition, notes, updated_by, is_mock, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    );
    insertPinResult.run('ipr_mock_01', 'ent_mock_01', 'pin_mock_01', 'good', 'Gearbox running smooth at 2.4 mm/s.', fieldOperatorName, yesterday);
    insertPinResult.run('ipr_mock_02', 'ent_mock_01', 'pin_mock_02', 'good', 'Trunnion track clean, no pitting.', fieldOperatorName, yesterday);
    insertPinResult.run('ipr_mock_03', 'ent_mock_03', 'pin_mock_04', 'needs_attention', 'Phase B lug slightly warm at 44.2 °C.', 'Marcus Chen (Sample)', now);

    const insertStep = db.prepare(
      `INSERT INTO report_approval_steps (id, report_id, step_order, approver_id, approver_name, approver_title, status, decision_note, acted_at, is_mock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    );
    insertStep.run('stp_mock_01', 'rep_mock_01', 1, leadAdminId, leadAdminName, leadAdminTitle, 'approved', 'Verified against turnaround criteria.', yesterday);
    insertStep.run('stp_mock_02', 'rep_mock_02', 1, leadAdminId, leadAdminName, leadAdminTitle, 'pending', '', null);
    insertStep.run('stp_mock_03', 'rep_mock_03', 1, mockApproverId, 'Elena Rostova (Sample)', 'EHS & Reliability Approver', 'sent_back', 'Please attach photo of reset switch guard.', yesterday);

    const insertComment = db.prepare(
      `INSERT INTO report_comments (id, report_id, entry_id, author_id, author_name, author_roles_json, body, is_mock, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );
    insertComment.run(
      'cmt_mock_01',
      'rep_mock_02',
      'ent_mock_03',
      mockInspectorId,
      'Marcus Chen (Sample)',
      JSON.stringify(['user']),
      'Recommended torquing B2 feeder lug during the upcoming PRJ-M01 turnaround.',
      now
    );

    const insertFootprint = db.prepare(
      `INSERT INTO report_footprints (id, report_id, actor_id, actor_name, actor_roles_json, action, summary, is_mock, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );
    insertFootprint.run(
      'rfp_mock_01',
      'rep_mock_01',
      leadAdminId,
      leadAdminName,
      JSON.stringify(['admin', 'approver']),
      'approved',
      'Approved report INSP-M001 at step 1.',
      yesterday
    );

    // Sample activity logs
    db.prepare(
      `INSERT INTO activity_logs (id, actor_name, actor_role, event_type, summary, is_mock, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    ).run(
      'log_mock_01',
      leadAdminName,
      'admin',
      'mock:enabled',
      'Sample mock operations dataset loaded (zones, assets, schematics, projects, and reports).',
      now
    );

    setWorkspaceSetting('mock_data_enabled', true);
  });

  runSeed();
}
