---
id: 004
title: CI/CD options — building and shipping the image
label: wayfinder:research
status: open
assignee:
blocked-by: []
---

## Question

What are the options for building the image and getting it onto the Web App,
sized against a one-week box? Compare: manual (docker build/push + portal
restart), `az acr build` + Web App continuous deployment from ACR (webhook),
GitHub Actions (azure/login with OIDC federated credentials vs publish
profile), and Azure DevOps Pipelines. For each: setup time, secrets/credentials
required (and whether IT involvement is needed for OIDC federation), and what
it costs. Note which options the work tenant's policies could block.
