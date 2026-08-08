# Handoff — state as of 2026-08-08

For any agent (or human) picking this project up. Read `CLAUDE.md` first for repo
conventions; this file is the *current position and what's next*. Everything below
was true at the end of the 2026-08-08 session.

## One-paragraph summary

Internal Dataverse dashboard: React + Apache ECharts frontend, Express BFF, one
container image → ACR → Azure Web App for Containers. The research phase (options
atlas), architecture lock (5 ADRs), and the **local build are complete and verified**
— the app runs in mock mode with sample data, tests pass, the client builds, the
rendered dashboard was visually checked. What remains is: commit, IT/Azure
provisioning, pointing the live provider at real tables, and deploy.

## Where everything lives

| Artifact | Location |
|---|---|
| Locked architecture + process decisions (7 ADRs) | `plans/architecture/DECISIONS.md` → `plans/architecture/2026/2026-08.md` |
| Options atlas (all alternatives + costs + IT package) | `docs/options-atlas.md` |
| S2S credential deep-dive (3 variations, diagrams) | `docs/s2s-credential-variations.md` |
| Research files (primary-source citations) | `wayfinder/research/001…006-*.md` |
| Planning history (wayfinder map + tickets, all closed) | GitHub issues #1–#8; map is [#8](https://github.com/AndrewGodlewsky/Dataverse-to-Azure-Web-App/issues/8) |
| App code | `server/` (BFF), `client/` (Vite React), `Dockerfile` |
| Run/test/deploy commands | `README.md` |

## Architecture in five lines (ADR-0001…0005, all Accepted)

1. **Live-only Dataverse access** via Web API from the BFF — no copy store.
   **Tripwire**: an aggregate needing ≥50k rows OR sustained 429s → add Azure
   Synapse Link additively and write a superseding ADR.
2. **S2S credential staged**: client secret now → federated identity credential
   (FIC) once the Web App's user-assigned managed identity exists, then delete the
   secret. Swap point: `server/dataverse.js` `getToken()` only.
3. **Viewers**: Easy Auth (Entra) + "Assignment required" + a viewer group. No auth
   code in the app. Everyone with access sees everything (user-confirmed).
4. **Hosting**: single multi-stage image, ACR Basic (~$5/mo), B1 Linux plan
   (~$12/mo), pull via managed identity + AcrPull. CI/CD: **manual by choice**
   (`az acr build` + restart) — automation rungs deliberately not adopted yet.
5. **Frontend**: Vite + Express + ECharts (modular imports). Cross-filtering is the
   founding requirement (it's why Power BI was rejected) — already working: click a
   category bar → KPIs + revenue line filter.

## What's left — in order

1. **Commit** (the user does ALL commits/pushes — never run git write commands).
   Uncommitted right now: all app code (`server/`, `client/`, `Dockerfile`,
   `package*.json`, dotfiles), `docs/` (atlas + credential variations), the five
   ADRs (`plans/architecture/2026/` + modified `DECISIONS.md`), modified `README.md`.
2. **IT request package** → hand over `docs/options-atlas.md` §6.1 items **A–C**
   (app registration + client secret, Dataverse application user, `Dashboard
   Reader` security role). Item **E** (Easy Auth) comes with Azure provisioning.
   Item D (column security) only if secured columns end up on the dashboard; item F
   (Fabric) never — that branch was not chosen.
3. **Go live locally**: copy `.env.example` → `.env`, fill DATAVERSE_URL /
   TENANT_ID / CLIENT_ID / CLIENT_SECRET. The app auto-switches from mock to live
   (header badge flips). Then edit the two `<EDIT>` markers in
   `server/provider.js` to the real order + org-unit table/column names.
4. **Azure provisioning** (atlas §3.3/§6.2): resource group → ACR Basic → B1 Linux
   plan → Web App for Containers → system-assigned MI + **AcrPull** on ACR +
   `acrUseManagedIdentityCreds=true` → app settings `WEBSITES_PORT=8080` + the four
   Dataverse env vars → Easy Auth on, Assignment required, viewer group assigned.
5. **Deploy**: `az acr build --registry <acr> --image dashboard:latest .` then
   restart the Web App (README has exact commands).
6. **Stage-2 credential upgrade** (ADR-0002 follow-on, after 4): create user-assigned
   MI (or reuse system MI decision — ADR says *user-assigned* for FIC), add
   federated credential on the app registration, swap `getToken()` to the MI
   assertion flow (see `docs/s2s-credential-variations.md` V2), delete the secret.
7. **Later, if wanted**: CI/CD ladder (atlas §3.4) — `az acr build` webhook, then
   GitHub Actions OIDC. Plan-tier bump B1 → P0v3 is an in-place scale, no ADR.

## Gotchas discovered while building (save yourself the re-derivation)

- `@azure/msal-node` v3 has **named ESM exports** — `import { ConfidentialClientApplication }`,
  not a default import.
- `node --test <directory>` **hangs on this Windows setup** — the npm test script
  is pinned to the file (`node --test server/app.test.js`). Keep it that way or
  investigate before changing.
- Express 5 wildcard routes use the **`"*path"`** named syntax (path-to-regexp v8);
  bare `"*"` fails.
- The client bundle is ~776 kB pre-gzip (260 kB gzipped) — that's ECharts; fine for
  an internal tool, `manualChunks` if it ever matters.
- Chart colors come from **CSS custom properties** in `client/src/styles.css`
  (light + dark), read at render via `getComputedStyle` (`client/src/EChart.jsx`).
  The palette follows the dataviz skill's reference instance; the blue ordinal steps
  were validated in both modes. Don't hardcode hex in chart options.
- Playwright MCP screenshots save to the **repo root** — clean them up after visual
  checks.
- Mock data is deterministic (seeded) — tests and screenshots are stable.

## Session conventions (also in CLAUDE.md — the short version)

- **Git writes are the user's** — no commit/push/PR ever, leave changes uncommitted.
- **ADRs**: only ratified, hard-to-reverse decisions; append-only; record + year
  index + `DECISIONS.md` move together (a post-commit hook nudges if not).
- **New large effort** (e.g., "add per-user security", "adopt Synapse after the
  tripwire") → chart a fresh wayfinder map as GitHub issues, don't reopen #8.
- Security blocks: stop and ask, never work around.
