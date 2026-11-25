export type UserRole = 'admin' | 'approver' | 'user';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roles: UserRole[];
  title: string;
  isMock?: boolean;
  createdAt: string;
}

export function hasAnyRole(user: User | null | undefined, ...required: UserRole[]): boolean {
  if (!user) return false;
  const userRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
  return required.some((r) => userRoles.includes(r));
}

export function formatRoleLabel(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'approver':
      return 'Approver';
    default:
      return 'User';
  }
}

export type CycleType = 'routine' | 'yearly' | 'eventual';
export type CriticalityLevel = 'low' | 'medium' | 'high';
export type CustomParameterType = 'text' | 'number' | 'boolean';

export interface FacilityArea {
  id: string;
  code: string;
  name: string;
  building: string;
  riskLevel: CriticalityLevel;
  description: string;
  isActive: boolean;
  isMock?: boolean;
  updatedAt: string;
}

export interface AssetParameter {
  id: string;
  libraryItemId: string;
  label: string;
  paramType: CustomParameterType;
  unit: string;
  isRequired: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface AssetPin {
  id: string;
  libraryItemId: string;
  pinNumber: number;
  label: string;
  guidance: string;
  xPercent: number;
  yPercent: number;
  linkedTaskId: string | null;
  linkedTaskWbs?: string | null;
  linkedTaskTitle?: string | null;
  linkedTaskStatus?: TaskStatus | null;
  linkedTaskProgress?: number | null;
  linkedProjectId?: string | null;
  linkedProjectName?: string | null;
  updatedAt: string;
}

export interface LibraryItem {
  id: string;
  code: string;
  category: string;
  title: string;
  description: string;
  criteria: string;
  facilityAreaId: string | null;
  facilityAreaName: string;
  cycleType?: CycleType | null;
  requirePhoto: boolean;
  criticality: CriticalityLevel;
  sortOrder: number;
  isActive: boolean;
  drawingUrl: string | null;
  pins: AssetPin[];
  parameters: AssetParameter[];
  isMock?: boolean;
  updatedAt: string;
}

export type ConditionStatus = 'good' | 'fair' | 'needs_attention' | 'critical' | 'na';
export type ReportStatus =
  | 'draft'
  | 'pending_approval'
  | 'sent_back'
  | 'approved'
  | 'submitted'
  | 'reviewed';

export type ApprovalStepStatus = 'waiting' | 'pending' | 'approved' | 'sent_back';

export interface InspectionPhoto {
  id: string;
  entryId: string;
  pinId: string | null;
  fileUrl: string;
  fileName: string;
  caption: string;
  uploadedAt: string;
}

export interface InspectionPinResult {
  id: string;
  entryId: string;
  pinId: string;
  condition: ConditionStatus;
  notes: string;
  updatedBy: string;
  updatedAt: string;
}

export interface EntryVisualPin extends AssetPin {
  result: InspectionPinResult | null;
  photos: InspectionPhoto[];
}

export interface InspectionParameterValue {
  id: string;
  entryId: string;
  parameterId: string;
  label: string;
  paramType: CustomParameterType;
  unit: string;
  valueText: string;
  updatedBy: string;
  updatedAt: string;
}

export interface EntryEditHistoryItem {
  id: string;
  entryId: string;
  reportId: string;
  actorName: string;
  actorRoles: UserRole[];
  fieldName: string;
  oldValue: string;
  newValue: string;
  summary: string;
  createdAt: string;
}

export interface ReportApprovalStep {
  id: string;
  reportId: string;
  stepOrder: number;
  approverId: string;
  approverName: string;
  approverTitle: string;
  status: ApprovalStepStatus;
  decisionNote: string;
  actedAt: string | null;
}

export interface ReportComment {
  id: string;
  reportId: string;
  entryId: string | null;
  authorId: string | null;
  authorName: string;
  authorRoles: UserRole[];
  body: string;
  createdAt: string;
}

export interface ReportFootprint {
  id: string;
  reportId: string;
  actorId: string | null;
  actorName: string;
  actorRoles: UserRole[];
  action: string;
  summary: string;
  createdAt: string;
}

export interface InspectionEntry {
  id: string;
  reportId: string;
  libraryItemId: string;
  itemCode: string;
  itemTitle: string;
  category: string;
  criteria: string;
  facilityAreaName: string;
  requirePhoto: boolean;
  criticality: CriticalityLevel;
  condition: ConditionStatus;
  conditionNote: string;
  itemRemarks: string;
  drawingUrl: string | null;
  visualPins: EntryVisualPin[];
  photos: InspectionPhoto[];
  parameterValues: InspectionParameterValue[];
  comments: ReportComment[];
  editHistory: EntryEditHistoryItem[];
  updatedAt: string;
}

export interface InspectionReport {
  id: string;
  reportNumber: string;
  title: string;
  cycleType: CycleType;
  facilityArea: string;
  inspectorId: string | null;
  inspectorName: string;
  inspectorTitle: string;
  status: ReportStatus;
  overallCondition: ConditionStatus;
  summaryNotes: string;
  createdAt: string;
  submittedAt: string | null;
  updatedAt: string;
  entries: InspectionEntry[];
  approvalSteps: ReportApprovalStep[];
  comments: ReportComment[];
  footprints: ReportFootprint[];
  isMock?: boolean;
}

export type TaskType = 'phase' | 'task' | 'milestone';
export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'completed';
export type DependencyType = 'FS' | 'SS';

export interface Project {
  id: string;
  name: string;
  code: string;
  description: string;
  cycleType: CycleType;
  startDate: string;
  endDate: string;
  useWbs: boolean;
  createdAt: string;
}

export interface ProjectTask {
  id: string;
  projectId: string;
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
  sortOrder: number;
  isMock?: boolean;
  updatedAt: string;
}

export interface TaskBlocker {
  id: string;
  projectId: string;
  blockerTaskId: string;
  blockedTaskId: string;
  dependencyType: DependencyType;
  blockerReason: string;
  isResolved: boolean;
  createdAt: string;
}

export interface TaskHistoryEntry {
  id: string;
  taskId: string;
  projectId: string;
  actorName: string;
  actorRole: UserRole;
  fieldName: string;
  oldValue: string;
  newValue: string;
  summary: string;
  createdAt: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  projectId: string;
  authorId: string | null;
  authorName: string;
  authorRole: UserRole;
  body: string;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  actorName: string;
  actorRole: UserRole;
  eventType: string;
  summary: string;
  createdAt: string;
}

export type NotificationType =
  | 'approval_requested'
  | 'step_approved'
  | 'report_sent_back'
  | 'report_approved';

export interface UserNotification {
  id: string;
  userId: string;
  type: NotificationType;
  reportId: string;
  reportNumber: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export type TourPageKey =
  | 'dashboard'
  | 'inspections'
  | 'library'
  | 'history'
  | 'gantt'
  | 'users'
  | 'settings'
  | 'howto';

export type TableDensity = 'comfortable' | 'compact';
export type LandingTabPreference = 'dashboard' | 'inspections' | 'library' | 'gantt';

export interface UserPreferences {
  tableDensity: TableDensity;
  defaultLandingTab: LandingTabPreference;
  toastNotifications: boolean;
  approvalAlerts: boolean;
}

export interface WorkspaceDefaults {
  organizationName: string;
  defaultCycleType: CycleType;
  defaultCriticality: CriticalityLevel;
  defaultRequirePhoto: boolean;
}

export interface DeveloperDatasetCounts {
  manualZones: number;
  mockZones: number;
  manualAssets: number;
  mockAssets: number;
  manualProjects: number;
  mockProjects: number;
  manualTasks: number;
  mockTasks: number;
  manualReports: number;
  mockReports: number;
  manualUsers: number;
  mockUsers: number;
}

export interface DeveloperSettingsState {
  developerMode: boolean;
  mockDataEnabled: boolean;
  loginTemplatesEnabled: boolean;
  counts: DeveloperDatasetCounts;
}

export interface DemoAccountSummary {
  id: string;
  name: string;
  email: string;
  title: string;
  roles: UserRole[];
}

export interface AuthStatusPayload {
  needsFirstAdminSetup: boolean;
  loginTemplatesEnabled: boolean;
  demoAccounts: DemoAccountSummary[];
  portableExeMode?: boolean;
  portableExeAvailable?: boolean;
}

export interface SessionInfo {
  sessionId: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface BootstrapPayload {
  libraryItems: LibraryItem[];
  facilityAreas: FacilityArea[];
  reports: InspectionReport[];
  projects: Project[];
  tasks: ProjectTask[];
  blockers: TaskBlocker[];
  taskHistory: TaskHistoryEntry[];
  taskComments: TaskComment[];
  activityLogs: ActivityLog[];
  users: User[];
  notifications: UserNotification[];
  completedTours: TourPageKey[];
  userPreferences: UserPreferences;
  workspaceDefaults: WorkspaceDefaults;
  developerState: DeveloperSettingsState;
}

export type RealtimeEventType =
  | 'connected'
  | 'state:sync'
  | 'library:changed'
  | 'facility:changed'
  | 'report:changed'
  | 'project:changed'
  | 'task:changed'
  | 'blocker:changed'
  | 'user:changed'
  | 'notification:changed';

export interface RealtimeMessage {
  type: RealtimeEventType;
  summary?: string;
  activityLog?: ActivityLog;
  targetUserId?: string;
  timestamp: string;
}
