# Dataverse → Azure Web App Dashboard

Planning repo for an options atlas: a custom React-family dashboard shipped as a
container image via ACR to Azure Web App for Containers, fed by Dataverse data.

## Where facts live

- **Wayfinder map**: `wayfinder/map.md` — destination, standing facts, fog, scope.
  Tickets in `wayfinder/tickets/` (local-markdown tracker; conventions at the top of
  the map).
- **Architecture decision records**: `plans/architecture/` — entry point
  `plans/architecture/DECISIONS.md`, template `plans/architecture/TEMPLATE.md`.
  Only ratified, architecturally significant, hard-to-reverse decisions go here
  (`/repo-memory` skill owns the format). Wayfinder ticket resolutions stay on their
  tickets; one that also ratifies a significant choice gets an ADR linking the ticket.

## Hooks

Activate once per clone: `git config core.hooksPath .githooks`. The post-commit hook
prints a one-line ADR reminder on architecture-adjacent commits — it never writes or
blocks.

## Git

The user commits and pushes manually. Leave changes uncommitted.
