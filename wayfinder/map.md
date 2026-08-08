# Map: Dataverse → Azure Web App Dashboard — Options Atlas

Labels: `wayfinder:map`
Tracker: local-markdown (no external tracker configured). Tickets are files in
`wayfinder/tickets/`; a ticket is **claimed** by setting its `assignee:` field,
**closed** by setting `status: closed` and appending a `## Resolution` section.
`blocked-by:` lists ticket ids; a ticket is unblocked when every listed ticket
is closed. The **frontier** = open, unblocked, unassigned tickets.

## Destination

An **options atlas**: a research document surveying all viable architectures for
a custom React-family dashboard, shipped as a container image via Azure
Container Registry to Azure Web App for Containers, fed by Dataverse data — no
option locked. Each layer covered with alternatives, tradeoffs, sensible-corporate
cost notes, and a build-time tier against a ~1-week build box, plus a complete
access/prerequisites checklist including a ready-to-hand-to-IT app-registration
request package.

## Notes

- Planning only — this map produces research and decisions, not the built system.
- Skills to consult per session: `/research` for research tickets (high-trust
  primary sources; the `microsoft-docs` skill/MCP is available for Azure and
  Power Platform documentation), `/grilling` for anything HITL.
- Standing facts from the charting interview:
  - ACR ships the **app image**, not the data; data reaches the app separately.
  - Work tenant; app registrations possible (self or via IT) — atlas must
    include the exact IT request package.
  - User has: Dataverse env with real data, Azure subscription, M365 licensing.
  - Viewers are internal tenant users → Entra ID + App Service Easy Auth focus.
  - Freshness unknown → live-query and exported-copy are equal first-class
    branches with a decision rubric (volume, query complexity, latency).
  - Frontend is React-family; Power BI ruled out by custom-UX requirement
    (footnote only).
  - Cost stance: work pays, be sensible — note monthly cost per option, no
    premium-tier filter.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

## Not yet specified

- How the freshness rubric resolves once the table inventory exists — may
  collapse or reweight the egress branches.
- Whether any egress option is disqualified by actual data volume or entity
  shape (unknowable until the inventory ticket closes).

## Out of scope

- Locking a single architecture — the destination is the atlas, not a decision.
- Building anything (app code, Azure resources, pipelines).
- Power BI as a primary path — ruled out by the custom-UX requirement; atlas
  carries a one-line footnote only.
