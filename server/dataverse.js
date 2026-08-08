// Dataverse Web API client for the BFF (ADR-0001, ADR-0002).
// Token acquisition is isolated here on purpose: the stage-2 upgrade to a
// federated identity credential (ADR-0002) replaces only getToken().
import { ConfidentialClientApplication } from "@azure/msal-node";

const { DATAVERSE_URL, TENANT_ID, CLIENT_ID, CLIENT_SECRET } = process.env;

export function isConfigured() {
  return Boolean(DATAVERSE_URL && TENANT_ID && CLIENT_ID && CLIENT_SECRET);
}

let cca;
async function getToken() {
  cca ??= new ConfidentialClientApplication({
    auth: {
      clientId: CLIENT_ID,
      authority: `https://login.microsoftonline.com/${TENANT_ID}`,
      clientSecret: CLIENT_SECRET,
    },
  });
  const result = await cca.acquireTokenByClientCredential({
    scopes: [`${DATAVERSE_URL}/.default`],
  });
  return result.accessToken;
}

// GET an OData path (e.g. "cr_orders?$select=..."), following @odata.nextLink
// pages and honoring 429 Retry-After — all viewers share one service-protection
// bucket, so throttle handling lives here and nowhere else.
export async function query(path, { maxPageSize = 5000, fetchImpl = fetch, tokenProvider = getToken } = {}) {
  const token = await tokenProvider();
  let url = `${DATAVERSE_URL}/api/data/v9.2/${path}`;
  const rows = [];
  while (url) {
    const res = await fetchWithRetry(url, token, maxPageSize, fetchImpl);
    const body = await res.json();
    rows.push(...(body.value ?? []));
    url = body["@odata.nextLink"] ?? null;
  }
  return rows;
}

async function fetchWithRetry(url, token, maxPageSize, fetchImpl, attempt = 0) {
  const res = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Prefer: `odata.maxpagesize=${maxPageSize}`,
    },
  });
  if (res.status === 429 && attempt < 3) {
    const waitSec = Number(res.headers.get("Retry-After")) || 2 ** attempt;
    await new Promise((r) => setTimeout(r, waitSec * 1000));
    return fetchWithRetry(url, token, maxPageSize, fetchImpl, attempt + 1);
  }
  if (!res.ok) throw new Error(`Dataverse ${res.status}: ${await res.text()}`);
  return res;
}
