// One data-provider interface, two implementations: mock (no env vars) and
// live Dataverse (ADR-0001). Routes never know which one answered.
import { cached } from "./cache.js";
import * as dv from "./dataverse.js";
import { CATEGORIES, buildOrders, ORG_TREE } from "./mock-data.js";

const TTL = (Number(process.env.CACHE_TTL_SECONDS) || 60) * 1000;

// ---------- shared aggregation (works on mock rows and on live rows mapped
// to the same {category, month, total, accountId, open} shape) ----------
export function summarize(orders, category) {
  const rows = category ? orders.filter((o) => o.category === category) : orders;
  return {
    totalRevenue: Math.round(rows.reduce((s, o) => s + o.total, 0)),
    orderCount: rows.length,
    openOrders: rows.filter((o) => o.open).length,
    accounts: new Set(rows.map((o) => o.accountId)).size,
  };
}

export function revenueByMonth(orders, category) {
  const rows = category ? orders.filter((o) => o.category === category) : orders;
  const byMonth = new Map();
  for (const o of rows) byMonth.set(o.month, (byMonth.get(o.month) ?? 0) + o.total);
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month, total: Math.round(total) }));
}

export function revenueByCategory(orders) {
  const byCat = new Map();
  for (const o of orders) byCat.set(o.category, (byCat.get(o.category) ?? 0) + o.total);
  return [...byCat.entries()]
    .map(([category, total]) => ({ category, total: Math.round(total) }))
    .sort((a, b) => b.total - a.total);
}

// ---------- mock ----------
const mockOrders = () => cached("mock-orders", Infinity, () => buildOrders());

const mock = {
  mode: "mock",
  categories: async () => CATEGORIES,
  summary: async (category) => summarize(mockOrders(), category),
  revenue: async (category) => revenueByMonth(mockOrders(), category),
  categoryTotals: async () => revenueByCategory(mockOrders()),
  orgTree: async () => ORG_TREE,
};

// ---------- live Dataverse ----------
// EDIT HERE for your real tables: replace the entity set / column names below.
// Fetching rows and aggregating in the BFF keeps every query far from the 50k
// aggregate cap for the expected volumes (ADR-0001); revisit if row counts grow.
async function liveOrders() {
  return cached("live-orders", TTL, async () => {
    const rows = await dv.query(
      // <EDIT>: your order table + columns
      "cr_orders?$select=cr_category,cr_orderdate,cr_total,_cr_account_value,statuscode"
    );
    return rows.map((r) => ({
      category: r.cr_category ?? "Uncategorized",
      month: (r.cr_orderdate ?? "").slice(0, 7),
      total: r.cr_total ?? 0,
      accountId: r._cr_account_value,
      open: r.statuscode === 1, // <EDIT>: your "open" status value
    }));
  });
}

const live = {
  mode: "live",
  categories: async () => revenueByCategory(await liveOrders()).map((c) => c.category),
  summary: async (category) => summarize(await liveOrders(), category),
  revenue: async (category) => revenueByMonth(await liveOrders(), category),
  categoryTotals: async () => revenueByCategory(await liveOrders()),
  orgTree: async () =>
    cached("live-orgtree", TTL, async () => {
      // <EDIT>: your org-unit table; parent lookup gives the tree shape.
      const units = await dv.query(
        "cr_orgunits?$select=cr_name,cr_orgunitid,_cr_parent_value"
      );
      const byId = new Map(
        units.map((u) => [u.cr_orgunitid, { name: u.cr_name, children: [] }])
      );
      let root = null;
      for (const u of units) {
        const node = byId.get(u.cr_orgunitid);
        const parent = byId.get(u._cr_parent_value);
        if (parent) parent.children.push(node);
        else root ??= node;
      }
      return root ?? { name: "No org data", children: [] };
    }),
};

export const provider = dv.isConfigured() ? live : mock;
