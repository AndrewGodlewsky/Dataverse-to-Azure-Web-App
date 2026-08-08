---
id: 003
title: Container path — Dockerfile → ACR → Web App for Containers
label: wayfinder:research
status: open
assignee:
blocked-by: []
---

## Question

What does the container leg require end-to-end? Dockerfile patterns for a
React-family app with a Node BFF (single image vs static-frontend-plus-API);
ACR tiers (Basic/Standard/Premium) and which suffices; pushing images (docker
push vs `az acr build`); Web App for Containers configuration (Linux plan
tiers, port/settings conventions, WEBSITES_PORT); and **image pull auth** —
admin credentials vs managed-identity pull, and which is the sensible-corporate
default. Include monthly cost of the minimal sensible tier combo and note
alternatives that reuse the same image (Container Apps) in one paragraph for
completeness.
