# 001 — Data Egress Options: Every Way Out of Dataverse

> Research ticket resolution. Primary sources only (Microsoft Learn / first-party pricing APIs). Researched 2026-08-07.
> Consumer context (fixed): React frontend + Node BFF, containerized on Azure Web App for Containers, internal tenant viewers, work tenant with app registrations available. Live-query and exported-copy branches are equal first-class options — no recommendation is made here.

## Executive summary

Six viable paths exist. Two are **live** (no copy): the **Dataverse Web API** (OData v4 REST, real-time, throttled at ~6,000 requests/5-min per user and a 50,000-record aggregation cap) and the **TDS/SQL endpoint** (read-only T-SQL over the same live data, 5-minute query timeout, same throttles). Four are **copy** paths: **Azure Synapse Link** (continuous push to your ADLS Gen2, near-real-time CSV or interval-based Delta Lake, queried via Synapse serverless SQL at $5/TB), **Fabric Link** (no-ETL replica surfaced in OneLake via shortcuts, ~15–60 min freshness, needs Fabric capacity ≈$263+/month and consumes Dataverse storage), **Power Platform dataflows** (Power Query scheduled ETL, ≤48 refreshes/day, to Dataverse or your own ADLS), and the **Azure Data Factory Dataverse connector** (pipeline copy to any sink, service-principal auth, pennies-to-tens-of-dollars monthly at small scale, but it consumes the same throttled API). **Dead paths to avoid**: Data Export Service (EOL Nov 2022), Export to Data Lake for F&O (decommissioned 2025), the OData v2 Organization Data Service (removed), and the 2011 SOAP endpoint (deprecated). All options authenticate a server-side app via an Entra ID app registration + Dataverse "application user" (no per-user license fee); ADF additionally supports user-assigned managed identity. A decision rubric at the end maps table volume, query shape, latency tolerance, setup time, and cost to a branch.

---

## Option 1 — Dataverse Web API (OData v4)

Live REST queries against the operational database. ([Web API overview](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/overview))

### Freshness
- **Real-time.** Queries hit the live transactional store; there is no copy or sync lag (it *is* the platform's data API — all data operations go through the underlying organization service). ([Web API and the Organization service](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/overview#web-api-and-the-organization-service))

### Setup effort
- Register an app in Entra ID (name, single-tenant, client secret) — minutes. ([Single-tenant S2S walkthrough](https://learn.microsoft.com/power-apps/developer/data-platform/use-single-tenant-server-server-authentication#azure-application-registration))
- Create an **application user** in the Power Platform admin center bound to that app registration, and assign a **custom security role** (application users cannot use default roles) scoping table read access. ([Connect as an app](https://learn.microsoft.com/power-apps/developer/data-platform/authenticate-oauth#connect-as-an-app), [multi-tenant S2S — application user](https://learn.microsoft.com/power-apps/developer/data-platform/use-multi-tenant-server-server-authentication#create-an-application-user-associated-with-the-registered-application-in-dataverse))
- Time to first data: **well under a day** — the smallest setup of any option. Fits easily in a one-week build budget, leaving the week for the app itself.

### Prerequisites & licensing
- No new Azure resources. Needs an Entra app registration and someone with rights to create the application user (Power Platform admin) plus a maker/admin to define the security role.
- The application user is **unlicensed — no license fee** — but its requests draw from tenant-level "non-licensed user" request pools: **25,000 requests/24h base for Power Apps-licensed tenants** (no per-license accrual), or **500,000 base + 5,000 per Dynamics 365 Enterprise USL (max 10M)** for Dynamics-licensed tenants. ([S2S authentication](https://learn.microsoft.com/power-apps/developer/data-platform/build-web-applications-server-server-s2s-authentication), [Non-licensed user request limits](https://learn.microsoft.com/power-platform/admin/api-request-limits-allocations#non-licensed-user-request-limits))
- Interactive licensed users get 40,000 requests/24h (per paid Power Platform/D365 license) if you ever call on-behalf-of users. ([Licensed user request limits](https://learn.microsoft.com/power-platform/admin/api-request-limits-allocations#licensed-user-request-limits))

### Cost
- **$0/month incremental.** Uses existing Dataverse capacity. If the 24h entitlement pool is chronically exceeded, capacity add-ons raise limits by 50,000 requests/24h per pack (paid), or pay-as-you-go covers overages. ([Request capacity add-on](https://learn.microsoft.com/power-platform/admin/api-request-limits-allocations#power-platform-request-capacity-add-on))

### Query capability
- **Transactional point reads and filtered lists** via OData v4: `$select`, `$filter`, `$expand`, `$orderby`, `$top`; FetchXML also accepted for more complex joins/aggregates. ([Query data sample](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/web-api-query-data-sample))
- **Paging:** max **5,000 rows per page** (standard tables; 500 for elastic); page via `Prefer: odata.maxpagesize` + `@odata.nextLink`. **`$skip` is not supported.** ([Page results using OData](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/query/page-results))
- **Aggregation (`$apply` / FetchXML aggregate) is capped at 50,000 records** — still current; exceeding it throws `AggregateQueryRecordLimit exceeded` (error `-2147164125`). Also: no `groupby` on datetime values, no `$orderby` on aggregate values via OData. ([Aggregate data by using OData](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/query/aggregate-data), [FetchXML aggregate limit](https://learn.microsoft.com/power-apps/developer/data-platform/fetchxml/aggregate-data#row-aggregate))
- FetchXML simple paging can't exceed 50,000 total records; use paging cookies for large sets. ([FetchXML page results](https://learn.microsoft.com/power-apps/developer/data-platform/fetchxml/page-results#simple-paging))

### Limits & throttling
Service protection limits, per user, per web server, over a 5-minute sliding window ([Service protection API limits](https://learn.microsoft.com/power-apps/developer/data-platform/api-limits#how-the-system-enforces-service-protection-api-limits)):
- **6,000 requests** / 5 minutes
- **20 minutes (1,200 s) combined execution time** / 5 minutes
- **52 concurrent requests** (or higher)
- Breach → HTTP **429 Too Many Requests** with a `Retry-After` header; clients must back off. ([Retry operations](https://learn.microsoft.com/power-apps/developer/data-platform/api-limits#retry-operations))
- Use the `x-ms-dop-hint` response header to size parallelism. ([Send parallel requests](https://learn.microsoft.com/power-apps/developer/data-platform/send-parallel-requests))
- These are per authenticated user — the BFF's single application user is one bucket shared by all viewers, which is the key sizing risk for a live-query design.

### Auth model (Node.js BFF)
- Entra ID **app registration + client secret or certificate**, OAuth2 client-credentials via MSAL (`@azure/msal-node`); token scope `https://<org>.crm.dynamics.com/.default`. Microsoft ships no Node SDK (only .NET and Python) — use plain HTTPS/OData. ([OAuth with Dataverse](https://learn.microsoft.com/power-apps/developer/data-platform/authenticate-oauth), [Web API overview](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/overview))
- Managed identity: Dataverse supports managed-identity flows for app authentication ([app registration tutorial](https://learn.microsoft.com/power-apps/developer/data-platform/walkthrough-register-app-azure-active-directory)); the documented mainstream server path remains service principal + secret/cert bound to an application user.

---

## Option 2 — TDS/SQL endpoint

Read-only SQL Server (Tabular Data Stream) protocol emulation over live Dataverse data. ([Use SQL to query data](https://learn.microsoft.com/power-apps/developer/data-platform/dataverse-sql-query))

### Freshness
- **Real-time** — same live data as the Web API, exposed as a read-only SQL connection over the Dataverse business layer. ([Use SQL to query data](https://learn.microsoft.com/power-apps/developer/data-platform/dataverse-sql-query))

### Setup effort
- The **Enable TDS endpoint** environment setting is **on by default**; optionally enable user-level access control and grant the "Allow user to access TDS endpoint" privilege for least-privilege. TCP **1433** (or 5558 appended to the org URL) must be reachable. ([Prerequisites](https://learn.microsoft.com/power-apps/developer/data-platform/dataverse-sql-query), [Dataverse connector prerequisites](https://learn.microsoft.com/power-query/connectors/dataverse))
- Time to first data: **under a day** (connection string + Entra token in a `mssql`/tedious client).

### Prerequisites & licensing
- Only a Dataverse environment and Entra ID identity with table read access via the Dataverse security model; **no Azure resources**. Same non-licensed application-user entitlement pools as the Web API apply, since TDS queries **execute under the service protection API limits**. ([Limitations](https://learn.microsoft.com/power-apps/developer/data-platform/dataverse-sql-query#limitations))

### Cost
- **$0/month incremental** — no separate meter; consumes Dataverse request entitlements like the Web API. ([Requests limits and allocations](https://learn.microsoft.com/power-platform/admin/api-request-limits-allocations))

### Query capability
- **T-SQL subset, SELECT-only**: JOIN, APPLY, WHERE, GROUP BY, HAVING, ORDER BY, TOP supported. **Not supported**: INSERT/UPDATE (read-only), CTEs (`WITH`), PIVOT/UNPIVOT, OPTION/hints, SELECT `FOR`/`INTO`/`OVER`, GROUP BY ROLLUP/CUBE/GROUPING SETS, FREETEXT. ([How Dataverse SQL differs from Transact-SQL](https://learn.microsoft.com/power-apps/developer/data-platform/how-dataverse-sql-differs-from-transact-sql#queries))
- Unsupported column types: `binary`, `image`, `file`, `xml`, `partylist`, `timestamp`, `choices`, others; virtual and audit tables excluded; **elastic tables not supported**. ([Supported operations and data types](https://learn.microsoft.com/power-apps/developer/data-platform/dataverse-sql-query#supported-operations-and-data-types), [Limitations](https://learn.microsoft.com/power-apps/developer/data-platform/dataverse-sql-query#limitations))
- Aggregations are real SQL aggregations, but keep queries lean: keep <100 columns, filter on choice *values* not labels, always use TOP. ([Performance guidance](https://learn.microsoft.com/power-apps/developer/data-platform/dataverse-sql-query#performance-guidance))

### Limits & throttling
- **Fixed 5-minute query timeout** (streamed, no hard result-size cap); automatically reduced to **2 minutes** for expensive patterns (`SELECT *`, nested FROMs, heavy JOINs). Microsoft points large/long queries to Synapse Link or dataflows instead. ([Limitations](https://learn.microsoft.com/power-apps/developer/data-platform/dataverse-sql-query#limitations))
- Runs under the same **service protection limits** (6,000 req / 20 min compute / 52 concurrent per 5-min window). ([Limitations](https://learn.microsoft.com/power-apps/developer/data-platform/dataverse-sql-query#limitations), [API limits](https://learn.microsoft.com/power-apps/developer/data-platform/api-limits))
- Dates returned in UTC; plug-ins on Retrieve/RetrieveMultiple do not fire. ([Limitations](https://learn.microsoft.com/power-apps/developer/data-platform/dataverse-sql-query#limitations))

### Auth model (Node.js BFF)
- **Microsoft Entra ID only — SQL auth and Windows auth are not supported.** ([Security and authentication](https://learn.microsoft.com/power-apps/developer/data-platform/dataverse-sql-query#applications-support))
- Service-principal (app registration) access is supported over this endpoint — the Power Query Dataverse connector, which rides the TDS endpoint, lists **Service principal** as a supported auth type. From Node, use the `mssql` package with an Entra access token. ([Dataverse connector — authentication types](https://learn.microsoft.com/power-query/connectors/dataverse))

---

## Option 3 — Azure Synapse Link for Dataverse

Continuous managed push-export to your own Azure Data Lake Storage Gen2, optionally wired to an Azure Synapse Analytics workspace. ([What is Azure Synapse Link for Dataverse?](https://learn.microsoft.com/power-apps/maker/data-platform/export-to-data-lake))

### Freshness
- **Near-real-time, push-based** — CUD changes are pushed to the lake without refresh schedules; change tracking drives incremental sync. ([Overview](https://learn.microsoft.com/power-apps/maker/data-platform/export-to-data-lake))
- Two data views land in the lake: **near-real-time tables** plus **read-only snapshot tables updated hourly**. ([Near real-time data and snapshot data](https://learn.microsoft.com/troubleshoot/azure/synapse-analytics/serverless-sql/query-perf/ssql-perf-optimize-synapse-link))
- With the **Delta Lake option**, you choose the conversion interval (5, 15, 60, or 1440 min); actual freshness depends on Spark pool size and churn. ([Delta conversion interval](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-select-fno-data#add-finance-and-operations-tables-in-azure-synapse-link))
- Microsoft's indicative end-to-end numbers for the sync engine: jobs trigger every 15 minutes; updated files typically within **15–45 minutes**, not guaranteed under high churn. ([Transition guide — more real-time reporting](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-transition-from-fno#understanding-benefits-%E2%80%93-more-real-time-reporting))

### Setup effort
- Create ADLS Gen2 storage account (hierarchical namespace **required**, same Entra tenant, Owner + Storage Blob Data Contributor roles, Reader on the resource group); optional Synapse workspace (same region as storage) + Spark pool if using Delta Lake; then the maker-portal wizard: **Link data → New link**, pick tables, Save. ([Data lake prerequisites](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-data-lake#prerequisites), [Synapse workspace variant](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-synapse#connect-dataverse-to-synapse-workspace), [Delta Lake prerequisites](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-delta-lake#prerequisites))
- Time to first data: **1–2 days** including Azure provisioning and initial sync (initial sync duration scales with data size). Comfortably inside a one-week budget if only CSV/serverless is used; the Delta-Lake/Spark variant adds provisioning and tuning time.

### Prerequisites & licensing
- **Dataverse system administrator** role; exported tables must have **Track changes (change tracking) enabled**; max **10 Synapse Link profiles per environment**. ([Prerequisites](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-data-lake#prerequisites))
- Storage must allow public network access unless you set up **managed identity (enterprise policy)** for firewall-restricted accounts. ([Managed identities for Synapse Link](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-msi#create-a-new-azure-synapse-link-for-dataverse-with-managed-identity))
- Consumers of the lake need **Storage Blob Data Reader/Contributor/Owner** on the storage account; **Synapse Administrator** role in Synapse Studio to query there. ([Serverless SQL prerequisites](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-serverless))
- No extra Power Platform license — it's an out-of-the-box Power Platform feature. ([Data lake article](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-data-lake#connect-dataverse-to-azure-data-lake-storage-gen2))

### Cost (order of magnitude)
- **ADLS Gen2 storage**: ≈ **$0.02/GB-month** (hot LRS, East US retail: $0.0208 first tier) + per-10k transaction fees. ([ADLS pricing page](https://azure.microsoft.com/en-us/pricing/details/storage/data-lake/); rate verified via [Azure Retail Prices API](https://prices.azure.com/api/retail/prices))
- **Synapse serverless SQL**: **$5 per TB of data processed** (min 10 MB/query). ([Synapse pricing page](https://azure.microsoft.com/en-us/pricing/details/synapse-analytics/); rate verified via [Azure Retail Prices API](https://prices.azure.com/api/retail/prices))
- **Spark pool (Delta option only)**: billed per vCore-hour only while conversion jobs run; cost scales inversely with the conversion interval. ([Delta Lake how-it-works — cost note](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-delta-lake#how-delta-lake-works-with-azure-synapse-link-for-dataverse))
- Realistic small-tenant total: **single-digit to low-tens of $/month** for CSV + serverless; **tens-to-low-hundreds** if the Spark/Delta variant runs on a short interval.

### Query capability
- **Analytical**: full T-SQL via **serverless SQL pool** over the lake files (create views, aggregate freely — no 50k cap), or Spark (PySpark/Spark SQL) for transformation. Dedicated SQL pools are **not supported**. ([Query with serverless SQL pool](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-serverless), [Spark transformation](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-spark))
- Data lands in Common Data Model format (CSV) or Delta/Parquet (compressed to ⅓–⅛ size, faster queries). ([Overview](https://learn.microsoft.com/power-apps/maker/data-platform/export-to-data-lake), [Transition guide](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-transition-from-fno#after-transition))
- Point reads are possible but this is not a transactional store; latency and cost profiles favor aggregations/reports.

### Limits & throttling
- **Change tracking required** per table; only such tables exportable. ([Prerequisites](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-data-lake#prerequisites))
- **In-place update vs append-only**: in-place update is **legacy** and doesn't scale with high volume; **append-only** is recommended (deletes appear as appended rows with `IsDelete=True`; consumers must dedupe on `VersionNumber`/`SinkModifiedOn` and filter `isDeleted=0`). Not every intermediate change is captured (batched). ([Advanced configuration](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-advanced-configuration#in-place-updates-vs-append-only-writes), [FAQ](https://learn.microsoft.com/power-apps/maker/data-platform/export-data-lake-faq#what-is-append-only-mode-and-what-is-the-difference-between-append-only-and-in-place-update-mode))
- Up to 1,000 tables per link profile; 10 profiles per environment. ([Transition guide](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-transition-from-fno#understanding-benefits-and-cost-reductions), [Prerequisites](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-data-lake#prerequisites))
- No throttling on the read side beyond Synapse/Storage service limits — reads never touch Dataverse service protection limits.

### Auth model (Node.js BFF)
- The **export** is a managed service (grant Synapse Link service access to the storage account; managed-identity option for locked-down storage). ([MSI configuration](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-msi))
- Your **app reads the copy** with a plain Azure identity: service principal or managed identity holding **Storage Blob Data Reader** (direct Parquet/CSV reads via `@azure/storage-blob` / `@azure/identity`), or an Entra-authenticated connection to the Synapse **serverless SQL endpoint** (standard SQL over TDS with Entra tokens). Dataverse security roles do *not* flow to the lake — the storage/Synapse RBAC is the boundary. ([Serverless SQL prerequisites](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-serverless))

---

## Option 4 — Link to Microsoft Fabric (Fabric Link)

No-copy, no-ETL integration: Dataverse maintains a Delta-Parquet replica in Dataverse-managed storage and surfaces it in a Fabric Lakehouse via OneLake **shortcuts**; a SQL analytics endpoint and Power BI semantic model are auto-created. ([Link your Dataverse environment to Microsoft Fabric](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-view-in-fabric#link-to-fabric-from-power-apps))

### Freshness
- Data updates land in OneLake **"within the hour"**; Dataverse triggers update jobs **every 15 minutes**, with updated Parquet typically visible in **15–45 minutes** (indicative, not guaranteed under high churn). Microsoft is rolling out a lower-latency sync engine and calls Fabric Link its primary sync path. ([Transition guide — real-time reporting](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-transition-from-fno#understanding-benefits-%E2%80%93-more-real-time-reporting), [View in Fabric](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-view-in-fabric#link-to-fabric-from-power-apps))

### Setup effort
- Wizard-driven from Power Apps (**Link data → New link → Fabric link**, or Tables → Analyze → Analyze in Fabric): four steps, auto-creates Lakehouse + SQL endpoint + semantic model. **No storage account or Synapse workspace to provision.** ([Create a link to Fabric](https://learn.microsoft.com/power-apps/maker/data-platform/fabric-link-to-data-platform#create-a-link-to-fabric), [View in Fabric](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-view-in-fabric#link-to-fabric-from-power-apps))
- Time to first data: **hours** (fastest copy-path setup) — *if* Fabric capacity already exists in the right region; capacity procurement/tenant-settings approval is the long pole otherwise.

### Prerequisites & licensing
([Fabric link prerequisites](https://learn.microsoft.com/power-apps/maker/data-platform/fabric-link-to-data-platform#prerequisites))
- Power Platform environment **System Administrator** role; **admin of the Power BI workspace**.
- **Fabric capacity (F SKU) or Power BI Premium capacity in the same region/geography as the Dataverse environment** (Premium *Per User* is not sufficient — [troubleshooting](https://learn.microsoft.com/power-apps/maker/data-platform/fabric-troubleshoot)).
- Fabric tenant settings enabled: *Users can create Fabric items*, *Create workspaces*, *Users can access data stored in OneLake with apps external to Fabric*.
- Linking selects all non-system tables with **Track changes enabled**; linked tables **consume Dataverse storage capacity** (visible in Power Platform admin center). One Fabric workspace per environment today. ([View in Fabric](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-view-in-fabric#link-to-fabric-from-power-apps))

### Cost (order of magnitude)
- **Fabric capacity**: pay-as-you-go **$0.18 per CU-hour** (East US retail) → smallest SKU **F2 = 2 CU ≈ $263/month** if left running 24×7; reservations are cheaper; capacity can be paused. ([Fabric pricing page](https://azure.microsoft.com/en-us/pricing/details/microsoft-fabric/); CU rate verified via [Azure Retail Prices API](https://prices.azure.com/api/retail/prices))
- **Dataverse storage**: the Delta replica draws down Dataverse capacity (paid add-on capacity if you exceed entitlement). ([View in Fabric](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-view-in-fabric#link-to-fabric-from-power-apps))
- This is the highest fixed-floor option: capacity is billed whether or not queries run (unless paused).

### Query capability
- **Analytical, full Fabric surface**: T-SQL via the Lakehouse **SQL analytics endpoint**, Spark notebooks, Dataflows Gen2, KQL, Power BI Direct Lake — no Dataverse aggregation caps. ([Build apps with Fabric](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-build-apps-with-fabric))
- Shortcuts are **read-only** regardless of permissions. ([Create a Dataverse shortcut](https://learn.microsoft.com/fabric/onelake/create-dataverse-shortcut))

### Limits & throttling
- Tables need **Track changes**; one Fabric workspace per environment (multi-workspace support planned); replica governed/secured by Dataverse and stays in-region. ([View in Fabric](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-view-in-fabric#link-to-fabric-from-power-apps))
- Fabric capacity throttling applies per SKU (CU smoothing), not Dataverse service protection limits — reads never touch the operational API.

### Auth model (Node.js BFF)
- Dataverse shortcuts use a **delegated authorization model**: the shortcut's stored credential — **organizational account (OAuth2) or Service Principal** — authorizes all access; that account must have **system administrator** permission on the Dataverse Managed Lake. ([Shortcut authorization](https://learn.microsoft.com/fabric/onelake/create-dataverse-shortcut#authorization))
- A Node app would typically query the **SQL analytics endpoint** with an Entra token (service principal), like any SQL-over-TDS source; workspace-identity auth is also supported for the link itself. ([Fabric link prerequisites](https://learn.microsoft.com/power-apps/maker/data-platform/fabric-link-to-data-platform#prerequisites))

---

## Option 5 — Power Platform dataflows

Power Query–based self-service ETL, authored in Power Apps, refreshed on schedule, landing in Dataverse or your organization's ADLS Gen2. ([Create and use dataflows in Power Platform](https://learn.microsoft.com/power-query/dataflows/create-use))

### Freshness
- **Scheduled only**: manual or automatic refresh in 30-minute increments; **up to 48 refreshes/day**; max 2 hours per-table refresh time (Power Apps). ([Set the refresh frequency](https://learn.microsoft.com/power-apps/maker/data-platform/create-and-use-dataflows#set-the-refresh-frequency), [Dataflow capabilities table](https://learn.microsoft.com/power-query/dataflows/create-use#dataflow-capabilities-in-microsoft-power-platform-services))

### Setup effort
- No Azure resources needed for Dataverse-destination flows; for ADLS destination, connect your own storage account to the environment. Authoring is Power Query Online (low-code). Time to first data: **hours**. ([Create and use dataflows](https://learn.microsoft.com/power-query/dataflows/create-use), [Connect ADLS for dataflow storage](https://learn.microsoft.com/power-query/dataflows/connect-azure-data-lake-storage-for-dataflow))

### Prerequisites & licensing
- Requires a **Power Apps (or Power BI) product license** for the author; **own-ADLS storage additionally requires an Azure subscription**; **incremental refresh to ADLS requires Power Apps Plan 2**. ([Dataflow licenses](https://learn.microsoft.com/power-query/dataflows/what-licenses-do-you-need-in-order-to-use-dataflows#limitations-on-each-license), [capabilities table](https://learn.microsoft.com/power-query/dataflows/create-use#dataflow-capabilities-in-microsoft-power-platform-services))
- Reading from Dataverse uses the Dataverse connector, which requires the **TDS endpoint enabled** and rides the same request-limit regime. ([Dataverse connector](https://learn.microsoft.com/power-query/connectors/dataverse))

### Cost
- **$0 Azure incremental** for Dataverse-destination flows (license-covered); own-ADLS destination adds ~$0.02/GB-month storage. ([Dataflow licenses](https://learn.microsoft.com/power-query/dataflows/what-licenses-do-you-need-in-order-to-use-dataflows#limitations-on-each-license), [ADLS pricing](https://azure.microsoft.com/en-us/pricing/details/storage/data-lake/))

### Query capability
- Dataflows are an **ETL surface, not a query endpoint**. Output in ADLS is **CSV in Common Data Model folders**, readable by ADF, Databricks, or your own code; the internal (non-BYO) dataflow storage is **not accessible to external workloads**. ([Using dataflow output from Azure workloads](https://learn.microsoft.com/power-query/dataflows/using-output-power-platform-dataflows-other-azure#dataflows-with-external-azure-data-lake-storage))
- Extraction throughput guidance: the Dataverse connector retrieves ~**500 rows/second** — Microsoft's stated recommendation for bulk extraction is Synapse Link. ([Table retrieval rate](https://learn.microsoft.com/power-query/connectors/dataverse#limitations-and-considerations))

### Limits & throttling
- 48 scheduled refreshes/day; 2-hour per-table refresh cap; (Fabric Dataflows Gen2: 300 refreshes per 24h rolling window, 8-hour query evaluation cap). ([Capabilities](https://learn.microsoft.com/power-query/dataflows/create-use#dataflow-capabilities-in-microsoft-power-platform-services), [Dataflow refresh limitations](https://learn.microsoft.com/fabric/data-factory/dataflow-gen2-refresh#refresh-limitations))
- Source reads count against Dataverse request limits/service protection. ([Dataverse connector limits](https://learn.microsoft.com/power-query/connectors/dataverse#limitations-and-considerations))

### Auth model
- Dataverse connector supports **Organizational account or Service principal** (service principal not supported through on-prem/VNet gateways). Your app then reads the *output* (Dataverse or ADLS) with its own identity. ([Dataverse connector summary](https://learn.microsoft.com/power-query/connectors/dataverse))

---

## Option 6 — Azure Data Factory (Dataverse connector)

Pipeline-based copy using the "Dynamics 365 (Microsoft Dataverse)" connector in ADF or Synapse pipelines; also available in Fabric Data Factory. ([ADF Dynamics/Dataverse connector](https://learn.microsoft.com/azure/data-factory/connector-dynamics-crm-office-365))

### Freshness
- **Scheduled/triggered batch** — freshness equals your trigger cadence (schedule, tumbling window, or event). Each run re-queries Dataverse (full or FetchXML-filtered incremental you design yourself).

### Setup effort
- Provision a Data Factory, create the linked service (serviceUri = org URL, auth type), a dataset per entity, copy activities, and a sink (Azure SQL, ADLS, etc.). Requires the same Entra app registration + Dataverse application user as the Web API. Time to first data: **about a day**; incremental-load logic (watermarks) adds more. ([Prerequisites — S2S setup](https://learn.microsoft.com/azure/data-factory/connector-dynamics-crm-office-365#prerequisites), [Linked service properties](https://learn.microsoft.com/azure/data-factory/connector-dynamics-crm-office-365#linked-service-properties))

### Prerequisites & licensing
- Azure subscription (Data Factory + sink resources); Entra app registration registered as a Dataverse **application user with granted permissions**; no Power Platform license for the service principal. If tenant uses conditional access/MFA, **service principal auth is mandatory** (Office 365 username/password auth won't work — and is legacy anyway). ([Supported capabilities](https://learn.microsoft.com/azure/data-factory/connector-dynamics-crm-office-365#supported-capabilities))

### Cost (order of magnitude)
- **Orchestration $1 per 1,000 activity runs** + **data movement $0.25 per DIU-hour** (Azure IR, East US retail; self-hosted IR $1.50/1,000 + $0.10/DIU-hr), plus sink storage/database cost. Hourly small-table syncs land in the **$5–$50/month** range. ([ADF pricing page](https://azure.microsoft.com/en-us/pricing/details/data-factory/); rates verified via [Azure Retail Prices API](https://prices.azure.com/api/retail/prices))

### Query capability
- Source supports entity dumps or **FetchXML queries**; sink to anything ADF supports (Azure SQL DB gives your app a real transactional+analytical T-SQL store you fully control). Mapping data flow and Lookup activity supported. ([Supported capabilities](https://learn.microsoft.com/azure/data-factory/connector-dynamics-crm-office-365#supported-capabilities))
- Query capability for your app is then **whatever the sink provides** — this option's flexibility and its cost: you own schema drift, deletes, and watermarking.

### Limits & throttling
- Reads/writes go through the Dataverse API, so **service protection limits apply** — docs call out the **52 concurrent batch calls per org** limit and recommend `writeBatchSize ≤ 10`. Extraction competes with your live users' API budget during runs. ([Copy activity properties](https://learn.microsoft.com/azure/data-factory/connector-dynamics-crm-office-365#copy-activity-properties))

### Auth model
- Linked service auth types: **Microsoft Entra service principal (key or certificate)**, **user-assigned managed identity**, or legacy Office 365 credentials. Secrets can live in Key Vault. ([Linked service properties](https://learn.microsoft.com/azure/data-factory/connector-dynamics-crm-office-365#linked-service-properties))

---

## Live-vs-copy decision rubric

Fill in the table inventory (row counts, churn rate, query shapes), then score each criterion. "Live" = Web API and/or TDS endpoint; "Copy" = Synapse Link, Fabric Link, dataflows, or ADF.

| Criterion | Favors LIVE when… | Favors COPY when… | Driving limit (citation) |
|---|---|---|---|
| **Data volume per query** | Screens need ≤ a few pages of rows (5,000/page) and filtered lists | Queries scan large tables; bulk extraction needed (connector throughput ~500 rows/s makes live bulk pulls impractical) | [5,000-row page cap](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/query/page-results); [retrieval-rate guidance & "recommended approach for bulk extraction is Azure Synapse Link"](https://learn.microsoft.com/power-query/connectors/dataverse#limitations-and-considerations) |
| **Aggregation scope** | Aggregates always evaluate < 50,000 rows after filters | Any aggregate/groupby can touch ≥ 50,000 rows (hard error on live paths — including TDS) | [50,000-record aggregate limit, OData & SQL](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/query/aggregate-data#odata-aggregation-limitations), [same via TDS](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/query/sql#aggregate-data) |
| **Query complexity** | Point reads, simple joins ($expand / TDS JOIN), lookups by key | Multi-table analytics, window functions, CTEs, pivots, history/trends (TDS lacks CTE/PIVOT/OVER; 5-min/2-min timeout) | [Dataverse SQL unsupported features](https://learn.microsoft.com/power-apps/developer/data-platform/how-dataverse-sql-differs-from-transact-sql#queries), [TDS timeout](https://learn.microsoft.com/power-apps/developer/data-platform/dataverse-sql-query#limitations) |
| **Request rate (all viewers via one BFF app user)** | Peak stays well under 6,000 requests & 20 min compute per 5-min window and ~25k–500k requests/24h pool | Dashboard fan-out or polling would breach the shared per-user window → 429s for everyone | [Service protection limits](https://learn.microsoft.com/power-apps/developer/data-platform/api-limits#how-the-system-enforces-service-protection-api-limits), [non-licensed 24h pools](https://learn.microsoft.com/power-platform/admin/api-request-limits-allocations#non-licensed-user-request-limits) |
| **Latency tolerance** | Viewers need up-to-the-second data (live is real-time) | 15–60 min staleness acceptable (Synapse/Fabric link), or hours (dataflows/ADF schedules) | [Fabric/Synapse sync 15–45 min indicative](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-transition-from-fno#understanding-benefits-%E2%80%93-more-real-time-reporting), [hourly snapshots](https://learn.microsoft.com/troubleshoot/azure/synapse-analytics/serverless-sql/query-perf/ssql-perf-optimize-synapse-link) |
| **Setup time available (1-week budget)** | < 1 day acceptable-effort: app registration + application user only | 1–2+ days acceptable: storage/capacity provisioning, table change-tracking, sync validation, dedupe logic (append-only) | [S2S setup](https://learn.microsoft.com/power-apps/developer/data-platform/use-single-tenant-server-server-authentication#azure-application-registration), [Synapse Link prerequisites](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-data-lake#prerequisites) |
| **Ongoing monthly cost** | $0 incremental is required | Budget exists: ~$5–50/mo (Synapse Link CSV + serverless @$5/TB, or ADF), or ~$263+/mo fixed (Fabric F2 24×7) + Dataverse storage draw | [Serverless $5/TB & CU $0.18/hr & ADF rates via Retail Prices API](https://prices.azure.com/api/retail/prices), [Fabric pricing](https://azure.microsoft.com/en-us/pricing/details/microsoft-fabric/) |
| **Security model** | Dataverse row/column security must apply per query (TDS/Web API enforce Dataverse security model) | Coarse-grained is fine — lake/warehouse RBAC replaces Dataverse roles on the copy | [TDS uses Dataverse security model](https://learn.microsoft.com/power-apps/developer/data-platform/dataverse-sql-query), [lake access = storage roles](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-serverless) |
| **Table prerequisites** | Elastic tables or tables without change tracking involved (TDS excludes elastic; Synapse/Fabric require change tracking) — check per path | All needed tables are standard with Track changes on (or can be enabled) | [TDS elastic-table exclusion](https://learn.microsoft.com/power-apps/developer/data-platform/dataverse-sql-query#limitations), [change-tracking requirement](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-data-lake#prerequisites) |

**Practical thresholds to test during table inventory:** (a) any single aggregate over ≥50,000 rows → that workload must be on a copy; (b) sustained BFF traffic approaching ~20 requests/second (≈6,000/5-min) or heavy queries eating the 20-min compute window → copy or aggressive caching; (c) total daily requests vs the tenant's 24h non-licensed pool (25k base for Power Apps-only tenants is easy to exhaust); (d) if all workloads are ≤ a few thousand rows with simple filters, live costs $0 and ships fastest.

---

## Deprecated — do not use

| Path | Status | What to use instead |
|---|---|---|
| **Data Export Service (DES)** (replication to Azure SQL DB) | **Deprecated Nov 2021; end-of-life Nov 2022.** ([Deprecation notice on the DES article](https://learn.microsoft.com/power-platform/admin/replicate-data-microsoft-azure-sql-database)) | Azure Synapse Link for Dataverse / Fabric Link |
| **Export to Data Lake** (F&O add-in) | **Deprecated Nov 1 2024; decommissioning began Mar 25 2025.** ([Transition FAQ](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-transition-faq#is-byod-service-retired--is-there-a-retirement-date)) | Synapse Link / Fabric Link |
| **Organization Data Service (OData v2.0, `/XRMServices/2011/OrganizationData.svc`)** | **Deprecated since v8.0; removal announced (dates extended), and the platform now returns error `OrganizationDataServiceDeprecatedError`: "has been removed. Please use the Dataverse Web API."** ([Do not use the OData v2.0 endpoint](https://learn.microsoft.com/power-apps/developer/model-driven-apps/best-practices/business-logic/do-not-use-odata-v2-endpoint), [error code reference](https://learn.microsoft.com/power-apps/developer/data-platform/reference/web-service-error-codes#microsoft-dataverse-errors)) | Web API (OData v4) |
| **2011 SOAP endpoint (Organization Service)** | **Deprecated** — still works, no removal date announced; .NET SDK will transparently migrate to Web API. Never target the SOAP protocol directly from a new app (and there is no Node story for it at all). ([About the legacy SOAP endpoint](https://learn.microsoft.com/power-apps/developer/data-platform/org-service/overview#about-the-legacy-soap-endpoint)) | Web API (OData v4); FetchXML remains fully supported *through* the Web API (`?fetchXml=`) ([FetchXML via Web API](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/web-api-query-data-sample#section-8-fetchxml-queries)) |
| **BYOD (Bring Your Own Database, F&O)** | No retirement date but Microsoft recommends transition to Synapse Link / Fabric Link. ([Transition FAQ](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-transition-faq#is-byod-service-retired--is-there-a-retirement-date)) | Synapse Link / Fabric Link |
| **Synapse Link "In-place update" CSV mode** | Not deprecated, but documented as **legacy**; doesn't scale with volume/churn — prefer Append only or Delta Lake. ([Advanced configuration](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-advanced-configuration#in-place-updates-vs-append-only-writes)) | Append-only or Delta Lake mode |

Stale blog posts may also suggest the **Organization Service .NET SDK over SOAP** for integrations or **DES profiles** — both funnel to the paths above.

---

## Sources

Dataverse Web API & limits
- https://learn.microsoft.com/power-apps/developer/data-platform/webapi/overview
- https://learn.microsoft.com/power-apps/developer/data-platform/api-limits
- https://learn.microsoft.com/power-apps/maker/data-platform/api-limits-overview
- https://learn.microsoft.com/power-apps/developer/data-platform/send-parallel-requests
- https://learn.microsoft.com/power-apps/developer/data-platform/webapi/query/page-results
- https://learn.microsoft.com/power-apps/developer/data-platform/webapi/query/aggregate-data
- https://learn.microsoft.com/power-apps/developer/data-platform/fetchxml/aggregate-data
- https://learn.microsoft.com/power-apps/developer/data-platform/fetchxml/page-results
- https://learn.microsoft.com/power-apps/developer/data-platform/webapi/web-api-query-data-sample
- https://learn.microsoft.com/power-platform/admin/api-request-limits-allocations

Auth
- https://learn.microsoft.com/power-apps/developer/data-platform/authenticate-oauth
- https://learn.microsoft.com/power-apps/developer/data-platform/build-web-applications-server-server-s2s-authentication
- https://learn.microsoft.com/power-apps/developer/data-platform/use-single-tenant-server-server-authentication
- https://learn.microsoft.com/power-apps/developer/data-platform/use-multi-tenant-server-server-authentication
- https://learn.microsoft.com/power-apps/developer/data-platform/walkthrough-register-app-azure-active-directory

TDS / SQL endpoint
- https://learn.microsoft.com/power-apps/developer/data-platform/dataverse-sql-query
- https://learn.microsoft.com/power-apps/developer/data-platform/how-dataverse-sql-differs-from-transact-sql
- https://learn.microsoft.com/power-apps/developer/data-platform/webapi/query/sql
- https://learn.microsoft.com/power-query/connectors/dataverse

Azure Synapse Link for Dataverse
- https://learn.microsoft.com/power-apps/maker/data-platform/export-to-data-lake
- https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-data-lake
- https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-synapse
- https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-delta-lake
- https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-advanced-configuration
- https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-serverless
- https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-spark
- https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-msi
- https://learn.microsoft.com/power-apps/maker/data-platform/export-data-lake-faq
- https://learn.microsoft.com/troubleshoot/azure/synapse-analytics/serverless-sql/query-perf/ssql-perf-optimize-synapse-link
- https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-select-fno-data

Fabric Link
- https://learn.microsoft.com/power-apps/maker/data-platform/fabric-link-to-data-platform
- https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-view-in-fabric
- https://learn.microsoft.com/fabric/onelake/create-dataverse-shortcut
- https://learn.microsoft.com/power-apps/maker/data-platform/fabric-troubleshoot
- https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-build-apps-with-fabric
- https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-transition-from-fno
- https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-transition-faq

Dataflows
- https://learn.microsoft.com/power-query/dataflows/create-use
- https://learn.microsoft.com/power-apps/maker/data-platform/create-and-use-dataflows
- https://learn.microsoft.com/power-query/dataflows/what-licenses-do-you-need-in-order-to-use-dataflows
- https://learn.microsoft.com/power-query/dataflows/using-output-power-platform-dataflows-other-azure
- https://learn.microsoft.com/fabric/data-factory/dataflow-gen2-refresh

Azure Data Factory
- https://learn.microsoft.com/azure/data-factory/connector-dynamics-crm-office-365

Deprecated paths
- https://learn.microsoft.com/power-platform/admin/replicate-data-microsoft-azure-sql-database
- https://learn.microsoft.com/power-apps/developer/model-driven-apps/best-practices/business-logic/do-not-use-odata-v2-endpoint
- https://learn.microsoft.com/power-platform/important-changes-coming
- https://learn.microsoft.com/power-apps/developer/data-platform/org-service/overview
- https://learn.microsoft.com/power-apps/developer/data-platform/reference/web-service-error-codes

Pricing
- https://azure.microsoft.com/en-us/pricing/details/microsoft-fabric/
- https://azure.microsoft.com/en-us/pricing/details/synapse-analytics/
- https://azure.microsoft.com/en-us/pricing/details/data-factory/
- https://azure.microsoft.com/en-us/pricing/details/storage/data-lake/
- https://prices.azure.com/api/retail/prices (Azure Retail Prices API; East US, consumption rates, retrieved 2026-08-07)
