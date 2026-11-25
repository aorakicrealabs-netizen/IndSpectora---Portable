# IndSpectora — Inspection, Asset Governance & Project Operations

**IndSpectora** is a self-hosted operational platform unifying **Visual & Parameterized Field Inspections**, **Sequential Multi-Approver Workflows**, **Cross-Audit Asset History & Session Comparison**, **Project / Gantt Tracking**, and **Role-Based Governance** on top of a lightweight, persistent local stack.

Designed for **plant & facility operations teams**, **reliability engineers**, and **project teams** on desktop or mobile devices, IndSpectora replaces scattered spreadsheets, disconnected photo folders, and manual sign-off loops with an auditable single-source system synchronized in real time over WebSockets.

> **Quick Links**: [Localhost & AI-Agent Deployment Runbook (`DEPLOY.md`)](./DEPLOY.md) · [Frequently Asked Questions (`FAQ.md`)](./FAQ.md)

---

## End-to-End Operational Workflow

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 1. DEFINE ASSETS & ZONES (Admin / Approver)                                      │
│    Facility Zones ─▶ Asset Library (CSV Bulk Import or Manual)                   │
│                    ├─ Custom Inspection Parameters (Text, Number+Unit, Yes/No)   │
│                    └─ Engineering Drawings + Numbered Inspection Pins ──(links)──┼──┐
└──────────────────────────────────────────────────────────────────────────────────┘  │
                                        │                                               │
                                        ▼                                               │
┌──────────────────────────────────────────────────────────────────────────────────┐  │
│ 2. EXECUTE FIELD INSPECTION (Any Role · Desktop or Mobile Cards)                 │
│    Filter by Zone ─▶ Edit Draft Title ─▶ Record Condition + Custom Params        │
│                    └─ Click Visual Drawing Pins + Attach Pin-Linked Photos       │
└──────────────────────────────────────────────────────────────────────────────────┘  │
                                        │                                               │
                                        ▼                                               │
┌──────────────────────────────────────────────────────────────────────────────────┐  │
│ 3. SEQUENTIAL APPROVAL & DIGITAL FOOTPRINT (1–6 Approvers)                       │
│    Submit ─▶ Step 1 Pending (Real-Time Alert & "Need My Action")                 │
│              ├─ Send Back + Reason ─▶ Executor Revises & Resubmits ──┐           │
│              └─ Approve Step ──▶ Activates Step 2 .. Step N ─────────┘           │
│                                  └─▶ Final Approval (Immutable Digital Footprint)│  │
└──────────────────────────────────────────────────────────────────────────────────┘  │
                                        │                                               │
              ┌─────────────────────────┴─────────────────────────┐                     │
              ▼                                                   ▼                     │
┌──────────────────────────────────────────┐  ┌─────────────────────────────────────────┴─┐
│ 4. ASSET HISTORY & SESSION COMPARE       │  │ 5. TRACK PROJECTS (Gantt, Table & Blockers)│
│    Chronological Timeline & KPI Trends   │  │    Optional WBS Numbering (Toggleable)    │
│    2–4 Session Side-by-Side Diff + Photos│  │    Registered Assignees & Progress History│
└──────────────────────────────────────────┘  └───────────────────────────────────────────┘
```

---

## Navigation Structure & Responsive Mobile Experience

- **Workflow-Prioritized Navigation**: The desktop sidebar surfaces daily operational modules first in order:
  `Operations Dashboard` → `Inspections & Audits` → `Projects` → `Asset History` → `Asset Library` → `Settings` → `How to Use`.
- **Mobile Touch-First Ergonomics**:
  - Sticky compact mobile top bar (`52px`) and fixed bottom navigation bar (`Dashboard`, `Inspect`, `Projects`, `History`, plus a `More` bottom sheet for `Asset Library`, `Settings`, `How to Use`, Dark/Light theme toggle, and Sign Out).
  - Dense multi-column tables automatically adapt into touch-friendly **compact mobile cards** (`md:hidden`) across Inspections, Projects, Asset History, Asset Library, Dashboard, User Management, and Settings, with horizontally scrollable filter strips and `>=38px–44px` touch targets.
- **Branding**: Custom IndSpectora emblem displayed in the sidebar header, mobile header, login screen, and browser favicon.

---

## Core Modules & Capabilities

### 1. Inspections, Sequential Approvals & Audit Governance
- **Facility-Filtered Execution & Editable Draft Titles**: Start inspections filtered by **Facility / Zone Area** and keyword search. Keep the report title editable while in `Draft` or `Sent Back` status (or anytime as `Admin`).
- **Visual Pin & Photo Evidence Capture**: Upload photos per asset or linked directly to numbered engineering drawing pins, with client-side HEIC image conversion support (`heic2any`).
- **Sequential 1–6 Approver Routing**: Select between 1 and 6 distinct reviewers holding the `Approver` role in exact sequential order (`Step 1` → `Step N`).
- **Send Back & Targeted Comments**: Active step approvers receive persistent + WebSocket real-time alerts and can **Approve Step**, **Send Back** with a mandatory revision reason, or post comments **on individual Asset entries** or on the **overall report**.
- **Digital Footprint & Per-Item Edit History**: Immutable **Digital Footprint** timeline and field-level **Edit History** tracking actor name, active roles, exact before/after changes, and timestamps.
- **Exports & Print**: Export structured inspection datasets to CSV or generate clean, theme-independent print/PDF audit sheets.

### 2. Need My Action & Live Notifications
- Personalized priority inbox surfaced simultaneously in three places:
  1. **Sidebar counter badge** on *Inspections & Audits*
  2. **Dashboard priority card** for immediate shift triage
  3. **Need My Action filter tab** inside the Inspections list
- Automatically displays `Pending Approval` reports where your sequential step is active (for Approvers) and `Sent Back` reports awaiting revision (for Executors).

### 3. Projects (Optional WBS, Gantt Timeline, Table & Blockers)
- **Optional WBS Code Numbering**: When creating a new project, choose whether to **Enable WBS Code Numbering** (`1`, `1.1`, `1.1.1`) or manage activities purely by title without WBS prefixes. Toggle WBS visibility anytime later in **Project Settings** without losing previously stored WBS codes.
- **Dual Schedule Views**: Switch seamlessly between an interactive **Gantt Timeline** and a high-density **Table View** featuring **Schedule Start–Stop** columns, inline status/progress updates, and quick assignee switching.
- **Registered User Assignees**: Assign every activity directly to a registered IndSpectora team member (`assigneeId` + synchronized display name).
- **Automatic Change History & Timestamped Comments**: Updating progress or status automatically records immutable audit entries (e.g., `Work Progress 0% → 50% on dd/mmm/yyyy hh:mm`), paired with a timestamped **Activity Comments** feed and Finish-to-Start / Start-to-Start dependency blocker tracking.

### 4. Asset History & Multi-Session Side-by-Side Comparison
- **Dedicated Cross-Audit History Page**: Filter by Asset code/title or Facility Zone, use horizontal 1-tap quick asset chips, or jump directly from any row in **Asset Library**.
- **Numeric Parameter Trending**: Automatically summarizes numeric custom parameters across all recorded sessions (`Latest`, `Previous`, `Delta`, `Avg`, `Min`, and `Max`).
- **2-to-4 Session Side-by-Side Comparison**: Pick any **2, 3, or 4** historical inspection sessions (or use 1-tap quick-compare presets) to compare baseline-to-latest progression side by side:
  - Condition ratings, executor, cycle, and approval status
  - Unified custom parameter readings across sessions
  - Visual pin findings and inspector notes
  - Chronological evidence photo galleries with full-screen lightbox inspection

### 5. Asset & Facility Library
- **Facility / Zone Areas**: Organize plant buildings, production lines, or utility zones with unique zone codes (e.g., `DRY-01`, `UTL-02`) and link Assets directly to their physical zones.
- **CSV Template & Bulk Import**: Download a pre-formatted CSV template (`indspectora-asset-import-template.csv`) and bulk-import or update Assets—including embedded **Custom Parameters**—with instant pre-import row validation.
- **Configurable Custom Inspection Parameters**: Define unlimited inspection metrics per Asset using three typed controls:
  - **Number with Unit** (e.g., `Powder Accumulation` in `kg`, `Delta P` in `kPa`, `Temperature` in `°C`)
  - **Yes / No Toggle** (e.g., `Chamber Seal Intact`)
  - **Free-Form Text** (e.g., `Operator Observation`)
- **Interactive Visual Inspection**: Upload an engineering drawing or schematic per Asset and place numbered inspection pins with guidance notes and optional links to **Project Tasks**. Pins sync automatically into every newly created inspection report for that Asset.

### 6. Unified Settings, Preferences & Developer Mock Engine
Consolidated inside **Settings** with personal sections for all members and administrative sections restricted to `Admin`:
- **Profile, Security & Active Sessions** *(All Users)*: Edit display name and job title, change password (automatically invalidating other sessions), and inspect or revoke active login sessions.
- **Preferences & Guided Tours** *(All Users)*: Configure **Light / Dark Mode**, **Table Density** (`Comfortable` or `Compact`), **Default Landing Tab**, **Toast Notification toggle**, and **Reset All Guided Tours**.
- **Account & Role Management** *(Admin)*: Create user accounts, assign composable multi-roles (`Admin`, `Approver`, `User`), and reset team passwords without a duplicate sidebar page.
- **Workspace Defaults & SQLite JSON Backup** *(Admin)*: Set Workspace/Plant display name, default inspection cycle (`Routine`, `Yearly`, `Eventual`), default new-asset criticality, default photo-evidence requirement, and export a **Sanitized SQLite JSON Backup** (password hashes and session tokens strictly omitted).
- **Developer Mode & Isolated Mock Data Pack** *(Admin)*:
  - Toggle **Developer Mode** and enable/disable the **Mock Operations Dataset Pack** (sample Facility Zones, Assets with SVG schematics & pins, Projects, Tasks, Reports, and sample team accounts).
  - **Strict Manual Data Isolation**: Mock records (`is_mock = 1`) are completely isolated from manually created records (`is_mock = 0`). Turning Mock Data **OFF** immediately removes all mock items—and resets any edits made to mock records—while leaving all manually created assets, reports, and projects intact. Includes **Reset Modified Mock Data** and a live Manual vs. Mock database breakdown table.

### 7. Composable Multi-Role Access Control (RBAC)
Users can hold **multiple roles simultaneously** (e.g., `Approver + User` or `Admin + Approver`) managed via **Settings → Account & Role Management**:

| Operation / Capability | Admin | Approver | User |
| :--- | :---: | :---: | :---: |
| Start & submit inspection reports (1–6 step routing) | Yes | Yes | Yes |
| Revise & resubmit own `Sent Back` drafts | Yes | Yes | Yes |
| View **Asset History** & compare 2–4 sessions side by side | Yes | Yes | Yes |
| Appear in Approver selector & **Approve / Send Back** active steps | — *(unless also Approver)* | Yes | — |
| Create/edit Facility Zones, Assets, CSV imports, & Visual Pins | Yes | Yes | — |
| Create & manage Projects, optional WBS activities, & blockers | Yes | Yes | — |
| Update progress & comments on active assigned Project activities | Yes | Yes | Yes *(assigned only)* |
| Override-edit `Pending Approval` / `Approved` reports & `Completed` tasks | Yes *(logged)* | — | — |
| Manage Users, Workspace Defaults, JSON Backup & Developer Mode | Yes | — | — |

### 8. Built-In Onboarding, FAQ & Theme Support
- **First-Time Per-Page Tours**: Guides new users automatically the first time they open each workspace (including **Asset History** and **Settings**), with **Launch Tour** and **Reset All Guided Tours** controls in **How to Use** and **Settings**.
- **In-App Searchable FAQ**: Categorized troubleshooting, CSV syntax, and workflow Q&As right inside **How to Use**.
- **Light & Dark Mode**: Persistent theme toggle in both desktop sidebar and mobile `More` sheet with full contrast parity across tables, Gantt timelines, comparison grids, and visual pin editors.

---

## Real-World Application Cases

### Case A: Manufacturing Equipment & Plant Maintenance
**Scenario**: Daily and turnaround monitoring of high-value process machinery such as a **Rotary Spray Dryer Tower (`AST-DRY-01`)** in `DRY-01 — Dryer Hall Alpha`.

1. **Standardize Asset Setup**: A Reliability Engineer (`Approver`) imports plant equipment via CSV and configures custom parameters on `AST-DRY-01`: `Powder Accumulation` (`number`, `kg`, required), `Chamber Seal Intact` (`boolean`, required), and `Operator Observation` (`text`).
2. **Map Critical Inspection Points**: An engineering schematic of the spray dryer is uploaded once to the Asset Library with numbered visual pins: **Pin #1 (Rotary Valve Seal)** and **Pin #2 (Cyclone Hopper Chute)**—with Pin #2 linked to a preventive turnaround task (`Replace Chute Gasket`) in **Projects**.
3. **Shift Execution on Mobile or Tablet**: A Shift Operator (`User`) opens **Inspections** on a mobile browser, filters by `DRY-01`, taps Pins #1 and #2 to attach close-up inspection photos, enters `3.4 kg` for `Powder Accumulation`, and submits to a 2-step approval chain (`Line Supervisor` → `Maintenance Lead`).
4. **Cross-Audit Trend & Side-by-Side Compare**: Over months of inspections, supervisors open **Asset History** on `AST-DRY-01` to inspect `kg` accumulation deltas and select up to **4 sessions side by side** to verify seal wear and photo progression before scheduling cleaning shutdowns.

### Case B: Facility Safety & Multi-Zone Compliance Audits
**Scenario**: Monthly EHS & facility safety walkthrough spanning **Chemical Storage (`CHM-01`)**, **Boiler & Chiller Room (`UTL-02`)**, and **Loading Dock (`LOG-03`)**.

1. **Zone-Scoped Audits**: Inspectors start separate zone-filtered audit drafts so field checklists contain only equipment and safety stations located inside that specific zone, keeping report titles editable while gathering findings (`"Q4 Boiler & Chiller EHS Walkthrough"`).
2. **Enforced Sequential Sign-Off**: Each report routes through a 3-step governance chain (`1. Area EHS Officer` → `2. Facility Engineer` → `3. Plant Director`). Only the active step reviewer is alerted in **Need My Action**.
3. **Controlled Send-Back Revisions**: At Step 2, the Facility Engineer spots an incomplete relief-valve photo, posts a comment directly on that specific Asset entry, and clicks **Send Back** with a revision note. The report moves into the original inspector's **Need My Action** queue, preserving prior comments and history.
4. **Corrective Closure & Audit Trail**: Once approved, the report locks against unauthorized edits with an immutable **Digital Footprint**. Follow-up remediation tasks are scheduled inside **Projects** (with WBS numbering enabled or disabled per project preference), assigned to named technicians, tracked in **Table View (`Schedule Start–Stop`)**, and archived via **Settings → Sanitized JSON Backup** for regulatory review.

---

## Technical Architecture

```
┌──────────────────────────────┐        HTTPS / HTTP (:3000)        ┌──────────────────────────────┐
│ Browser Client (React 19)    │ ◀────────────────────────────────▶ │ Express Server (server.ts)   │
│  • Tailwind CSS v4 (Dark/Lt) │        REST JSON + Multipart       │  • Session Bearer Auth       │
│  • Mobile Bottom Nav & Cards │                                    │  • Multi-Role RBAC Guards    │
│  • Interactive Gantt / Pins  │                                    │  • Multer Image Uploads      │
│  • Live WebSocket Listener   │ ◀═════════ WebSockets (/ws) ═════▶ │  • Mock Data Isolation Engine│
└──────────────────────────────┘        Real-time sync & alerts     └──────────────┬───────────────┘
                                                                                   │
                                                                    ┌──────────────▼───────────────┐
                                                                    │ Local Persistent ./data/     │
                                                                    │  • data/indspectora.db (SQLite)│
                                                                    │  • data/uploads/ (Photos)    │
                                                                    └──────────────────────────────┘
```

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Motion, `heic2any`
- **Backend**: Node.js (`v22.18+` native TS execution or `tsx`), Express, `ws` WebSocket server, Multer
- **Database**: `better-sqlite3` (`./data/indspectora.db`, WAL-friendly local relational persistence with foreign keys) — or built-in `node:sqlite` inside the standalone Windows Portable `.exe`

---

## Quick Start & Portable Installation

IndSpectora starts cleanly with **zero mock operational data** and automatically initializes `./data/indspectora.db` on first boot. Admins can optionally load sandbox sample records anytime via **Settings → Developer Mode**.

### Option 1: Windows Portable `.exe` (No Admin Rights, No NPM, No Docker Required)

Use this option on **Windows 10 / Windows 11 (x64)** when installing Node.js, NPM, or Docker Desktop is blocked by Administrator privileges:

1. **Download `IndSpectora-Portable.exe`**:
   - From a running IndSpectora instance, click **Download Portable (.exe)** on the sign-in screen or under **Settings → Workspace & Backup → Windows Portable Executable (.exe)**.
   - Or build it from source on any machine with Node.js v22+:
     ```bash
     npm install
     npm run build:portable
     # Output: dist-portable/IndSpectora-Portable.exe
     ```
2. **Place in a Dedicated User Folder**: Move `IndSpectora-Portable.exe` to a normal user folder such as `Documents\IndSpectora\IndSpectora-Portable.exe` (no installation or Administrator elevation required).
3. **Run Directly**:
   - Double-click `IndSpectora-Portable.exe` (if Windows Defender SmartScreen prompts on an unsigned portable binary, click **More info → Run anyway** — no Admin password needed).
   - It automatically starts the local IndSpectora server (port `3000`, or the next free port), opens `http://localhost:3000` in your browser, and stores `./data/indspectora.db` + `./data/uploads/` in the `data` folder right next to `IndSpectora-Portable.exe`.
4. **Stop & Back Up**:
   - Keep the console window open while working; press `Ctrl+C` or close the console window to stop cleanly.
   - To move to another PC, copy the `IndSpectora-Portable.exe` + `data\` folder or export via **Settings → Workspace & Backup → Download JSON Backup**.

### Option 2: Direct Node.js (`v22.18+` Recommended)

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Verify TypeScript & frontend build
npm run lint && npm run build

# 4. (Optional) Build standalone Windows portable executable
npm run build:portable

# 5. Start IndSpectora on http://localhost:3000
npm run dev
```

For production serving (`dist/` static bundle + API on port `3000`):
```bash
NODE_ENV=production PORT=3000 npm start
```

### Option 3: Docker & Docker Compose

```bash
# Build and start in background on http://localhost:3000 with persistent ./data mount
docker compose up --build -d
```

> **Troubleshooting & AI-Agent Automation**: See [`DEPLOY.md`](./DEPLOY.md) for preflight checks, native SQLite C++ build prerequisites, container lifecycle commands, health smoke tests, and step-by-step **User Intervention Gates**.

---

## First-Time Login & Usage Guide

IndSpectora ships with **zero hardcoded accounts or default passwords**:

1. **First-Run Administrator Setup**: When booting against an empty database, open `http://localhost:3000` and complete the one-time **Create Initial Administrator Account** form (`Admin + Approver`, minimum 8-character password). The setup endpoint locks automatically once the first Administrator exists.
2. **Invite Team Accounts**: Open **Settings → Account Management** to create named team accounts with composable multi-role assignments (`Admin`, `Approver`, `User`).
3. **Optional Sandbox & Demo Access**: Want to test workflows without affecting manual records? Open **Settings → Developer Mode**, turn **Developer Mode ON**, enable the **Mock Operations Dataset Pack**, and optionally toggle **Login Page Non-Admin Quick-Login** to expose passwordless non-admin sandbox cards (`Approver` / `User` only) on the sign-in screen.
4. **Set Up Zones & Import Assets**: Open **Asset Library → Facility / Zone Areas** to add your physical zones, then click **Download CSV Template** and upload your equipment inventory via **Import CSV**.
5. **Follow Built-In Tours**: Every workspace launches a brief interactive walkthrough on your first visit. Visit **How to Use** or **Settings → Appearance & Preferences** anytime to replay tours, check the Role Capability Matrix, or search the in-app FAQ.

---

## Further Documentation

- [`DEPLOY.md`](./DEPLOY.md) — Full **AI-Agent Localhost Deployment & First-Setup Runbook** (Node.js + Docker Compose, automated verification script, and explicit User Intervention Gates).
- [`FAQ.md`](./FAQ.md) — Complete **IndSpectora Usage FAQ** covering Multi-Role RBAC, CSV Parameter Syntax (`Label|type|unit|required`), Sequential Approvals, Digital Footprints, Asset History Side-by-Side Compare, Optional WBS/Gantt vs. Table View, Developer Mode Mock Isolation, and SQLite backup/reset procedures.

---

*Created by Aoraki CreaLabs*
