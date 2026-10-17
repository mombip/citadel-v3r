/** Plotly figure builders — ports of components/charts.py with identical styling. */
import { kdiColor } from "./format";
import { celestiaColor, CELESTIA_LEVELS } from "../../../shared/celestia";

export const PLOTLY_CONFIG = { displayModeBar: false, responsive: true };
const FONT = "Source Sans 3, Source Sans Pro, sans-serif";

export interface Figure { data: any[]; layout: any }

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  if (c.length === 6) return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
  return [74, 222, 128];
}

function baseLayout(isLight: boolean, accent: string) {
  return {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: FONT, color: isLight ? "#0f172a" : "#f1f5f9" },
    margin: { l: 20, r: 20, t: 30, b: 25 },
    height: 360,
    hovermode: "x unified",
    hoverlabel: {
      bgcolor: isLight ? "#ffffff" : "#1c1c20",
      bordercolor: accent,
      font: { color: isLight ? "#0f172a" : "#ffffff", family: FONT, size: 12 },
    },
    showlegend: true,
    legend: { orientation: "v", x: 1, y: 1, xanchor: "right" },
  };
}

/** Balance timeline with neon glow and a fill always below the curve. */
export function balanceFigure(x: string[], y: number[], isLight: boolean): Figure {
  if (!x.length || !y.length) return { data: [], layout: {} };
  const last = y[y.length - 1];
  let main: string, mid: string, outer: string, fill: string;
  if (last > 0.001) [main, mid, outer, fill] = ["#22c55e", "rgba(34, 197, 94, 0.40)", "rgba(34, 197, 94, 0.16)", "rgba(34, 197, 94, 0.08)"];
  else if (last < -0.001) [main, mid, outer, fill] = ["#ef4444", "rgba(239, 68, 68, 0.40)", "rgba(239, 68, 68, 0.16)", "rgba(239, 68, 68, 0.08)"];
  else if (isLight) [main, mid, outer, fill] = ["#0f172a", "rgba(15, 23, 42, 0.25)", "rgba(15, 23, 42, 0.10)", "rgba(15, 23, 42, 0.05)"];
  else [main, mid, outer, fill] = ["#ffffff", "rgba(255, 255, 255, 0.35)", "rgba(255, 255, 255, 0.14)", "rgba(255, 255, 255, 0.06)"];

  const minY = Math.min(...y);
  const maxY = Math.max(...y);
  const margin = Math.max((maxY - minY) * 0.15, 30);
  const yLow = Math.min(minY, 0) - margin;
  const yHigh = Math.max(maxY, 0) + margin;
  const single = y.length === 1;
  const data = [
    { x, y: x.map(() => yLow), mode: "lines", line: { width: 0, color: "rgba(0,0,0,0)" }, hoverinfo: "skip", showlegend: false },
    { x, y, mode: "lines", line: { width: 0, color: "rgba(0,0,0,0)", shape: "spline" }, fill: "tonexty", fillcolor: fill, hoverinfo: "skip", showlegend: false },
    { x, y, mode: "lines", line: { color: outer, width: 8, shape: "spline" }, hoverinfo: "skip", showlegend: false },
    { x, y, mode: "lines", line: { color: mid, width: 4.5, shape: "spline" }, hoverinfo: "skip", showlegend: false },
    {
      x, y, mode: single ? "markers" : "lines", name: "Saldo", line: { color: main, width: 2.2, shape: "spline" },
      ...(single ? { marker: { size: 8, color: main, line: { color: "#ffffff", width: 2 } } } : {}),
      hovertemplate: "Data: %{x}<br><b>Saldo: %{y:,.2f} zł</b><extra></extra>",
    },
  ];
  const layout = {
    ...baseLayout(isLight, main),
    xaxis: { showgrid: false, color: isLight ? "#64748b" : "#94a3b8", tickfont: { size: 11, family: FONT }, showspikes: true, spikethickness: 1, spikedash: "dot", spikecolor: main, spikemode: "across" },
    yaxis: { showgrid: true, gridcolor: isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.06)", color: isLight ? "#64748b" : "#94a3b8", ticksuffix: " zł", tickformat: ",.2f", range: [yLow, yHigh], tickfont: { size: 11, family: FONT }, automargin: true },
    shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 0, y1: 0, line: { dash: "dot", color: isLight ? "rgba(15, 23, 42, 0.35)" : "rgba(255, 255, 255, 0.4)", width: 1.2 } }],
    annotations: [{ xref: "paper", x: 0, y: 0, yanchor: "bottom", xanchor: "left", text: "0.00 zł (Równowaga)", showarrow: false, font: { color: isLight ? "#475569" : "rgba(255, 255, 255, 0.75)", size: 10, family: FONT } }],
  };
  return { data, layout };
}

/** KDI dynamics coloured by the member's current KDI colour. */
export function kdiFigure(x: string[], y: (number | null)[], kdiVal: number | null, isLight: boolean): Figure {
  if (!x.length || !y.length) return { data: [], layout: {} };
  const valid = y.filter((v): v is number => v !== null);
  const maxK = valid.length ? Math.max(...valid) : 1.5;
  const minK = valid.length ? Math.min(...valid) : 0;
  const minVal = Math.min(minK, 0);
  const span = maxK > minVal ? maxK - minVal : 1;
  const yLow = -Math.max(span * 0.12, 0.15);
  const yHigh = Math.max(maxK + Math.max(span * 0.15, 0.25), 1.25);
  const eff = kdiVal !== null ? kdiVal : valid.length ? valid[valid.length - 1] : null;
  const color = kdiColor(eff, isLight);
  const [r, g, b] = hexToRgb(color);
  const mid = `rgba(${r}, ${g}, ${b}, 0.38)`;
  const outer = `rgba(${r}, ${g}, ${b}, 0.16)`;
  const fill = `rgba(${r}, ${g}, ${b}, 0.08)`;
  const single = valid.length === 1;
  const data = [
    { x, y: x.map(() => yLow), mode: "lines", line: { width: 0, color: "rgba(0,0,0,0)" }, hoverinfo: "skip", showlegend: false },
    { x, y, mode: "lines", line: { width: 0, color: "rgba(0,0,0,0)", shape: "spline" }, fill: "tonexty", fillcolor: fill, connectgaps: false, hoverinfo: "skip", showlegend: false },
    { x, y, mode: "lines", line: { color: outer, width: 8, shape: "spline" }, connectgaps: false, hoverinfo: "skip", showlegend: false },
    { x, y, mode: "lines", line: { color: mid, width: 4.5, shape: "spline" }, connectgaps: false, hoverinfo: "skip", showlegend: false },
    {
      x, y, mode: single ? "markers" : "lines", name: "KDI", line: { color, width: 2.2, shape: "spline" },
      ...(single ? { marker: { size: 8, color, line: { color: "#ffffff", width: 2 } } } : {}), connectgaps: false,
      hovertemplate: "Data: %{x}<br><b>KDI: %{y:.2f}</b><extra></extra>",
    },
  ];
  const layout = {
    ...baseLayout(isLight, color),
    xaxis: { showgrid: false, color: isLight ? "#64748b" : "#94a3b8", tickfont: { size: 11, family: FONT }, showspikes: true, spikethickness: 1, spikedash: "dot", spikecolor: color, spikemode: "across" },
    yaxis: { showgrid: true, gridcolor: isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.06)", color: isLight ? "#64748b" : "#94a3b8", range: [yLow, yHigh], tickformat: ".2f", tickfont: { size: 11, family: FONT }, automargin: true },
  };
  return { data, layout };
}

/** Horizontal KDI bar chart for units / regions with the 1.20 boundary. */
export function kdiBarFigure(items: { nazwa: string; kdi: number }[], xTitle: string, isLight: boolean): Figure | null {
  const valid = items.filter((e) => e.kdi !== null && e.kdi !== undefined);
  if (!valid.length) return null;
  const sorted = [...valid].sort((a, b) => b.kdi - a.kdi);
  const yLabels = sorted.map((p) => p.nazwa);
  const xValues = sorted.map((p) => p.kdi);
  const colors = xValues.map((v) => kdiColor(v, isLight));
  const height = Math.max(220, Math.min(500, sorted.length * 36 + 60));
  const data = [{
    y: yLabels, x: xValues, type: "bar", orientation: "h",
    marker: { color: colors, line: { color: isLight ? "rgba(15, 23, 42, 0.15)" : "rgba(255, 255, 255, 0.15)", width: 1 } },
    hovertemplate: "<b>%{y}</b><br>KDI: %{x:.2f}<extra></extra>",
  }];
  const lineColor = isLight ? "#d97706" : "#facc15";
  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: FONT, color: isLight ? "#0f172a" : "#f1f5f9" },
    margin: { l: 15, r: 15, t: 25, b: 25 }, height,
    xaxis: { title: { text: xTitle, font: { color: isLight ? "#64748b" : "#94a3b8", size: 11 } }, showgrid: true, gridcolor: isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.06)", color: isLight ? "#64748b" : "#94a3b8", tickformat: ".2f", tickfont: { size: 11 } },
    yaxis: { showgrid: false, color: isLight ? "#0f172a" : "#f1f5f9", tickfont: { size: 12 }, automargin: true },
    hoverlabel: { bgcolor: isLight ? "#ffffff" : "#1c1c20", bordercolor: isLight ? "#cbd5e1" : "#3f3f46", font: { color: isLight ? "#0f172a" : "#ffffff", family: FONT, size: 12 } },
    shapes: [{ type: "line", yref: "paper", y0: 0, y1: 1, x0: 1.2, x1: 1.2, line: { dash: "dash", color: lineColor, width: 1.5 } }],
    annotations: [{ yref: "paper", y: 1, x: 1.2, xanchor: "left", yanchor: "bottom", text: "1.20 (Granica)", showarrow: false, font: { color: lineColor, size: 10, family: FONT } }],
  };
  return { data, layout };
}

/** Distribution of Celestia rating classes within a unit. */
export function celestiaDistributionFigure(counts: Record<string, number>, isLight: boolean): Figure {
  const codes = CELESTIA_LEVELS.map((p) => p.kod);
  const data = [{
    x: codes, y: codes.map((k) => counts[k] ?? 0), type: "bar",
    marker: { color: codes.map((k) => celestiaColor(k, isLight)), line: { color: isLight ? "rgba(15, 23, 42, 0.2)" : "rgba(255, 255, 255, 0.2)", width: 1 } },
    text: codes.map((k) => ((counts[k] ?? 0) > 0 ? String(counts[k]) : "")), textposition: "auto",
    hovertemplate: "<b>Poziom %{x}</b><br>Liczba członków: %{y}<extra></extra>",
  }];
  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: FONT, color: isLight ? "#0f172a" : "#f1f5f9" },
    margin: { l: 20, r: 20, t: 25, b: 25 }, height: 260,
    xaxis: { showgrid: false, color: isLight ? "#64748b" : "#94a3b8" },
    yaxis: { showgrid: true, gridcolor: isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.06)", color: isLight ? "#64748b" : "#94a3b8" },
  };
  return { data, layout };
}
