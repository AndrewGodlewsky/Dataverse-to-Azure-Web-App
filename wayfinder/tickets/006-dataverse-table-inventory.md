---
id: 006
title: Inventory the target Dataverse tables
label: wayfinder:task
status: open
assignee:
blocked-by: []
---

## Question

HITL task: the user identifies which Dataverse tables/entities the dashboard
needs, with approximate row counts, update frequency, and any
column-level-security or sensitive fields. This weights the egress branches
(live API is fine for small/transactional; large/analytical pushes toward
Synapse/Fabric copies) and feeds the freshness rubric from
[001-data-egress-options](001-data-egress-options.md). The agent supplies the
checklist of what to collect and where to look (Power Apps maker portal →
Tables); the user brings the facts back.
