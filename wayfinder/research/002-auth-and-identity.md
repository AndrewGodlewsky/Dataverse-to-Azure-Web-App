# 002 — Auth & Identity: App-to-Dataverse and Viewer-to-App

> Research ticket resolution. Primary sources only (Microsoft Learn). Researched 2026-08-07.
> Context (fixed): containerized React dashboard + Node BFF on Azure Web App for Containers, internal viewers in a work tenant. Live and copy branches are both first-class; nothing here is a final recommendation.

## Executive summary

Server side: the BFF authenticates to Dataverse as an Entra ID **app registration** bound to an unlicensed Dataverse **application user** carrying a custom security role — no delegated API permissions and no license are needed for this S2S path ([Connect as an app](https://learn.microsoft.com/power-apps/developer/data-platform/authenticate-oauth#connect-as-an-app)). Credentials, in ascending robustness: client secret (fastest, expires), certificate, or **managed identity** — Dataverse's admin center now accepts a managed identity's Application ID directly when creating the application user, and the FIC (federated identity credential) route lets an app registration trust the App Service's user-assigned managed identity with zero stored secrets ([Manage application users](https://learn.microsoft.com/power-platform/admin/manage-application-users#create-an-application-user), [Configure an app to trust a managed identity](https://learn.microsoft.com/entra/workload-id/workload-identity-federation-config-app-trust-managed-identity)). The Node BFF acquires tokens with MSAL Node's client-credentials flow against scope `https://<org>.crm.dynamics.com/.default`. Viewer side: **App Service Easy Auth** with the Entra provider is the near-zero-code option — it gates the whole site and injects identity into the container via `X-MS-CLIENT-PRINCIPAL*` headers ([Work with user identities](https://learn.microsoft.com/azure/app-service/configure-authentication-user-identities)); in-app MSAL (React + Node) costs more setup but is required if you want per-user Dataverse calls via the **on-behalf-of** flow, which also moves each viewer into their own 6k req/5-min service-protection bucket. The full IT request package is a copy-pasteable section below.

---

## Part 1 — App → Dataverse (server-to-server)

### 1.1 Entra ID app registration requirements

- **Account type:** single tenant — "Accounts in this organizational directory only". No redirect URI is needed for a daemon/S2S client. ([Single-tenant S2S walkthrough](https://learn.microsoft.com/power-apps/developer/data-platform/use-single-tenant-server-server-authentication#azure-application-registration))
- **API permissions: none required for S2S.** The Dynamics CRM `user_impersonation` **delegated** permission is only for apps where a signed-in user performs operations. Microsoft's docs are explicit: "If your app uses Server-to-Server (S2S) authentication, you don't need to complete this step" and "You don't need to grant the **Access Dynamics 365 as organization users** permission" — the application is bound to a specific (application) user instead. ([Use OAuth with Dataverse — App registration](https://learn.microsoft.com/power-apps/developer/data-platform/authenticate-oauth#app-registration), [Connect as an app](https://learn.microsoft.com/power-apps/developer/data-platform/authenticate-oauth#connect-as-an-app))
- **Admin consent:** the S2S walkthrough has you click **Grant admin consent** on the (empty/default) API permissions page as a hygiene step; there is no delegated-permission consent to grant for the S2S path itself. ([Single-tenant S2S walkthrough](https://learn.microsoft.com/power-apps/developer/data-platform/use-single-tenant-server-server-authentication#azure-application-registration))
- Record three values for the app: **Application (client) ID**, **Directory (tenant) ID**, and the credential (secret value / cert thumbprint). ([Single-tenant S2S walkthrough](https://learn.microsoft.com/power-apps/developer/data-platform/use-single-tenant-server-server-authentication#azure-application-registration))
- If the OBO variant (Part 2.3) is ever adopted, *then* the registration additionally needs the Dataverse `user_impersonation` delegated permission + admin consent — worth noting in the IT ask so it's granted once.

### 1.2 The Dataverse application user (no license needed)

- Created in the **Power Platform admin center**: environment → **Settings → Users + permissions → Application users → + New app user** → pick the app registration → choose business unit → assign security role(s). One application user per app registration per environment. ([Manage application users — Create an application user](https://learn.microsoft.com/power-platform/admin/manage-application-users#create-an-application-user))
- It is explicitly an **unlicensed** user: "You can create an unlicensed application user in your environment" and "another benefit of this approach is that it doesn't consume a paid license." ([Manage application users](https://learn.microsoft.com/power-platform/admin/manage-application-users#create-an-application-user), [Connect as an app](https://learn.microsoft.com/power-apps/developer/data-platform/authenticate-oauth#connect-as-an-app))
- **Security role:** create a *custom* role (copy of App Opener or from scratch) granting Read on exactly the dashboard tables; every role needs the documented minimum privileges to function. ([Create or configure a custom security role](https://learn.microsoft.com/power-platform/admin/database-security-configure#create-or-configure-a-custom-security-role), [Minimum privileges](https://learn.microsoft.com/power-platform/admin/create-edit-security-role#minimum-privileges-for-common-tasks))
- **Column security (cross-finding):** the sample schema secures CreditLimit and Salary. Secured columns are readable only by system administrators unless the principal is added to a **column security profile** with Read = Allowed — so the application user must be added to a profile covering those columns, or the dashboard will see masked `********` values / no data for them. ([Column-level security to control access](https://learn.microsoft.com/power-platform/admin/field-level-security#add-teams-or-users-to-a-column-security-profile-to-control-access))

### 1.3 Credential options compared

| Option | Setup | Rotation burden | Notes |
|---|---|---|---|
| **Client secret** | Minutes (Certificates & secrets → New client secret) | Expires (typ. 1–2 years); value visible once; must be stored (App Service app setting / Key Vault) | Documented mainstream S2S path. ([Connect as an app](https://learn.microsoft.com/power-apps/developer/data-platform/authenticate-oauth#connect-as-an-app)) |
| **Certificate** | Upload .cer/.pem/.crt public key to the registration | Renewal on expiry; private key must live somewhere (Key Vault) | "Higher level of assurance" than a shared secret per MSAL docs. ([Connect as an app](https://learn.microsoft.com/power-apps/developer/data-platform/authenticate-oauth#connect-as-an-app), [MSAL Node client credentials](https://learn.microsoft.com/entra/msal/javascript/node/acquire-token-requests#client-credentials-flow)) |
| **Managed identity** | Enable on App Service; see two routes below | **None** — platform-managed, no secret ever exists | Microsoft's stated preference: "use the most secure authentication flow available… such as managed identities." ([Register an app tutorial](https://learn.microsoft.com/power-apps/developer/data-platform/walkthrough-register-app-azure-active-directory)) |

**Managed identity — verified current state (two documented routes):**

1. **Direct managed-identity application user.** The PPAC application-user flow now accepts a managed identity: "In addition to entering the Application Name or Application ID, you can also enter an **Azure Managed Identity Application ID**" (use the MI's *Application ID*, not its name). So a user-assigned managed identity on the Web App can itself be the Dataverse application user; the BFF then requests a token for `https://<org>.crm.dynamics.com/.default` from the App Service managed-identity endpoint (e.g., `@azure/identity` `ManagedIdentityCredential.getToken(...)`) with no app registration secret at all. Dataverse's app-registration tutorial lists managed identity among its supported auth flows. ([Manage application users](https://learn.microsoft.com/power-platform/admin/manage-application-users#create-an-application-user), [Register an app tutorial](https://learn.microsoft.com/power-apps/developer/data-platform/walkthrough-register-app-azure-active-directory), [App Service managed identity — token endpoint](https://learn.microsoft.com/azure/app-service/overview-managed-identity#connect-to-azure-services-in-app-code))
2. **Federated identity credential (workload identity) on an app registration.** Entra ID supports configuring an app registration to *trust* a user-assigned managed identity as its credential (FIC, audience `api://AzureADTokenExchange`): the workload exchanges its MI token for an app token via MSAL's client-assertion path. This keeps a normal app registration (useful if IT prefers registrations for governance) while eliminating secrets. Only **user-assigned** managed identities can be used as the FIC credential. ([Configure an app to trust a managed identity](https://learn.microsoft.com/entra/workload-id/workload-identity-federation-config-app-trust-managed-identity#configure-a-federated-identity-credential-on-an-application), [Workload identity federation concepts](https://learn.microsoft.com/entra/workload-id/workload-identity-federation))

Caveats: FIC changes take a few minutes to propagate (transient `AADSTS70021`; add retry logic) ([FIC considerations](https://learn.microsoft.com/entra/workload-id/workload-identity-federation-considerations#time-for-federated-credential-changes-to-propagate)). The "Power Platform managed identity" feature page is about Dataverse *plug-ins* calling Azure, i.e., the opposite direction — don't confuse it with this scenario ([Power Platform managed identity overview](https://learn.microsoft.com/power-platform/admin/managed-identity-overview)). Note that managed identity only works when running in Azure; local dev still needs a secret/cert or developer credentials (`DefaultAzureCredential` chain). ([Azure Identity credential chain](https://learn.microsoft.com/javascript/api/@azure/identity/defaultazurecredential))

### 1.4 Token acquisition from Node

- Package: `@azure/msal-node`, class `ConfidentialClientApplication`, method **`acquireTokenByClientCredential`** — "acquires a token using the confidential client application's credentials… instead of impersonating a user," exactly the middle-tier/daemon case; supports secret or certificate; MSAL caches app tokens. ([Acquire tokens in MSAL Node — Client Credentials Flow](https://learn.microsoft.com/entra/msal/javascript/node/acquire-token-requests#client-credentials-flow), [ConfidentialClientApplication](https://learn.microsoft.com/javascript/api/@azure/msal-node/confidentialclientapplication))
- Authority: `https://login.microsoftonline.com/<tenant-id>`; scope: **`https://<org>.crm.dynamics.com/.default`** (the `.default` scope resolves to the Dataverse resource for a client-credentials grant, mirroring the documented .NET pattern). ([Use OAuth with Dataverse](https://learn.microsoft.com/power-apps/developer/data-platform/authenticate-oauth), [Register an app — use in code](https://learn.microsoft.com/power-apps/developer/data-platform/walkthrough-register-app-azure-active-directory#use-an-app-registration-in-code))
- With managed identity instead of MSAL: `@azure/identity` → `ManagedIdentityCredential` / `DefaultAzureCredential` → `getToken("https://<org>.crm.dynamics.com/.default")`; App Service exposes the MI token endpoint via `IDENTITY_ENDPOINT`/`IDENTITY_HEADER`. ([App Service managed identity](https://learn.microsoft.com/azure/app-service/overview-managed-identity#connect-to-azure-services-in-app-code), [DefaultAzureCredential (JS)](https://learn.microsoft.com/javascript/api/@azure/identity/defaultazurecredential))
- Don't hardcode secrets; use App Service app settings or Key Vault references. ([MSAL Node — using secrets securely](https://learn.microsoft.com/entra/msal/javascript/node/acquire-token-requests#client-credentials-flow))

---

## Part 2 — Viewer → app (internal tenant users)

### 2.1 App Service Easy Auth (Entra provider)

- **What it is:** built-in authentication/authorization handled by the App Service platform *before* requests reach the container — "with minimal or no code"; you add the Microsoft identity provider in the portal (Settings → Authentication → Add identity provider → Microsoft), which can create the viewer-facing app registration for you, and set "Require authentication." ([Configure Entra sign-in](https://learn.microsoft.com/azure/app-service/configure-authentication-provider-aad), [EasyAuth setup steps](https://learn.microsoft.com/azure/data-api-builder/concept/security/authenticate-easy-auth#quick-reference))
- **Setup time:** minutes; zero React or Node auth code. Everyone in the tenant can sign in by default; tightening to specific users/groups uses the enterprise app's assignment requirement or the built-in authorization policies. ([Configure Entra sign-in — Authorize requests](https://learn.microsoft.com/azure/app-service/configure-authentication-provider-aad#authorize-requests))
- **What it enables:** authentication (who the viewer is) + coarse gate on the whole site. Authorization beyond "any tenant user" is your code's job, using the injected claims. ([Authorize requests](https://learn.microsoft.com/azure/app-service/configure-authentication-provider-aad#authorize-requests))

### 2.2 How Easy Auth passes identity to the container

Claims are injected as request headers on every authenticated request; **external callers cannot spoof them** ("External requests aren't allowed to set these headers, so they're present only if App Service sets them"):

| Header | Content |
|---|---|
| `X-MS-CLIENT-PRINCIPAL` | Base64-encoded JSON of all claims (`{"auth_typ","claims":[{"typ","val"}],"name_typ","role_typ"}`) — decode and read in the Node BFF |
| `X-MS-CLIENT-PRINCIPAL-ID` | Provider's identifier for the caller (object ID) |
| `X-MS-CLIENT-PRINCIPAL-NAME` | UPN/email |
| `X-MS-CLIENT-PRINCIPAL-IDP` | Identity provider name (`aad`) |
| `X-MS-TOKEN-AAD-ACCESS-TOKEN` / `X-MS-TOKEN-AAD-ID-TOKEN` | The provider tokens themselves (requires token store; needed as OBO input) |

([Work with user identities — Access user claims](https://learn.microsoft.com/azure/app-service/configure-authentication-user-identities), [Authorize requests](https://learn.microsoft.com/azure/app-service/configure-authentication-provider-aad#authorize-requests))

Notes: claims go through a default claims-mapping (e.g., `tid` → `http://schemas.microsoft.com/identity/claims/tenantid`), and header casing varies by framework — match case-insensitively in Express. ([Access user claims](https://learn.microsoft.com/azure/app-service/configure-authentication-user-identities#access-user-claims-in-app-code)) The same Easy Auth model applies to container hosting (Container Apps documents it identically, "the same authentication and authorization system as Azure App Service"). ([Container Apps authentication](https://learn.microsoft.com/azure/container-apps/authentication))

### 2.3 In-app MSAL (React `@azure/msal-browser` + Node) vs Easy Auth

- **In-app MSAL:** the SPA signs the user in (auth-code + PKCE), acquires an access token *for the BFF's registered API*, and the BFF validates the JWT. Setup is days not minutes: SPA redirect URIs, an exposed API scope on the BFF registration, token validation middleware, logout, token refresh handling. What it buys: full control of the sign-in UX, fine-grained scopes, and the token shape needed for OBO.
- **On-behalf-of (OBO) flow:** the BFF exchanges the user's incoming access token for a Dataverse token *as that user* — "propagate the delegated user identity and permissions through the request chain"; MSAL Node implements it as `acquireTokenOnBehalfOf`. OBO uses **delegated scopes only** (the Dataverse `user_impersonation` permission), never app roles. ([OAuth 2.0 On-Behalf-Of flow](https://learn.microsoft.com/entra/identity-platform/v2-oauth2-on-behalf-of-flow), [MSAL Node — OBO](https://learn.microsoft.com/entra/msal/javascript/node/acquire-token-requests#on-behalf-of-flow), [MSAL auth flows — OBO](https://learn.microsoft.com/entra/identity-platform/msal-authentication-flows#on-behalf-of-obo))
- **Hybrid worth knowing:** Easy Auth + token store already hands the container the user's access token in `X-MS-TOKEN-AAD-ACCESS-TOKEN`; if that token's audience is set up for the Dataverse delegated permission chain, the BFF can run OBO from it without any SPA-side MSAL — a middle path IT may prefer. ([Access user claims / provider tokens](https://learn.microsoft.com/azure/app-service/configure-authentication-user-identities), [OBO protocol](https://learn.microsoft.com/entra/identity-platform/v2-oauth2-on-behalf-of-flow))

### 2.4 Per-user OBO queries vs app-level access with app-enforced visibility

| Dimension | App-level (application user + BFF filters) | Per-user OBO |
|---|---|---|
| Dataverse authorization | One security role for the app user; BFF must re-implement any per-viewer visibility rules itself | Dataverse's own security roles / row ownership / column security apply per viewer — no rules duplicated in the BFF |
| Throttling (cross-finding) | **One** service-protection bucket: 6,000 requests / 20 min execution / 52 concurrent per 5-min sliding window *per user, per web server* — shared by every viewer | Limits are "evaluated for each user; each authenticated user has an independent limit" → each viewer gets their own 6k/5-min bucket ([Service protection API limits](https://learn.microsoft.com/power-apps/developer/data-platform/api-limits#how-the-system-enforces-service-protection-api-limits)) |
| Licensing / request entitlements | Application user is unlicensed; draws from tenant non-licensed pools | Requests attribute to licensed viewers' daily entitlements ([Why choose Dataverse — limits](https://learn.microsoft.com/power-apps/maker/data-platform/why-dataverse-overview#availability-and-scalability)) |
| IT footprint | App registration + application user + role (+ column profile) | All of the left, **plus** `user_impersonation` delegated permission + admin consent, **plus** every viewer needs their own Dataverse security role assignment to see anything |
| Caching | Easy — one identity means shared cache is safe | Hard — responses are viewer-specific |
| When it matters | Uniform dashboards, small viewer count, want caching | Row/column visibility must differ per viewer, or viewer count × query rate threatens the single 6k bucket |
| Copy branch (Fabric/Synapse) | OBO to Dataverse is irrelevant — access control moves to the copy store | Same |

Also note the OBO client limitation: OBO only works for user principals (an app-only token can't be exchanged), and SPAs must hand their token to a confidential client (the BFF) to run OBO — which is exactly this architecture. ([OBO — client limitations](https://learn.microsoft.com/entra/identity-platform/v2-oauth2-on-behalf-of-flow#client-limitations))

---

## IT REQUEST PACKAGE (copy-paste to IT if self-service isn't possible)

> Purpose: allow an internal read-only dashboard (Azure Web App for Containers, Node backend) to read Dataverse data server-to-server, and allow tenant users to sign in to it. No Dataverse licenses are consumed by the service account. All items are in-tenant; nothing is exposed externally.

**A. Entra ID app registration (Azure portal → Microsoft Entra ID → App registrations)**
- [ ] New registration — Name: `dataverse-dashboard-bff` (or per naming convention)
- [ ] Supported account types: **Accounts in this organizational directory only** (single tenant)
- [ ] Redirect URI: none (daemon app)
- [ ] API permissions: **none required** for server-to-server. (Only if per-user on-behalf-of access is chosen later: add **Dynamics CRM → Delegated → user_impersonation** and click **Grant admin consent**.)
- [ ] Credential — ONE of:
  - Client secret (Certificates & secrets → New client secret; 12–24 mo expiry; send us the **secret value** securely, it is shown once), or
  - Certificate (we supply the public key .cer/.pem), or
  - **Preferred — no secret:** Certificates & secrets → **Federated credentials → Add credential → scenario "Managed Identity"** → select our Web App's **user-assigned managed identity** (we will supply its name/object ID); audience `api://AzureADTokenExchange`
- [ ] Send us: **Application (client) ID** and **Directory (tenant) ID**
- *(Alternative that skips the app registration entirely: use our user-assigned managed identity's **Application ID** directly in step B.)*

**B. Dataverse application user (Power Platform admin center → environment `<ENV NAME>` → Settings → Users + permissions → Application users)**
- [ ] **+ New app user** → **+ Add an app** → select the registration from A (or paste the managed identity's **Application ID**)
- [ ] Business unit: root (default) unless advised otherwise
- [ ] Assign security role from C
- Note: this application user is **unlicensed** — it consumes no license.

**C. Custom security role (same environment → Settings → Users + permissions → Security roles)**
- [ ] Create role `Dashboard Reader` (copy of **App Opener** is a fine starting point, which includes the required minimum privileges)
- [ ] Grant **Read** (organization scope) on tables: `<LIST DASHBOARD TABLES>` — read-only; no create/write/delete needed
- [ ] Assign the role to the application user from B

**D. Column security profile (only because some dashboard columns are secured: e.g., CreditLimit, Salary)**
- [ ] Settings → Users + permissions → **Column security profiles** → New profile `Dashboard Reader Columns`
- [ ] Add the application user from B to the profile
- [ ] Column permissions: **Read = Allowed** for the secured columns `<LIST SECURED COLUMNS>`; Update/Create = Not Allowed
- Without this, secured columns return masked/blocked values to the app even with a valid security role.

**E. Viewer sign-in (Azure portal → the Web App → Settings → Authentication)** *(can be done by us if we have Contributor on the Web App)*
- [ ] Add identity provider → **Microsoft** → create new app registration (workforce tenant) → Require authentication
- [ ] Optional tightening: on the created enterprise application, set **Assignment required** and assign the viewer group `<GROUP>`

**F. Separate, larger ask — ONLY if the "copy via Microsoft Fabric" branch is chosen (flagging now, not requesting yet)**
- The Fabric link's identity (workspace identity or service principal) must be onboarded as a Dataverse application user with the **System Administrator** role, and enabling the link itself requires a System Administrator; a Fabric-side shortcut credential likewise "must have the system administrator permission." This is a materially bigger grant than A–E and needs its own approval. ([Link to Microsoft Fabric — prerequisites](https://learn.microsoft.com/power-apps/maker/data-platform/fabric-link-to-data-platform#prerequisites), [Create a Dataverse shortcut — Authorization](https://learn.microsoft.com/fabric/onelake/create-dataverse-shortcut))

*Package sources: app registration & credentials ([S2S walkthrough](https://learn.microsoft.com/power-apps/developer/data-platform/use-single-tenant-server-server-authentication#azure-application-registration), [FIC on an app](https://learn.microsoft.com/entra/workload-id/workload-identity-federation-config-app-trust-managed-identity#configure-a-federated-identity-credential-on-an-application)); application user ([Manage application users](https://learn.microsoft.com/power-platform/admin/manage-application-users#create-an-application-user)); security role ([custom security role](https://learn.microsoft.com/power-platform/admin/database-security-configure#create-or-configure-a-custom-security-role)); column profile ([column-level security](https://learn.microsoft.com/power-platform/admin/field-level-security#add-teams-or-users-to-a-column-security-profile-to-control-access)); Easy Auth ([Entra provider setup](https://learn.microsoft.com/azure/app-service/configure-authentication-provider-aad)).*

---

## Sources

1. Use OAuth authentication with Microsoft Dataverse — https://learn.microsoft.com/power-apps/developer/data-platform/authenticate-oauth
2. Use single-tenant server-to-server authentication — https://learn.microsoft.com/power-apps/developer/data-platform/use-single-tenant-server-server-authentication
3. Tutorial: Register an app with Microsoft Entra ID (Dataverse) — https://learn.microsoft.com/power-apps/developer/data-platform/walkthrough-register-app-azure-active-directory
4. Manage application users in the Power Platform admin center — https://learn.microsoft.com/power-platform/admin/manage-application-users
5. Configure user security in an environment (custom security roles) — https://learn.microsoft.com/power-platform/admin/database-security-configure
6. Create or edit a security role (minimum privileges) — https://learn.microsoft.com/power-platform/admin/create-edit-security-role
7. Column-level security to control access — https://learn.microsoft.com/power-platform/admin/field-level-security
8. Configure an application to trust a managed identity (FIC) — https://learn.microsoft.com/entra/workload-id/workload-identity-federation-config-app-trust-managed-identity
9. Workload identity federation concepts — https://learn.microsoft.com/entra/workload-id/workload-identity-federation
10. Important considerations and restrictions for federated identity credentials — https://learn.microsoft.com/entra/workload-id/workload-identity-federation-considerations
11. Power Platform managed identity overview (plug-in direction; disambiguation) — https://learn.microsoft.com/power-platform/admin/managed-identity-overview
12. Use managed identities for App Service and Azure Functions — https://learn.microsoft.com/azure/app-service/overview-managed-identity
13. Acquire tokens in MSAL Node (client credentials, OBO) — https://learn.microsoft.com/entra/msal/javascript/node/acquire-token-requests
14. ConfidentialClientApplication (@azure/msal-node) — https://learn.microsoft.com/javascript/api/@azure/msal-node/confidentialclientapplication
15. DefaultAzureCredential (@azure/identity) — https://learn.microsoft.com/javascript/api/@azure/identity/defaultazurecredential
16. Configure your App Service app to use Microsoft Entra sign-in — https://learn.microsoft.com/azure/app-service/configure-authentication-provider-aad
17. Work with user identities in App Service authentication — https://learn.microsoft.com/azure/app-service/configure-authentication-user-identities
18. Authentication and authorization in Azure Container Apps (same Easy Auth system) — https://learn.microsoft.com/azure/container-apps/authentication
19. Microsoft identity platform and OAuth 2.0 On-Behalf-Of flow — https://learn.microsoft.com/entra/identity-platform/v2-oauth2-on-behalf-of-flow
20. Service protection API limits — https://learn.microsoft.com/power-apps/developer/data-platform/api-limits
21. Microsoft Dataverse API limits overview — https://learn.microsoft.com/power-apps/maker/data-platform/api-limits-overview
22. Link to Microsoft Fabric (prerequisites; System Administrator requirement) — https://learn.microsoft.com/power-apps/maker/data-platform/fabric-link-to-data-platform
23. Create a Dataverse shortcut (delegated credential must be system administrator) — https://learn.microsoft.com/fabric/onelake/create-dataverse-shortcut
