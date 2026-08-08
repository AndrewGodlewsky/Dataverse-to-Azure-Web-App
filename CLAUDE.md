# Dataverse → Azure Web App Dashboard

**Picking up mid-project? Read [HANDOFF.md](HANDOFF.md) first** — current state,
what's left, and build gotchas.

Planning repo for an options atlas: a custom React-family dashboard shipped as a
container image via ACR to Azure Web App for Containers, fed by Dataverse data.

## Where facts live

- **Wayfinder map**: [GitHub issue #8](https://github.com/AndrewGodlewsky/Dataverse-to-Azure-Web-App/issues/8)
  (label `wayfinder:map`) — destination, standing facts, fog, scope. Tickets are its
  sub-issues; blocking uses native issue dependencies. Research assets live in
  `wayfinder/research/`.
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
