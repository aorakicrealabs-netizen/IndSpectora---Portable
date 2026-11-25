# IndSpectora — Frequently Asked Questions (FAQ)

Reference guide covering **Access & Multi-Role Permissions**, **Asset Library, Facility Zones & CSV Import**, **Inspections, Sequential Approvals & Digital Footprints**, **Projects, WBS, Gantt & Table Views**, and **Localhost Storage & Interactive Tours**.

---

## 1. Access, Accounts & Multi-Role Permissions

### What are the differences between Admin, Approver, and User roles?
IndSpectora uses three composable roles so access matches real plant responsibilities. A single user can hold more than one role at the same time (for example, `Approver + User`, or `Admin + Approver`):
- **User (Standard Executor)**: Can start and submit inspection reports, edit their own `Draft` or `Sent Back` reports, post comments, and update progress and comments on Project Activities assigned to them.
- **Approver**: Has all User capabilities plus authority to create/edit **Facility Zones**, **Asset Library** items, **CSV imports**, and **Projects / WBS Activities**—and appears in the 1–6 sequential Approver picker to **Approve** or **Send Back** inspections.
- **Admin**: Has full **User Management** (create, multi-role assignment, password reset, delete) and override capability to edit already `Pending Approval` / `Approved` inspection reports or `Completed` Project Activities with full **Digital Footprint** logging.

### Why does a teammate not show up in the Approver dropdown when submitting an inspection?
Only accounts that explicitly hold the **Approver** role appear in the sequential approval selector. Holding only `Admin` or only `User` does not include someone in the approver roster.
1. Sign in as an **Admin** and open **User Management**.
2. Click **Edit** on the teammate row and check the **Approver** role box alongside any existing roles.
3. Save changes—the user immediately becomes selectable across Steps 1 to 6.

### How does first-time Administrator setup work on an empty database?
When IndSpectora boots against an empty SQLite database, **zero default accounts or preset passwords** are seeded.
1. Open `http://localhost:3000` to launch the one-time **Create Initial Administrator Account** form (`Admin + Approver`, minimum 8-character password). Once submitted, initial setup locks permanently.
2. Open **Settings → Account Management** to create named accounts for your team.
3. Optional testing: Admins can toggle **Developer Mode** ON in **Settings → Developer Mode** and enable **Login Page Non-Admin Quick-Login** to surface sandbox `Approver` and `User` test accounts (never Admin accounts) on the login screen.

---

## 2. Asset Library, Facility Zones, CSV Import & Visual Inspection

### Why does the Asset form not ask for a Maintenance Cycle anymore?
Physical equipment is often inspected across multiple cadences—for example, routine daily checks as well as yearly turnaround or eventual incident audits. **Maintenance Cycle** is chosen when starting an **Inspection Report** or creating a **Project**, rather than locking each Asset to one fixed cycle.

### How do Facility / Zone Areas link to Assets and new inspections?
Every Asset can be assigned to a **Facility / Zone Area** (such as `DRY-01 — Dryer Hall Alpha`). When starting a new inspection, teams can filter the Asset checklist by Facility / Zone Area and keyword search so only equipment relevant to that zone or shift is loaded.

### How do I format Custom Inspection Parameters when bulk-importing Assets via CSV?
Click **Download CSV Template** in **Asset Library** to download `indspectora-asset-import-template.csv`. Existing Asset Codes are updated on re-import, while new codes are inserted automatically.
- **Columns**: `Asset Code`, `Category`, `Asset Title`, `Facility Area Code`, `Description`, `Inspection Criteria`, `Criticality (low/medium/high)`, `Require Photo (yes/no)`, `Active (yes/no)`, `Custom Parameters`.
- **Custom Parameters syntax** (column 10): Separate multiple parameters with `;` and fields inside each parameter with `|` (`Label|type|unit|required`).
- **Example**: `Powder Accumulation|number|kg|required; Chamber Seal Intact|boolean||required; Operator Notes|text|`

### How do Custom Inspection Parameters and per-Asset Inspection History work?
Each Asset can define unlimited custom inspection fields using three types: **Text**, **Number** (with unit such as `kg`, `bar`, `°C`, `mm/s`), or **Yes/No** toggle. Required parameters must be completed before submitting a report for approval. Click **History** on any Asset row in the **Asset Library** to inspect chronological readings, condition ratings, and numeric trends across all reports.

### How does the Interactive Visual Inspection drawing and pin system work?
Engineering drawings and numbered inspection pins are defined once in the **Asset Library** and automatically synced into every new Inspection Report for that Asset. During field inspection, operators click numbered pins directly on the drawing to log point-specific conditions, notes, and pin-linked evidence photos.

---

## 3. Inspections, Sequential Approvals & Digital Footprints

### Can I edit an Inspection Report title after creating the draft?
Yes. While a report is in **Draft** or **Sent Back** status, the executor (and Admins) can edit the title directly in the report header. Once `Pending Approval` or `Approved`, only **Admins** can modify the title, and every edit is logged in the Digital Footprint.

### How does the sequential 1 to 6 Approver workflow route notifications and decisions?
When submitting a report, the executor selects **1 to 6 unique Approvers** in exact sequential order (`Step 1` → `Step N`):
1. Step 1 activates as `Pending` and notifies Approver 1 in real time and in their **Need My Action** queue.
2. When Approver 1 clicks **Approve Step**, Step 2 activates and notifies Approver 2 automatically.
3. When the final step approves, the report transitions to **Approved** and notifies the original executor.

### What happens when an Approver sends back a report, and where do comments go?
Clicking **Send Back** (requires a revision reason) pauses the approval chain and returns the report to **Sent Back** status. The executor receives an alert and sees the report inside **Need My Action**. Approvers and team members can post comments both **per specific Asset entry** and on the **overall report**.

### Where did Digital Sign-Off go, and what is the Digital Footprint?
Signature pads were replaced by an immutable **Digital Footprint** timeline and per-asset **Edit History**. Every report creation, title update, asset condition edit, custom parameter reading, comment, submission, step approval, send-back, and Admin post-approval override logs actor name, active roles, summary, and timestamp.

### What appears inside the "Need My Action" queue?
Surfaced in three places—the **Sidebar badge**, **Dashboard priority card**, and **Inspections filter tab**:
- **For Approvers**: `Pending Approval` reports where your sequential step is currently active.
- **For Executors**: `Sent Back` reports awaiting your revision and resubmission.

### Can anyone modify an Approved Inspection Report or a Completed Project Activity?
Only **Admins** retain override editing privileges on `Pending Approval`/`Approved` inspection reports and `Completed` Project activities, with every edit permanently flagged as `admin_edited` in the Digital Footprint or Activity History.

---

## 4. Projects, WBS, Gantt & Table Views

### What is a WBS Code in Projects & Active Project?
**WBS** stands for **Work Breakdown Structure**—a hierarchical numbering identifier (`1`, `1.1`, `1.1.1`, `2`, `2.1`) organizing a project from major Phases down to child activities and milestones so schedule dependencies and blockers remain clear.

### How do Gantt View, Table View, Activity History, and Registered Assignees work?
Inside **Active Project**, switch between visual **Gantt Timeline** bars and a compact **Table View** with **Schedule Start–Stop** columns, inline progress updates, and **registered user Assignee** pickers. Clicking any activity opens the **Activity Inspector Drawer**, where saving progress automatically logs timestamped change entries (e.g., `Work Progress 0% → 50% on dd/mmm/yyyy hh:mm`) alongside timestamped team **Comments**.

---

## 5. Localhost Operations, Data & Tours

### Where are IndSpectora records, photos, and asset drawings stored on localhost?
- SQLite database: `./data/indspectora.db`
- Uploaded photos & drawings: `./data/uploads/`

Back up anytime by stopping the server and copying `./data/`. In Docker Compose, `./data` is mounted directly into `/app/data` so container rebuilds preserve all data.

### How do Light/Dark Mode and first-time interactive Page Tours work?
Toggle Light/Dark Mode from the header Sun/Moon button (saved per browser). First-time page tours run automatically once per page for each user; visit **How to Use** anytime to launch individual workspace tours or click **Reset All First-Time Tours**.
