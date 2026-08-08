# 005 — Frontend & Charting: React Stack vs the Custom-UX Requirement

> Research ticket resolution (issue #5). Primary sources: official library docs/repos + npm registry API. Researched 2026-08-07.
> Context (fixed): custom-interactivity dashboard, React family, Node BFF, one-week build, containerized on Azure Web App. Shapes to serve: time-series streams (8M-row *aggregated* telemetry), hierarchies (org chart, BOM explosion → treemap/sunburst/tree), and standard KPI/bar/line. Nothing here is a final recommendation.

## Executive summary

**ECharts is the only library in the field that covers every project shape natively** — line/bar, treemap, sunburst, *and* a `tree` (org-chart/BOM) series — with canvas rendering claimed to "visualize millions of data points" and built-in `dataZoom`/`brush`/`connect` interactions ([feature page](https://echarts.apache.org/en/feature.html), [apache/echarts src/chart](https://github.com/apache/echarts/tree/master/src/chart)); cost is the biggest bundle (~368 kB min+gzip full, tree-shakable) and an options-object API rather than JSX. **Recharts** (v3, MIT, SVG/JSX) now ships Treemap, Sunburst and Sankey ([src/chart](https://github.com/recharts/recharts/tree/master/src/chart)) and is the fastest to learn, but has no tree-diagram series and SVG strains at high point counts. **Chart.js** is the smallest (~68 kB) and fast on canvas with a decimation plugin, but hierarchy support is a third-party treemap plugin only — no sunburst/tree. **visx** offers the highest custom-interaction ceiling (D3 math + React DOM, `@visx/hierarchy` has treemap *and* tree) at the highest build cost. **AG Charts Community is effectively disqualified for this project's shapes**: treemap, sunburst, org chart, zoom and chart synchronization are all Enterprise-only ($499/dev) ([pricing](https://www.ag-grid.com/charts/license-pricing/)). The BFF is non-negotiable on the live branch (secret confinement + shared 6k/5-min throttle bucket + 5k page cap handling). Framework: Vite SPA + Express is the least-machinery path for a one-week build; Next.js `output: 'standalone'` is the viable alternative and Docker-friendly, at the price of framework surface a client-rendered dashboard doesn't use.

---

## Part 1 — Charting library comparison

### 1.1 Comparison table

Bundle sizes are bundlephobia min+gzip for the full package (2026-08-07); ECharts and Chart.js shrink materially with tree-shakable imports. Maintenance = npm registry latest publish + weekly downloads (2026-08-07).

| Library (React wrapper) | Rendering | Interactivity ceiling | Time-series @ scale | Hierarchies (treemap / sunburst / tree) | KPI/bar/line | Bundle (min+gzip) | Learning curve | License | Maintenance |
|---|---|---|---|---|---|---|---|---|---|
| **Recharts** (native React) | SVG, D3 math ([repo](https://github.com/recharts/recharts)) | Medium — declarative composable components; custom interactions via props/activeIndex; no built-in cross-chart link or zoom-sync | Weak-to-medium: SVG DOM nodes become the limit at high point counts (needs pre-aggregation — which this project does anyway) | Treemap ✅ Sunburst ✅ Sankey ✅ Tree ❌ ([src/chart](https://github.com/recharts/recharts/tree/master/src/chart)) | ✅ best-in-class DX | ~148 kB | **Low** — plain JSX composition | MIT | v3.10.1, 2026-07-25; 27.5k stars |
| **Apache ECharts** (echarts-for-react) | Canvas *or* SVG, selectable per chart ([import guide](https://echarts.apache.org/handbook/en/basics/import/)) | **High** — `dataZoom`, `brush`, `tooltip` built in ([features](https://echarts.apache.org/en/feature.html)); `on()` events + `dispatchAction` for programmatic highlight/tooltip/zoom ([event handbook](https://echarts.apache.org/handbook/en/concepts/event/)); `echarts.connect` groups charts for synced interaction ([API](https://echarts.apache.org/en/api.html)) | **Strong** — "visualize millions of data points" via incremental canvas rendering ([features](https://echarts.apache.org/en/feature.html)) | Treemap ✅ Sunburst ✅ Tree ✅ Sankey ✅ — all native series ([src/chart](https://github.com/apache/echarts/tree/master/src/chart)) | ✅ | ~368 kB full; tree-shakable via `echarts/core` + per-chart/component/renderer imports ([import guide](https://echarts.apache.org/handbook/en/basics/import/)) | Medium — big options object, not JSX; excellent examples | Apache-2.0 | echarts v6.1.0, 2026-05-19, 4.5M dl/wk; wrapper v3.0.6, 2026-01-21, 1.3M dl/wk |
| **Chart.js** (react-chartjs-2) | Canvas — "very performant… would otherwise require thousands of SVG nodes" ([docs](https://www.chartjs.org/docs/latest/)) | Medium — events/plugins; no built-in cross-chart sync; custom interactions live in plugin code | Strong — decimation plugin, `normalized` parsing, offscreen-canvas workers ([performance docs](https://www.chartjs.org/docs/latest/general/performance.html)) | Treemap only via third-party `chartjs-chart-treemap` (kurkle, MIT) ([plugin](https://github.com/kurkle/chartjs-chart-treemap)); Sunburst ❌ Tree ❌ | ✅ | ~68 kB (+~1 kB wrapper), tree-shakable | Low-medium | MIT | v4.5.1, 2025-10-13, 12.5M dl/wk; wrapper v5.3.1, 2025-10-27 |
| **visx** (native React) | SVG primitives; "d3 for the calculations and math," React owns the DOM ([repo](https://github.com/airbnb/visx)) | **Highest** — you own every event handler and mark; anything is buildable, nothing is prebuilt | Medium — SVG again; canvas possible but hand-rolled | `@visx/hierarchy`: Treemap ✅ Tree ✅ ([repo](https://github.com/airbnb/visx)); sunburst = hand-rolled from d3 partition | ✅ but you assemble axes/tooltips yourself (`@visx/xychart` helps, ~50 kB) | Modular — "keep bundle sizes down and use only the packages you need" ([repo](https://github.com/airbnb/visx)) | **High** — it's a primitives kit "meant to be built upon", not a chart library | MIT | v4.0.0, 2026-06-11; 21k stars; lower adoption (@visx/xychart ~499k dl/wk) |
| **AG Charts Community** (ag-charts-react) | Canvas | Low in Community: zoom, synchronization, animations, context menu, navigator, crosshairs are **Enterprise-only** ([pricing](https://www.ag-grid.com/charts/license-pricing/)) | Fine for aggregated series; navigator/zoom paywalled | **All Enterprise-only**: Treemap, Sunburst, Org Chart, Sankey, Heatmap ([pricing](https://www.ag-grid.com/charts/license-pricing/)) | ✅ (bar/line/area/scatter/bubble/pie/doughnut/combination are the free 8) | ~388 kB — largest, for the fewest free types | Low-medium | Community MIT; Enterprise commercial $499/dev ([pricing](https://www.ag-grid.com/charts/license-pricing/); npm `ag-charts-enterprise` license field = "Commercial") | v14.1.0, 2026-08-05 — very active |

### 1.2 Fit against this project's three shapes

- **Time-series streams (8M rows, pre-aggregated in the BFF):** after aggregation the browser sees thousands, not millions, of points — every candidate copes. If drill-down ever streams raw-ish slices, canvas (ECharts, Chart.js) keeps headroom that SVG (Recharts, visx) doesn't; ECharts explicitly claims millions of points with responsive zoom/pan ([features](https://echarts.apache.org/en/feature.html)), Chart.js leans on its decimation plugin ([performance](https://www.chartjs.org/docs/latest/general/performance.html)).
- **Hierarchies (org chart, BOM explosion):** the discriminator. Native coverage: ECharts (treemap+sunburst+tree+sankey) > visx (treemap+tree via `@visx/hierarchy`) > Recharts (treemap+sunburst+sankey, no tree) > Chart.js (plugin treemap only) > AG Charts Community (none — all paywalled). An org-chart/BOM *tree diagram* specifically is only free-and-native in ECharts and visx.
- **KPI/bar/line:** all five. Recharts is fastest to ship; KPI stat tiles are plain React in every stack.
- **Cross-filtering/linked charts (the custom-UX requirement):** ECharts has the most machinery in the box (`on('click')` → refetch/refilter, `dispatchAction` to highlight peers, `connect` to sync groups) ([event handbook](https://echarts.apache.org/handbook/en/concepts/event/), [API](https://echarts.apache.org/en/api.html)). In Recharts/Chart.js you implement cross-filtering yourself in React state (click handler → shared filter state → other charts re-render) — workable and idiomatic, just manual. visx makes it fully bespoke. AG Charts puts "synchronization" itself behind Enterprise ([pricing](https://www.ag-grid.com/charts/license-pricing/)).
- **Licensing bottom line:** Recharts MIT, Chart.js MIT (+MIT plugin), visx MIT, ECharts Apache-2.0, wrappers MIT — all free for commercial use. Only AG Charts has a paid tier, and this project's required shapes sit in it.

---

## Part 2 — The BFF pattern (why the browser never talks to Dataverse)

### 2.1 Why direct browser → Dataverse is off the table

1. **Secret confinement.** The live branch authenticates as an app registration / application user via MSAL Node's client-credentials flow (cross-finding, research 002). That is a *confidential client* credential (secret/cert/managed identity) — it cannot ship in browser JavaScript. The only browser-legal alternative is per-user delegated auth, a different architecture entirely (see 002 §2.3 OBO).
2. **Shared throttle bucket.** All viewers of a server-side app user share one Dataverse service-protection bucket (~6,000 requests per 5 minutes per user+server) ([service protection limits](https://learn.microsoft.com/power-apps/developer/data-platform/api-limits)). Direct browser calls multiply request volume by viewer count with no shared cache in between; the BFF collapses N viewers into 1 upstream request per cache window and is the single place to honor `Retry-After` on 429s.
3. **CORS/origin coupling.** Dataverse's Web API is not a public CORS endpoint for arbitrary app-only callers; browser access is designed around delegated user tokens. Keeping the org URL, API version, and query shapes behind the BFF also decouples the frontend from Dataverse entirely — which the hybrid branch (live filtered reads + copied aggregates from SQL) requires anyway, since the browser can't query Azure SQL either.

### 2.2 What the Node BFF needs

| Concern | Choice | Notes |
|---|---|---|
| **Token acquisition** | `@azure/msal-node` `ConfidentialClientApplication`, `acquireTokenByClientCredential`, scope `https://<org>.crm.dynamics.com/.default` | v5.5.0, MIT, published 2026-08-04 (npm registry) — actively maintained. Cache tokens in-process; MSAL handles expiry. Managed-identity variants per research 002. |
| **Query construction** | Hand-built OData (`$select`, `$filter`, `$apply` for aggregates) + FetchXML for hierarchy operators | No official Node.js Dataverse SDK exists (cross-finding) — plain `fetch` with `OData-MaxVersion: 4.0` headers. Hierarchy queries are FetchXML/Web API-only (cross-finding), so the BFF must own FetchXML templates for org/BOM trees. |
| **Response caching** | **In-memory TTL cache (Map/`node-cache`) first**; Redis (Azure Cache) only if the plan scales out | Near-mandatory on the live branch (shared 6k/5-min bucket, cross-finding). A single-instance App Service container makes in-memory correct and free; Redis buys nothing until there are multiple instances or restarts must keep the cache warm. Key by normalized query; TTL per data class (KPIs 1–5 min, hierarchies longer). |
| **Pagination** | Follow `@odata.nextLink` loops server-side; set `Prefer: odata.maxpagesize` | Web API pages cap at 5,000 rows; the response's `@odata.nextLink` must be used verbatim to fetch the next page ([page results](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/query/page-results)). The browser should never see pagination — the BFF aggregates or windows before responding. |
| **Throttle handling** | Central 429 handler honoring `Retry-After`, serving stale cache during backoff | ([service protection limits](https://learn.microsoft.com/power-apps/developer/data-platform/api-limits)) |
| **Viewer identity** | Read Easy Auth's injected headers (`X-MS-CLIENT-PRINCIPAL*`) if per-viewer behavior is needed | On Linux/containers Easy Auth runs as a separate Ambassador-pattern container in front of the app; "the relevant information that your app needs is passed through in request headers," no SDK or code changes required ([Easy Auth overview](https://learn.microsoft.com/azure/app-service/overview-authentication-authorization)). |

---

## Part 3 — Framework choice and stack combos

### 3.1 Vite SPA + Express vs Next.js

| Axis | Vite React SPA + Express BFF | Next.js (App Router) |
|---|---|---|
| **Dockerfile** | Two-stage: `vite build` → copy `dist/` + Express server into a slim Node image; Express serves static files and `/api/*`. Everything is explicit; no framework tracing. | `output: 'standalone'` emits `.next/standalone` with a minimal `server.js` and only the traced `node_modules` needed — deployable "without installing node_modules"; copy `public/` and `.next/static` in yourself; start with `node server.js`, `PORT`/`HOSTNAME` env-controlled ([Next.js output config](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)). Slim image, but build-time file tracing is a new failure mode (includes/excludes config). |
| **BFF home** | Express routes — unlimited middleware freedom (cache layer, 429 handler, streaming). | Route Handlers inside the same app — fine for this size; long-lived in-memory cache lives in module scope of the single server process. |
| **Easy Auth** | Identical for both: Easy Auth fronts the container and injects identity headers regardless of framework — "doesn't require any particular language, SDK… or code" ([Easy Auth overview](https://learn.microsoft.com/azure/app-service/overview-authentication-authorization)). SPA note: "Require authentication" gates all paths, which suits an internal dashboard; header parsing happens in Express or in Next's server code equally. | Same. |
| **Dev speed (one-week build)** | Vite dev server (v8.2.1, very active) + proxy to Express; near-zero framework concepts beyond React itself. Charts are client components by nature, so SSR adds nothing here. | One framework instead of two packages; file-based routing free. Costs: every chart page is `'use client'` anyway, server/client component boundaries and caching semantics are real learning surface if the team isn't already fluent. |
| **When it wins** | Custom BFF behavior (cache warming, SSE/streaming for the live branch), minimum concepts, maximum debuggability. | Team already knows Next; want one deployable, one router, and Vercel-grade conventions; possible future SSR/ISR of report pages. |

### 3.2 Viable stack combos (no final pick)

**Combo A — Vite + Express + Apache ECharts (echarts-for-react).**
The interactivity-ceiling play. Every project shape is a native series (line, treemap, sunburst, **tree** for org/BOM), canvas handles any drill-down volume, and cross-filtering uses built-in events/`dispatchAction`/`connect` instead of hand-rolled plumbing. Express gives the cache/throttle layer full freedom. Tradeoffs: largest chart bundle (mitigate with `echarts/core` modular imports), options-object API is the least "React-ish" of the field, and the wrapper (`echarts-for-react`, MIT, maintained) is a thin community layer, not first-party.

**Combo B — Vite + Express + Recharts (accept the tree-diagram gap or pair it).**
The dev-speed play. MIT, JSX-composable, lowest learning curve, and v3 now covers treemap/sunburst/sankey natively — only the org-chart/BOM *tree diagram* is missing, which could be rendered as an indented expandable list/treemap instead, or by pulling in ECharts for just that one view (both licenses permit mixing; costs double bundle weight on that page only). Cross-filtering is manual React state — idiomatic but more code than ECharts. SVG is fine because the BFF pre-aggregates everything.

**Combo C — Next.js (standalone) + visx (optionally + Chart.js for the routine charts).**
The bespoke-UX play. If "custom interactivity" means novel linked visualizations rather than configuring stock charts, visx's primitives put no ceiling anywhere, `@visx/hierarchy` covers treemap+tree, and Next standalone gives a clean single-artifact Docker image. This is the slowest path to first pixel and the riskiest fit for a one-week window; pairing cheap Chart.js canvas charts for KPIs/lines with visx for the one or two signature interactions moderates that.

**Cross-cutting:** AG Charts Community drops out of all combos — its free tier lacks every hierarchy type and even zoom/synchronization ([pricing](https://www.ag-grid.com/charts/license-pricing/)). Raw D3 (ISC, last published 2024 but stable-by-design) remains available underneath Recharts/visx for one-off math (e.g., `d3-hierarchy` partition for a sunburst in visx) without adopting it as the rendering layer.

---

## Sources

- Apache ECharts features (renderers, millions of points, chart types, dataZoom/brush): https://echarts.apache.org/en/feature.html
- ECharts event handling / `dispatchAction` / `on()`: https://echarts.apache.org/handbook/en/concepts/event/
- ECharts tree-shakable imports and renderer selection: https://echarts.apache.org/handbook/en/basics/import/
- ECharts API reference (incl. `echarts.connect`): https://echarts.apache.org/en/api.html
- ECharts native series inventory (tree.ts, treemap.ts, sunburst.ts, sankey.ts): https://github.com/apache/echarts/tree/master/src/chart
- Recharts repo (SVG, D3, MIT, composability, 27.5k stars): https://github.com/recharts/recharts
- Recharts chart-type inventory (Treemap, SunburstChart, Sankey, no tree): https://github.com/recharts/recharts/tree/master/src/chart
- Chart.js overview (canvas rationale, tree-shaking, MIT): https://www.chartjs.org/docs/latest/
- Chart.js performance (decimation, normalized parsing, offscreen canvas workers): https://www.chartjs.org/docs/latest/general/performance.html
- chartjs-chart-treemap (third-party MIT treemap plugin): https://github.com/kurkle/chartjs-chart-treemap
- visx repo (primitives, D3-for-math, modular bundles, @visx/hierarchy, MIT): https://github.com/airbnb/visx
- AG Charts license/pricing (Community MIT scope vs Enterprise $499/dev; treemap/sunburst/org-chart/zoom/sync are Enterprise): https://www.ag-grid.com/charts/license-pricing/
- npm registry API (versions, publish dates, licenses, downloads, 2026-08-07): https://registry.npmjs.org/ and https://api.npmjs.org/downloads/ — recharts 3.10.1 (MIT), echarts 6.1.0 (Apache-2.0), echarts-for-react 3.0.6 (MIT), chart.js 4.5.1 (MIT), react-chartjs-2 5.3.1 (MIT), @visx/visx 4.0.0 (MIT), ag-charts-community 14.1.0 (MIT), ag-charts-enterprise 14.1.0 (Commercial), @azure/msal-node 5.5.0 (MIT), vite 8.2.1, express 5.2.1, d3 7.9.0 (ISC)
- Bundle sizes (min+gzip, bundlephobia API, 2026-08-07): https://bundlephobia.com/
- Next.js `output: 'standalone'` (Docker, server.js, PORT/HOSTNAME): https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- App Service built-in auth / Easy Auth (Ambassador container on Linux, identity via headers, zero code): https://learn.microsoft.com/azure/app-service/overview-authentication-authorization
- Dataverse service protection limits (6k req/5-min per user+server, Retry-After): https://learn.microsoft.com/power-apps/developer/data-platform/api-limits
- Dataverse Web API paging (5,000-row page cap, `@odata.nextLink`): https://learn.microsoft.com/power-apps/developer/data-platform/webapi/query/page-results
- Cross-findings taken as given from prior tickets: no official Node Dataverse SDK; hierarchy queries FetchXML/Web API-only; BFF caching near-mandatory on live branch; hybrid dashboard shape (see `wayfinder/research/001-data-egress-options.md`, `wayfinder/research/002-auth-and-identity.md`)
