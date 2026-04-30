# Progress And Next Steps

## Done

See [DONE.md](./DONE.md) for the full chronological log. High-level summary:

- Built a GitHub-style repo overview vertical slice: Hono API + Vite/React UI rendering repo metadata, branches, commits, and a Code tab.
- Wired live Freestyle Git data (branches, commits, file tree, file contents) with a `bun run seed:freestyle` script that uploads tracked files to a Freestyle repo.
- Implemented nested directory browsing, breadcrumb navigation, line-numbered file viewer, README preview at root, and URL-synced path state with back/forward support.
- Added a single `bun run start` dev command, a Playwright e2e suite, and a `RepoList` page routing between `/` and `/:owner/:repo` with breadcrumb back-nav.
- Shipped magic-link email auth via Resend (replacing initial password auth), backed by Postgres (Docker Compose) locally and Cloudflare D1 in production.
- Deployed to Cloudflare Workers at `https://better-github.dexter-de6.workers.dev` with assets binding, D1 migrations, and Worker secrets for Freestyle/Resend/JWT.
- Built a GitHub Actions–style workflow engine: `.better-github/workflows/*.yml` parsed and executed on Freestyle VMs, with `workflow_runs` persistence in Postgres and D1.
- Added Actions tab UI: runs list with status icons, run detail view with per-step logs, cancel + re-run buttons, and a workflow file editor (list/view/create/edit/delete).
- Added a signed `POST /api/webhooks/push` endpoint (HMAC-SHA256) that auto-triggers matching workflows on push; wired into `seed:freestyle` so seeding triggers CI/Deploy end-to-end.
- Added real-time run status updates: WebSocket broadcaster locally, Cloudflare Durable Object (`WorkflowBroadcaster`) on the Worker with cached-state replay on subscribe.
- Ported all Actions/workflow CRUD routes to the Worker against D1 + Freestyle (including a fix for the Freestyle SDK's CF-Workers incompatibilities, documented in `research_findings/`).
- Refactored persistence behind seams: `WorkflowRunRepository` (Postgres + D1 adapters) and `makeD1AuthDb` peer to the Bun/Postgres `AuthDB`; consolidated row mapping in `workflow-run-row.ts`.
- Extracted shared workflow lifecycle helpers (`newQueuedRun`, `DEFAULT_WORKFLOW_CONTENT`, `deriveTerminalStatus`, `startWorkflowExecution`) so `server.ts` and `worker.ts` go through one constructor / one execution helper.
- Collapsed the duplicated repo/actions/workflow/webhook route table behind `registerRepositoryRoutes(app, deps)`, leaving `server.ts` and `worker.ts` to provide runtime-specific auth, storage, broadcasting, and execution dependencies.
- Extracted shared auth route wiring behind `registerAuthRoutes(app, deps)`, so Bun/Postgres and Worker/D1 both inject runtime-specific magic-link/JWT behavior while preserving the same auth API and `requireAuth` middleware behavior.
- 112 unit tests, 4 Playwright e2e tests, and full typecheck + Biome lint all passing.

## Highest priority task
<guidance> keep this a low level, the smallest individually testable unit </guidance>

Task: Start the `App.tsx` page split by extracting the repository breadcrumb/home-link components into a small module with their existing tests preserved.
Verification: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:e2e`; browser-smoke repo navigation with `agent-browser`.

## Next Up

- keep hardening the minimal Actions clone on Freestyle sandboxes/vms until it can reliably deploy better-github itself with `wrangler` on pushes
- add a first pass at repository visibility/collaborator modeling for private repos

### Architecture deepening opportunities

Surfaced via `/improve-codebase-architecture`. Ordered by leverage; #1 unblocks #2.

1. **Unify workflow persistence behind a `WorkflowRunRepository` seam.** *(done)*
   - Files: `src/workflow-db.ts`, `src/workflow-db-d1.ts`, `src/workflow-run-row.ts`.
   - `workflow-run-row.ts` now exports `WorkflowRunRepository` + `WorkflowRunUpdates`. `workflow-db.ts` exposes a `postgresWorkflowRunRepo` singleton; `workflow-db-d1.ts` exposes a `makeD1WorkflowRunRepo(db)` factory. `server.ts` and `worker.ts` go through the seam (`runRepo.get/list/insert/update`) instead of importing runtime-specific functions.

2. **Collapse the duplicated route table in `server.ts` and `worker.ts`.** *(done)*
   - Files: `src/server.ts` (394), `src/worker.ts` (576).
   - `src/repo-routes.ts` now owns shared `/api/repos`, `/api/repos/:owner/:repo`, Actions run, workflow CRUD, cancel, and signed push webhook routes. `server.ts` and `worker.ts` inject the runtime-specific run repository, Freestyle env bridge, workflow-file helpers, broadcast behavior, webhook secret source, and execution lifecycle.
   - Remaining duplication is intentionally auth/static/runtime boot code, where Bun and Cloudflare Workers still differ.

3. **Make the auth seam symmetric — lift the D1 `AuthDB` adapter out of `worker.ts`.** *(done)*
   - Files: `src/auth-d1.ts` (new), `src/worker.ts`.
   - `auth-d1.ts` now exports a `makeD1AuthDb(d1)` factory peer to `auth.ts`'s Bun/Postgres adapter. `worker.ts` calls `makeD1AuthDb(c.env.DB)` instead of the previous inlined `makeD1Db`. Both adapters are now named, file-level, and visually parallel to the `workflow-db.ts` / `workflow-db-d1.ts` pair.

4. **Extract shared auth route wiring.** *(done)*
   - Files: `src/auth-routes.ts`, `src/server.ts`, `src/worker.ts`.
   - `auth-routes.ts` now owns `POST /api/auth/request-link`, `GET /api/auth/verify`, and the shared Bearer-token `requireAuth` middleware. `server.ts` injects the local Bun/Postgres wrapper functions from `auth.ts`; `worker.ts` injects D1-backed `auth-core` calls plus Worker secrets from `c.env`.

5. **Break up `App.tsx` (1740 lines) into per-page modules.**
   - Files: `src/App.tsx`.
   - Problem: declares 9 inline subcomponents (`AuthForm`, `RepoBreadcrumb`, `ReadmePreview`, `RepoList`, `LineNumberedCode`, `WorkflowEditor`, `RunDetail`, `ActionsTab`, `RepoBrowser`) plus status-icon helpers, and runs ~4 state machines (auth, route, repo overview, runs) cascading via prop callbacks. Subcomponents can't be tested in isolation — `App.test.tsx` reaches them through the megacomponent surface.
   - Deletion test: real complexity, but concentrated wrong. A page-shaped split (`RepoListPage`, `RepoDetailPage`, `ActionsPage`) lets each page be tested through its own interface.
   - Shape: page-shaped split with a thin top-level router and small hooks (`useAuth`, `useRepoRoute`). Largest yard work, lowest risk per move — can land incrementally one page at a time.

## Long Term Goals

- Add public/private repo specifications and add a public repo list to the default un-authed route, move signin to its own route with a "log in or sign up" button in the header
- reskin the app to have a minimalist terminal-ui theme - all font the same size, fixed width font everywhere, only colors/dimming/bold for differentiation
- add hotkeys for nav, arrows and vim-style j/k/h/l/esc using useHotkeys
- Add repository navigation for Actions (placeholder for now), and Settings.
- Add file contents view after nested directory browsing exists.

## Out of scope

- pull requests
- issues
