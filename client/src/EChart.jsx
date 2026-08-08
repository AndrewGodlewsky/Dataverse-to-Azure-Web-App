// Modular ECharts (ADR-0005): only the charts/components this dashboard uses.
import { useEffect, useState } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, LineChart, TreeChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([BarChart, LineChart, TreeChart, GridComponent, TooltipComponent, CanvasRenderer]);

// Palette roles resolved from CSS custom properties, re-read on scheme change
// so chart colors follow light/dark from the single source in styles.css.
const ROLE_VARS = [
  "surface-1", "text-primary", "text-secondary", "text-muted",
  "gridline", "baseline", "border", "series-1", "series-1-strong", "series-1-soft",
];

function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(ROLE_VARS.map((v) => [v, cs.getPropertyValue(`--${v}`).trim()]));
}

export function usePalette() {
  const [palette, setPalette] = useState(readPalette);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setPalette(readPalette());
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return palette;
}

export default function EChart({ option, height = 280, onEvents }) {
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      style={{ height }}
      onEvents={onEvents}
    />
  );
}
