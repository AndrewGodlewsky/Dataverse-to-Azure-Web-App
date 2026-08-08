---
id: 001
title: Data egress options — every way out of Dataverse
label: wayfinder:research
status: open
assignee:
blocked-by: []
---

## Question

What are all the viable ways to get Dataverse data to a custom web app, and how
do they compare? Survey at minimum: Dataverse Web API (OData), TDS/SQL endpoint,
Azure Synapse Link for Dataverse, Fabric Link, Power Platform dataflows, Azure
Data Factory Dataverse connector, and note deprecated paths (Data Export
Service) so they aren't accidentally chosen from stale docs. For each: freshness
characteristics, setup effort vs a one-week build box, licensing/capacity
prerequisites, cost, query capability (transactional vs analytical), and limits
(API throttling, row counts). Produce the live-vs-copy decision rubric (data
volume, query complexity, latency tolerance) the atlas promises.
