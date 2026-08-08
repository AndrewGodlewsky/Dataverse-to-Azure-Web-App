// The one runnable check per non-trivial path: aggregation, cache TTL, paging+429.
import test from "node:test";
import assert from "node:assert/strict";
import { summarize, revenueByMonth, revenueByCategory } from "./provider.js";
import { cached, clearCache } from "./cache.js";
import { query } from "./dataverse.js";

const orders = [
  { category: "A", month: "2026-01", total: 100, accountId: 1, open: true },
  { category: "A", month: "2026-02", total: 50, accountId: 2, open: false },
  { category: "B", month: "2026-01", total: 25, accountId: 1, open: false },
];

test("summarize totals and filters by category", () => {
  assert.deepEqual(summarize(orders, null), { totalRevenue: 175, orderCount: 3, openOrders: 1, accounts: 2 });
  assert.equal(summarize(orders, "A").totalRevenue, 150);
});

test("revenueByMonth sorts months; revenueByCategory sorts descending", () => {
  assert.deepEqual(revenueByMonth(orders, null).map((r) => r.month), ["2026-01", "2026-02"]);
  assert.deepEqual(revenueByCategory(orders).map((r) => r.category), ["A", "B"]);
});

test("cache returns same value inside TTL, recomputes after", async () => {
  clearCache();
  let calls = 0;
  const fn = () => ++calls;
  assert.equal(cached("k", 60_000, fn), 1);
  assert.equal(cached("k", 60_000, fn), 1);
  assert.equal(cached("k2", -1, fn), 2); // already expired
  assert.equal(cached("k2", -1, fn), 3);
});

test("query follows nextLink and honors 429 Retry-After", async () => {
  process.env.DATAVERSE_URL ??= "https://example.crm.dynamics.com";
  let call = 0;
  const pages = {
    first: { value: [{ id: 1 }], "@odata.nextLink": "https://example.crm.dynamics.com/api/data/v9.2/page2" },
    second: { value: [{ id: 2 }] },
  };
  const fetchImpl = async (url) => {
    call++;
    if (call === 1) return { ok: true, status: 200, json: async () => pages.first };
    if (call === 2)
      return { ok: false, status: 429, headers: { get: () => "0" }, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => pages.second };
  };
  const rows = await query("cr_orders", { fetchImpl, tokenProvider: async () => "test-token" });
  assert.deepEqual(rows.map((r) => r.id), [1, 2]);
  assert.equal(call, 3, "429 page was retried");
});
