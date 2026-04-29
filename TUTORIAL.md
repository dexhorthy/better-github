# better-github — Local Testing Tutorial

A walk-through of every shipped feature and how to exercise it locally.

## 1. Prerequisites

- [Bun](https://bun.com) v1.3+
- Docker (for Postgres)
- Freestyle account + API key (for live repo browsing & workflow VMs)
- Resend account + API key (for magic-link email)

## 2. Configure environment

Create `.env` at the repo root:

```bash
FREESTYLE_API_KEY=fs_...
FREESTYLE_REPO_ID=...                # optional; otherwise looked up by name
RESEND_API_KEY=re_...
RESEND_API_DOMAN=yourdomain.com      # note: spelling matches code
JWT_SECRET=any-long-random-string
WEBHOOK_SECRET=any-long-random-string
DATABASE_URL=postgres://postgres:postgres@localhost:5434/better_github
```

## 3. Boot dependencies

```bash
docker compose up -d        # starts Postgres on :5434
bun install
```

## 4. Seed Freestyle (one-time)

Pushes tracked workspace files into a Freestyle Git repo so the UI has data:

```bash
bun run seed:freestyle better-github
```

Copy the printed repo id into `.env` as `FREESTYLE_REPO_ID`.

## 5. Run the stack

```bash
bun run start
```

- Hono API: http://localhost:8787
- Vite UI:  http://127.0.0.1:5173 (proxies `/api/*` to 8787)

Health check:

```bash
curl http://localhost:8787/api/health   # {ok:true}
```

---

## What you can test

### Auth (magic-link via Resend)
1. Open http://127.0.0.1:5173 → email-only login form.
2. Submit your email → "Check your email" confirmation.
3. Click the emailed link → lands back at `/?token=...` and auto-signs in.
4. Sign-out button in the topbar clears the session.

Behind the scenes: `users` + `magic_link_tokens` tables in Postgres, JWT signed with `JWT_SECRET`, 15-min token expiry, single-use.

Bypass email in tests: `_insertTestToken` / `_hasPendingToken` helpers in `src/auth.ts`.

### Repositories list (`/`)
After login you see a list of fixture repos (`dexhorthy/better-github`, `dexhorthy/hello-world`). Click one to drill in.

### Repo browser (`/:owner/:repo`)
- File tree fetched live from Freestyle Git.
- Click directories to navigate; URL syncs to `?path=...`.
- Click a file → line-numbered viewer.
- README.md preview rendered at root path.
- Breadcrumb `Better GitHub / dexhorthy / repo / path` — every segment SPA-navigates.
- Back/forward buttons restore prior path.
- Deep links (`/:owner/:repo?path=src/App.tsx`) load directly.

### Actions tab
Switch to **Actions** in the repo page.
- Lists workflow runs with status icons (queued / in_progress / success / failure).
- **Run workflow** button triggers `.better-github/workflows/ci.yml` on a Freestyle VM (`oven/bun:1` + apt `git`).
- Click a run → detail view with per-step logs, status icons, timestamps, polling every 5s.
- Live updates also stream over WebSocket at `ws://localhost:8787/ws` (subscribe to a run id).

Trigger via API:
```bash
TOKEN=...   # JWT from login
curl -X POST http://localhost:8787/api/repos/dexhorthy/better-github/actions/runs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workflowPath":".better-github/workflows/ci.yml"}'
```

### Push webhook
`POST /api/webhooks/push` triggers any workflow whose `on:` matches the branch.
Requires HMAC-SHA256 signature header `X-Hub-Signature-256: sha256=<hex>` over the raw body, keyed by `WEBHOOK_SECRET`.

```bash
BODY='{"owner":"dexhorthy","repo":"better-github","branch":"main","commitSha":"abc123"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | awk '{print $2}')
curl -X POST http://localhost:8787/api/webhooks/push \
  -H "X-Hub-Signature-256: sha256=$SIG" \
  -H "Content-Type: application/json" \
  -d "$BODY"
```
Returns the list of triggered workflow runs. Missing/bad signature → 401.

`bun run seed:freestyle` automatically POSTs to the webhook after a successful Freestyle commit using `WEBHOOK_SECRET`. Override the target with `WEBHOOK_URL=...` (defaults to the deployed Worker), or set `WEBHOOK_TRIGGER=0` to skip. The deployed Worker also has `WEBHOOK_SECRET` set via `wrangler secret put WEBHOOK_SECRET`; rotate locally and on the Worker together.

### WebSocket live updates
```js
const ws = new WebSocket("ws://localhost:8787/ws");
ws.onopen = () => ws.send(JSON.stringify({ type: "subscribe", runId: "<id>" }));
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```
Receives full run object on subscribe, then deltas as the run progresses.

---

## Tests

```bash
bun test              # unit + API tests (52+ tests, Postgres required)
bun run test:e2e      # Playwright UI flows (auto-boots api+vite)
bun run typecheck
bun run lint          # biome
```

## Production deploy

```bash
bun run deploy        # vite build + wrangler deploy
```
Worker uses D1 instead of Postgres (see `src/worker.ts`, `migrations/0001_schema.sql`). Live at `https://better-github.dexter-de6.workers.dev`.

## Troubleshooting

- **`/api/repos/...` 401** — token expired or missing; sign out and back in.
- **Workflow run stuck in `queued`** — check `FREESTYLE_API_KEY`; Freestyle plan must allow VM provisioning (no custom sizing).
- **Magic link never arrives** — verify `RESEND_API_KEY` and that `RESEND_API_DOMAN` is a verified Resend sender domain.
- **Postgres connection refused** — `docker compose up -d` and confirm port 5434 isn't taken.
