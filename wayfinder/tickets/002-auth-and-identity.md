---
id: 002
title: Auth & identity — app-to-Dataverse and viewer-to-app
label: wayfinder:research
status: open
assignee:
blocked-by: []
---

## Question

How does the dashboard authenticate on both sides, in a work tenant?

**App → Dataverse (server-to-server):** Entra ID app registration requirements
(account type, API permissions, admin consent), the Dataverse **application
user** setup, client-secret vs certificate vs **managed identity** from App
Service, and token acquisition from a Node/React BFF. Deliverable within the
answer: the exact **IT request package** — every setting, permission, and step
IT must perform if the user can't self-serve.

**Viewer → app (internal tenant users):** App Service Easy Auth (Entra ID
provider) vs in-app MSAL; what each costs in setup time and what each enables
(e.g., per-user Dataverse queries via on-behalf-of vs app-level access with the
app enforcing visibility).
