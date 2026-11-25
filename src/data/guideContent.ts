import type { TourPageKey, UserRole } from '../types.ts';

export interface TourStep {
  title: string;
  targetArea: string;
  description: string;
  tip?: string;
}

export interface PageGuideSection {
  key: TourPageKey;
  title: string;
  subtitle: string;
  summary: string;
  rolesNote: string;
  steps: TourStep[];
  checklist: string[];
}

export interface RoleCapabilityRow {
  capability: string;
  admin: boolean;
  approver: boolean;
  user: boolean;
  notes: string;
}

export const ROLE_CAPABILITY_MATRIX: RoleCapabilityRow[] = [
  {
    capability: 'Start & Submit Inspection Reports',
    admin: true,
    approver: true,
    user: true,
    notes: 'Any role can execute inspections, fill custom parameters, capture photos, and route 1–6 approvers.',
  },
  {
    capability: 'Revise & Resubmit Own Sent-Back Reports',
    admin: true,
    approver: true,
    user: true,
    notes: 'Executors receive instant alerts when an approver sends back a report for correction.',
  },
  {
    capability: 'Approve / Send Back Sequential Steps',
    admin: false,
    approver: true,
    user: false,
    notes: 'Only users holding the Approver role appear in the 1–6 approver selection list (Admin can also hold Approver).',
  },
  {
    capability: 'Create & Edit Asset Library, CSV Import & Zones',
    admin: true,
    approver: true,
    user: false,
    notes: 'Manage assets, drawings, visual pins, custom parameters, and Facility/Zone Areas.',
  },
  {
    capability: 'Create & Manage Projects, WBS & Blockers',
    admin: true,
    approver: true,
    user: false,
    notes: 'Admins & Approvers create projects, structure WBS activities, and assign registered users.',
  },
  {
    capability: 'Update Assigned Project Activities',
    admin: true,
    approver: true,
    user: true,
    notes: 'Assigned users can update progress %, status, and comments on active (non-completed) activities.',
  },
  {
    capability: 'Edit Locked / Approved Inspections & Completed Tasks',
    admin: true,
    approver: false,
    user: false,
    notes: 'Admins retain override control on approved reports and completed project tasks with full Digital Footprint.',
  },
  {
    capability: 'Manage Users & Assign Multi-Roles (Settings → Accounts)',
    admin: true,
    approver: false,
    user: false,
    notes: 'Full user CRUD, password resets, multi-role assignment, workspace defaults & Developer Mock Data inside Settings.',
  },
];

export const PAGE_GUIDES: Record<TourPageKey, PageGuideSection> = {
  dashboard: {
    key: 'dashboard',
    title: 'Admin & Operations Dashboard',
    subtitle: 'Live overview of Need My Action items, inspection throughput, and active project blockers.',
    summary:
      'Use the Dashboard at the start of every shift to spot pending approvals or sent-back inspections that need your immediate action, inspect real-time asset health, and jump straight to blocked project activities.',
    rolesNote: 'Available to all roles. Action cards tailor dynamically to your assigned approvals and sent-back drafts.',
    checklist: [
      'Check the Need My Action priority panel for active sequential approvals or sent-back revisions.',
      'Monitor active asset health metrics and routine vs. yearly inspection breakdowns.',
      'Review recent Live Operations Activity events synchronized over WebSockets.',
    ],
    steps: [
      {
        title: 'Need My Action Priority Queue',
        targetArea: 'Top Action Card',
        description:
          'Highlights inspection reports waiting on your sequential approval step (for Approvers) or sent back by an approver for revision (for Executors). Click any item to jump straight into the report.',
        tip: 'The sidebar badge on Inspections & Audits always reflects this live count.',
      },
      {
        title: 'Live KPI & Condition Breakdown',
        targetArea: 'KPI Strip & Summary Cards',
        description:
          'Tracks active assets, approval throughput, average project progress, and unresolved WBS dependency blockers.',
      },
      {
        title: 'Audit Stream & Quick Navigation',
        targetArea: 'Activity Log & Header Actions',
        description:
          'Every inspection edit, approval decision, and task change logs cleanly in chronological order with exact timestamps.',
      },
    ],
  },
  inspections: {
    key: 'inspections',
    title: 'Inspections & Audits',
    subtitle: 'Execute asset checklists, record visual pin findings & custom parameters, and route sequential approvals.',
    summary:
      'Start structured inspection audits filtered by Facility/Zone Area, keep the report title editable while drafting, capture custom parameter readings (text, numeric with unit, Yes/No), attach pin-linked photos, and route to 1–6 sequential approvers.',
    rolesNote: 'All roles can start & submit reports; Approvers act on active steps; Admins can edit even approved items.',
    checklist: [
      'Filter the list by Need My Action, Draft, Pending Approval, Sent Back, or Approved.',
      'Start a new inspection using Facility/Zone Area filters + asset search.',
      'Complete condition statuses, custom parameter fields, visual pin markers, and evidence photos.',
      'Select 1–6 Approvers in sequential Step 1 → Step N order before submitting.',
    ],
    steps: [
      {
        title: 'Need My Action Filter & Status Queue',
        targetArea: 'Filter Tabs & Report Table',
        description:
          'Switch to the Need My Action tab to isolate reports where Step N is waiting on your approval, or reports an approver sent back to you for corrections.',
      },
      {
        title: 'Facility-Filtered Start & Editable Title',
        targetArea: 'New Inspection Modal & Audit Header',
        description:
          'When starting a report, filter assets by Facility/Zone Area and keyword search. While the report is in Draft or Sent Back status (or anytime for Admin), you can edit the report title directly in the header.',
      },
      {
        title: 'Visual Pins & Custom Inspection Parameters',
        targetArea: 'Asset Inspection Rows',
        description:
          'Each asset displays its engineering drawing with clickable inspection pins plus custom parameters configured in the Asset Library (e.g., Powder Accumulation in kg, Pressure Check Yes/No).',
        tip: 'Every change is automatically recorded in the per-asset Edit History log.',
      },
      {
        title: 'Sequential 1–6 Approver Routing & Digital Footprint',
        targetArea: 'Approval Routing & Comments Panel',
        description:
          'Choose 1 to 6 Approvers in sequential order. Step 1 is notified first; once approved, Step 2 activates automatically. Approvers can comment per-asset or overall and either Approve or Send Back with a required reason. All actions form an immutable Digital Footprint.',
      },
    ],
  },
  library: {
    key: 'library',
    title: 'Asset & Facility Library',
    subtitle: 'Manage master assets, Facility/Zone Areas, CSV bulk imports, visual drawings, custom parameters & history.',
    summary:
      'Centralize every inspectable asset under its Facility/Zone Area. Define engineering drawings with inspection pins, configure custom inspection parameters, import assets in bulk via CSV template, and inspect full cross-report Asset History.',
    rolesNote: 'Admins and Approvers can create, import, and edit Assets and Facility Areas; Standard Users have read + history access.',
    checklist: [
      'Create Facility / Zone Areas first so assets map cleanly to physical plant zones.',
      'Download the CSV Template and bulk-import assets with instant row validation.',
      'Add custom inspection parameters (Text, Number + Unit, or Yes/No toggle) per asset.',
      'Click History on any asset row to review all past inspection readings and parameter trends.',
    ],
    steps: [
      {
        title: 'Facility / Zone Areas & Asset Filtering',
        targetArea: 'Sub-tabs & Filter Bar',
        description:
          'Organize equipment by Facility/Zone Area and search by asset code, category, or title. Maintenance Cycle has been removed from assets so schedules stay flexible per inspection.',
      },
      {
        title: 'Download CSV Template & Bulk Import',
        targetArea: 'Top Toolbar Buttons',
        description:
          'Click Download CSV Template to get a ready-to-fill spreadsheet matching IndSpectora columns, then use Import CSV to preview and import dozens of assets in one batch.',
      },
      {
        title: 'Custom Inspection Parameters & Visual Drawings',
        targetArea: 'Asset Modal & Visual Pin Editor',
        description:
          'Inside each asset, configure custom inspection fields (e.g., Powder Accumulation in grams, Belt Tension Yes/No) and upload drawings to place numbered inspection pins linked to WBS tasks.',
      },
      {
        title: 'Per-Asset Inspection History',
        targetArea: 'Asset Row → History Button',
        description:
          'Inspect chronological inspection results for an individual asset across every historical report, including recorded custom parameter metrics and numeric averages.',
      },
    ],
  },
  history: {
    key: 'history',
    title: 'Asset Inspection History & Compare',
    subtitle: 'Review chronological inspection trends, evidence photos, and compare 2 to 4 sessions side by side.',
    summary:
      'Pick any asset to review its full cross-report audit history, numeric parameter trends (Latest, Avg, Min, Max), pin observations, and captured photos—or select 2 to 4 sessions to inspect side by side.',
    rolesNote: 'Available to all roles for complete equipment traceability.',
    checklist: [
      'Filter assets by Facility/Zone Area or jump straight from Asset Library rows.',
      'Review automatic numeric parameter trends and photo evidence across audits.',
      'Select 2 to 4 inspection sessions (or use Compare Latest 2 / 3 / 4) for synchronized side-by-side review.',
    ],
    steps: [
      {
        title: 'Asset Picker & Trend Summary',
        targetArea: 'Top Asset Selector & Trend Cards',
        description:
          'Switch between any library asset to view its total inspection count, latest condition status, photo count, and parameter delta trends.',
      },
      {
        title: 'Custom 2–4 Session Side-by-Side Comparison',
        targetArea: 'Compare Mode & Quick Presets',
        description:
          'Check any 2 to 4 inspection sessions to compare conditions, parameter deltas vs. baseline, pin notes, and photos side by side.',
      },
    ],
  },
  gantt: {
    key: 'gantt',
    title: 'Projects (WBS, Gantt & Table Views)',
    subtitle: 'Plan WBS hierarchies, assign registered users, toggle Gantt/Table views, and resolve dependency blockers.',
    summary:
      'Track corrective projects and turnarounds using Work Breakdown Structure (WBS) codes (1, 1.1, 1.2). Switch seamlessly between Gantt Timeline and Table View with schedule start-stop columns, change history, and activity comments.',
    rolesNote: 'Admins & Approvers create Projects/Activities and manage blockers; assigned Users can update progress & comments on active tasks.',
    checklist: [
      'Understand WBS codes: hierarchical identifiers (1 = Phase, 1.1 = Child Activity) organizing scope.',
      'Assign each activity to a registered user from the team directory.',
      'Toggle between Gantt View and Table View for compact schedule start-stop editing.',
      'Review automatic Work Progress change history and add timestamped comments inside the Activity Drawer.',
    ],
    steps: [
      {
        title: 'Active Project: Gantt & Table View Switcher',
        targetArea: 'View Mode Toggle & Sub-tabs',
        description:
          'Switch between visual Gantt Timeline bars and a clean Table View featuring Schedule Start–Stop columns, inline progress updates, and quick assignee selection.',
      },
      {
        title: 'Registered User Assignment & WBS Hierarchy',
        targetArea: 'New Activity Modal & Table',
        description:
          'Pick Assignees directly from registered IndSpectora users. Use parent phases and WBS numbering to keep turnaround tasks structured.',
      },
      {
        title: 'Activity Drawer: Progress History & Comments',
        targetArea: 'Click Any Activity Row or Bar',
        description:
          'Opens the detail drawer showing automatic change logs (e.g., Work Progress 0% → 50% with exact timestamp) alongside a team Comments thread.',
        tip: 'Completed activities lock automatically unless edited by an Admin.',
      },
    ],
  },
  users: {
    key: 'users',
    title: 'User & Role Management',
    subtitle: 'Manage local accounts, assign multiple roles per user, and reset passwords securely.',
    summary:
      'Administrators manage all IndSpectora accounts inside Settings → Account Management. Each user can hold one or more roles simultaneously (Admin, Approver, User) to match real plant responsibilities without duplicate accounts.',
    rolesNote: 'Restricted to Admin users inside Settings → Account Management.',
    checklist: [
      'Assign one or more roles (Admin, Approver, User) via multi-role checkboxes.',
      'Ensure designated reviewers hold the Approver role so they appear in Inspection approval routing.',
      'Use Reset Password to rotate credentials and immediately revoke stale login tokens.',
    ],
    steps: [
      {
        title: 'Multi-Role Assignment',
        targetArea: 'Settings → Account Management',
        description:
          'Combine roles freely—for instance, grant someone both Approver and Admin, or keep field technicians as Standard User. Safety checks prevent removing the last Admin.',
      },
      {
        title: 'Role Filtering & Search',
        targetArea: 'Filter Bar',
        description:
          'Filter the user directory by Admin, Approver, or User role to audit who holds approval and asset-editing authority.',
      },
      {
        title: 'Password Resets & Account Removal',
        targetArea: 'Row Action Buttons',
        description:
          'Reset passwords cleanly (revoking active sessions) or remove deactivated accounts without breaking historical audit footprints.',
      },
    ],
  },
  settings: {
    key: 'settings',
    title: 'Settings, Accounts & Developer Mode',
    subtitle: 'Manage profile security, display density, account roles, workspace defaults, JSON backups, and Developer Mock Data.',
    summary:
      'Every signed-in user can update their profile, rotate passwords, revoke remote sessions, configure Light/Dark mode and Comfortable/Compact table density, and reset guided tours. Admins also access Account Management, Workspace Defaults & JSON Backup, and Developer Mock Data isolation.',
    rolesNote: 'Profile & Appearance available to all users; Account Management, Workspace Defaults & Developer Mode restricted to Admins.',
    checklist: [
      'Rotate your personal password or revoke inactive browser sessions under Profile & Security.',
      'Choose Comfortable vs. Compact table row density and your Default Landing Workspace under Appearance & Preferences.',
      'Admins: Manage team multi-roles under Account Management or download sanitized JSON database backups under Workspace & Backup.',
      'Admins: Toggle Developer Mode → Mock Data Pack ON to explore sample assets/schematics, or OFF to immediately purge mock & edited mock data while preserving all manual records.',
    ],
    steps: [
      {
        title: 'Personal Profile, Password & Active Sessions',
        targetArea: 'Settings → Profile & Security',
        description:
          'Update your display name/title, change your password cleanly (automatically invalidating other devices), and revoke stale login tokens.',
      },
      {
        title: 'Table Density, Default Landing Tab & Tours',
        targetArea: 'Settings → Appearance & Preferences',
        description:
          'Switch between Comfortable and Compact table density, pick which module opens on sign-in, control sync toast popups, or reset all interactive guided tours.',
      },
      {
        title: 'Account Management, Workspace Defaults & Developer Mock Data',
        targetArea: 'Admin Sections',
        description:
          'Administrators manage user accounts/roles, set workspace default cycles & backup JSON snapshots, and toggle isolated Mock Data ON/OFF or Reset Modified Mock Data without ever touching manual entries.',
        tip: 'Turning Mock Data OFF immediately deletes mock records and any edits made to mock records while preserving manual work.',
      },
    ],
  },
  howto: {
    key: 'howto',
    title: 'How to Use & Onboarding Tours',
    subtitle: 'Role permissions reference, per-page walkthroughs, and interactive tour replay controls.',
    summary:
      'Reference this guide anytime you need a refresher on IndSpectora workflows, multi-role permissions, or want to relaunch the interactive page tour on any module.',
    rolesNote: 'Accessible to all authenticated users at any time.',
    checklist: [
      'Review the Role Capability Matrix to verify what Admin, Approver, and User roles can do.',
      'Click Launch Tour on any module card to jump there and replay its guided walkthrough.',
      'Use Reset All First-Time Tours to re-enable automatic onboarding popups on every page.',
    ],
    steps: [
      {
        title: 'Per-Page Guides & Instant Tour Replay',
        targetArea: 'Page Guide Cards',
        description:
          'Every major workspace has a dedicated guide card here. Click Launch Interactive Tour to open that workspace and step through its key controls.',
      },
      {
        title: 'Reset All First-Time Tours',
        targetArea: 'Top Action Button',
        description:
          'Clears your completed-tour history so IndSpectora automatically walks you through each workspace the next time you visit it.',
      },
      {
        title: 'Searchable IndSpectora FAQ',
        targetArea: 'Bottom FAQ Section',
        description:
          'Filter frequently asked questions by category or keyword across Roles, Asset CSV Imports, Sequential Approvals, WBS Codes, and Localhost Storage.',
      },
    ],
  },
};

export const GUIDE_ORDER: TourPageKey[] = [
  'dashboard',
  'inspections',
  'gantt',
  'history',
  'library',
  'settings',
  'howto',
];

export function filterVisibleGuides(_roles: UserRole[]): PageGuideSection[] {
  return GUIDE_ORDER.map((key) => PAGE_GUIDES[key]);
}

export type FaqCategory =
  | 'all'
  | 'access'
  | 'assets'
  | 'inspections'
  | 'projects'
  | 'system';

export interface FaqItem {
  id: string;
  category: Exclude<FaqCategory, 'all'>;
  question: string;
  answer: string;
  steps?: string[];
  appliesTo: string;
  relatedPageKey?: TourPageKey;
  keywords: string[];
}

export const FAQ_CATEGORIES: { key: FaqCategory; label: string }[] = [
  { key: 'all', label: 'All Topics' },
  { key: 'access', label: 'Access & Multi-Role' },
  { key: 'assets', label: 'Assets, Zones & CSV' },
  { key: 'inspections', label: 'Inspections & Approvals' },
  { key: 'projects', label: 'Projects, WBS & Gantt' },
  { key: 'system', label: 'Localhost, Data & Tours' },
];

export const APP_FAQ_ITEMS: FaqItem[] = [
  {
    id: 'faq-roles-difference',
    category: 'access',
    question: 'What are the differences between Admin, Approver, and User roles?',
    answer:
      'IndSpectora uses three composable roles so access matches real plant responsibilities. A single user can hold more than one role at the same time (for example, Approver + User, or Admin + Approver).',
    steps: [
      'User (Standard Executor): Can start and submit inspection reports, edit their own Draft or Sent-Back reports, post comments, and update progress/comments on Project Activities assigned to them.',
      'Approver: Has all User capabilities plus authority to create/edit Facility Zones, Asset Library items, CSV imports, and Projects/WBS Activities—and appears in the 1–6 sequential Approver picker to Approve or Send Back inspections.',
      'Admin: Has full User Management (create, multi-role assignment, password reset, delete) and override capability to edit already Pending Approval / Approved inspection reports or Completed Project Activities with full Digital Footprint logging.',
    ],
    appliesTo: 'Admin · Approver · User',
    relatedPageKey: 'users',
    keywords: ['role', 'admin', 'approver', 'user', 'multi-role', 'privilege', 'permission', 'rbac'],
  },
  {
    id: 'faq-approver-picker-missing',
    category: 'access',
    question: 'Why does a teammate not show up in the Approver dropdown when submitting an inspection?',
    answer:
      'Only accounts that explicitly hold the Approver role appear in the sequential approval selector. Holding only Admin or only User does not include someone in the approver roster.',
    steps: [
      'Sign in as an Admin and open Settings → Account Management.',
      'Click Edit on the teammate row and check the Approver role box alongside any existing roles.',
      'Save changes—the user will immediately become selectable across Steps 1 to 6.',
    ],
    appliesTo: 'Admin',
    relatedPageKey: 'users',
    keywords: ['approver', 'dropdown', 'missing', 'select', 'role', 'step'],
  },
  {
    id: 'faq-default-accounts',
    category: 'access',
    question: 'How does first-time Administrator setup work on an empty database?',
    answer:
      'Fresh IndSpectora databases contain zero default accounts or hardcoded passwords. When you open the login screen against an uninitialized database, a one-time First-Run Administrator Setup form creates the initial Admin + Approver account and automatically locks setup afterward.',
    steps: [
      'Open IndSpectora right after deployment and fill out the Create Initial Administrator Account form (minimum 8-character password).',
      'Open Settings → Account Management to create named accounts for your plant operators, supervisors, and approvers.',
      'Optional testing: Admins can enable Settings → Developer Mode and turn on Login Page Non-Admin Quick-Login to expose passwordless non-admin sandbox accounts (Approver and User only) on the sign-in screen.',
    ],
    appliesTo: 'Admin',
    relatedPageKey: 'settings',
    keywords: ['login', 'first setup', 'admin setup', 'bootstrap', 'developer mode', 'quick login'],
  },
  {
    id: 'faq-why-no-cycle-on-assets',
    category: 'assets',
    question: 'Why does the Asset form not ask for a Maintenance Cycle anymore?',
    answer:
      'Physical equipment is often inspected across multiple cadences—for example, daily/routine checks as well as yearly turnaround or eventual incident audits. Maintenance Cycle is chosen when you start an Inspection Report or create a Project, rather than locking each Asset to a single fixed cycle.',
    appliesTo: 'Admin · Approver · User',
    relatedPageKey: 'library',
    keywords: ['maintenance cycle', 'asset', 'routine', 'yearly', 'eventual', 'removed'],
  },
  {
    id: 'faq-facility-zones',
    category: 'assets',
    question: 'How do Facility / Zone Areas link to Assets and new inspections?',
    answer:
      'Every Asset can be assigned to a Facility / Zone Area (such as DRY-01 — Dryer Hall Alpha). When someone starts a new inspection, they can filter the Asset checklist by Facility / Zone Area and search keywords so field teams only load assets relevant to that shift or building.',
    steps: [
      'Open Asset Library → Facility / Zone Areas sub-tab and create your plant zones with unique zone codes.',
      'Assign each Asset to its Facility / Zone Area manually or via the Facility Area Code column in CSV import.',
    ],
    appliesTo: 'Admin · Approver',
    relatedPageKey: 'library',
    keywords: ['facility', 'zone', 'area', 'filter', 'location', 'plant'],
  },
  {
    id: 'faq-csv-import-format',
    category: 'assets',
    question: 'How do I format Custom Inspection Parameters when bulk-importing Assets via CSV?',
    answer:
      'Click Download CSV Template in the Asset Library to download indspectora-asset-import-template.csv with valid headers and two working examples. Existing Asset Codes are updated on re-import, while new codes are inserted automatically.',
    steps: [
      'Keep columns: Asset Code, Category, Asset Title, Facility Area Code, Description, Inspection Criteria, Criticality (low/medium/high), Require Photo (yes/no), Active (yes/no), Custom Parameters.',
      'Format multiple custom parameters inside column 10 separated by semicolons (;), using pipes (|) inside each parameter: Label|type|unit|required.',
      'Example: Powder Accumulation|number|kg|required; Chamber Seal Intact|boolean||required; Operator Notes|text|',
    ],
    appliesTo: 'Admin · Approver',
    relatedPageKey: 'library',
    keywords: ['csv', 'import', 'template', 'bulk', 'upload', 'custom parameter', 'pipe', 'semicolon'],
  },
  {
    id: 'faq-custom-parameters-history',
    category: 'assets',
    question: 'How do Custom Inspection Parameters and per-Asset Inspection History work?',
    answer:
      'Each Asset can define unlimited custom inspection fields using three input types: Text, Number (with custom unit like kg, bar, °C, mm/s), or Yes/No toggle. Every value recorded during inspections is archived chronologically under that Asset.',
    steps: [
      'Configure parameters when creating or editing an Asset in the Asset Library.',
      'During inspection execution, fill in those fields on the Asset card (required parameters must be filled before submitting for approval).',
      'Click History on any Asset row in the Asset Library to view cross-report readings, condition ratings, and numeric parameter trends over time.',
    ],
    appliesTo: 'Admin · Approver · User',
    relatedPageKey: 'library',
    keywords: ['custom parameter', 'powder', 'number', 'unit', 'boolean', 'history', 'trend', 'dryer'],
  },
  {
    id: 'faq-visual-pins',
    category: 'assets',
    question: 'How does the Interactive Visual Inspection drawing and pin system work?',
    answer:
      'Drawings and numbered inspection pins are defined once in the Asset Library and automatically sync into every new Inspection Report for that Asset. During inspection, operators click pins directly on the engineering drawing to log pin-specific condition notes and evidence photos.',
    steps: [
      'In Asset Library, upload an asset drawing image (PNG/JPG/WebP) and click anywhere on the drawing to drop numbered pins with guidance notes and optional linked WBS Project Tasks.',
      'Inside an active Inspection Report, click any numbered pin on the asset diagram to record that point’s condition, text findings, and pin-specific photos.',
    ],
    appliesTo: 'Admin · Approver · User',
    relatedPageKey: 'library',
    keywords: ['drawing', 'pin', 'visual', 'diagram', 'map', 'photo', 'sync'],
  },
  {
    id: 'faq-editable-report-title',
    category: 'inspections',
    question: 'Can I edit an Inspection Report title after creating the draft?',
    answer:
      'Yes. While a report is in Draft or Sent Back status, the executor (and Admins) can edit the report title directly inside the report workspace header. Once submitted for approval or approved, only Admins can modify the title, and every change is logged in the Digital Footprint.',
    appliesTo: 'Admin · Approver · User',
    relatedPageKey: 'inspections',
    keywords: ['title', 'edit', 'draft', 'rename', 'report'],
  },
  {
    id: 'faq-sequential-approvals',
    category: 'inspections',
    question: 'How does the sequential 1 to 6 Approver workflow route notifications and decisions?',
    answer:
      'When submitting an inspection report, the executor selects between 1 and 6 unique Approvers in exact sequential order (Step 1 → Step N). Only the currently active step approver receives a notification and can act.',
    steps: [
      'Upon submission, Step 1 status becomes Pending and notifies Approver 1 in real time and in their Need My Action queue.',
      'When Approver 1 clicks Approve Step, Step 2 automatically activates and notifies Approver 2.',
      'When the final approver approves, the report transitions to Approved and notifies the original executor.',
    ],
    appliesTo: 'Admin · Approver · User',
    relatedPageKey: 'inspections',
    keywords: ['approval', 'sequential', 'step', '6 approver', 'route', 'notification', 'chain'],
  },
  {
    id: 'faq-send-back-and-comments',
    category: 'inspections',
    question: 'What happens when an Approver sends back a report, and where do comments go?',
    answer:
      'If any step approver clicks Send Back (which requires a revision note), the approval chain pauses and returns the report to Sent Back status. The original executor receives a notification and the report appears in their Need My Action queue for edits and resubmission.',
    steps: [
      'Approvers and team members can post comments at two levels: per specific Asset entry (for targeted equipment feedback) or on the overall Inspection Report.',
      'After the executor revises entries or photos, clicking Submit for Approval restarts the sequential review cleanly while preserving all prior Digital Footprints and comments.',
    ],
    appliesTo: 'Admin · Approver · User',
    relatedPageKey: 'inspections',
    keywords: ['send back', 'reject', 'revision', 'comment', 'resubmit', 'feedback'],
  },
  {
    id: 'faq-digital-footprint',
    category: 'inspections',
    question: 'Where did Digital Sign-Off go, and what is the Digital Footprint?',
    answer:
      'Hand-drawn signature pads were replaced with a cryptographic-grade Digital Footprint and per-item Edit History. Every report creation, title edit, asset condition update, custom parameter entry, comment, submission, approval step, send-back, and Admin post-approval edit records the exact user name, active roles, action summary, and timestamp.',
    appliesTo: 'Admin · Approver · User',
    relatedPageKey: 'inspections',
    keywords: ['digital sign-off', 'signature', 'digital footprint', 'audit trail', 'edit history'],
  },
  {
    id: 'faq-need-my-action',
    category: 'inspections',
    question: 'What appears inside the "Need My Action" queue?',
    answer:
      'Need My Action is personalized for your signed-in account and surfaced in three places: the Sidebar badge counter, the Dashboard priority card, and the Need My Action tab inside Inspections & Audits.',
    steps: [
      'For Approvers: Shows Pending Approval reports where your sequential step is currently active.',
      'For Executors: Shows Sent Back reports that you created and need to revise and resubmit.',
    ],
    appliesTo: 'Admin · Approver · User',
    relatedPageKey: 'dashboard',
    keywords: ['need my action', 'queue', 'badge', 'pending', 'sent back', 'inbox'],
  },
  {
    id: 'faq-admin-edit-locked',
    category: 'inspections',
    question: 'Can anyone modify an Approved Inspection Report or a Completed Project Activity?',
    answer:
      'Standard Users and Approvers cannot modify locked Pending Approval/Approved reports or Completed project activities. Only Admins retain override edit access, and every Admin modification appends a flagged audit record (admin_edited) in the Digital Footprint or Activity History.',
    appliesTo: 'Admin',
    relatedPageKey: 'inspections',
    keywords: ['approved', 'locked', 'override', 'admin edit', 'completed', 'immutable'],
  },
  {
    id: 'faq-wbs-code',
    category: 'projects',
    question: 'What is a WBS Code in Projects & Active Project?',
    answer:
      'WBS stands for Work Breakdown Structure—a standard hierarchical numbering code (such as 1, 1.1, 1.1.1, 2, 2.1) that organizes a project from major phases down to individual maintenance activities and milestones so schedules, dependencies, and blockers stay unambiguous.',
    steps: [
      'Top-level Phases use whole numbers (1, 2).',
      'Child tasks and milestones inherit decimal sub-codes (1.1, 1.2, 2.1) and can depend on upstream WBS items via Finish-to-Start or Start-to-Start blockers.',
    ],
    appliesTo: 'Admin · Approver · User',
    relatedPageKey: 'gantt',
    keywords: ['wbs', 'work breakdown structure', 'code', 'hierarchy', 'phase', 'milestone'],
  },
  {
    id: 'faq-gantt-vs-table-assignees',
    category: 'projects',
    question: 'How do Gantt View, Table View, Activity History, and Registered Assignees work?',
    answer:
      'Inside Active Project, toggle between visual Gantt Timeline bars and a compact Table View displaying Schedule Start–Stop dates, inline progress updates, and quick assignee selectors. Assignees are picked directly from registered IndSpectora users.',
    steps: [
      'Click any activity bar or table row to open the Activity Inspector Drawer.',
      'Update progress % or status—every save automatically appends a timestamped history entry (e.g., Work Progress 0% → 50% on dd/mmm/yyyy hh:mm).',
      'Use the Activity Comments section inside the drawer to share shift handoffs or field notes with exact timestamps.',
    ],
    appliesTo: 'Admin · Approver · User',
    relatedPageKey: 'gantt',
    keywords: ['gantt', 'table view', 'schedule start-stop', 'assignee', 'progress history', 'comments'],
  },
  {
    id: 'faq-data-persistence-localhost',
    category: 'system',
    question: 'Where are IndSpectora records, photos, and asset drawings stored on localhost?',
    answer:
      'Everything persists locally on disk inside the data directory: structured relational data in data/indspectora.db (SQLite) and uploaded inspection photos or asset drawings inside data/uploads/. When running via Docker Compose, ./data is mounted as a persistent host volume so restarts never lose data.',
    steps: [
      'Back up anytime by stopping the server briefly and copying the entire data/ folder.',
      'To start completely fresh on localhost, stop the server, remove data/indspectora.db and data/uploads/*, and restart—only the two starter user accounts will be re-seeded.',
    ],
    appliesTo: 'Admin · DevOps',
    keywords: ['sqlite', 'database', 'backup', 'uploads', 'storage', 'docker', 'volume', 'reset'],
  },
  {
    id: 'faq-tours-and-dark-mode',
    category: 'system',
    question: 'How do Light/Dark Mode and first-time interactive Page Tours work?',
    answer:
      'Use the Sun/Moon toggle in the top header to switch between Light and Dark Mode (saved per browser). When a user signs in and visits a workspace for the first time, IndSpectora automatically launches a short interactive tour tailored to that page.',
    steps: [
      'Completion is tracked per user and per page in the database so tours do not repeat unexpectedly.',
      'Open How to Use at any time to click Launch Tour on an individual module or Reset All First-Time Tours to replay every onboarding prompt.',
    ],
    appliesTo: 'Admin · Approver · User',
    relatedPageKey: 'howto',
    keywords: ['dark mode', 'light mode', 'theme', 'tour', 'onboarding', 'replay', 'reset tours'],
  },
];

