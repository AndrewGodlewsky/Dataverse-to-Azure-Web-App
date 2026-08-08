// Sample data shaped like the synthetic configurations (wayfinder/research/006):
// config B's Category→Order spine and config D's OrgUnit tree. Deterministic
// (seeded) so charts and tests are stable. Served whenever Dataverse env vars
// are absent, so the dashboard renders before any credentials exist.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CATEGORIES = [
  "Industrial Pumps", "Centrifugal", "Seals & Gaskets",
  "Valves", "Motors & Drives", "Instrumentation",
];

// 24 months of orders across categories and accounts.
export function buildOrders(seed = 42) {
  const rand = mulberry32(seed);
  const orders = [];
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 23, 1);
  for (let m = 0; m < 24; m++) {
    const month = new Date(start.getFullYear(), start.getMonth() + m, 1);
    for (const [ci, category] of CATEGORIES.entries()) {
      // per-category base volume + mild seasonality + noise
      const base = 8 + ci * 3;
      const count = Math.round(base * (1 + 0.25 * Math.sin((m + ci) / 3)) + rand() * 4);
      for (let i = 0; i < count; i++) {
        orders.push({
          category,
          month: month.toISOString().slice(0, 7),
          total: Math.round((150 + rand() * 4800) * 100) / 100,
          accountId: Math.floor(rand() * 40),
          open: rand() < 0.18,
        });
      }
    }
  }
  return orders;
}

export const ORG_TREE = {
  name: "Operations",
  children: [
    {
      name: "Manufacturing",
      children: [
        { name: "Plant A", children: [{ name: "Line 1" }, { name: "Line 2" }] },
        { name: "Plant B", children: [{ name: "Line 3" }] },
      ],
    },
    {
      name: "Field Services",
      children: [
        { name: "North Region", children: [{ name: "Crew N1" }, { name: "Crew N2" }] },
        { name: "South Region", children: [{ name: "Crew S1" }] },
      ],
    },
    { name: "Quality", children: [{ name: "Inspection" }, { name: "Compliance" }] },
  ],
};
