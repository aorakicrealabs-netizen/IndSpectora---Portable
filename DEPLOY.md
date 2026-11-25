# IndSpectora — AI-Agent Localhost Deployment & First-Setup Runbook

This runbook provides deterministic, step-by-step instructions for an **AI Agent** to deploy IndSpectora to `http://localhost:3000`, initialize the local SQLite database and uploads directory on first boot, verify runtime health, and clearly signal **User Intervention Gates** whenever human action or confirmation is required.

---

## Architecture & Persistence Overview

- **Backend & Server**: Express (`server.ts`) + WebSockets (`ws`) listening on `0.0.0.0:${PORT:-3000}`
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 (Vite middleware in dev mode; static `dist/` in production mode)
- **Database & File Storage**:
  - SQLite database auto-initialized at `./data/indspectora.db`
  - Uploaded inspection photos and asset engineering drawings stored under `./data/uploads/`
- **First-Run Initialization**: When `users` has zero non-mock Admin accounts at boot, IndSpectora serves an unseeded database (`0` users, `0` mock assets/reports/projects) and presents a one-time **First-Run Administrator Setup** form in the browser (`/api/auth/setup-admin`), which locks automatically after creation.

---

## Phase 1: AI-Agent Preflight Checks (Run Before Installing)

Run the following read-only checks to determine whether the host is ready for **Option A (Node.js Localhost)** or **Option B (Docker Compose)**:

```bash
# 1. Check Node.js & npm versions
node -v && npm -v

# 2. Check whether port 3000 is free (Linux/macOS)
lsof -i :3000 || ss -tulpn | grep :3000 || true

# 3. Check if Docker & Docker Compose v2 are available (for Option B)
docker --version && docker compose version || true
```

### Decision Rules for the AI Agent

| Condition Observed | Action |
| :--- | :--- |
| `node -v` is `v22.18.0` or higher (recommended) | Proceed directly with **Option A (Node.js Localhost)**. Native `node server.ts` works for both `npm run dev` and `npm start`. |
| `node -v` is `v20.x` or `v22.0–v22.17` | Warn the user; use `npm run dev` or `NODE_ENV=production npx tsx server.ts` instead of bare `node server.ts`. |
| `node` is missing or `< v20` AND `docker compose` is available | Recommend or proceed with **Option B (Docker Compose)**. |
| Both Node `>= 20` and Docker are missing | **STOP — Trigger User Intervention Gate #1**. |
| Port `3000` is already in use | **STOP — Trigger User Intervention Gate #3** (do not kill unknown host processes without approval). |

---

## Phase 2: Environment Configuration (Autonomous)

Create `.env` from `.env.example` if `.env` does not exist yet (do not overwrite an existing user `.env`):

```bash
if [ ! -f .env ]; then
  cp .env.example .env
fi
```

Default `.env` values for localhost:

```env
PORT=3000
NODE_ENV=development
APP_URL="http://localhost:3000"
GEMINI_API_KEY=""
```

> **Note**: Do **not** commit `.env` or `./data/` to version control. Ensure `.env` stays untracked and `./data/` is backed up locally.

---

## Phase 3: Deployment Target Setup

### Option A — Direct Node.js Localhost Setup

#### Step A1: Install Dependencies
```bash
npm install
```

> If `npm install` fails with `node-gyp` / `better_sqlite3.node` compilation errors (missing `python3`, `make`, `g++`, or Visual Studio C++ Build Tools), **STOP — Trigger User Intervention Gate #2** (or offer to switch to **Option B: Docker Compose**, which already includes build tools).

#### Step A2: Verify TypeScript & Frontend Build
```bash
npm run lint
npm run build
```

Both commands must exit with code `0` (`tsc --noEmit` passes and `dist/index.html` is generated).

#### Step A3: Start Localhost Server

- **Development Mode** (Vite middleware + live Express API + WebSockets):
  ```bash
  npm run dev
  ```
- **Production Localhost Mode** (serves compiled `dist/` bundle directly):
  ```bash
  NODE_ENV=production PORT=3000 npm start
  ```
  *(On Node 20 / `< 22.18`, run `NODE_ENV=production PORT=3000 npx tsx server.ts`.)*

Expected startup log:
```text
IndSpectora server listening on http://0.0.0.0:3000
```

---

### Option B — Docker & Docker Compose Localhost Setup

Use this option when the host lacks Node.js 22+ or C++ build tools for `better-sqlite3`, or when an isolated container runtime is preferred.

#### Step B1: Ensure Data Directory Exists
```bash
mkdir -p data/uploads
```

#### Step B2: Build Image and Start Container
```bash
docker compose up --build -d
```

#### Step B3: Inspect Container Logs
```bash
docker compose logs -f --tail=50 indspectora
```

Wait until you see:
```text
IndSpectora server listening on http://0.0.0.0:3000
```

#### Useful Docker Lifecycle Commands
- **Stop container (keeps `./data/indspectora.db` & `./data/uploads`)**: `docker compose down`
- **Restart after code edits**: `docker compose up --build -d`

---

## Phase 4: AI-Agent First-Setup Verification (Autonomous Health Check)

Once the server is running on port `3000`, verify HTTP serving and authentication status without mutating or claiming the first-run Admin slot:

```bash
node -e '
(async () => {
  const base = "http://127.0.0.1:3000";
  const page = await fetch(base);
  if (!page.ok) throw new Error("UI failed to respond: " + page.status);

  const statusRes = await fetch(base + "/api/auth/status");
  const status = await statusRes.json();
  if (statusRes.status !== 200 || typeof status.needsFirstAdminSetup !== "boolean") {
    throw new Error("Auth status check failed: " + JSON.stringify(status));
  }

  console.log("LOCALHOST DEPLOY HEALTHY:", {
    url: base,
    needsFirstAdminSetup: status.needsFirstAdminSetup,
    loginTemplatesEnabled: status.loginTemplatesEnabled,
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
'
```

Verification criteria:
1. `http://localhost:3000` responds with HTTP `200`.
2. `./data/indspectora.db` and `./data/uploads/` exist on disk.
3. `GET /api/auth/status` returns `needsFirstAdminSetup: true` on a clean database with `loginTemplatesEnabled: false` and `demoAccounts: []`.

---

## Phase 5: Mandatory User Intervention Gates (When & How Humans Must Step In)

An AI Agent must **pause and provide clear instructions** to the user whenever any of the following conditions occur:

### Gate 1 — Missing Node.js Runtime or Docker Desktop
- **Trigger**: `node` is missing / `< v20` **and** `docker` is unavailable or the Docker daemon is stopped.
- **User Instruction**:
  - Install **Node.js LTS v22.18+** from `https://nodejs.org` (or via `nvm install 22 && nvm use 22`), **OR** install and launch **Docker Desktop**.
  - Confirm back to the agent once installed or Docker daemon is running.

### Gate 2 — Native `better-sqlite3` Compilation Failure (`node-gyp`)
- **Trigger**: `npm install` exits non-zero mentioning `better_sqlite3`, `python`, `make`, `g++`, or `Visual Studio Build Tools`.
- **User Instruction**:
  - **Ubuntu / Debian**: Run `sudo apt-get update && sudo apt-get install -y python3 make g++`
  - **macOS**: Run `xcode-select --install`
  - **Windows**: Install **Visual Studio Build Tools** with the *Desktop development with C++* workload, then re-run `npm install`.
  - **Zero-Compiler Alternative**: Run **Option B (`docker compose up --build -d`)** instead.

### Gate 3 — Port `3000` Already Occupied
- **Trigger**: Preflight check finds another service bound to port `3000` or startup fails with `EADDRINUSE`.
- **User Instruction**:
  - Either stop the conflicting process holding port `3000`, **OR** instruct the agent to run IndSpectora on an alternate port (for example `PORT=3001` in `.env` and `3001:3000` in `docker-compose.yml`).

### Gate 4 — Mandatory First-Run Administrator Creation (Human Setup Inside App)
- **Trigger**: Immediately after the agent reports `LOCALHOST DEPLOY HEALTHY` with `needsFirstAdminSetup: true`.
- **User Instruction**:
  1. Open `http://localhost:3000` in your browser.
  2. Complete the **Create Initial Administrator Account** form (`Admin + Approver`, minimum 8-character password).
  3. Open **Settings → Account Management** to create real accounts for your team and assign multi-role checkboxes (`Admin`, `Approver`, `User`). Make sure designated reviewers hold the **Approver** role so they appear in Inspection approval chains.

### Gate 5 — Initial Plant Data Onboarding (Human Setup Inside App)
- **Trigger**: First operational onboarding before teams execute live inspections.
- **User Instruction**:
  1. Open **Asset Library → Facility / Zone Areas** and register your plant buildings, lines, or zones (with unique codes like `DRY-01`, `UTL-02`).
  2. Click **Download CSV Template** in **Asset Library**, populate your equipment list (including optional Custom Parameters), and upload via **Import CSV**.
  3. Open individual high-priority Assets to upload **engineering drawings**, place numbered **visual inspection pins**, and verify custom parameter units (`kg`, `bar`, `°C`, `Yes/No`).

### Gate 6 — Resetting Local Data or Exposing Beyond Localhost
- **Resetting a corrupted or test database**: Stop the server (`Ctrl+C` or `docker compose down`), delete `./data/indspectora.db` and `./data/uploads/*`, then restart to re-initialize a clean unseeded database awaiting first-run Administrator setup.
- **Exposing on a LAN or Public Server**: Never expose plain HTTP port `3000` directly to untrusted networks; place IndSpectora behind a reverse proxy (Nginx / Caddy / Cloudflare Tunnel) with HTTPS/TLS enabled so session cookies, tokens, and inspection photos stay encrypted in transit.
