import { useEffect, useState } from "react";
import EChart, { usePalette } from "./EChart.jsx";

const fmtUSD = (n) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}k` : `$${n}`;

function useJson(url) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    fetch(url).then((r) => r.json()).then((d) => live && setData(d));
    return () => { live = false; };
  }, [url]);
  return data;
}

export default function App() {
  const p = usePalette();
  const [category, setCategory] = useState(null);
  const qs = category ? `?category=${encodeURIComponent(category)}` : "";

  const meta = useJson("/api/meta");
  const summary = useJson(`/api/summary${qs}`);
  const revenue = useJson(`/api/revenue-by-month${qs}`);
  const catTotals = useJson("/api/category-totals");
  const orgTree = useJson("/api/org-tree");

  const ink = { primary: p["text-primary"], secondary: p["text-secondary"], muted: p["text-muted"] };
  const axisCommon = {
    axisLine: { lineStyle: { color: p["baseline"] } },
    axisLabel: { color: ink.muted, fontSize: 11 },
    axisTick: { show: false },
  };
  const tooltipCommon = {
    backgroundColor: p["surface-1"],
    borderColor: p["border"],
    textStyle: { color: ink.primary, fontSize: 12 },
  };

  // Revenue over time — single series, so no legend box; the card title names it.
  const revenueOption = revenue && {
    grid: { left: 48, right: 16, top: 16, bottom: 28 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross", label: { backgroundColor: p["baseline"] } },
      valueFormatter: fmtUSD,
      ...tooltipCommon,
    },
    xAxis: { type: "category", data: revenue.map((r) => r.month), ...axisCommon },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: p["gridline"] } },
      axisLabel: { ...axisCommon.axisLabel, formatter: fmtUSD },
    },
    series: [{
      name: "Revenue",
      type: "line",
      data: revenue.map((r) => r.total),
      lineStyle: { width: 2, color: p["series-1"] },
      itemStyle: { color: p["series-1"] },
      symbolSize: 8,
      showSymbol: false,
      emphasis: { scale: true },
    }],
  };

  // Revenue by category — one measure, one hue; the SELECTED bar (cross-filter
  // source) takes the strong step, identity stays with the entity via axis label.
  const categoryOption = catTotals && {
    grid: { left: 110, right: 40, top: 8, bottom: 24 },
    tooltip: { trigger: "item", valueFormatter: fmtUSD, ...tooltipCommon },
    xAxis: {
      type: "value",
      splitLine: { lineStyle: { color: p["gridline"] } },
      axisLabel: { ...axisCommon.axisLabel, formatter: fmtUSD },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: catTotals.map((c) => c.category),
      ...axisCommon,
      axisLabel: { ...axisCommon.axisLabel, color: ink.secondary },
    },
    series: [{
      type: "bar",
      barWidth: 14,
      data: catTotals.map((c) => ({
        value: c.total,
        itemStyle: {
          color: category === c.category ? p["series-1-strong"] : p["series-1"],
          borderRadius: [0, 4, 4, 0],
        },
      })),
      // selective direct label: value on the selected (or top) bar only
      label: {
        show: true,
        position: "right",
        color: ink.secondary,
        fontSize: 11,
        formatter: ({ dataIndex, value }) =>
          (category ? catTotals[dataIndex].category === category : dataIndex === 0) ? fmtUSD(value) : "",
      },
    }],
  };

  const treeOption = orgTree && {
    tooltip: { trigger: "item", triggerOn: "mousemove", ...tooltipCommon },
    series: [{
      type: "tree",
      data: [orgTree],
      left: 90, right: 100, top: 8, bottom: 8,
      symbolSize: 8,
      itemStyle: { color: p["series-1"] },
      lineStyle: { color: p["baseline"], width: 1 },
      label: { color: ink.secondary, fontSize: 11, position: "left", verticalAlign: "middle", align: "right" },
      leaves: { label: { position: "right", align: "left" } },
      expandAndCollapse: true,
      initialTreeDepth: 2,
      emphasis: { focus: "descendant" },
    }],
  };

  const tiles = summary && [
    { label: "Total revenue (24 mo)", value: fmtUSD(summary.totalRevenue) },
    { label: "Orders", value: summary.orderCount.toLocaleString() },
    { label: "Open orders", value: summary.openOrders.toLocaleString() },
    { label: "Active accounts", value: summary.accounts.toLocaleString() },
  ];

  return (
    <div className="shell">
      <header>
        <h1>Operations Dashboard</h1>
        {meta && <span className="mode-badge">{meta.mode === "mock" ? "sample data" : "live Dataverse"}</span>}
      </header>

      <div className="filter-row">
        {category ? (
          <>
            <span>Filtered to</span>
            <span className="filter-chip">
              {category}
              <button onClick={() => setCategory(null)} aria-label="Clear filter">✕</button>
            </span>
          </>
        ) : (
          <span>All categories — click a bar to cross-filter</span>
        )}
      </div>

      {tiles && (
        <div className="tiles">
          {tiles.map((t) => (
            <div className="tile" key={t.label}>
              <div className="label">{t.label}</div>
              <div className="value">{t.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid">
        <div className="card wide">
          <h2>Revenue by month{category ? ` — ${category}` : ""}</h2>
          <p className="sub">Monthly order totals, trailing 24 months</p>
          {revenueOption && <EChart option={revenueOption} height={260} />}
          {revenue && (
            <TableView head={["Month", "Revenue"]} rows={revenue.map((r) => [r.month, fmtUSD(r.total)])} />
          )}
        </div>

        <div className="card">
          <h2>Revenue by category</h2>
          <p className="sub">Click to filter the dashboard</p>
          {categoryOption && (
            <EChart
              option={categoryOption}
              height={260}
              onEvents={{
                click: ({ dataIndex }) => {
                  const next = catTotals[dataIndex]?.category ?? null;
                  setCategory((cur) => (cur === next ? null : next));
                },
              }}
            />
          )}
          {catTotals && (
            <TableView head={["Category", "Revenue"]} rows={catTotals.map((c) => [c.category, fmtUSD(c.total)])} />
          )}
        </div>

        <div className="card">
          <h2>Organization</h2>
          <p className="sub">Org units — click a node to expand</p>
          {treeOption && <EChart option={treeOption} height={260} />}
        </div>
      </div>
    </div>
  );
}

function TableView({ head, rows }) {
  return (
    <details className="table-view">
      <summary>View as table</summary>
      <table>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
