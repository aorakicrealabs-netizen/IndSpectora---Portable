import type {
  CriticalityLevel,
  CustomParameterType,
  FacilityArea,
  InspectionReport,
  Project,
  ProjectTask,
  TaskBlocker,
} from '../types.ts';

function sanitizeFormulaCell(str: string): string {
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const str = sanitizeFormulaCell(raw);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsvFile(filename: string, rows: (string | number | boolean | null | undefined)[][]): void {
  const csvContent = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ParsedAssetCsvRow {
  code: string;
  category: string;
  title: string;
  facilityCode: string;
  description: string;
  criteria: string;
  criticality: CriticalityLevel;
  requirePhoto: boolean;
  isActive: boolean;
  parameters: {
    label: string;
    paramType: CustomParameterType;
    unit: string;
    isRequired: boolean;
  }[];
  error?: string;
}

export function downloadAssetCsvTemplate(facilityAreas: FacilityArea[]): void {
  const sampleFacilityCode = facilityAreas.find((f) => f.isActive)?.code ?? 'ZONE-A';
  const rows: (string | number | boolean)[][] = [
    [
      'Asset Code',
      'Category',
      'Asset Title',
      'Facility Area Code',
      'Description',
      'Inspection Criteria',
      'Criticality (low/medium/high)',
      'Require Photo (yes/no)',
      'Active (yes/no)',
      'Custom Parameters (Label|type:text/number/boolean|unit; ...)',
    ],
    [
      'AST-DRY-01',
      'Production Equipment',
      'Rotary Powder Dryer #1',
      sampleFacilityCode,
      'Main hot-air rotary dryer drum & exhaust cyclone',
      'Inspect drum seal integrity, cyclone hopper build-up, and exhaust fan vibration.',
      'high',
      'yes',
      'yes',
      'Powder Accumulation|number|kg; Drum Surface Temp|number|C; Abnormal Vibration|boolean|; Visual Seal Check|text|',
    ],
    [
      'AST-PMP-02',
      'Utilities',
      'Chilled Water Feed Pump #2',
      sampleFacilityCode,
      'Primary process cooling circulation pump',
      'Verify mechanical seal drip rate and bearing housing temperature.',
      'medium',
      'no',
      'yes',
      'Discharge Pressure|number|bar; Mechanical Seal Leak|boolean|',
    ],
  ];
  downloadCsvFile('indspectora-asset-import-template.csv', rows);
}

export function parseCsvMatrix(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c.length > 0)) rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c.length > 0)) rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  currentRow.push(currentCell.trim());
  if (currentRow.some((c) => c.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

export function parseAssetCsvText(text: string): ParsedAssetCsvRow[] {
  const matrix = parseCsvMatrix(text);
  if (matrix.length === 0) return [];

  const firstCell = (matrix[0][0] ?? '').toLowerCase();
  const dataRows =
    firstCell.includes('asset code') || firstCell === 'code' ? matrix.slice(1) : matrix;

  return dataRows.map((cols) => {
    const code = (cols[0] ?? '').trim().toUpperCase();
    const category = (cols[1] ?? '').trim();
    const title = (cols[2] ?? '').trim();
    const facilityCode = (cols[3] ?? '').trim().toUpperCase();
    const description = (cols[4] ?? '').trim();
    const criteria = (cols[5] ?? '').trim();
    const rawCrit = (cols[6] ?? 'medium').trim().toLowerCase();
    const criticality: CriticalityLevel =
      rawCrit === 'high' || rawCrit === 'low' ? rawCrit : 'medium';
    const rawPhoto = (cols[7] ?? 'no').trim().toLowerCase();
    const requirePhoto = rawPhoto === 'yes' || rawPhoto === 'true' || rawPhoto === '1';
    const rawActive = (cols[8] ?? 'yes').trim().toLowerCase();
    const isActive = !(rawActive === 'no' || rawActive === 'false' || rawActive === '0');
    const rawParams = (cols[9] ?? '').trim();

    const parameters: ParsedAssetCsvRow['parameters'] = [];
    if (rawParams) {
      for (const token of rawParams.split(';')) {
        const trimmed = token.trim();
        if (!trimmed) continue;
        const parts = trimmed.split('|').map((p) => p.trim());
        const label = parts[0] ?? '';
        if (!label) continue;
        const rawType = (parts[1] ?? 'text').toLowerCase();
        const paramType: CustomParameterType =
          rawType === 'number' || rawType === 'boolean' ? rawType : 'text';
        const unit = paramType === 'number' ? parts[2] ?? '' : '';
        const isRequired = (parts[3] ?? '').toLowerCase() === 'required';
        parameters.push({ label, paramType, unit, isRequired });
      }
    }

    let error: string | undefined;
    if (!code || !category || !title) {
      error = 'Missing required Asset Code, Category, or Asset Title.';
    }

    return {
      code,
      category,
      title,
      facilityCode,
      description,
      criteria,
      criticality,
      requirePhoto,
      isActive,
      parameters,
      error,
    };
  });
}

export function exportReportsToCsv(reports: InspectionReport[]): void {
  const header = [
    'Report Number',
    'Report Title',
    'Cycle Type',
    'Facility Area',
    'Report Status',
    'Overall Condition',
    'Executor Name',
    'Approval Chain',
    'Submitted At',
    'Asset Code',
    'Category',
    'Asset Title',
    'Asset Condition',
    'Custom Parameters',
    'Condition Note',
    'Asset Remarks',
    'Visual Pin Findings',
    'Photo Count',
    'Photo Captions',
  ];

  const rows: (string | number | boolean | null | undefined)[][] = [header];

  for (const rep of reports) {
    const approvalChain = (rep.approvalSteps ?? [])
      .map((s) => `${s.stepOrder}.${s.approverName} (${s.status})`)
      .join(' -> ');

    if (rep.entries.length === 0) {
      rows.push([
        rep.reportNumber,
        rep.title,
        rep.cycleType,
        rep.facilityArea,
        formatReportStatusLabel(rep.status),
        rep.overallCondition,
        rep.inspectorName,
        approvalChain,
        rep.submittedAt ?? '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        0,
        '',
      ]);
      continue;
    }

    for (const ent of rep.entries) {
      const captions = ent.photos.map((p, i) => `[Photo ${i + 1}] ${p.caption || p.fileName}`).join(' | ');
      const paramSummary = (ent.parameterValues ?? [])
        .map(
          (pv) =>
            `${pv.label}: ${pv.valueText || '—'}${pv.paramType === 'number' && pv.unit ? ` ${pv.unit}` : ''}`
        )
        .join(' | ');
      const pinSummary = (ent.visualPins ?? [])
        .filter((vp) => vp.result && (vp.result.condition !== 'na' || vp.result.notes))
        .map(
          (vp) =>
            `Pin #${vp.pinNumber} (${vp.label}): ${formatConditionLabel(vp.result!.condition)}${
              vp.result!.notes ? ` - ${vp.result!.notes}` : ''
            }`
        )
        .join(' | ');
      rows.push([
        rep.reportNumber,
        rep.title,
        rep.cycleType,
        rep.facilityArea,
        formatReportStatusLabel(rep.status),
        rep.overallCondition,
        rep.inspectorName,
        approvalChain,
        rep.submittedAt ?? '',
        ent.itemCode,
        ent.category,
        ent.itemTitle,
        ent.condition,
        paramSummary,
        ent.conditionNote,
        ent.itemRemarks,
        pinSummary,
        ent.photos.length,
        captions,
      ]);
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  downloadCsvFile(`inspection-reports-${stamp}.csv`, rows);
}

export function exportProjectScheduleToCsv(
  project: Project,
  tasks: ProjectTask[],
  blockers: TaskBlocker[]
): void {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const header = [
    'Project Code',
    'Project Name',
    'WBS',
    'Activity Title',
    'Type',
    'Assignee',
    'Start Date',
    'End Date',
    'Duration (Days)',
    'Progress (%)',
    'Status',
    'Linked Cycle',
    'Blocked By',
    'Blocker Reason',
    'Notes',
  ];

  const rows: (string | number | boolean | null | undefined)[][] = [header];

  for (const t of tasks) {
    const activeBlockers = blockers.filter((b) => b.blockedTaskId === t.id && !b.isResolved);
    const blockedByText = activeBlockers
      .map((b) => {
        const up = taskById.get(b.blockerTaskId);
        return up ? `${up.wbsCode} ${up.title} (${b.dependencyType})` : b.blockerTaskId;
      })
      .join(' | ');
    const reasonText = activeBlockers.map((b) => b.blockerReason).join(' | ');

    rows.push([
      project.code,
      project.name,
      t.wbsCode,
      t.title,
      t.taskType,
      t.assigneeName,
      t.startDate,
      t.endDate,
      getDurationDays(t.startDate, t.endDate),
      t.progress,
      t.status,
      t.linkedCycle,
      blockedByText,
      reasonText,
      t.notes,
    ]);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  downloadCsvFile(`${project.code.toLowerCase()}-project-schedule-${stamp}.csv`, rows);
}

export function getDurationDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

export function formatShortDate(isoOrDate: string | null | undefined): string {
  if (!isoOrDate) return '—';
  const d = new Date(isoOrDate.length === 10 ? `${isoOrDate}T00:00:00Z` : isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatAuditTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mmm = SHORT_MONTHS[d.getMonth()] ?? 'Jan';
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mmm}/${yyyy} ${hh}:${mm}`;
}

export function formatConditionLabel(condition: string): string {
  switch (condition) {
    case 'good':
      return 'Good';
    case 'fair':
      return 'Fair';
    case 'needs_attention':
      return 'Needs Attention';
    case 'critical':
      return 'Critical';
    default:
      return 'N/A';
  }
}

export function formatReportStatusLabel(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'pending_approval':
      return 'Pending Approval';
    case 'sent_back':
      return 'Sent Back';
    case 'approved':
      return 'Approved';
    case 'submitted':
      return 'Submitted';
    case 'reviewed':
      return 'Reviewed';
    default:
      return status;
  }
}

export function formatTaskStatusLabel(status: string): string {
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

export function formatCycleLabel(cycle: string, short = false): string {
  switch (cycle) {
    case 'routine':
      return short ? 'Routine' : 'Routine Inspection';
    case 'yearly':
      return short ? 'Yearly' : 'Yearly Maintenance';
    case 'eventual':
      return short ? 'Eventual' : 'Eventual Inspection';
    default:
      return 'None';
  }
}
