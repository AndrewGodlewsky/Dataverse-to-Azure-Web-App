# Mission: Run the Dataverse → Azure dashboard without an agent

## Why

The dashboard is built and verified locally but has never been deployed, and every
architectural decision inside it was made by an agent. You want to provision the Azure
side, point it at real Dataverse tables, deploy it, and fix it when it breaks — reading
the portal, the CLI and the code yourself instead of directing an assistant.

## Success looks like

- Provision the registry, plan and Web App from the CLI and explain every flag you typed
- Trace a failing request across Easy Auth → BFF → Dataverse and name the layer that broke
- Open `server/dataverse.js` and `server/provider.js` and change them unaided
- Answer "why live and not a copy?" using the two ceilings and your own row counts
- Ship a new image and know why the running app didn't change until it restarted
- Hand IT the access request and answer their follow-up questions yourself

## Constraints

- Sessions of 30–45 minutes
- Starting from zero on **both** Azure and Dataverse — no vocabulary assumed
- Windows + PowerShell; `az` CLI is the primary tool; Docker Desktop optional
- Azure resources are not provisioned yet, so early lessons must work without them
- Git commits are yours alone — lessons never commit anything

## Out of scope

- The copy branch (Synapse Link, Fabric) beyond recognising when the tripwire fires
- Per-user on-behalf-of auth — the app reads at app level by decision (ADR-0003)
- Power BI, ruled out at framing time by the custom-interactivity requirement
- Deep React or ECharts authoring beyond changing what this dashboard already renders
