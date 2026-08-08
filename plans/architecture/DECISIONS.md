# Architecture Decisions — master index

Every architecture decision record (ADR) for this repository. **This file is the entry
point**: it groups decisions by domain and points at where each one is written in full.

## How this is organised

```
plans/architecture/
├── DECISIONS.md          ← you are here: domains → decisions → location
├── TEMPLATE.md           the record template; copy it, do not improvise
├── YYYY/
│   ├── INDEX.md          that year's decision log — one table row per ADR
│   └── YYYY-MM.md        the records themselves, in full, one file per month
```

Find a decision three ways: **by domain** (the tables below), **by date** (the year
`INDEX.md`), or **by number** (`ADR-NNNN` is globally sequential and never reused).

## Where a fact belongs in this repo

- **Ratified, hard-to-reverse architecture decisions** → an ADR here.
- **Wayfinder ticket resolutions and research findings** → the ticket itself, indexed
  in `wayfinder/map.md` under Decisions-so-far. A ticket resolution that also ratifies
  a significant, hard-to-reverse choice gets an ADR *in addition*, linking the ticket
  under `### Related`.
- **Preferences, conventions, reversible implementation choices** → not an ADR; the
  wayfinder map's Notes or the code itself.

## The rules that make this worth keeping

1. **One decision per record.** If a proposal contains two decisions, it is two records.
   Multi-phase work — short-term, then long-term — is one record per phase.
2. **Records are append-only. Never edit an accepted record.** If the decision changes,
   write a new record that supersedes it and link the two. This preserves *when and why*
   the direction shifted, which is the whole point.
3. **Never delete a record**, including a rejected one. A rejected option that stays
   visible stops the team re-litigating it next year.
4. **Only architecturally significant decisions.** It qualifies if it affects the
   system's structure, a key quality attribute, or is **difficult to reverse**. A
   reversible implementation choice is not an ADR.
5. **A record is not a design guide.** State the decision so it stands alone; link
   supplemental exploration rather than inlining it.
6. **Never hide a consequence.** The negative ones are the reason anyone reads this later.
7. **Record confidence.** A significant decision made with low confidence is worth
   flagging so a future reader knows it was a judgement call under uncertainty, not a
   settled matter.

## Status values

| Status | Meaning |
|---|---|
| `Proposed` | Written, not yet agreed |
| `Accepted` | Agreed and in force |
| `Superseded by ADR-NNNN` | Replaced; the record stays, the pointer is added |
| `Deprecated` | No longer applies, nothing replaced it |
| `Rejected` | Considered and declined — kept deliberately |

## Decisions by domain

<!-- Add a row when an ADR is accepted. Keep one line per decision; detail lives in the
     monthly file. Domains are added as needed — do not force a decision into a domain
     that does not fit. Likely domains for this project: Data egress, Auth & identity,
     Hosting & deployment, Frontend. -->

### Data access

| ADR | Decision | Status | Record |
|-----|----------|--------|--------|
| [ADR-0001](2026/2026-08.md#adr-0001--access-dataverse-live-via-the-web-api-no-copy-store) | Live via Web API, no copy store; tripwire to Synapse Link at ≥50k aggregates or sustained 429s | Accepted | 2026-08 |

### Auth & identity

| ADR | Decision | Status | Record |
|-----|----------|--------|--------|
| [ADR-0002](2026/2026-08.md#adr-0002--stage-the-s2s-credential-client-secret-first-federated-identity-credential-as-end-state) | S2S credential staged: client secret → federated identity credential | Accepted | 2026-08 |
| [ADR-0003](2026/2026-08.md#adr-0003--gate-viewers-with-easy-auth-and-an-assigned-entra-group) | Viewers gated by Easy Auth + assigned Entra group | Accepted | 2026-08 |

### Hosting & deployment

| ADR | Decision | Status | Record |
|-----|----------|--------|--------|
| [ADR-0004](2026/2026-08.md#adr-0004--ship-one-multi-stage-container-image-via-acr-to-web-app-for-containers) | One multi-stage image via ACR (managed-identity pull) to Web App for Containers | Accepted | 2026-08 |

### Frontend

| ADR | Decision | Status | Record |
|-----|----------|--------|--------|
| [ADR-0005](2026/2026-08.md#adr-0005--build-the-frontend-as-vite--express--apache-echarts) | Vite + Express + Apache ECharts | Accepted | 2026-08 |

### Planning & records

| ADR | Decision | Status | Record |
|-----|----------|--------|--------|
| [ADR-0006](2026/2026-08.md#adr-0006--record-architecture-decisions-as-adrs-in-plansarchitecture) | ADRs live in plans/architecture/ (append-only, hook-nudged) | Accepted | 2026-08 |
| [ADR-0007](2026/2026-08.md#adr-0007--plan-large-efforts-as-wayfinder-maps-on-github-issues-keep-research-assets-in-repo) | Wayfinder maps on GitHub Issues; research assets in-repo | Accepted | 2026-08 |

## Years

| Year | Decisions | Index |
|------|-----------|-------|
| 2026 | 7 | [2026/INDEX.md](2026/INDEX.md) |
