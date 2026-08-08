# Research 004 — CI/CD options: building and shipping the container image

**Question:** How do we build the container image and get it onto Azure Web App for Containers, given a one-week total build budget?
**Status:** Resolved (research only — no recommendation is final; nothing was provisioned).
**Repo:** github.com/AndrewGodlewsky/Dataverse-to-Azure-Web-App (currently on GitHub; public/private status covered both ways below).

## Executive summary

- Four viable paths, in ascending setup cost: (1) manual `docker build`/push + restart, (2) `az acr build` + ACR-webhook continuous deployment, (3) GitHub Actions build-push-deploy, (4) Azure DevOps Pipelines.
- Within a one-week budget, option 1 (~0 setup) is fine for the first deploys; option 2 (~0.5–1 h setup) removes the "restart the app" step for roughly zero extra credential surface; option 3 (~2 h with publish-profile, ~half a day with OIDC) is the standard end-state since the repo already lives on GitHub.
- Option 4 (Azure DevOps) adds an org, billing linkage for the free parallel-job grant, and a service connection — meaningful overhead with no benefit here because the repo is on GitHub, not Azure Repos.
- For GitHub Actions auth, OIDC federated credentials are Microsoft's recommended method (no long-lived secret); publish-profile is the fastest but requires SCM basic auth enabled; a service-principal client secret is the legacy middle ground.
- The main work-tenant risks: app-registration creation disabled (blocks the Entra-app OIDC route — a user-assigned managed identity sidesteps it), Conditional Access on workload identities (can block SP sign-ins from GitHub's runner IPs), basic-auth-disabled policy (breaks publish-profile and the ACR webhook), and Azure DevOps PAT/parallelism policies.
- Actions pricing: free on public repos (standard runners); private repos get 2,000 free minutes/month on the Free plan, then $0.006/min Linux. ACR quick tasks bill $0.0001/second of build time.

## Option 1 — Manual: docker build + push to ACR, restart the Web App

**Flow:** `docker build` locally (or `az acr build`, see option 2), `docker push` to ACR, then the Web App picks up the image. Without continuous deployment enabled, the app does **not** pull a new image on its own — you must trigger a pull by restarting the web app ([Learn: custom-container tutorial](https://learn.microsoft.com/azure/app-service/tutorial-custom-container) — "If you don't complete this step, you must manually trigger an image pull by restarting the web app"). Pointing the app at the image/registry is `az webapp config container set` ([Learn: deploy-ci-cd-custom-container](https://learn.microsoft.com/azure/app-service/deploy-ci-cd-custom-container#automate-with-cli)).

- **Setup time:** ~zero beyond having Docker + Azure CLI locally and the Web App already configured to pull the image.
- **Credentials:** your own `az login` (interactive Entra sign-in) for push; the Web App itself should pull via managed identity with `AcrPull`, or via registry admin username/password stored in app settings ([Learn: tutorial-custom-container](https://learn.microsoft.com/azure/app-service/tutorial-custom-container#configure-the-web-app); [Learn: deploy-ci-cd-custom-container](https://learn.microsoft.com/azure/app-service/deploy-ci-cd-custom-container#automate-with-cli)). Nothing new lives in GitHub.
- **Cost:** none beyond the ACR SKU and App Service plan (SKU features/limits: [Learn: container-registry-skus](https://learn.microsoft.com/azure/container-registry/container-registry-skus)).
- **When it's actually fine:** solo developer, low deploy frequency, first week of the project, or whenever you're iterating on infrastructure rather than code. The cost is per-deploy human time (build + push + restart each time) and no audit trail of what was deployed. Reasonable to start here and layer option 2 or 3 on later — they're additive, not exclusive.

## Option 2 — `az acr build` + Web App continuous deployment from ACR

**Build side:** `az acr build --registry <acr> --image app:v1 .` uploads the build context and runs `docker build` in Azure (an ACR Tasks *quick task*), pushing to the registry on success — no local Docker needed, no Dockerfile changes ([Learn: container-registry-quickstart-task-cli](https://learn.microsoft.com/azure/container-registry/container-registry-quickstart-task-cli); [Learn: container-registry-tasks-overview](https://learn.microsoft.com/azure/container-registry/container-registry-tasks-overview#quick-tasks)).

**Deploy side:** enable continuous deployment on the app and register an ACR webhook. When you push the image, the registry POSTs to the app's SCM webhook endpoint; App Service restarts the app and runs `docker pull` for the updated image ([Learn: deploy-ci-cd-custom-container](https://learn.microsoft.com/azure/app-service/deploy-ci-cd-custom-container#enable-ci-cd)):

```
ci_cd_url=$(az webapp deployment container config --name <app> --resource-group <rg> --enable-cd true --query CI_CD_URL -o tsv)
az acr webhook create --name <hook> --registry <acr> --resource-group <rg> --actions push --uri $ci_cd_url --scope '<image>:<tag>'
```

([Learn: deploy-ci-cd-custom-container, Automate with CLI](https://learn.microsoft.com/azure/app-service/deploy-ci-cd-custom-container#automate-with-cli))

- **Setup time:** ~30–60 minutes (two CLI commands plus verifying the webhook fires) — estimate.
- **Credentials:** your `az login` for builds; webhook auth rides on the app's publishing credentials — **Basic Auth Publishing Credentials must be enabled** on the app or the webhook gets 401 ([Learn: deploy-ci-cd-custom-container](https://learn.microsoft.com/azure/app-service/deploy-ci-cd-custom-container#enable-ci-cd)). No secrets in GitHub at all.
- **Cost:** ACR Tasks compute is billed at $0.0001/second of task run time ([Learn: key-concept-continuous-patching, Pricing](https://learn.microsoft.com/azure/container-registry/key-concept-continuous-patching#pricing) — "the default ACR Task pricing of $0.0001/second"); a 5-minute build is ~$0.03. Registry SKU (Basic is the cost-optimized entry tier with webhooks included) per [Learn: container-registry-skus](https://learn.microsoft.com/azure/container-registry/container-registry-skus).
- **Limits/caveats:**
  - The redeploy is triggered by *image push*, not by *git push* — CI (tests, lint) doesn't exist in this path; `az acr build` is still a manual command unless you add an ACR task with a git trigger (which needs a GitHub PAT: [Learn: container-registry-tutorial-base-image-update](https://learn.microsoft.com/azure/container-registry/container-registry-tutorial-base-image-update#create-a-task)).
  - Pin a `:tag` scope on the webhook; with Docker Compose/multi-container, the webhook is registry-scoped and any push restarts the app ([Learn: deploy-ci-cd-custom-container](https://learn.microsoft.com/azure/app-service/deploy-ci-cd-custom-container#enable-ci-cd)).
  - If the work tenant enforces basic-auth-disabled on App Service, the webhook path breaks ([Learn: configure-basic-auth-disable](https://learn.microsoft.com/azure/app-service/configure-basic-auth-disable)).
  - If the registry has ABAC repository permissions enabled, `az acr build` needs `--source-acr-auth-id [caller]` ([Learn: container-registry-quickstart-task-cli](https://learn.microsoft.com/azure/container-registry/container-registry-quickstart-task-cli#build-and-push-image-from-a-dockerfile)).

**Fit for one week:** the best effort-to-payoff ratio after manual. `az acr build` also solves "no Docker locally" and slow uplink pushes.

## Option 3 — GitHub Actions: build-push-deploy

Microsoft's documented workflow for containers on App Service: `azure/login` → `docker/login-action` against ACR → build & push (either `docker build`/`docker push` steps or `docker/build-push-action`) → `azure/webapps-deploy@v2` with `images: <acr>.azurecr.io/<image>:${{ github.sha }}` ([Learn: deploy-container-github-action](https://learn.microsoft.com/azure/app-service/deploy-container-github-action)). App Service's Deployment Center can also generate and commit this workflow for you, including a user-assigned-identity OIDC setup ([Learn: deploy-github-actions](https://learn.microsoft.com/azure/app-service/deploy-github-actions#set-up-github-actions-deployment-from-deployment-center)).

### Auth choices, compared

| | OIDC federated credential | Publish profile | SP client secret |
|---|---|---|---|
| Secret stored in GitHub | None that's sensitive — `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` are identifiers, not secrets ([Learn](https://learn.microsoft.com/azure/app-service/deploy-container-github-action#configure-the-github-secret-for-authentication)) | Full publish profile XML as `AZURE_WEBAPP_PUBLISH_PROFILE` secret ([Learn](https://learn.microsoft.com/azure/app-service/deploy-container-github-action#configure-the-github-secret-for-authentication)) | `AZURE_CREDENTIALS` JSON incl. long-lived client secret ([Learn](https://learn.microsoft.com/azure/app-service/deploy-container-github-action#configure-the-github-secret-for-authentication)) |
| Entra work needed | App registration + federated credential, **or** user-assigned managed identity + federated credential | None | App registration + client secret + role assignment |
| Rotation burden | None (short-lived tokens) | Reset if leaked; breaks if basic auth disabled | Secret expiry/rotation |
| Microsoft's position | Recommended ([Learn: deploy-github-actions](https://learn.microsoft.com/azure/app-service/deploy-github-actions#manually-set-up-a-github-actions-workflow) — "We recommend that you use OpenID Connect") | Fastest, least secure posture | Legacy |

Registry auth for the docker push is separate: the documented flow stores ACR admin `REGISTRY_USERNAME`/`REGISTRY_PASSWORD` as GitHub secrets ([Learn: deploy-container-github-action](https://learn.microsoft.com/azure/app-service/deploy-container-github-action#configure-github-secrets-for-your-registry)); alternatively, after `azure/login` you can run `az acr login`/`az acr build` under the federated identity with `AcrPush`, avoiding registry passwords entirely (ACR Tasks integrates with a service-principal `az login`: [Learn: container-registry-tasks-overview](https://learn.microsoft.com/azure/container-registry/container-registry-tasks-overview#quick-tasks)).

### What OIDC requires in Entra (and whether IT is needed)

Workflow side: `permissions: id-token: write` plus `azure/login` with client/tenant/subscription IDs ([GitHub Docs: OIDC in Azure](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure)).

Entra side, two routes:

1. **App registration route:** register an app, assign it an Azure role (e.g., Website Contributor + AcrPush), then add a federated credential under Certificates & secrets → Federated credentials, scenario "GitHub Actions deploying Azure resources", specifying org, repo, and entity type (branch/environment/tag/PR). Subject must **exactly** match the workflow trigger — no pattern matching for branches/tags ([Learn: workload-identity-federation-create-trust](https://learn.microsoft.com/entra/workload-id/workload-identity-federation-create-trust#configure-a-federated-identity-credential-on-an-app)).
   - **IT involvement:** anyone who can create an app registration and add a secret can add a federated credential. But if the tenant sets **"Users can register applications" = No**, you cannot create the app registration or the federated credential yourself — an admin in the Application Administrator role (or an Application Owner) must do it ([Learn: workload-identity-federation-considerations](https://learn.microsoft.com/entra/workload-id/workload-identity-federation-considerations)). Max 20 federated credentials per app; issuer+subject must be unique on the app (same source).
2. **User-assigned managed identity route:** create a UAMI, assign it the role, and configure the federated credential *on the managed identity resource* — this is Azure resource management (subscription RBAC), not an Entra directory operation, so it typically avoids the app-registration policy entirely ([Learn: deploy-container-github-action, Option 2](https://learn.microsoft.com/azure/app-service/deploy-container-github-action#option-2-use-a-user-assigned-managed-identity); [Learn: workload-identity-federation-create-trust-user-assigned-managed-identity](https://learn.microsoft.com/entra/workload-id/workload-identity-federation-create-trust-user-assigned-managed-identity)). This is what Deployment Center automates; it needs permission to assign the Website Contributor role on the app ([Learn: deploy-github-actions](https://learn.microsoft.com/azure/app-service/deploy-github-actions#set-up-github-actions-deployment-from-deployment-center)).

### Cost (GitHub Actions)

- **Public repo:** free on standard GitHub-hosted runners ([GitHub Docs: Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)).
- **Private repo:** GitHub Free includes 2,000 minutes/month + 500 MB artifact storage; Pro 3,000 min/1 GB; Team 3,000 min/2 GB; Enterprise Cloud 50,000 min/50 GB. Overage on standard Linux runners is $0.006/minute ([GitHub Docs: Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)). A ~6-minute Docker build/deploy run fits ~300 runs/month in the free private allowance.

- **Setup time:** ~1–2 hours with publish-profile; ~half a day for the full OIDC + ACR flow including Entra setup (estimates). Deployment Center's generated workflow shortcuts much of it.
- **Note:** repositories created after July 15, 2026 get an immutable OIDC subject claim format including owner/repo IDs — this repo predates that, but subject-claim exactness still applies ([GitHub Docs: OIDC in Azure](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure)).

**Fit for one week:** the standard destination. Publish-profile day one, upgrade to OIDC when/if the app moves into a locked-down tenant, is a defensible sequence — but see blockers below.

## Option 4 — Azure DevOps Pipelines

Equivalent flow exists and is documented: an Azure Pipelines YAML with Docker build/push to ACR and a Web App for Containers deploy task ([Learn: webapp-on-container-linux](https://learn.microsoft.com/azure/devops/pipelines/targets/webapp-on-container-linux), linked from [deploy-ci-cd-custom-container](https://learn.microsoft.com/azure/app-service/deploy-ci-cd-custom-container)). The `AzureWebApp` task works even with basic auth disabled ([Learn: configure-basic-auth-disable](https://learn.microsoft.com/azure/app-service/configure-basic-auth-disable#deploy-without-basic-authentication)).

- **Credentials:** an Azure Resource Manager *service connection* stored in the ADO org (workload identity federation recommended; secret-based SP connections are managed via the ADO portal — [Learn: connect-to-azure](https://learn.microsoft.com/azure/devops/pipelines/library/connect-to-azure)); plus a GitHub connection to pull the repo.
- **Cost / free tier:** free tier for **private projects** is one Microsoft-hosted parallel job, max 60 min/job, 1,800 min (30 h)/month — and the grant only activates after you **link a valid Azure subscription for billing** ([Learn: concurrent-jobs](https://learn.microsoft.com/azure/devops/pipelines/licensing/concurrent-jobs); [Learn: hosted agents](https://learn.microsoft.com/azure/devops/pipelines/agents/hosted#capabilities-and-limitations)). Without the grant, pipelines fail with "No hosted parallelism has been purchased or granted" ([Learn: troubleshoot-start](https://learn.microsoft.com/azure/devops/pipelines/troubleshooting/troubleshoot-start#parallel-job-limits---no-available-agents-or-you-have-hit-your-free-limits)). **Public projects are retired** — no new ones, existing ones convert to private by 2027 ([Learn: hosted agents](https://learn.microsoft.com/azure/devops/pipelines/agents/hosted#capabilities-and-limitations)), so there is no ADO "free because public" path anymore.
- **Setup time:** ~1 day including org creation, billing linkage for the parallelism grant, service connection, GitHub repo connection, and pipeline YAML (estimate).
- **When it makes sense over GitHub Actions:** the org already lives in Azure DevOps (Boards/Repos/existing service connections and approvals), compliance requires ADO environments/gates, or Actions is blocked by policy. **This repo is already on GitHub**, so ADO would mean cross-connecting GitHub → ADO and maintaining a second system for zero functional gain. Not a sensible first choice within a one-week budget.

## Work-tenant policies that could block each path

- **App registration disabled for users** ("Users can register applications" = No): blocks self-service creation of the Entra app and its federated credential (options 3-OIDC and 3-SP-secret via app registration); requires an Application Administrator or app owner ([Learn: workload-identity-federation-considerations](https://learn.microsoft.com/entra/workload-id/workload-identity-federation-considerations)). Mitigation: the UAMI route (Azure RBAC only) ([Learn: deploy-container-github-action](https://learn.microsoft.com/azure/app-service/deploy-container-github-action#option-2-use-a-user-assigned-managed-identity)).
- **Conditional Access for workload identities**: tenants with Workload Identities Premium can scope location-based (block outside known public IP ranges) or risk-based block policies to single-tenant service principals ([Learn: workload-identity CA](https://learn.microsoft.com/entra/identity/conditional-access/workload-identity)). GitHub-hosted runners have no fixed IPs, so a location-scoped policy on the deploy SP would block CI sign-ins (both OIDC and secret auth — the policy applies at token request). Managed identities are *not* covered by these policies (same source).
- **Basic auth disabled on App Service** (common hardening, enforceable via custom role/policy): kills the publish-profile method and the ACR CD webhook; GitHub Actions must then use OIDC/SP and ADO must use the `AzureWebApp` task ([Learn: configure-basic-auth-disable](https://learn.microsoft.com/azure/app-service/configure-basic-auth-disable#deploy-without-basic-authentication)).
- **OIDC subject restrictions**: federated credential issuer/subject/audience must match the GitHub token case-sensitively and exactly; a mismatch fails silently (no error, just no token) ([Learn: workload-identity-federation-considerations](https://learn.microsoft.com/entra/workload-id/workload-identity-federation-considerations)). GitHub enterprises can customize subject claims, which changes what the Entra credential must contain ([GitHub Docs: OIDC in Azure](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure)).
- **Azure DevOps-specific**: tenant admins can restrict PAT creation via organization policies ([Learn: manage-pats-with-policies-for-administrators](https://learn.microsoft.com/azure/devops/organizations/accounts/manage-pats-with-policies-for-administrators)), and the parallelism grant depends on billing being linked to a subscription you may not control ([Learn: concurrent-jobs](https://learn.microsoft.com/azure/devops/pipelines/licensing/concurrent-jobs#how-do-i-enable-the-free-tier-of-parallel-jobs)).
- **ACR admin account disabled** (common policy): forces managed-identity/Entra auth for both the Web App's pull and CI's push instead of `REGISTRY_USERNAME`/`REGISTRY_PASSWORD` — the managed-identity pull path is the documented default anyway ([Learn: tutorial-custom-container](https://learn.microsoft.com/azure/app-service/tutorial-custom-container#configure-the-web-app)).

## Sizing against the one-week budget (non-final)

| Option | Setup | Per-deploy effort | New secrets | Week-1 fit |
|---|---|---|---|---|
| 1. Manual | ~0 | 5–10 min human | none | Fine to start |
| 2. `az acr build` + webhook | ~1 h | 1 command | none (webhook uses publishing creds) | Best ratio |
| 3. GH Actions (publish profile) | ~1–2 h | git push | 1 GitHub secret | Good |
| 3. GH Actions (OIDC) | ~0.5 day | git push | 3 non-sensitive IDs | Standard end-state |
| 4. Azure DevOps | ~1 day | git push | service connection + GH link | Not justified (repo on GitHub) |

## Sources

- https://learn.microsoft.com/azure/app-service/deploy-ci-cd-custom-container — CD from ACR/Docker Hub, webhook mechanics, basic-auth requirement, CLI automation
- https://learn.microsoft.com/azure/app-service/tutorial-custom-container — managed-identity pull, restart-to-pull behavior
- https://learn.microsoft.com/azure/container-registry/container-registry-quickstart-task-cli — `az acr build` quick task
- https://learn.microsoft.com/azure/container-registry/container-registry-tasks-overview — ACR Tasks concepts, CI integration
- https://learn.microsoft.com/azure/container-registry/container-registry-tutorial-base-image-update — git-triggered ACR tasks need a PAT
- https://learn.microsoft.com/azure/container-registry/key-concept-continuous-patching — ACR Task pricing $0.0001/sec
- https://learn.microsoft.com/azure/container-registry/container-registry-skus — ACR SKU features/limits
- https://learn.microsoft.com/azure/app-service/deploy-container-github-action — container workflow, all three auth methods, registry secrets
- https://learn.microsoft.com/azure/app-service/deploy-github-actions — Deployment Center generated workflows, OIDC recommendation
- https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure — id-token permission, azure/login, subject-claim notes
- https://docs.github.com/en/billing/concepts/product-billing/github-actions — Actions pricing, free minutes per plan
- https://learn.microsoft.com/entra/workload-id/workload-identity-federation-create-trust — federated credential setup on an app
- https://learn.microsoft.com/entra/workload-id/workload-identity-federation-create-trust-user-assigned-managed-identity — federated credential on a UAMI
- https://learn.microsoft.com/entra/workload-id/workload-identity-federation-considerations — who can create federated credentials, subject-match rules, limits
- https://learn.microsoft.com/entra/identity/conditional-access/workload-identity — Conditional Access for service principals, Workload ID Premium
- https://learn.microsoft.com/azure/app-service/configure-basic-auth-disable — what breaks when basic auth is off
- https://learn.microsoft.com/azure/devops/pipelines/licensing/concurrent-jobs — ADO free tier (1 job, 60 min, 1,800 min/mo, billing linkage)
- https://learn.microsoft.com/azure/devops/pipelines/agents/hosted — hosted agent limits, public-project retirement
- https://learn.microsoft.com/azure/devops/pipelines/troubleshooting/troubleshoot-start — "no hosted parallelism" failure
- https://learn.microsoft.com/azure/devops/pipelines/targets/webapp-on-container-linux — ADO container deploy to Web App
- https://learn.microsoft.com/azure/devops/pipelines/library/connect-to-azure — ARM service connections
- https://learn.microsoft.com/azure/devops/organizations/accounts/manage-pats-with-policies-for-administrators — tenant PAT restrictions
