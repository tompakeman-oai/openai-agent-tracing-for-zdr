import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  BarController,
  BarElement,
  TimeSeriesScale,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { fmtTs, truncateLabel } from "../utils";
import { useAppContext } from "../state/AppContext";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  BarController,
  BarElement,
  TimeSeriesScale,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
);

// Green palette
const GREEN = {
  primary: "#16a34a", // green-600
  secondary: "#22c55e", // green-500
  dark: "#166534", // green-800
  light: "#86efac", // green-200
  translucent: "rgba(22,163,74,0.15)",
};


const buildLineDataset = (
  label: string,
  xs: string[],
  ys: number[],
  color: string = GREEN.primary,
  fill: boolean = false
) => {
  return {
    labels: xs,
    datasets: [
      {
        label,
        data: ys,
        borderColor: color,
        backgroundColor: fill ? GREEN.translucent : color,
        fill: fill,
        tension: 0.25,
        pointRadius: 0,
      },
    ],
  };
};

const buildBarDataset = (
  label: string,
  xs: string[],
  ys: number[],
  color: string = GREEN.secondary
) => {
  return {
    labels: xs,
    datasets: [
      {
        label,
        data: ys,
        backgroundColor: "rgba(34,197,94,0.6)",
        borderColor: color,
        borderWidth: 1,
      },
    ],
  };
};

// Simple chart hook using Chart.js directly
const useChart = (
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  configBuilder: () => any,
  deps: React.DependencyList
) => {
  const chartRef = useRef<Chart | null>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    // Create chart
    const cfg = configBuilder();
    chartRef.current?.destroy();
    chartRef.current = new Chart(ctx, cfg);

    // Cleanup
    return () => chartRef.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
};

// Window options used to parametrize queries
const WINDOW_OPTIONS = [
  { key: "1h", pgInterval: "1 hour", bucket: "minute" },
  { key: "24h", pgInterval: "24 hours", bucket: "minute" },
  { key: "7d", pgInterval: "7 days", bucket: "hour" },
  { key: "30d", pgInterval: "30 days", bucket: "hour" },
  { key: "all", pgInterval: "all", bucket: "hour" },
];

type WindowKey = (typeof WINDOW_OPTIONS)[number]["key"];

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white rounded-2xl shadow p-4 border border-gray-100">
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-lg font-medium">{title}</h2>
    </div>
    {children}
  </div>
);



const baseTimeSeriesOptions = (yTitle: string) => {
  return {
    responsive: true,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: { display: true },
      tooltip: { enabled: true },
    },
    scales: {
      x: {
        type: "category" as const,
        ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 8 },
      },
      y: { beginAtZero: true, title: { display: true, text: yTitle } },
    },
  };
};

// --- SQL builders (SQLite-flavored) ---
const buildQueries = (pgInterval: string, bucket: "minute" | "hour") => {
  // Template pieces
  const bucketExpr =
    bucket === "minute"
      ? "strftime('%Y-%m-%d %H:%M:00', started_at)"
      : "strftime('%Y-%m-%d %H:00:00', started_at)";
  const tsFmt = bucket === "minute" ? "%Y-%m-%d %H:%M:00" : "%Y-%m-%d %H:00:00";
  const step = bucket === "minute" ? "minute" : "hour";
  const timeFilter = pgInterval === "all" ? "" : `WHERE started_at >= datetime('now', '-${pgInterval}')`;
  const whereAnd = pgInterval === "all" ? "" : ` AND started_at >= datetime('now', '-${pgInterval}')`;
  const seriesStart =
    pgInterval === "all"
      ? `(SELECT COALESCE(strftime('${tsFmt}', MIN(started_at)), strftime('${tsFmt}', 'now')) FROM spans)`
      : `strftime('${tsFmt}', datetime('now', '-${pgInterval}'))`;

  const throughput = `
    SELECT ${bucketExpr} AS ts, COUNT(*) AS spans_started
    FROM spans
    ${timeFilter}
    GROUP BY 1
    ORDER BY 1;
  `;

  const latency = `
    WITH d AS (
      SELECT
        ${bucketExpr} AS ts,
        (julianday(ended_at) - julianday(started_at)) * 86400000.0 AS ms
      FROM spans
      WHERE ended_at IS NOT NULL${whereAnd}
    ),
    ranked AS (
      SELECT ts,
             ms,
             ROW_NUMBER() OVER (PARTITION BY ts ORDER BY ms) AS rn,
             COUNT(*) OVER (PARTITION BY ts) AS cnt
      FROM d
    ),
    p95 AS (
      SELECT ts, ms AS p95_ms
      FROM ranked
      WHERE rn = CAST((cnt * 95 + 99) / 100 AS INT)
    )
    SELECT d.ts,
           AVG(d.ms) AS avg_ms,
           MAX(p95.p95_ms) AS p95_ms
    FROM d
    LEFT JOIN p95 ON p95.ts = d.ts
    GROUP BY d.ts
    ORDER BY d.ts;
  `;

  const errorRate = `
    SELECT ${bucketExpr} AS ts,
           SUM(CASE WHEN error IS NOT NULL AND error <> '' THEN 1 ELSE 0 END) AS errors,
           COUNT(*) AS total,
           1.0 * SUM(CASE WHEN error IS NOT NULL AND error <> '' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS error_rate
    FROM spans
    ${timeFilter}
    GROUP BY 1
    ORDER BY 1;
  `;

  const concurrency = `
    WITH RECURSIVE series(ts) AS (
      SELECT ${seriesStart}
      UNION ALL
      SELECT strftime('${tsFmt}', datetime(ts, '+1 ${step}'))
      FROM series
      WHERE ts < strftime('${tsFmt}', 'now')
    )
    SELECT series.ts AS ts,
           COUNT(*) AS active_spans
    FROM series
    JOIN spans s
      ON datetime(s.started_at) <= datetime(series.ts)
     AND datetime(COALESCE(s.ended_at, strftime('${tsFmt}', 'now'))) > datetime(series.ts)
    GROUP BY 1
    ORDER BY 1;
  `;

  const topErrors = `
    SELECT substr(ifnull(error,''), 1, 200) AS error_head, COUNT(*) AS n
    FROM spans
    WHERE error IS NOT NULL AND error <> ''
      ${pgInterval === "all" ? "" : `AND started_at >= datetime('now', '-${pgInterval}')`}
    GROUP BY 1
    ORDER BY n DESC
    LIMIT 20;
  `;

  const traceSize = `
    WITH counts AS (
      SELECT trace_id, COUNT(*) AS n_spans
      FROM spans
      ${pgInterval === "all" ? "" : `WHERE started_at >= datetime('now', '-${pgInterval}')`}
      GROUP BY 1
    ),
    dist AS (
      SELECT MIN(20, CAST(n_spans / 50 AS INT) + 1) AS bkt,
             COUNT(*) AS traces_in_bucket,
             MIN(n_spans) AS min_s,
             MAX(n_spans) AS max_s
      FROM counts
      GROUP BY 1
    )
    SELECT '[' || ((bkt-1)*50) || '-' || (bkt*50) || ']' AS bucket_label,
           traces_in_bucket
    FROM dist
    ORDER BY bkt;
  `;

  return { throughput, latency, errorRate, concurrency, topErrors, traceSize };
};

export const Charts: React.FC = () => {
  const [win, setWin] = useState<WindowKey>("24h");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { runSql } = useAppContext();

  // Data state
  const [throughput, setThroughput] = useState<{ ts: string[]; n: number[] }>({
    ts: [],
    n: [],
  });
  const [latency, setLatency] = useState<{ ts: string[]; p95: number[]; avg: number[] }>(
    { ts: [], p95: [], avg: [] }
  );
  const [errorRate, setErrorRate] = useState<{ ts: string[]; rate: number[]; errs: number[]; total: number[] }>(
    { ts: [], rate: [], errs: [], total: [] }
  );
  const [concurrency, setConcurrency] = useState<{ ts: string[]; active: number[] }>({
    ts: [],
    active: [],
  });
  const [topErrors, setTopErrors] = useState<{ msg: string[]; n: number[] }>({ msg: [], n: [] });
  const [traceSize, setTraceSize] = useState<{ bucket: string[]; n: number[] }>({ bucket: [], n: [] });

  const windowCfg = useMemo(() => WINDOW_OPTIONS.find((w) => w.key === win)!, [win]);

  // Fetch all datasets
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const queries = buildQueries(windowCfg.pgInterval, windowCfg.bucket as "minute" | "hour");

        const [q1, q2, q3, q4, q5, q6] = await Promise.all([
          runSql(["ts", "spans_started"] as const, queries.throughput),
          runSql(["ts", "avg_ms", "p95_ms"] as const, queries.latency),
          runSql(["ts", "errors", "total", "error_rate"] as const, queries.errorRate),
          runSql(["ts", "active_spans"] as const, queries.concurrency),
          runSql(["error_head", "n"] as const, queries.topErrors),
          runSql(["bucket_label", "traces_in_bucket"] as const, queries.traceSize),
        ]);

        if (cancelled) return;

        setThroughput({
          ts: q1.map((r) => r.ts),
          n: q1.map((r) => Number(r.spans_started)),
        });
        setLatency({
          ts: q2.map((r) => r.ts),
          avg: q2.map((r) => Number(r.avg_ms)),
          p95: q2.map((r) => Number(r.p95_ms ?? r.avg_ms)), // fallback
        });
        setErrorRate({
          ts: q3.map((r) => r.ts),
          errs: q3.map((r) => Number(r.errors)),
          total: q3.map((r) => Number(r.total)),
          rate: q3.map((r) => Number(r.error_rate) * 100),
        });
        setConcurrency({
          ts: q4.map((r) => r.ts),
          active: q4.map((r) => Number(r.active_spans)),
        });
        setTopErrors({
          msg: q5.map((r) => r.error_head || "(empty)"),
          n: q5.map((r) => Number(r.n)),
        });
        setTraceSize({
          bucket: q6.map((r) => r.bucket_label),
          n: q6.map((r) => Number(r.traces_in_bucket)),
        });
      } catch (e: any) {
        console.error(e);
        setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [windowCfg]);

  // Canvas refs
  const cThroughput = useRef<HTMLCanvasElement>(null);
  const cLatency = useRef<HTMLCanvasElement>(null);
  const cErrorRate = useRef<HTMLCanvasElement>(null);
  const cConcurrency = useRef<HTMLCanvasElement>(null);
  const cTopErrors = useRef<HTMLCanvasElement>(null);
  const cTraceSize = useRef<HTMLCanvasElement>(null);

  // Charts
  useChart(
    cThroughput,
    () => ({
      type: "line",
      data: buildLineDataset("Spans started", throughput.ts, throughput.n, GREEN.primary, true),
      options: baseTimeSeriesOptions("Throughput (spans / " + windowCfg.bucket + ")"),
    }),
    [throughput, windowCfg.bucket]
  );

  useChart(
    cLatency,
    () => ({
      type: "line",
      data: {
        labels: latency.ts,
        datasets: [
          {
            label: "avg ms",
            data: latency.avg,
            pointRadius: 0,
            tension: 0.25,
            borderColor: GREEN.secondary,
            backgroundColor: GREEN.translucent,
            fill: false,
          },
          {
            label: "p95 ms",
            data: latency.p95,
            pointRadius: 0,
            tension: 0.25,
            borderColor: GREEN.dark,
            backgroundColor: GREEN.translucent,
            fill: false,
          },
        ],
      },
      options: baseTimeSeriesOptions("Latency (ms)"),
    }),
    [latency]
  );

  useChart(
    cErrorRate,
    () => ({
      type: "line",
      data: buildLineDataset("Error rate (%)", errorRate.ts, errorRate.rate, GREEN.dark, false),
      options: baseTimeSeriesOptions("Error rate (%)"),
    }),
    [errorRate]
  );

  useChart(
    cConcurrency,
    () => ({
      type: "line",
      data: buildLineDataset("Active spans", concurrency.ts, concurrency.active, GREEN.secondary, true),
      options: baseTimeSeriesOptions("Concurrency (active spans)"),
    }),
    [concurrency]
  );

  useChart(
    cTopErrors,
    () => ({
      type: "bar",
      data: buildBarDataset("Occurrences", topErrors.msg, topErrors.n, GREEN.secondary),
      options: {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: {
          x: { ticks: { callback: (v: any) => truncateLabel(String(topErrors.msg[v])) } },
          y: { beginAtZero: true },
        },
      },
    }),
    [topErrors]
  );

  useChart(
    cTraceSize,
    () => ({
      type: "bar",
      data: buildBarDataset("Traces", traceSize.bucket, traceSize.n, GREEN.primary),
      options: {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: { y: { beginAtZero: true } },
      },
    }),
    [traceSize]
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">AI Tracing Dashboard</h1>
        <div className="flex items-center gap-2">
          {WINDOW_OPTIONS.map((w) => (
            <button
              key={w.key}
              onClick={() => setWin(w.key as WindowKey)}
              className={
                "px-3 py-1 rounded-full border text-sm " +
                (win === w.key
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50")
              }
            >
              {w.key}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-sm text-gray-500">Loading metrics…</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Throughput">
          <canvas ref={cThroughput} />
        </Card>

        <Card title="Latency (avg & p95)">
          <canvas ref={cLatency} />
        </Card>

        <Card title="Error rate">
          <canvas ref={cErrorRate} />
        </Card>

        <Card title="Concurrency (active spans)">
          <canvas ref={cConcurrency} />
        </Card>

        <Card title="Top error signatures">
          <canvas ref={cTopErrors} />
        </Card>

        <Card title="Trace size distribution (spans/trace)">
          <canvas ref={cTraceSize} />
        </Card>
      </div>

      <div className="text-xs text-gray-500">
        Window: {windowCfg.pgInterval} • Updated {fmtTs(new Date())}
      </div>
    </div>
  );
};

export default Charts;
