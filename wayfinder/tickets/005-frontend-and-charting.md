---
id: 005
title: Frontend & charting — React stack vs the custom-UX requirement
label: wayfinder:research
status: open
assignee:
blocked-by: []
---

## Question

Within the React family, what stack serves a custom-interactivity dashboard
fastest? Compare charting libraries (e.g., Recharts, ECharts, Chart.js,
visx/d3, AG Charts) on interactivity ceiling, learning curve, and licensing.
Cover the **BFF pattern**: why the browser must not call Dataverse directly
(CORS, secrets), and what the Node backend needs (MSAL Node, OData query
building, caching). Note framework choice (Vite SPA + Express vs Next.js) as it
affects the Dockerfile and Easy Auth integration. Output: 2–3 viable stack
combos with tradeoffs — no lock.
