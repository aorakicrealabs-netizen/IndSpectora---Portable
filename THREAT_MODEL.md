# Threat Model — IndSpectora Portable (.exe)

Scope: standalone Windows portable executable + adjacent `./data/` folder. Distribution is single-user/local; no network service beyond localhost:3000.

## Assets
- SQLite database `./data/indspectora.db` (users, sessions, inspections, projects, uploads metadata)
- Uploaded photos `./data/uploads/`
- Session tokens in DB (plaintext, needed for lookup)
- Password hashes (scrypt + per-user salt)
- The .exe binary itself (Node.js SEA)

## Trust boundaries
- OS user ↔ application (same trust level; no privilege separation)
- Application ↔ filesystem (DB and uploads writable by the running user)
- Application ↔ localhost browser (HTTP on 127.0.0.1:3000)
- Build host ↔ nodejs.org (downloads node win-x64 zip; integrity checked by size only)

## Threats
1. Committed seed DB with accounts/sessions shipped in repo (Critical) — impersonation via copied DB. Mitigation: ship empty DB or build on first run; remove data/*.db from git; purge history.
2. DB file readable/copiable by any process running as the user (High) — offline credential/token extraction. Mitigation: OS-level file permissions; document not to share the data folder.
3. Session tokens stored plaintext (Medium) — token theft = account takeover. Acceptable for local single-user; note.
4. Unsigned portable binary → SmartScreen warning and supply-chain trust (Medium) — users must click Run anyway. Mitigation: code signing if distributing publicly.
5. node:sqlite experimental + esbuild bundling (Low) — stability/compat risk; pin Node version.
6. Uploads stored unencrypted beside DB (Low) — photo confidentiality depends on OS permissions.
7. Build supply chain: curl+unzip download of Node binary verified by size only (Low) — add SHA256 verification.

## Out of scope
- Multi-tenant/network deployment; browser-side XSS beyond React defaults; DoS.
