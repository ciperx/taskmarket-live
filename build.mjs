#!/usr/bin/env node
// Taskmarket live market visualizer — server-side build.
// Fetches every public API endpoint at BUILD time, caches one snapshot, renders one
// static HTML page. The browser never calls the API.
//
// Measured behaviour of the public API (2026-11-25), verified by comparing responses:
//   chainId IS honoured by:  /api/market/stats   /api/tasks
//   chainId is IGNORED by:   /api/stats/breakdowns  /api/stats/platform-time-series
//                            /api/stats/activity-heatmap  /api/stats/activity-feed
// The last four return identical bodies for 4217, 8453 and no parameter at all.
// So anything split by chain here is computed from /api/tasks, and anything taken from
// those four endpoints is labelled platform-wide. Nothing is fabricated to fill a split.
import fs from "node:fs/promises";
import path from "node:path";

const BASE = "https://api.taskmarket.dev";
const OUT = path.resolve("dist");
const CHAINS = [
  { id: 4217, name: "Tempo", unit: "OUSD" },
  { id: 8453, name: "Base", unit: "USDC" },
];
const UA = { "user-agent": "taskmarket-visualizer/1.0 (+open source; MIT)", accept: "application/json" };

async function api(p) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(BASE + p, { headers: UA, signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      last = e;
      if (i < 2) await new Promise((s) => setTimeout(s, 1500 * (i + 1)));
    }
  }
  throw new Error(`${p}: ${last.message}`);
}

const usd = (baseUnits) => Number(baseUnits || 0) / 1e6;

async function allTasks(chainId, maxPages = 40) {
  const seen = [];
  let cursor = null;
  for (let p = 0; p < maxPages; p++) {
    const q = `/api/tasks?chainId=${chainId}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const d = await api(q);
    if (d.tasks) seen.push(...d.tasks);
    cursor = d.nextCursor;
    if (!d.hasMore || !cursor) break;
  }
  return seen;
}

const day = (iso) => new Date(iso).toISOString().slice(0, 10);
function weekKey(iso) {
  const d = new Date(iso);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}

// Posted reward per day, per chain, straight out of the task list.
// This is the per-chain split the aggregate time-series endpoint cannot give.
function postedByDay(tasks) {
  const m = new Map();
  for (const t of tasks) {
    if (!t.createdAt) continue;
    const k = day(t.createdAt);
    m.set(k, (m.get(k) || 0) + usd(t.reward));
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]) => ({ d, usd: v }));
}

function posterStats(tasks) {
  const byPoster = new Map();
  for (const t of tasks) {
    const k = t.requesterDisplayName || t.requester;
    const cur = byPoster.get(k) || { name: k, tasks: 0, usd: 0 };
    cur.tasks += 1;
    cur.usd += usd(t.reward);
    byPoster.set(k, cur);
  }
  const rows = [...byPoster.values()].sort((a, b) => b.usd - a.usd);
  const sum = (n) => rows.slice(0, n).reduce((s, r) => s + r.usd, 0);
  const total = rows.reduce((s, r) => s + r.usd, 0);
  return {
    distinct: rows.length,
    totalUsd: total,
    top1Share: total ? sum(1) / total : 0,
    top5Share: total ? sum(5) / total : 0,
    top10Share: total ? sum(10) / total : 0,
    top: rows.slice(0, 10),
  };
}

function weeklyPosters(tasks) {
  const byWeek = new Map();
  for (const t of tasks) {
    const w = weekKey(t.createdAt);
    if (!byWeek.has(w)) byWeek.set(w, new Set());
    byWeek.get(w).add(t.requesterDisplayName || t.requester);
  }
  return [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, s]) => ({ week, posters: s.size }));
}

function deadTasks(tasks, now) {
  let expired = 0, staleOpen = 0, cancelled = 0;
  for (const t of tasks) {
    if (t.status === "expired") expired++;
    else if (t.status === "cancelled") cancelled++;
    else if (t.status === "open" && t.expiryTime && new Date(t.expiryTime) < now) staleOpen++;
  }
  return { expired, cancelled, staleOpen };
}

function crowding(tasks) {
  const fin = tasks.filter((t) => ["completed", "expired", "cancelled"].includes(t.status));
  if (!fin.length) return null;
  const c = fin.map((t) => t.submissionCount || 0).sort((a, b) => a - b);
  const q = (p) => c[Math.min(c.length - 1, Math.floor(p * c.length))];
  return {
    n: c.length, median: q(0.5), p90: q(0.9), max: c[c.length - 1],
    zeroShare: c.filter((x) => x === 0).length / c.length,
    perTask: c.reduce((s, x) => s + x, 0) / c.length,
  };
}

function openWindow(tasks) {
  const h = [];
  for (const t of tasks) {
    if (!t.createdAt || !t.expiryTime) continue;
    const ms = new Date(t.expiryTime) - new Date(t.createdAt);
    if (ms > 0) h.push(ms / 3.6e6);
  }
  if (!h.length) return null;
  h.sort((a, b) => a - b);
  const q = (p) => h[Math.min(h.length - 1, Math.floor(p * h.length))];
  return { n: h.length, median: q(0.5), p90: q(0.9) };
}

async function main() {
  const now = new Date();

  // platform-wide, chainId ignored by the API on these four
  const [ts7, ts30, tsAll, breakdowns, heatMode, heatHour, feed] = await Promise.all([
    api("/api/stats/platform-time-series?range=7d&bucket=day"),
    api("/api/stats/platform-time-series?range=30d&bucket=day"),
    api("/api/stats/platform-time-series?range=all&bucket=week"),
    api("/api/stats/breakdowns"),
    api("/api/stats/activity-heatmap?range=30d&dimension=mode"),
    api("/api/stats/activity-heatmap?range=30d&dimension=hourOfWeek"),
    api("/api/stats/activity-feed?limit=40"),
  ]);

  const chains = [];
  for (const c of CHAINS) {
    const [stats, tasks] = await Promise.all([api(`/api/market/stats?chainId=${c.id}`), allTasks(c.id)]);
    chains.push({
      ...c, stats, taskCount: tasks.length,
      posted: postedByDay(tasks),
      postedTotal: tasks.reduce((s, t) => s + usd(t.reward), 0),
      awarded: tasks.filter((t) => (t.awardCount || 0) > 0).reduce((s, t) => s + usd(t.reward), 0),
      winners: tasks.filter((t) => (t.awardCount || 0) > 0).length,
      posters: posterStats(tasks),
      weeklyPosters: weeklyPosters(tasks),
      dead: deadTasks(tasks, now),
      crowding: crowding(tasks),
      window: openWindow(tasks),
    });
  }

  const snap = {
    generatedAt: now.toISOString(),
    source: BASE,
    note: "chainId is honoured by /api/market/stats and /api/tasks only; the other four endpoints return the same body for every chainId, so their figures are platform-wide.",
    platform: { ts: { "7d": ts7, "30d": ts30, all: tsAll }, breakdowns, heatMode, heatHour, feed },
    chains,
  };

  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, "data.json"), JSON.stringify(snap));

  const { render } = await import("./render.mjs");
  await fs.writeFile(path.join(OUT, "index.html"), render(snap));
  for (const f of ["app.js", "style.css"]) {
    await fs.writeFile(path.join(OUT, f), await fs.readFile(new URL("./" + f, import.meta.url), "utf8"));
  }
  const kit = path.resolve("kit");
  for (const f of ["taskmarket-lockup.png", "taskmarket-mark.png", "taskmarket-og-1200x630.png",
    "InstrumentSerif-Regular.ttf", "InstrumentSerif-Italic.ttf", "InterTight-Variable.ttf",
    "DepartureMono-Regular.woff2"]) {
    try { await fs.copyFile(path.join(kit, f), path.join(OUT, f)); } catch {}
  }

  console.log(`built · ${chains.map((c) => `${c.name} ${c.taskCount} tasks $${c.postedTotal.toFixed(2)}`).join(" · ")}`);
}

main().catch((e) => { console.error("BUILD FAILED:", e.message); process.exit(1); });
