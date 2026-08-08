# 003 — Container Path: Dockerfile → ACR → Web App for Containers

> Research ticket resolution. Primary sources only (Microsoft Learn, Docker docs, Azure Retail Prices API). Researched 2026-08-07.
> Context (fixed): React frontend + Node BFF, one container image, internal viewers, corporate-sensible cost stance. Options presented with tradeoffs — no final recommendation here.

## Executive summary

The container leg is: a **multi-stage Dockerfile** (stage 1 builds the Vite/React bundle, stage 2 runs the Node BFF serving `/api` + the static build) → pushed to **Azure Container Registry** (Basic tier suffices: ~$0.167/day ≈ **$5/mo**, 10 GiB included; push via `az acr login` + `docker push`, or let Azure build it with `az acr build` — no local Docker needed) → run on a **Linux App Service plan** as Web App for Containers. Plan floor is **B1** (~$12.41/mo East US) which now supports Always On *and* VNet integration; **P0v3** (~$56.58/mo, 1 vCPU/4 GB) adds deployment slots/autoscale-class production features. A single image is the natural fit because App Service custom containers expose exactly **one HTTP port** (set `WEBSITES_PORT` if not 80/8080). Redeploy is pull-based: App Service does `docker pull` on restart, or continuously via an ACR webhook → `CI_CD_URL`. **Image-pull auth**: system-assigned managed identity + **AcrPull** role (`acrUseManagedIdentityCreds=true`) is the corporate default; the ACR admin account is single-user, disabled by default, and explicitly not recommended for this. Minimal sensible combo: **ACR Basic + B1 ≈ $17/mo** (dev/internal); **ACR Basic + P0v3 ≈ $62/mo** (production-grade). Azure Container Apps can consume the same image with scale-to-zero, per-second billing (~$0–5/mo idle-heavy), at the cost of cold starts and a different ops model.

---

## 1. Dockerfile patterns for React + Node BFF

### Single image (multi-stage) — the shape that fits App Service

App Service custom containers can expose **only one port for HTTP requests** ([configure-custom-container — port number](https://learn.microsoft.com/azure/app-service/configure-custom-container#configure-port-number)), so one container where the Node BFF serves both the API and the static React build avoids any orchestration:

```dockerfile
# Stage 1 — build the Vite/React bundle
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build            # emits /app/client/dist

# Stage 2 — runtime: Node BFF + static assets only
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client-build /app/client/dist ./public
EXPOSE 8080
USER node
CMD ["node", "index.js"]     # Express serves ./public + /api routes
```

- Multi-stage builds keep build toolchains (Vite, TypeScript, dev deps) out of the runtime image; the final image contains only what `COPY --from=` brings forward ([Docker docs — multi-stage builds](https://docs.docker.com/build/building/multi-stage/)).
- Docker's own Node.js containerization guide uses this same pattern for production Node images ([Docker docs — containerize Node.js](https://docs.docker.com/guides/nodejs/containerize/)).
- **Next.js variant**: if the frontend were Next.js instead of Vite, use `output: "standalone"` and copy `.next/standalone` into the runtime stage — same multi-stage shape, the Next server replaces Express as the process ([Next.js docs — standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)).

Tradeoffs: one image = one deploy unit, one TLS endpoint, no CORS (same origin for `/` and `/api`), but frontend and BFF release together.

### Separate images (frontend nginx + API node)

- Two images (nginx serving the static build; Node API) require either **two Web Apps** (CORS + two plans/apps to manage) or App Service's **sidecar containers** feature (`LinuxFxVersion=sitecontainers`, still only one ingress port with the main container receiving traffic) ([configure-sidecar](https://learn.microsoft.com/azure/app-service/configure-sidecar)).
- Sensible when teams/release cadences differ; overhead for a one-week internal app. On AKS/Container Apps the two-image split is more idiomatic; on Web App for Containers the single image is the low-friction path.

## 2. ACR — tier choice, price, and pushing images

### Tiers

| Tier | Included storage | Notable limits/features | List price (East US) |
|---|---|---|---|
| **Basic** | 10 GiB | 2 webhooks; same auth (Entra ID, RBAC), same APIs as higher tiers | $0.1666/day ≈ **$5.00/mo** |
| **Standard** | 100 GiB | 10 webhooks; higher throughput — "satisfies many production scenarios" | $0.6666/day ≈ **$20.00/mo** |
| **Premium** | 500 GiB | Geo-replication, **private link/private endpoints**, content trust, highest throughput | $1.6666/day ≈ **$50.00/mo** |

Tier facts: [ACR SKUs](https://learn.microsoft.com/azure/container-registry/container-registry-skus); limits table: [Azure subscription limits — ACR](https://learn.microsoft.com/azure/azure-resource-manager/management/azure-subscription-service-limits#azure-container-registry-limits); prices: [Azure Retail Prices API](https://prices.azure.com/api/retail/prices?$filter=serviceName%20eq%20%27Container%20Registry%27%20and%20armRegionName%20eq%20%27eastus%27) (queried 2026-08-07; the [pricing page](https://azure.microsoft.com/pricing/details/container-registry/) confirms tiers/storage but renders prices client-side). Extra storage is $0.10/GiB/month across tiers (same API query).

**Which suffices**: one small app image with a handful of tags fits comfortably in Basic's 10 GiB. Basic has the *same* Entra ID auth, RBAC, and webhook mechanism (2 webhooks — one is all App Service CD needs). Standard is the upgrade if image count/pull volume grows; Premium only matters here if the registry must sit behind a **private endpoint** (corporate network isolation), which is Premium-only.

### Pushing: local `docker push` vs cloud `az acr build`

- **Local push**: `az acr login --name <registry>` (wraps `docker login` with a 3-hour Entra token), then `docker tag app <registry>.azurecr.io/app:v1` and `docker push` ([push/pull with Docker CLI](https://learn.microsoft.com/azure/container-registry/container-registry-get-started-docker-cli); [ACR authentication](https://learn.microsoft.com/azure/container-registry/container-registry-authentication)). Requires local Docker daemon.
- **Cloud build**: `az acr build --registry <registry> --image app:v1 .` uploads the build context, builds in Azure with unchanged Dockerfiles ("think `docker build`, `docker push` in the cloud"), and pushes on success — **no local Docker install needed** ([ACR Tasks overview — quick tasks](https://learn.microsoft.com/azure/container-registry/container-registry-tasks-overview#quick-tasks); [quick task tutorial](https://learn.microsoft.com/azure/container-registry/container-registry-tutorial-quick-task)). Task compute bills at $0.0001/vCPU-second (Retail Prices API, "Task vCPU Duration") — cents per build.
- ACR Tasks can also auto-build on git commit or on base-image updates (OS patch rebuilds) if CI is wanted later ([build on commit tutorial](https://learn.microsoft.com/azure/container-registry/container-registry-tutorial-build-task)).

Tradeoff: `az acr build` is the lower-friction default (works from any machine/CI runner, e.g. Windows without Docker Desktop licensing questions); local push gives faster inner-loop when Docker is already running locally.

## 3. Web App for Containers — plan, settings, redeploy

### Linux plan tiers and cost (list, East US, Linux)

| SKU | vCPU / RAM | Hourly | ~Monthly (730 h) | Container-relevant features |
|---|---|---|---|---|
| **B1** (Basic) | 1 / 1.75 GB | $0.017 | **$12.41** | Custom containers, Always On, **VNet integration** (Basic+ now supported); no deployment slots, manual scale to 3 instances |
| **S1** (Standard) | 1 / 1.75 GB | $0.095 | $69.35 | Adds slots, autoscale, daily backups |
| **P0v3** (Premium v3) | 1 / 4 GB | $0.0775 | **$56.58** | Premium hardware, slots, autoscale — cheaper *and* more RAM than S1 |
| **P1v3** | 2 / 8 GB | $0.155 | $113.15 | 2× P0v3 capacity |

Specs: [App Service Linux pricing page](https://azure.microsoft.com/pricing/details/app-service/linux/) (confirms B1 = 1 vCPU/1.75 GB, P0v3 = 1/4 GB, P1v3 = 2/8 GB; prices render client-side); prices: [Azure Retail Prices API](https://prices.azure.com/api/retail/prices?$filter=serviceName%20eq%20%27Azure%20App%20Service%27%20and%20armRegionName%20eq%20%27eastus%27) (queried 2026-08-07). Tier categories and per-VM billing: [App Service plans overview](https://learn.microsoft.com/azure/app-service/overview-hosting-plans). Note **P0v4** (Linux) lists at $0.073/h ≈ $53.29/mo — marginally cheaper than P0v3 where the v4 tier is available (same Retail Prices query).

- **VNet integration** requires a dedicated tier: "Basic, Standard, Premium, Premium v2, Premium v3, Premium v4" — so even B1 can reach VNet-secured resources (outbound); the feature itself carries no extra charge ([VNet integration overview](https://learn.microsoft.com/azure/app-service/overview-vnet-integration)). Inbound *private endpoints on ACR* (image pull over VNet, `vnetImagePullEnabled`) additionally require ACR Premium ([configure-custom-container — network-protected registry](https://learn.microsoft.com/azure/app-service/configure-custom-container#use-an-image-from-a-network-protected-registry)).
- Microsoft's own custom-container tutorial provisions **Basic B1** for this exact scenario ([tutorial-custom-container](https://learn.microsoft.com/azure/app-service/tutorial-custom-container#create-the-web-app)); Learn's cost guidance says Standard-or-higher for production, with Premium v3 the most cost-effective at scale ([plan and manage costs](https://learn.microsoft.com/azure/app-service/overview-manage-costs#optimize-costs)).

### Container settings

- **`WEBSITES_PORT`**: App Service auto-detects containers listening on 80 or 8080; any other port must be declared via this app setting. It only tells the front end where to forward — it is *not* injected into the container as an env var, and only **one** port can receive HTTP ([configure-custom-container — port](https://learn.microsoft.com/azure/app-service/configure-custom-container#configure-port-number); [App Service Linux FAQ](https://learn.microsoft.com/troubleshoot/azure/app-service/faqs-app-service-linux-new#custom-containers)).
- **Always On**: available Basic tier and up, toggled under Configuration → General settings; keeps the container warm instead of idling out, no extra charge beyond the plan ([configure common settings](https://learn.microsoft.com/azure/app-service/configure-common#configure-general-settings)).
- HTTPS termination happens at App Service's shared front ends — the container serves plain HTTP internally ([App Service Linux FAQ](https://learn.microsoft.com/troubleshoot/azure/app-service/faqs-app-service-linux-new#custom-containers)).

### How it pulls and redeploys on a new image

- On first run and on every app restart, App Service performs a `docker pull`; only **changed layers** are re-pulled, unchanged layers come from local disk. Scale-outs or instance moves re-pull all layers ([configure-custom-container — how images are stored](https://learn.microsoft.com/azure/app-service/configure-custom-container#use-an-image-from-a-network-protected-registry)).
- **Continuous deployment**: `az webapp deployment container config --enable-cd true` emits a `CI_CD_URL`; register it as an **ACR webhook** (`az acr webhook create --actions push --scope app:tag`) so every image push notifies App Service to pull and restart. Without the webhook, redeploy = restart the app (or re-set the tag) to trigger the pull. During the pull, the old container keeps serving until the new one is ready ([tutorial-custom-container — configure the web app](https://learn.microsoft.com/azure/app-service/tutorial-custom-container#configure-the-web-app); [troubleshoot updated container](https://learn.microsoft.com/azure/app-service/configure-custom-container#use-an-image-from-a-network-protected-registry)).
- Pinning a moving tag (`:latest`) + webhook gives auto-redeploy; immutable tags (`:v1.2.3`) + explicit config update gives auditable releases — corporate CI/CD usually prefers the latter.

## 4. Image pull auth — managed identity (corporate default) vs admin account

**Managed identity + AcrPull is the sensible corporate default.** Microsoft's guidance: the admin account "is designed for a single user to access the registry, mainly for testing purposes… not recommended for multiple users"; it is disabled by default, is a shared username/password with full push+pull, has no RBAC, and there are built-in Azure Policies specifically to deny enabling it ([ACR authentication — admin account](https://learn.microsoft.com/azure/container-registry/container-registry-authentication#admin-account); [ACR FAQ — prevent admin credentials](https://learn.microsoft.com/azure/container-registry/container-registry-faq#how-do-i-get-admin-credentials-for-a-container-registry)). Managed identity means no credentials stored in app settings at all.

Exact configuration (system-assigned; user-assigned differs only in the last step) ([configure-custom-container — managed identity pull](https://learn.microsoft.com/azure/app-service/configure-custom-container#use-managed-identity-to-pull-an-image-from-azure-container-registry)):

```bash
# 1. Give the web app an identity
principalId=$(az webapp identity assign -g <rg> -n <app> --query principalId -o tsv)
# 2. Grant that identity AcrPull on the registry
registryId=$(az acr show -g <rg> -n <registry> --query id -o tsv)
az role assignment create --assignee $principalId --scope $registryId --role "AcrPull"
# 3. Tell App Service to use the identity for pulls
az webapp config set -g <rg> -n <app> --generic-configurations '{"acrUseManagedIdentityCreds": true}'
# 4. (user-assigned only) also set the identity's client ID
az webapp config set -g <rg> -n <app> --generic-configurations '{"acrUserManagedIdentityID": "<client-id>"}'
```

- Prereq: the registry must accept **ARM audience tokens** (`az acr config authentication-as-arm show/update`) or pulls fail `UNAUTHORIZED` ([same doc](https://learn.microsoft.com/azure/app-service/configure-custom-container#use-managed-identity-to-pull-an-image-from-azure-container-registry)).
- AcrPull maps to `Microsoft.ContainerRegistry/registries/pull/read`; when configuring the pull through the portal, the role assignment is often created automatically — verify it wasn't blocked by policy ([troubleshoot Web App pulls](https://learn.microsoft.com/troubleshoot/azure/azure-container-registry/pull-image-to-web-app-fail#error-1-unauthorized)).
- System-assigned vs user-assigned: system-assigned dies with the app (simplest, per-app); user-assigned is shareable across apps/slots and is what the official tutorial uses, and is Microsoft's stated preference for ACA pulls ("when possible, use a user-assigned managed identity") ([tutorial-custom-container](https://learn.microsoft.com/azure/app-service/tutorial-custom-container#configure-the-web-app); [ACA tutorial](https://learn.microsoft.com/azure/container-apps/tutorial-code-to-cloud#create-a-user-assigned-managed-identity)). For one app, system-assigned is the fewest moving parts.
- Admin account's one legitimate niche: portal-driven "deploy from registry" flows to ACI/Container Apps still require it ([ACR authentication — admin account](https://learn.microsoft.com/azure/container-registry/container-registry-authentication#admin-account)). Not needed on this path.

## 5. Alternative: Azure Container Apps (same image, different cost model)

The same ACR image runs unchanged on Azure Container Apps' **Consumption plan**, which is serverless: replicas **scale to zero** when idle and billing is per-second on allocated resources (vCPU-seconds + GiB-seconds) plus HTTP requests, with monthly free grants of 180,000 vCPU-s, 360,000 GiB-s, and 2M requests per subscription — an idle app costs **$0**, and a low-traffic internal app lands around **$1–5/mo** versus a flat plan fee ([ACA plans](https://learn.microsoft.com/azure/container-apps/plans); [ACA billing](https://learn.microsoft.com/azure/container-apps/billing#consumption-plan); [Heroku migration cost comparison](https://learn.microsoft.com/azure/container-apps/migrate-heroku-overview#cost-comparison)). Managed-identity `acrpull` works the same way ([ACA managed identity image pull](https://learn.microsoft.com/azure/container-apps/managed-identity-image-pull)). The tradeoffs: cold-start latency when scaling from zero (or pay reduced idle rates to keep `minReplicas: 1`), a KEDA/revision-based ops model instead of App Service's app-settings world, and App Service conveniences (Easy Auth portal flow, slots) are replaced by ACA equivalents. Web App for Containers remains the primary path here; ACA is the fallback if per-use cost or scale-to-zero becomes the dominant requirement.

## 6. Cost of the minimal sensible combo

| Combo | Monthly (East US list, 730 h) | When |
|---|---|---|
| ACR Basic + **B1** Linux | $5.00 + $12.41 = **$17.41** | Internal/dev-grade; Always On + VNet integration included; no slots |
| ACR Basic + **P0v3** Linux | $5.00 + $56.58 = **$61.58** | Production-grade: premium hardware, 4 GB RAM, slots |
| ACR Standard + **P1v3** Linux | $20.00 + $113.15 = **$133.15** | Growth path: more storage/throughput, 2 vCPU/8 GB |

Prices from the [Azure Retail Prices API](https://prices.azure.com/api/retail/prices) (first-party, queried 2026-08-07) because the [ACR](https://azure.microsoft.com/pricing/details/container-registry/) and [App Service Linux](https://azure.microsoft.com/pricing/details/app-service/linux/) pricing pages render figures client-side; those pages corroborate tier structure and hardware specs. Corporate-sensible read: **$17/mo** covers this workload's actual load profile (internal viewers, single container); the **$62/mo** P0v3 combo is the defensible "production" line item if slots or the premium SLA posture is required. ACR Premium (+$45/mo over Basic) only enters if network isolation of the registry (private endpoints) is mandated.

---

## Sources

- ACR intro & tiers — https://learn.microsoft.com/azure/container-registry/container-registry-intro
- ACR SKU features and limits — https://learn.microsoft.com/azure/container-registry/container-registry-skus
- ACR limits (subscription limits page) — https://learn.microsoft.com/azure/azure-resource-manager/management/azure-subscription-service-limits#azure-container-registry-limits
- ACR authentication (incl. admin account) — https://learn.microsoft.com/azure/container-registry/container-registry-authentication
- ACR FAQ (admin credentials, deny policies) — https://learn.microsoft.com/azure/container-registry/container-registry-faq
- ACR push/pull with Docker CLI — https://learn.microsoft.com/azure/container-registry/container-registry-get-started-docker-cli
- ACR Tasks overview (az acr build) — https://learn.microsoft.com/azure/container-registry/container-registry-tasks-overview
- ACR Tasks quick task tutorial — https://learn.microsoft.com/azure/container-registry/container-registry-tutorial-quick-task
- ACR Tasks build-on-commit tutorial — https://learn.microsoft.com/azure/container-registry/container-registry-tutorial-build-task
- App Service custom container config (port, managed identity, image storage, VNet pull) — https://learn.microsoft.com/azure/app-service/configure-custom-container
- App Service custom container tutorial (B1, webhook CD, user-assigned MI) — https://learn.microsoft.com/azure/app-service/tutorial-custom-container
- App Service Linux FAQ (WEBSITES_PORT, HTTPS termination) — https://learn.microsoft.com/troubleshoot/azure/app-service/faqs-app-service-linux-new
- App Service plans overview — https://learn.microsoft.com/azure/app-service/overview-hosting-plans
- App Service cost planning — https://learn.microsoft.com/azure/app-service/overview-manage-costs
- App Service common settings (Always On) — https://learn.microsoft.com/azure/app-service/configure-common#configure-general-settings
- App Service VNet integration — https://learn.microsoft.com/azure/app-service/overview-vnet-integration
- App Service sidecars — https://learn.microsoft.com/azure/app-service/configure-sidecar
- Troubleshoot Web App image pulls (AcrPull permission) — https://learn.microsoft.com/troubleshoot/azure/azure-container-registry/pull-image-to-web-app-fail
- ACA plan types — https://learn.microsoft.com/azure/container-apps/plans
- ACA billing (consumption, free grants) — https://learn.microsoft.com/azure/container-apps/billing
- ACA Heroku cost comparison — https://learn.microsoft.com/azure/container-apps/migrate-heroku-overview
- ACA managed-identity image pull — https://learn.microsoft.com/azure/container-apps/managed-identity-image-pull
- Docker multi-stage builds — https://docs.docker.com/build/building/multi-stage/
- Docker Node.js guide — https://docs.docker.com/guides/nodejs/containerize/
- Next.js standalone output — https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- Azure Retail Prices API (ACR + App Service, eastus, queried 2026-08-07) — https://prices.azure.com/api/retail/prices
- ACR pricing page (tier/storage structure) — https://azure.microsoft.com/pricing/details/container-registry/
- App Service Linux pricing page (SKU specs) — https://azure.microsoft.com/pricing/details/app-service/linux/
