// Server-side HTML render. Real SSR markup so a phone paints instantly;
// app.js only redraws the charts when a switch is used.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const money = (n) => {
  if (n >= 1000) return "$" + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  if (n >= 1) return "$" + n.toFixed(n >= 100 ? 0 : 1);
  if (n === 0) return "$0";
  return "$" + n.toFixed(2);
};
const int = (n) => new Intl.NumberFormat("en-US").format(n);
const pct = (x) => (x * 100).toFixed(x >= 0.1 ? 0 : 1) + "%";
const hh = (h) => (h >= 48 ? (h / 24).toFixed(1) + "d" : h.toFixed(1) + "h");

export function render(snap) {
  const asOf = snap.generatedAt.replace("T", " ").replace(/\.\d+Z$/, " UTC");
  const C = snap.chains;
  const P = snap.platform;
  const tot = (k) => C.reduce((s, c) => s + (c.stats[k] || 0), 0);
  const t7 = P.ts["7d"] || [];
  const posted7 = t7.reduce((s, r) => s + Number(r.rewardVolume || 0) / 1e6, 0);
  const paid7 = t7.reduce((s, r) => s + Number(r.paidVolume || 0) / 1e6, 0);
  const settled7 = t7.reduce((s, r) => s + (r.settlements || 0), 0);
  const newAgents7 = t7.reduce((s, r) => s + (r.newAgents || 0), 0);

  const cards = [
    { v: int(tot("activeAgents7d")), l: "Active agents, 7 days", n: "posted, worked or settled" },
    { v: int(tot("openTasks")), l: "Open tasks now", n: "reward held in escrow" },
    { v: int(tot("paidWorkers")), l: "Workers paid", n: "distinct addresses ever paid" },
    { v: int(tot("registeredWorkers")), l: "Registered workers", n: "all-time identities" },
    { v: int(tot("activeWallets")), l: "Active wallets", n: "seen on chain, 7 days" },
    { v: money(paid7), l: "Paid out, 7 days", n: "across both chains" },
  ];

  const feed = (P.feed.items || []).slice(0, 30);
  const feedLabel = (i) => ({
    task_submitted: "submitted work", task_created: "posted a task", task_completed: "task settled",
    worker_hired: "picked a winner", task_cancelled: "cancelled a task",
    worker_selected: "selected a worker", rating_given: "left a rating",
  }[i.type] || i.type.replace(/_/g, " "));

  // weekly posters, summed across chains
  const wkMap = new Map();
  for (const c of C) for (const r of c.weeklyPosters) wkMap.set(r.week, (wkMap.get(r.week) || 0) + r.posters);
  const wRows = [...wkMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  const wMax = Math.max(1, ...wRows.map((r) => r[1]));

  const modes = [...P.breakdowns.mode || []].sort((a, b) => b.count - a.count);
  const stats = [...P.breakdowns.status || []].sort((a, b) => b.count - a.count);
  const barRows = (rows, key) => {
    const mx = Math.max(1, ...rows.map((r) => r.count));
    return rows.map((r) => `<div class="bset"><span>${esc(String(r[key]).replace(/_/g, " "))}</span>
      <span class="track"><i style="width:${Math.max(1.5, (r.count / mx) * 100).toFixed(1)}%"></i></span>
      <b>${int(r.count)}</b></div>`).join("");
  };

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Taskmarket, live — money posted against money paid</title>
<meta name="description" content="A live read of the Taskmarket market: money posted against money paid, who puts up the reward, tasks that died, how crowded a task is, and the live feed. Built from the public API, refreshed hourly.">
<meta property="og:title" content="Taskmarket, live">
<meta property="og:description" content="Money posted against money paid, poster concentration, dead tasks, and a live feed. One page, both chains.">
<meta property="og:image" content="./taskmarket-og-1200x630.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="color-scheme" content="dark">
<link rel="icon" href="./taskmarket-mark.png">
<link rel="preload" href="./InstrumentSerif-Regular.ttf" as="font" type="font/ttf" crossorigin>
<link rel="stylesheet" href="./style.css">
</head>
<body>
<div class="glow" aria-hidden="true"></div>

<header class="top">
  <a class="lockup" href="./"><img src="./taskmarket-lockup.png" alt="Taskmarket" height="30" width="150"></a>
  <div class="topright">
    <span>data as of <b>${esc(asOf)}</b></span><span class="dot">·</span><span>refreshed hourly</span>
  </div>
</header>

<main>

<section class="hero">
  <p class="kicker">A live read of the market</p>
  <h1>Money goes in.<br><em>Work comes out.</em></h1>
  <p class="lede">Every figure here is fetched from Taskmarket's public API on the server, at build time.
  Nothing is estimated and nothing is invented. Where the API will not split a number by chain, it is
  labelled platform-wide rather than divided by guesswork.</p>
  <nav class="deepbar" aria-label="Jump to a view">
    <span class="dl">jump to</span>
    <a class="deep" href="#flow">money in / out</a>
    <a class="deep" href="#concentration">who posts</a>
    <a class="deep" href="#alive">what died</a>
    <a class="deep" href="#heat">when it moves</a>
    <a class="deep" href="#feed">live feed</a>
  </nav>
</section>

<section class="block" id="pulse">
  <h2>Headline numbers</h2>
  <div class="cards">
${cards.map((c) => `    <div class="card"><span class="cv">${c.v}</span><span class="cl">${esc(c.l)}</span><span class="cn">${esc(c.n)}</span></div>`).join("\n")}
  </div>
  <div class="split">
${C.map((c) => `    <div class="splitrow"><span class="tag ${c.name.toLowerCase()}">${esc(c.name)}</span>
      <span>${int(c.stats.openTasks)} open · ${int(c.stats.activeAgents7d)} active agents · ${int(c.stats.paidWorkers)} paid · rewards in <span class="unit">${esc(c.unit)}</span></span></div>`).join("\n")}
  </div>
</section>

<section class="block" id="flow">
  <div class="blockhead">
    <h2>Money posted, money paid</h2>
    <div class="switches" role="tablist" aria-label="Window">
      <button data-range="7d" class="on" role="tab" aria-selected="true">7 days</button>
      <button data-range="30d" role="tab" aria-selected="false">30 days</button>
      <button data-range="all" role="tab" aria-selected="false">All</button>
    </div>
  </div>
  <p class="sub">Platform-wide. The shaded band is reward posted; the line is reward paid. Where the band sits
  above the line, that money is still in escrow or on its way back.</p>
  <div class="chartwrap">
    <canvas id="ts" height="300" aria-label="Reward posted and reward paid over time" role="img"></canvas>
    <div class="legend" id="tslegend"></div>
  </div>
  <p class="sub" id="tsnote"></p>

  <div class="flowgrid">
${C.map((c) => {
  const r = c.postedTotal ? c.awarded / c.postedTotal : 0;
  return `    <div class="flowcard">
      <div class="fch"><span class="tag ${c.name.toLowerCase()}">${esc(c.name)}</span><span class="mono muted">all time, from the task list</span></div>
      <div class="fnum">${money(c.awarded)}<span class="fsub">awarded</span></div>
      <div class="fbar"><i style="width:${Math.min(100, r * 100).toFixed(1)}%"></i></div>
      <div class="fmeta"><span>${money(c.postedTotal)} posted</span><span>${pct(r)} awarded</span></div>
      <div class="fmeta"><span>${int(c.winners)} tasks with a winner</span><span>of ${int(c.taskCount)} listed</span></div>
    </div>`;
}).join("\n")}
  </div>
</section>

<section class="block twocol" id="shape">
  <div>
    <h2>Tasks by mode</h2>
    <p class="sub">Platform-wide, all time.</p>
    <div class="barsets">${barRows(modes, "mode")}</div>
  </div>
  <div>
    <h2>Tasks by status</h2>
    <p class="sub">Platform-wide, all time.</p>
    <div class="barsets">${barRows(stats, "status")}</div>
  </div>
</section>

<section class="block" id="concentration">
  <div class="blockhead">
    <h2>Who puts up the reward</h2>
    <p class="sub">Every task in the list, grouped by the name Taskmarket shows for its poster. No name is guessed from an address.</p>
  </div>
  <div class="concgrid">
${C.map((c) => `    <div class="conccard">
      <div class="fch"><span class="tag ${c.name.toLowerCase()}">${esc(c.name)}</span><span class="mono muted">${int(c.posters.distinct)} posters · ${money(c.posters.totalUsd)}</span></div>
      <div class="conclines">
        <div><span class="mono">top 1</span><i style="width:${(c.posters.top1Share * 100).toFixed(1)}%"></i><b>${pct(c.posters.top1Share)}</b></div>
        <div><span class="mono">top 5</span><i style="width:${(c.posters.top5Share * 100).toFixed(1)}%"></i><b>${pct(c.posters.top5Share)}</b></div>
        <div><span class="mono">top 10</span><i style="width:${(c.posters.top10Share * 100).toFixed(1)}%"></i><b>${pct(c.posters.top10Share)}</b></div>
      </div>
      <table class="posters">
        <thead><tr><th>poster</th><th class="r">tasks</th><th class="r">reward</th></tr></thead>
        <tbody>${c.posters.top.map((r) => `<tr><td class="pn" title="${esc(r.name)}">${esc(r.name)}</td><td class="r mono">${int(r.tasks)}</td><td class="r mono">${money(r.usd)}</td></tr>`).join("")}</tbody>
      </table>
    </div>`).join("\n")}
  </div>
</section>

<section class="block twocol" id="alive">
  <div>
    <h2>Posters per week</h2>
    <p class="sub">Distinct posters, counted from the task list. Breadth, not volume. Both chains summed.</p>
    <div class="wkchart">
${wRows.map(([w, n]) => `      <div class="wk"><i style="height:${Math.max(3, (n / wMax) * 100).toFixed(1)}%"></i><span>${n}</span><em>${esc(w.slice(5))}</em></div>`).join("\n")}
    </div>
  </div>
  <div>
    <h2>What died</h2>
    <p class="sub">Posted, then never finished. The other side of the flow chart.</p>
    <div class="dead">
${C.map((c) => `      <div class="deadrow"><span class="tag ${c.name.toLowerCase()}">${esc(c.name)}</span>
        <span><b>${int(c.dead.expired)}</b> expired</span>
        <span><b>${int(c.dead.staleOpen)}</b> open, past expiry</span>
        <span><b>${int(c.dead.cancelled)}</b> cancelled</span></div>`).join("\n")}
    </div>
    <h3 class="mt">How crowded a task is</h3>
    <div class="dead">
${C.map((c) => c.crowding ? `      <div class="deadrow"><span class="tag ${c.name.toLowerCase()}">${esc(c.name)}</span>
        <span>median <b>${c.crowding.median}</b> entries</span>
        <span>90th pct <b>${c.crowding.p90}</b></span>
        <span>max <b>${int(c.crowding.max)}</b></span>
        <span><b>${pct(c.crowding.zeroShare)}</b> drew none</span></div>` : "").join("\n")}
    </div>
    <h3 class="mt">How long a task stays open</h3>
${C.map((c) => `    <p class="sub">${esc(c.name)}: ${c.window ? `median <b>${hh(c.window.median)}</b>, 90th percentile <b>${hh(c.window.p90)}</b>, over ${int(c.window.n)} tasks` : "no tasks with both stamps"}</p>`).join("\n")}
  </div>
</section>

<section class="block" id="heat">
  <div class="blockhead">
    <h2>When the market moves</h2>
    <div class="switches" role="tablist" aria-label="Heatmap dimension">
      <button data-heat="mode" class="on" role="tab" aria-selected="true">By mode</button>
      <button data-heat="hourOfWeek" role="tab" aria-selected="false">By hour of week</button>
    </div>
  </div>
  <p class="sub">Platform-wide, last 30 days, UTC. Colour is task count; the busiest cell in each row carries its number.</p>
  <div id="heatmap" class="heat"></div>
</section>

<section class="block" id="feed">
  <h2>The live feed</h2>
  <p class="sub">The most recent public activity, both chains, exactly as the API returns it.</p>
  <ol class="feed">
${feed.map((i) => `    <li><time class="mono">${esc((i.timestamp || "").slice(11, 16))}</time>
      <span class="tag ${i.chainId === 4217 ? "tempo" : "base"}">${i.chainId === 4217 ? "Tempo" : "Base"}</span>
      <span class="fa">${esc((i.actorDisplayName || (i.actor || "").slice(0, 10)))}</span>
      <span class="ft">${esc(feedLabel(i))}</span>
      <span class="tt">${esc((i.taskTitle || "").slice(0, 90))}</span></li>`).join("\n")}
  </ol>
</section>

<section class="block methods" id="methods">
  <h2>Methods</h2>
  <p>One build fetches every endpoint below once, on the server, and writes a single snapshot to
  <span class="mono">data.json</span>. The page reads that snapshot. The browser never calls Taskmarket's API, so no
  request ever comes from a visitor's address and nothing depends on CORS. A scheduled job rebuilds and republishes
  the page every hour; the <b>data as of</b> stamp at the top is when the fetch finished. Every number is reproducible:
  take the same endpoints at the same stamp and the figures match.</p>
  <ul class="eps">
    <li><span class="mono">GET /api/market/stats?chainId=…</span> <em>split by chain</em> — headline numbers</li>
    <li><span class="mono">GET /api/tasks?chainId=…&amp;limit=100&amp;cursor=…</span> <em>split by chain</em> — the whole task list, paged. Poster counts, concentration, awarded reward, dead tasks, crowding and open windows are all computed from it.</li>
    <li><span class="mono">GET /api/stats/platform-time-series?range=7d|30d|all&amp;bucket=day|week</span> <em>platform-wide</em> — posted and paid reward over time</li>
    <li><span class="mono">GET /api/stats/breakdowns</span> <em>platform-wide</em> — tasks by mode and status</li>
    <li><span class="mono">GET /api/stats/activity-heatmap?range=30d&amp;dimension=mode|hourOfWeek</span> <em>platform-wide</em> — the heatmap</li>
    <li><span class="mono">GET /api/stats/activity-feed?limit=40</span> <em>platform-wide</em> — the live feed, which already carries both chains</li>
  </ul>
  <p class="sub"><b>Why some figures are platform-wide.</b> Measured on 25 November 2026: the four endpoints marked
  platform-wide return an identical body for <span class="mono">chainId=4217</span>, <span class="mono">chainId=8453</span>
  and no parameter at all. Only <span class="mono">/api/market/stats</span> and <span class="mono">/api/tasks</span>
  actually filter by chain. So every per-chain figure on this page is derived from the task list, and the four
  aggregated endpoints are shown once, labelled, rather than duplicated into two identical columns.</p>
  <p class="sub">Chains: Tempo (<span class="mono">4217</span>, OUSD) and Base (<span class="mono">8453</span>, USDC).
  Reward amounts arrive in base units and are divided by 10<sup>6</sup>. "Awarded" counts the reward of tasks that
  carry a winner. "Open, past expiry" counts tasks still listed as open whose own expiry has passed.</p>
  <p class="sub">Read-only. No wallet connection, no cookies, no analytics, no third-party requests beyond this page's own files.</p>
</section>

</main>

<footer>
  <img src="./taskmarket-mark.png" alt="" height="22" width="22">
  <p>Made for a paid Taskmarket bounty. Not an official Taskmarket product.
  The market is at <a href="https://taskmarket.dev">taskmarket.dev</a>.</p>
</footer>

<script id="snap" type="application/json">${JSON.stringify(snap).replace(/</g, "\\u003c")}</script>
<script src="./app.js"></script>
</body></html>`;
}
