# Dataverse → Azure Web App Resources

Every link below was cited by this repo's own research files (`wayfinder/research/001–006`,
researched 2026-08-07 against primary sources) or verified against Microsoft Learn on
2026-08-08. Knowledge for lessons comes from here — not from memory.

## Knowledge

### Start here

- [Repo: `docs/options-atlas.md`](../docs/options-atlas.md)
  The synthesized survey of every option, with costs and an IT checklist. Use for: the
  full picture of any layer, and the footnoted link back to the underlying research.
- [Repo: `docs/options-diagrams.html`](../docs/options-diagrams.html)
  Eleven diagrams of the same material. Use for: seeing a mechanism rather than reading
  about it. Lessons cite these by figure number.
- [Repo: `wayfinder/research/001–006`](../wayfinder/research/)
  The primary-source research behind the atlas, one file per layer, each line cited.
  Use for: the exact quote and link when a lesson claim needs backing.

### Dataverse — getting data out

- [Web API Overview — Microsoft Learn](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/overview)
  The OData v4 endpoint the BFF actually calls. Use for: query syntax, `$select`,
  `$filter`, `$expand`.
- [Service protection API limits](https://learn.microsoft.com/power-apps/developer/data-platform/api-limits)
  The 6,000-requests / 20-minutes-compute / 52-concurrent per-5-minute budget, and the
  `Retry-After` contract. Use for: anything about throttling or 429s.
- [Aggregate data (Web API)](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/query/aggregate-data)
  Where the 50,000-row aggregate cap is documented. Use for: the hard ceiling that
  decides live vs copy.
- [Page results](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/query/page-results)
  The 5,000-row page size and `@odata.nextLink` paging loop. Use for: why the BFF pages
  and the browser never does.
- [How Dataverse SQL differs from T-SQL](https://learn.microsoft.com/power-apps/developer/data-platform/how-dataverse-sql-differs-from-transact-sql)
  The TDS endpoint's real limits — no CTEs, no PIVOT, no OVER. Use for: judging whether
  TDS can answer a query before you try.

### Identity — the app proving who it is

- [Use OAuth with Dataverse](https://learn.microsoft.com/power-apps/developer/data-platform/authenticate-oauth)
  The canonical S2S explanation, including "connect as an app". Use for: why an app
  registration needs *no* API permissions.
- [Manage application users](https://learn.microsoft.com/power-platform/admin/manage-application-users)
  Creating the unlicensed application user and assigning its role. Use for: the exact
  Power Platform admin center click-path IT will follow.
- [Single-tenant server-to-server walkthrough](https://learn.microsoft.com/power-apps/developer/data-platform/use-single-tenant-server-server-authentication)
  End-to-end registration → application user → token. Use for: the whole S2S setup in
  one page.
- [MSAL Node — acquiring tokens](https://learn.microsoft.com/entra/msal/javascript/node/acquire-token-requests)
  The client-credentials flow this repo's `server/dataverse.js` uses. Use for: reading
  that file line by line.
- [Configure an app to trust a managed identity](https://learn.microsoft.com/entra/workload-id/workload-identity-federation-config-app-trust-managed-identity)
  The federated-credential end state from ADR-0002. Use for: stage 2, once the Web App
  exists.

### Identity — viewers proving who they are

- [Authentication and authorization in App Service](https://learn.microsoft.com/azure/app-service/overview-authentication-authorization)
  What "Easy Auth" is and where it sits. Use for: the mental model of a gate in front of
  the container.
- [Work with user identities in App Service auth](https://learn.microsoft.com/azure/app-service/configure-authentication-user-identities)
  The `X-MS-CLIENT-PRINCIPAL*` headers injected into the container. Use for: reading who
  the viewer is from inside the BFF.

### Hosting and shipping the container

- [Configure a custom container for App Service](https://learn.microsoft.com/azure/app-service/configure-custom-container)
  Contains the load-bearing sentence "App Service currently allows your container to
  expose only one port for HTTP requests", and the `WEBSITES_PORT` setting. Use for:
  lesson 1's one-port rule and the first thing to check when a deploy shows a blank page.
- [Tutorial: custom container on App Service](https://learn.microsoft.com/azure/app-service/tutorial-custom-container)
  The full CLI path including `acrUseManagedIdentityCreds`. Use for: following along when
  you provision for real.
- [Container Registry authentication](https://learn.microsoft.com/azure/container-registry/container-registry-authentication)
  Why managed identity + AcrPull beats the admin account. Use for: the pull half of
  figure 7.
- [Managed identities in App Service](https://learn.microsoft.com/azure/app-service/overview-managed-identity)
  What a managed identity is and how code asks it for a token. Use for: the single
  concept that unlocks both the registry pull and the stage-2 credential.
- [ACR Tasks — `az acr build`](https://learn.microsoft.com/azure/container-registry/container-registry-quickstart-task-cli)
  Building in Azure with no local Docker daemon. Use for: your first deploy on a
  locked-down Windows machine.
- [Multi-stage builds — Docker docs](https://docs.docker.com/build/building/multi-stage/)
  Why this repo's `Dockerfile` has two `FROM` lines. Use for: reading that file.

### The frontend

- [Apache ECharts handbook — imports](https://echarts.apache.org/handbook/en/basics/import/)
  Modular imports, which is why the bundle isn't larger than it is. Use for: adding a new
  chart type to the dashboard.
- [ECharts events and actions](https://echarts.apache.org/handbook/en/concepts/event/)
  `on()` and `dispatchAction()` — the machinery cross-filtering is built from. Use for:
  changing how clicking a bar filters the other charts.

## Wisdom (Communities)

- [Microsoft Q&A](https://learn.microsoft.com/answers/)
  Official, moderated, and answered by Microsoft engineers on Azure and Power Platform
  tags. Use for: "is this limit real / has this changed" questions where the docs are
  ambiguous.
- [Power Platform Community forums](https://community.powerplatform.com/)
  Where Dataverse admins and makers actually work. Use for: the Power Platform admin
  center steps IT will be doing, and security-role troubleshooting.
- [r/AZURE](https://www.reddit.com/r/AZURE/)
  High-volume practitioner subreddit. Use for: sanity-checking cost and tier decisions
  against what people really run.
- [Stack Overflow — `dataverse` tag](https://stackoverflow.com/questions/tagged/dataverse)
  Use for: concrete Web API query and error-code problems once you're writing them.

Not yet raised with you: whether you want to post in any of these. Nothing here needs an
account until you hit a question the docs can't answer — flagged now so it's a choice
rather than a surprise.

## Gaps

- **No resource yet for the real table inventory.** The atlas used four *synthetic*
  configurations; nothing describes your actual tables, row counts, or secured columns.
  This is the single biggest gap and it can only be closed by opening your environment.
- **No cost source for an ADF-fed Azure SQL sink.** The research priced the pipeline but
  not the database. Only matters if the copy branch ever opens.
- **Nothing on operating the app after deployment** — log streaming, diagnosing a failed
  container start, restart semantics. Needed before the deploy lesson.
