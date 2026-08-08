# Dataverse-to-Azure-Web-App

Internal operations dashboard over Microsoft Dataverse: React + Apache ECharts
frontend, Express BFF, one container image, Azure Web App for Containers.

- **Architecture**: locked in [plans/architecture/DECISIONS.md](plans/architecture/DECISIONS.md) (ADR-0001…0005)
- **Research & options**: [docs/options-atlas.md](docs/options-atlas.md)
- **Access/IT checklist**: atlas §6.1 — items A–C (app registration, application user, security role) and E (Easy Auth)

## Run locally

```sh
npm install && (cd client && npm install)
npm run dev            # BFF on :8080
cd client && npm run dev   # Vite on :5173, proxies /api → :8080
```

No `.env` → **mock mode**: the dashboard renders sample data shaped like the
[synthetic table configurations](wayfinder/research/006-sample-table-configurations.md).
Copy `.env.example` to `.env` and fill the four Dataverse values to go live, then
edit the `<EDIT>` markers in [server/provider.js](server/provider.js) to your real
table/column names.

## Test

```sh
npm test
```

## Build & deploy (manual rung, per current CI/CD posture)

```sh
az acr build --registry <acr-name> --image dashboard:latest .   # cloud build, no local Docker
az webapp restart --name <app-name> --resource-group <rg>        # pull the new image
```

Web App settings that matter: `WEBSITES_PORT=8080`, the four Dataverse env vars,
managed identity with **AcrPull** on the registry (`acrUseManagedIdentityCreds=true`),
Easy Auth on with the viewer group assigned (ADR-0003).
