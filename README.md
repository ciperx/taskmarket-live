# Taskmarket, live

A public, read-only dashboard of Taskmarket's market data — money posted against
money paid, who puts up the reward, what died, how crowded a task is, and the live
activity feed. Both chains, one page.

**Live:** https://ciperx.github.io/taskmarket-live/

Custom domain can be attached at any time by dropping a `CNAME` file in the repo root.

## Why it is built this way

The Taskmarket API does not send CORS headers, so a page that calls it from the
browser works locally and breaks the moment it is deployed. This site never calls the
API from the browser. A build step runs on the server — GitHub Actions, hourly — fetches
every endpoint once, and writes a single static `dist/`. The page then reads that
snapshot, so it renders instantly on a phone and every number is reproducible.

## One-command deploy

```bash
node build.mjs          # fetch, render, write dist/
npx serve dist          # or: python3 -m http.server -d dist
```

To publish: enable GitHub Pages with **Settings → Pages → Source: GitHub Actions**.
`.github/workflows/build.yml` rebuilds and redeploys every hour and on every push.
No secrets, no tokens, no dependencies — the build uses only Node's built-in `fetch`
and `fs`, so there is nothing to install and nothing to audit.

## Stack

- Node 20+, zero dependencies. `build.mjs` fetches and computes, `render.mjs` writes
  the HTML server-side, `app.js` only redraws a chart when a switch is used.
- Fonts and mark are self-hosted from the Taskmarket brand kit. No third-party requests.
- No cookies, no analytics, no wallet connection. Read-only in the strict sense.

## Endpoints used

| Endpoint | Scope |
| --- | --- |
| `GET /api/market/stats?chainId=…` | per chain |
| `GET /api/tasks?chainId=…&limit=100&cursor=…` | per chain |
| `GET /api/stats/platform-time-series?range=7d\|30d\|all&bucket=day\|week` | platform-wide |
| `GET /api/stats/breakdowns` | platform-wide |
| `GET /api/stats/activity-heatmap?range=30d&dimension=mode\|hourOfWeek` | platform-wide |
| `GET /api/stats/activity-feed?limit=40` | platform-wide |

### One measured detail worth knowing

On 25 November 2026, four of those endpoints ignored `chainId` entirely: they returned
a byte-identical body for `chainId=4217`, `chainId=8453`, and no parameter at all. Only
`/api/market/stats` and `/api/tasks` actually filter by chain.

Rather than duplicate one platform-wide number into two identical columns, every figure
on the page is labelled with the scope it really has, and every per-chain figure is
derived from `/api/tasks`. Nothing is invented to fill a split.

`/api/stats/activity-feed` also already returns both chains in one response, so the feed
is fetched once and each row is tagged by its own `chainId`.

## Refresh

Every hour, via the workflow schedule. The page shows the exact time the fetch finished
at the top, and `dist/data.json` is the snapshot it was built from. To verify a number,
take the same endpoint at the same stamp.

## Reading the per-chain figures

- **Awarded** — sum of `reward` over tasks whose `awardCount` is above zero.
- **Posted** — sum of `reward` over every task in the list.
- **Poster concentration** — tasks grouped by `requesterDisplayName`, no name inferred
  from an address.
- **Open, past expiry** — still listed `open`, but `expiryTime` has passed.
- **Crowding** — `submissionCount` over finished tasks; "drew none" is the share that
  received zero submissions.

Reward amounts arrive in base units and are divided by 10⁶.

## Licence

MIT. See `LICENSE`.

Made for a paid Taskmarket bounty. Not an official Taskmarket product.
