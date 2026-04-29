# Progress And Next Steps

## Done

- Created the first usable GitHub repository overview vertical slice in `src/`.
- Added a Hono API endpoint for repository metadata, branches, commits, pull requests, and files.
- Added a Vite React UI that renders a GitHub-like repository code tab.
- Added API tests for the repository endpoint.

- Wired real Freestyle Git repository data into the Hono API via `src/freestyle-git.ts`:
  - Installed `freestyle` npm package for full Git API access (branches, commits, contents).
  - The `/api/repos/:owner/:repo` endpoint now fetches live branches, commits, and file tree from Freestyle Git.
  - Falls back to seeded fixture data when no matching Freestyle repo is found or the API is unavailable.
  - `FREESTYLE_REPO_ID` env var can pin the Freestyle repo ID directly without a name lookup.
- Added `bun run seed:freestyle better-github` to push tracked workspace files into Freestyle Git:
  - Uses `git ls-files` so ignored local files like `.env` and dependency folders are not uploaded.
  - Created and updated Freestyle repo `be1dc513-a62f-4be9-aee6-a160fd428f46` with 24 tracked files.
  - Browser-verified the UI renders live Freestyle file names and the seeded commit history.
- Added nested directory browsing for live Freestyle directories:
  - `/api/repos/:owner/:repo?path=src` returns child file entries for the requested directory.
  - The code tab renders path breadcrumbs and clickable directory rows.
  - Browser-verified clicking `src` updates the file list to source files including `App.tsx` and `server.ts`.
- Added a file contents viewer for live Freestyle files:
  - `/api/repos/:owner/:repo?path=src/App.tsx` decodes the base64 file payload and returns `fileContent` (path/name/size/text).
  - The code tab renders a monospace viewer with a header (filename + size) instead of the file list when `fileContent` is set.
  - Files in the listing are now clickable (`openFile`) so the path can drill into a leaf file.
  - Browser-verified end-to-end: click `src`, click `App.tsx`, breadcrumbs become `better-github / src / App.tsx` and the file source renders.
  - Added an API test asserting `fileContent.text` for `src/App.tsx` contains `function App()`.
- Added a line-numbered gutter to the file contents viewer:
  - `LineNumberedCode` renders one source row per text line with a left numeric gutter and source text cell.
  - Added a DOM-level static render test asserting one `.line-number` cell per file text line.
  - Browser-verified opening `src/App.tsx` shows a left line-number gutter beside the source.
- Initialized the repository path from the URL query string:
  - Added `readPathFromSearch(search)` helper that parses `?path=...` and trims surrounding slashes.
  - `App` seeds its `path` state from `window.location.search` so deep links open the matching directory or file directly.
  - Added unit tests covering empty, directory, nested file, and slash-trimmed query strings.
  - Browser-verified `http://127.0.0.1:5173/?path=src/App.tsx` loads the file viewer with the `better-github / src / App.tsx` breadcrumb and `function App()` source on first paint.
- Synced `window.location.search` to the active `path` state and supported back/forward:
  - Added `buildPathSearch(path)` helper that produces `?path=<encoded>` (or empty for root).
  - `App` pushes a history entry with the encoded path whenever `path` changes, and listens to `popstate` to restore prior path on back/forward.
  - Added unit tests for `buildPathSearch` covering empty/dir/nested/slash-trimmed inputs and a round trip with `readPathFromSearch`.
  - Browser-verified clicking `src` then `App.tsx` updates the URL to `?path=src%2FApp.tsx`; pressing back restores `?path=src` with the directory listing, and a second back returns to root.
- Rewrote `README.md` to document the local dev workflow: prerequisites, `.env` setup with `FREESTYLE_API_KEY` and `FREESTYLE_REPO_ID`, `bun run seed:freestyle`, and the two-terminal `bun run api` + `bun run dev` flow.
  - Added `src/readme.test.ts` asserting the README mentions `bun run dev`, `bun run api`, `bun run seed:freestyle`, both Freestyle env vars, and the `127.0.0.1:5173` dev URL.
  - Smoke-tested `bun run api` boots and `GET /api/health` returns `{ok:true}` per the README instructions.
- Added a single `bun run start` command that boots both the Hono API and Vite dev server:
  - `src/start.ts` spawns `bun run src/server.ts` and `bun x vite --host 127.0.0.1` with shared stdio, forwards SIGINT/SIGTERM to both children, and exits when either child dies.
  - Added `src/start.test.ts` asserting `package.json` declares a `start` script and that `src/start.ts` references both `src/server.ts` and `vite`.
  - Updated README so the local dev section leads with `bun run start`, with the two-terminal flow as a fallback.
  - Smoke-verified: `bun run start` boots, `GET http://localhost:8787/api/health` returns 200 and `GET http://127.0.0.1:5173/` returns 200.

- Made the repository name in the repo header a clickable link that resets the active path to root:
  - Extracted `RepoHomeLink` rendering an anchor with `href="/"` and `data-testid="repo-home-link"` so deep links can be unwound without using the browser back button.
  - Click handler calls `event.preventDefault()` and resets `path` to `""` (which clears the URL query via the existing path → URL effect), but bails out on modifier-key clicks so cmd/ctrl/shift/alt-click preserves default open-in-new-tab navigation.
  - Added unit tests covering the rendered anchor markup, the plain-click path (preventDefault + onHome called), and modifier-key passthrough (no preventDefault, no onHome).
  - Browser-verified from `/?path=src/App.tsx`: clicking the `better-github` link in the repo header navigates to `/`, the breadcrumb collapses to just `better-github`, and the root file listing (README.md, src, etc.) renders in place of the file viewer.

- Rendered a repository README preview below the file list on the root path:
  - Added `readme?: { text: string }` to `RepositoryOverview` type and `FreestyleRepoData`.
  - `fetchFreestyleRepoData` fetches `README.md` via `repo.contents.get({ path: "README.md" })` only at root path (`path === ""`), decodes base64, and returns it as `readme.text`.
  - `buildRepositoryOverview` in server passes `readme` through to the API response.
  - Added `ReadmePreview` component with a styled header and pre-formatted body, rendered below the file list only when at root path and readme is present.
  - API test asserts `readme` is defined and non-empty at root; asserts it is absent for subdirectory paths.
  - Unit test asserts `ReadmePreview` renders the text inside `data-testid="repo-readme"`.
  - Browser-verified: root path shows file list followed by a README.md section with the repo content; navigating to `?path=src` hides the README section.

- Added Playwright e2e test suite for UI integration tests:
  - Installed `@playwright/test`, added `playwright.config.ts` with Chromium project and webServer config that auto-starts both the Hono API and Vite dev server.
  - `bun run test:e2e` runs 4 tests: root page renders file list and README section; clicking `src` shows src files and hides README; clicking `App.tsx` shows the file viewer with line numbers; clicking the repo name resets to root.
  - Fixed `bun run test` to scope to `src/` so bun test doesn't pick up playwright spec files.
  - Fixed lint issues caught by Biome: removed non-null assertion in `main.tsx`, replaced `role="region"` with `<section>`, suppressed `noArrayIndexKey` for static file content.
  - All 26 unit tests and 4 e2e tests pass; biome check is clean.

- Added email + password authentication with SQLite and HMAC-SHA256 JWTs:
  - `src/auth.ts`: SQLite `users` table, `register`/`login` using `Bun.password.hash`/`verify`, manual JWT `sign`/`verify` via `crypto.subtle`.
  - `POST /api/auth/register` and `POST /api/auth/login` routes added to `server.ts`.
  - `requireAuth` Hono middleware guards `GET /api/repos/:owner/:repo` — returns 401 without a valid `Authorization: Bearer` token.
  - `AuthForm` component with login/register toggle, error display, and JWT persisted to `localStorage`.
  - `RepoBrowser` component handles the repo page when authenticated; sends `Authorization: Bearer` on every API fetch and signs out on 401.
  - Sign out button in topbar clears localStorage and returns to the login form.
  - New API tests: register/login return tokens, wrong password returns 401, duplicate email returns 400, unauthenticated repo request returns 401.
  - All 31 unit tests pass; biome check is clean.
  - Browser-verified: `/` shows login form; registering loads repo page with email + sign-out button; sign out returns to login; re-login works.

- Replaced password auth with magic-link email login via Resend:
  - `src/auth.ts`: removed `password_hash` column from `users` table; added `magic_link_tokens` table (email, token, expires_at); `requestMagicLink` upserts user, issues a random 32-byte base64url token stored with 15-min expiry, emails via Resend API; `verifyMagicLink` validates and consumes the token, returning a JWT.
  - `POST /api/auth/request-link` (body: email) — emails a sign-in link, returns `{ ok: true }`.
  - `GET /api/auth/verify?token=` — consumes the token and returns `{ token, email }`.
  - `AuthForm` now shows only an email input + "Send magic link" button; auto-verifies if `?token=` is present in the URL on mount; confirmation screen shows "Check your email — we sent a sign-in link to <email>."
  - Test helpers `_insertTestToken` / `_hasPendingToken` allow API tests to bypass real email delivery.
  - API tests: missing/invalid email → 400; valid token → 200 JWT; expired token → 401; unknown token → 401; token consumed on first use.
  - Browser-verified: email form shows no password field; submitting shows confirmation screen.

- Migrated from SQLite to Postgres with Docker Compose:
  - Added `docker-compose.yml` at repo root: `postgres:16` listening on port 5434 with healthcheck.
  - Replaced `bun:sqlite` / `Database` in `src/auth.ts` with `Bun.SQL` (built-in Bun Postgres client).
  - `DATABASE_URL` env var (default: `postgres://postgres:postgres@localhost:5434/better_github`).
  - Schema unchanged: `users` + `magic_link_tokens` tables, same columns, created with `CREATE TABLE IF NOT EXISTS`.
  - Test helpers `_insertTestToken` / `_hasPendingToken` converted to async (`Promise<void>` / `Promise<boolean>`).
  - All 34 unit tests pass with Postgres; biome lint is clean.
  - Browser-verified: login form shows email input + "Send magic link"; submitting shows "Check your email" confirmation.

- Added a repositories list page at `/` (after login):
  - `GET /api/repos` (auth-required) returns the full `repositories` array.
  - Added a second fixture repository `dexhorthy/hello-world` in `src/data.ts`.
  - `parseRoute(pathname)` helper maps `/` → `{ page: "repos" }` and `/:owner/:repo` → `{ page: "repo", owner, repo }`.
  - `RepoList` component fetches `/api/repos` and renders each repo as a card: name link, description, visibility badge, language, and relative updated time.
  - `App` now routes between `RepoList` (at `/`) and `RepoBrowser` (at `/:owner/:repo`) using `window.history.pushState` and `popstate` for SPA navigation.
  - `RepoBrowser` accepts `owner` and `repo` as props and uses them in the API URL instead of hardcoded values.
  - `RepoHomeLink` accepts an optional `href` prop (defaults to `"/"`) so the repo title link targets `/:owner/:repo`.
  - Added unit tests for `parseRoute` (root, `/:owner/:repo`, trailing slash).
  - Added API test asserting `GET /api/repos` returns 200 with ≥ 2 entries including both fixture repos.
  - Browser-verified: after login, repos list shows `dexhorthy/better-github` and `dexhorthy/hello-world`; clicking a repo navigates to `/:owner/:repo` with the code browser; pressing back returns to the list.

- Added a `RepoBreadcrumb` component above the repo header in `RepoBrowser`:
  - `RepoBreadcrumb` renders `Better GitHub / dexhorthy` with `Better GitHub` as a link that calls `onBack` to navigate to `/`.
  - Modifier-key clicks (cmd/ctrl/shift/alt) pass through for open-in-new-tab behavior.
  - CSS classes `repo-breadcrumb`, `repo-breadcrumb-home`, `repo-breadcrumb-sep`, `repo-breadcrumb-owner` added to `styles.css`.
  - Unit tests: breadcrumb renders `href="/"` link with `data-testid="repo-breadcrumb-home"` and owner text; plain click calls `onBack` and prevents default; modifier-key click skips both.
  - Browser-verified: clicking `dexhorthy/better-github` shows `Better GitHub / dexhorthy` breadcrumb above repo header; clicking `Better GitHub` returns to repos list SPA-style without a full reload.

- Deployed to Cloudflare Workers at `https://better-github.dexter-de6.workers.dev`:
  - Created `src/auth-core.ts` with a shared `AuthDB` interface + all JWT/magic-link logic; `auth.ts` wraps it with a Bun.SQL implementation for local dev.
  - Created `src/worker.ts` as the CF Workers entry point: implements `AuthDB` using D1's prepared-statement API, uses Hono with `{ Bindings: Env }` to access CF env vars, serves the Vite-built frontend via the `[assets]` directory binding.
  - Created `wrangler.toml` targeting `src/worker.ts` with `nodejs_compat` flag, the `dist/` assets directory, and the D1 database binding (`better-github-auth`, UUID `22233df0-3122-4361-8e09-d72621ee1c33`).
  - Created `migrations/0001_schema.sql` and applied it to the remote D1 database with `wrangler d1 migrations apply --remote`.
  - Added `bun run deploy` script: `vite build && wrangler deploy` (reads `CLOUDFLARE_API_TOKEN` from `.env`).
  - Set Worker secrets via CF API: `FREESTYLE_API_KEY`, `RESEND_API_KEY`, `RESEND_API_DOMAN`, `FREESTYLE_REPO_ID`, `JWT_SECRET`.
  - Browser-verified: login form renders at the deployed URL; `/api/health` returns `{ok:true}`; `/api/repos` without auth returns 401; no JS errors.
  - All 42 unit tests pass; biome lint is clean.

- Added GitHub Actions-style CI workflow infrastructure and Actions tab UI:
  - Created `.better-github/workflows/ci.yml` with a basic workflow definition (checkout, bun install, bun test, lint).
  - Created `src/workflows.ts` with workflow YAML parsing, trigger logic (`shouldTrigger`), and Freestyle VM-based execution (`executeWorkflowRun`) using the `oven/bun:1` base image.
  - Created `src/workflow-db.ts` with Postgres `workflow_runs` table and CRUD operations (`insertWorkflowRun`, `updateWorkflowRun`, `getWorkflowRun`, `listWorkflowRuns`).
  - Added API endpoints: `GET /api/repos/:owner/:repo/actions/runs` (list runs), `GET /api/repos/:owner/:repo/actions/runs/:runId` (get run), `POST /api/repos/:owner/:repo/actions/runs` (trigger run).
  - Added `ActionsTab` component with workflow runs list, status icons (queued/in_progress/success/failure), and "Run workflow" button.
  - Updated `RepoBrowser` with tab state switching between Code and Actions tabs.
  - Added CSS styles for actions tab, run items, and status badges.
  - Browser-verified: Actions tab shows "Workflow runs" heading and "Run workflow" button; clicking tab toggles between Code and Actions views.
  - All 42 unit tests pass; biome lint is clean.

- Wired up Freestyle VM execution for workflow runs:
  - Fixed route order in `server.ts`: more specific routes (`/api/repos/:owner/:repo/actions/runs`) now come before less specific ones (`/api/repos/:owner/:repo`) to prevent routing conflicts.
  - Updated `workflows.ts` VmSpec to use plan defaults (removed custom `.rootfsSizeGb()`, `.memSizeGb()`, `.vcpuCount()` to avoid CUSTOM_SIZING_NOT_ALLOWED errors).
  - Added `.aptDeps("git")` to VmSpec so git is available for checkout step.
  - API-verified: POST `/api/repos/:owner/:repo/actions/runs` creates a run that transitions queued → in_progress, and VMs are provisioned via Freestyle API.
  - Browser-verified: Actions tab shows workflow runs with status icons (In Progress, Failure) and the "Run workflow" button triggers new runs.
  - All 42 unit tests pass; biome lint is clean.

- Added `.better-github/workflows/deploy.yml` for Cloudflare deployment:
  - Workflow triggers on push to main branch only (not PRs).
  - Steps: checkout, install deps, build with Vite, deploy via `bunx wrangler deploy`.
  - Verified workflow parses correctly via `parseWorkflow()` and `shouldTrigger()` functions.
  - API-verified: POST `/api/repos/:owner/:repo/actions/runs` with deploy.yml content returns 201 and creates a queued run.
  - All 42 unit tests pass; biome lint is clean.

- Added webhook endpoint to trigger workflows on push events:
  - Added `fetchWorkflowFiles(repoName)` helper in `freestyle-git.ts` to fetch workflow YAML files from `.better-github/workflows/`.
  - Added `POST /api/webhooks/push` endpoint that accepts `{ owner, repo, branch, commitSha }` payload.
  - Endpoint reads all workflow files from the repo, parses them with `parseWorkflow()`, and uses `shouldTrigger()` to check which workflows should run for the push event.
  - Each matching workflow creates a workflow run in the database and executes in the background on Freestyle VMs.
  - Webhook endpoint does not require authentication (similar to GitHub webhooks which use signatures instead).
  - Added API tests: missing fields returns 400, valid payload returns triggered workflows list, endpoint does not require auth.
  - All 45 unit tests pass; biome lint is clean.

- Added webhook signature verification for push events using HMAC-SHA256:
  - Created `src/webhook-signature.ts` with `computeWebhookSignature(body)` and `verifyWebhookSignature(body, signatureHeader)` functions.
  - Uses `WEBHOOK_SECRET` env var (defaults to dev secret) to generate/verify signatures.
  - Signature format matches GitHub's `X-Hub-Signature-256` header: `sha256=<hex>`.
  - Updated `POST /api/webhooks/push` to require valid signature header; returns 401 on missing/invalid signature.
  - Uses timing-safe comparison to prevent timing attacks.
  - Added API tests: missing signature returns 401, invalid signature returns 401, valid signature with missing fields returns 400, valid signature with valid payload returns 200.
  - All 47 unit tests pass; biome lint is clean.

- Added second git remote and updated PROMPT.md:
  - Added `upstream` remote pointing to `git@github.com:dexhorthy/better-github` (same as `origin`).
  - Updated PROMPT.md guidance with note to push changes to both origin and upstream remotes.
  - `git remote -v` now shows both `origin` and `upstream` remotes.

- Added workflow run detail view with step-level logs and execution status:
  - Added `WorkflowStepResult` type with step name, status, timestamps, and logs.
  - Updated `WorkflowRun` type to include optional `steps` array.
  - Modified `executeWorkflowRun` in `workflows.ts` to track per-step results (status, logs, timing).
  - Added `steps JSONB` column to `workflow_runs` Postgres table with migration for existing tables.
  - Updated `insertWorkflowRun`, `updateWorkflowRun`, `getWorkflowRun`, and `listWorkflowRuns` to store/retrieve steps.
  - Created `RunDetail` component with expandable step logs, back button, and run metadata display.
  - Created `StepStatusIcon` component for step-level status indicators (pending/running/success/failure/skipped).
  - Made workflow runs clickable in `ActionsTab` to navigate to the detail view.
  - Added auto-refresh polling (5s) for run detail to show real-time updates.
  - Added CSS styles for run detail view, steps list, and log display.
  - Added API test verifying `GET /api/repos/:owner/:repo/actions/runs/:runId` returns run with steps field.
  - Added unit tests for `RunDetail` component rendering steps and back button.
  - All 52 unit tests pass; biome lint is clean.

- Added real-time workflow run status updates via WebSocket:
  - Created `src/websocket.ts` with WebSocket handlers for subscribe/unsubscribe to specific runs.
  - `broadcastRunUpdate(run)` sends full run details to subscribed clients, summary to others.
  - Wired WebSocket handlers to `Bun.serve()` at `/ws` endpoint in `server.ts`.
  - Created `src/useWorkflowWebSocket.ts` React hook for WebSocket connection with auto-reconnect.
  - Updated `ActionsTab` to use WebSocket for real-time updates instead of polling.
  - When a run is selected, client subscribes to that run ID for detailed step updates.
  - Removed 5-second polling interval in favor of push-based WebSocket updates.
  - Added unit tests for WebSocket handlers: open/close, subscribe/unsubscribe, broadcast behavior.
  - Browser-verified: triggering a workflow run shows instant status transitions (queued → in_progress → success/failure) without manual refresh.
  - All 59 unit tests pass; biome lint is clean.

- Added workflow run cancellation:
  - Added "cancelled" status to `WorkflowRun` type in both `types.ts` and `workflows.ts`.
  - Created cancellation registry (`requestCancellation`, `isCancelled`, `clearCancellation`) in `workflows.ts` to signal running workflows to stop.
  - Updated `executeWorkflowRun` to check for cancellation between steps and jobs.
  - Added `POST /api/repos/:owner/:repo/actions/runs/:runId/cancel` endpoint that marks queued runs as cancelled immediately or signals in-progress runs to stop.
  - Added Cancel button in `RunDetail` component for queued/in_progress runs.
  - Added `RunStatusIcon` and `run-status-badge` styles for cancelled status.
  - Added 3 API tests for cancel endpoint (success, 404, 401 without auth).
  - All cancel tests pass; biome lint is clean.

- Added workflow file viewer in UI:
  - Added `GET /api/repos/:owner/:repo/workflows` endpoint to fetch workflow files from Freestyle Git.
  - Added `WorkflowFile` type to `types.ts`.
  - Created `WorkflowEditor` component that lists workflow files and displays YAML content with syntax highlighting.
  - Added "View workflows" button in ActionsTab to toggle between runs list and workflow editor.
  - Added CSS styles for workflow editor layout, file list, and content viewer.
  - Added unit tests for WorkflowEditor component rendering.
  - Added API tests for workflows endpoint (returns files, requires auth).
  - All new tests pass; biome lint is clean.

- Added re-run workflow button for completed runs:
  - POST `/api/repos/:owner/:repo/actions/runs` now accepts `rerunOf` parameter to re-run a workflow from a previous run ID.
  - Server looks up original run's branch and commitSha when `rerunOf` is provided.
  - `RunDetail` component renders "Re-run" button for completed runs (success/failure/cancelled).
  - Added API tests: rerun creates new run with same branch/commit; invalid rerunOf returns 404.
  - Added unit tests for Re-run button rendering in RunDetail component.
  - Fixed `collectTrackedTextFiles` to skip files deleted from working tree but still in git index.
  - All 71 tests pass; biome lint is clean.

- Added workflow file editing (save changes back to Freestyle Git):
  - Added `saveWorkflowFile(repoName, fileName, content)` function in `freestyle-git.ts` using `repo.contents.upsert()` API.
  - Added `PUT /api/repos/:owner/:repo/workflows/:name` endpoint to save workflow file content.
  - Updated `WorkflowEditor` component with editable textarea, Save button, and "(unsaved)" indicator.
  - Save button is disabled when no changes; enables when content differs from original.
  - Added CSS styles for save button, unsaved indicator, and error display.
  - Added API tests: missing content returns 400, requires authentication returns 401.
  - Browser-verified: workflow files list, editable textarea, unsaved indicator appears on edit.
  - All 73 tests pass; biome lint is clean.

- Added workflow file creation (create new workflow files):
  - Added `POST /api/repos/:owner/:repo/workflows` endpoint that accepts `name` and `content` in request body.
  - Endpoint auto-appends `.yml` extension if not provided.
  - Uses existing `saveWorkflowFile` function which calls `repo.contents.upsert()` to create the file.
  - Updated `WorkflowEditor` component with "New workflow" button in header.
  - Added create form UI with file name input, textarea with default workflow template, and Create/Cancel buttons.
  - Added CSS styles for create button, name input, and cancel button.
  - Added API tests: missing name returns 400, missing content returns 400, requires authentication returns 401.
  - Added unit test for "New workflow" button rendering.
  - All 77 tests pass; biome lint is clean.

- Added workflow file deletion:
  - Added `deleteWorkflowFile(repoName, fileName)` function in `freestyle-git.ts` using `repo.contents.delete()` API.
  - Added `DELETE /api/repos/:owner/:repo/workflows/:name` endpoint in `server.ts` that requires authentication.
  - Updated `WorkflowEditor` component with delete button and two-step confirmation flow (click Delete → confirm/cancel).
  - Added CSS styles for delete button, confirm button, and confirmation text.
  - Added API test asserting DELETE workflow requires authentication.
  - All 78 tests pass; biome lint is clean.

- Added magic-link email regression test:
  - Created `src/auth-core.test.ts` with tests for `sendMagicLinkEmail` function.
  - Test verifies email link uses frontend path (`/?token=`) not API endpoint (`/api/auth/verify`).
  - Test verifies token is URL-encoded in the link.
  - All 80 tests pass; biome lint is clean.

- Added workflow run logs persistence hardening:
  - `workflow_runs.logs` is now idempotently backfilled in `ensureWorkflowRunsTable()` for existing Postgres databases.
  - D1 initial migration now creates `workflow_runs` with `logs` and `steps` columns so deployed databases can persist run output.
  - Added `src/workflow-db.test.ts` covering persisted full run logs, persisted step logs, and legacy JSON-string encoded step payloads.
  - Fixed `parseSteps()` to normalize double-encoded legacy step JSON so run detail responses always return an array for the UI.
  - Updated Playwright e2e setup to authenticate through the magic-link test path and browse `/:owner/:repo` routes after the repo-list routing change.
  - Browser-verified run detail shows persisted full logs and expandable step logs.
  - All 83 unit tests pass; typecheck and Biome lint are clean; all 4 Playwright e2e tests pass.

- Added D1-backed Actions API routes to `src/worker.ts`:
  - Added `listWorkflowRunsD1(db, owner, repo, limit)` and `getWorkflowRunD1(db, runId)` helpers that query the existing `workflow_runs` D1 table and map rows into the `WorkflowRun` shape (parses JSON-encoded `steps`, including legacy double-encoded payloads).
  - Wired `GET /api/repos/:owner/:repo/actions/runs` and `GET /api/repos/:owner/:repo/actions/runs/:runId` Hono routes in `worker.ts` behind `requireAuth`, both reading from the D1 binding.
  - Exported `app` (alongside the default `{ fetch }`) so worker tests can call `app.fetch(req, env)` with a fake D1 binding.
  - Added `src/worker.test.ts` with a fake-D1 stub asserting: helper maps rows correctly (incl. step logs), missing id returns null, authed `GET /actions/runs` returns persisted runs filtered by `repo_owner`/`repo_name`, unauthed returns 401, and unknown `:runId` returns 404.
  - All 88 unit tests pass; biome check and typecheck are clean.

- Added D1-backed Actions write routes to `src/worker.ts`:
  - Added `insertWorkflowRunD1(db, run)` and `updateWorkflowRunD1(db, id, updates)` helpers for the Worker/D1 runtime.
  - Wired authenticated `POST /api/repos/:owner/:repo/actions/runs` in `worker.ts`; it accepts the same branch/commit/workflowContent/rerunOf body shape as the local Bun server, validates workflow YAML with `parseWorkflow()`, inserts a queued run, and returns `201 { id, status: "queued" }`.
  - Wired authenticated `POST /api/repos/:owner/:repo/actions/runs/:runId/cancel`; queued runs are marked cancelled in D1, and in-progress runs are signaled through the shared cancellation registry.
  - Added `migrations/0002_workflow_runs.sql` because the already-applied remote D1 `0001` migration predated the `workflow_runs` table even though the local file had since been edited.
  - Applied the remote D1 migration with `wrangler d1 migrations apply better-github-auth --remote`.
  - Deployed Worker version `d3c25fe0-8827-4c4b-836f-ae2d7b5be205` to `https://better-github.dexter-de6.workers.dev`.
  - Browser-verified on the deployed Worker with a temporary AgentMail inbox (`better-github-codex-1777490097@agentmail.to`): magic-link login worked, Actions loaded, clicking "Run workflow" inserted and displayed a new queued `CI` run.
  - All 91 unit tests pass; typecheck and Biome lint are clean; all 4 Playwright e2e tests pass.

- Added `GET /api/repos/:owner/:repo/workflows` to `src/worker.ts`:
  - Reuses `fetchWorkflowFiles(repo)` from `freestyle-git.ts`; bridges `c.env.FREESTYLE_API_KEY` and `FREESTYLE_REPO_ID` into `process.env` so the Freestyle SDK call works in the Worker runtime.
  - Behind `requireAuth`, returns the same `WorkflowFile[]` shape as the local Bun server.
  - Added two `src/worker.test.ts` cases: unauthenticated request returns 401; authenticated request returns a JSON array (empty when `FREESTYLE_API_KEY` is unset).
  - All 93 unit tests pass; biome check and `tsc --noEmit` are clean.
  - Deployed Worker version `16dd938d-2b64-4134-9412-576a976bebe6`; `curl -s -o /dev/null -w "%{http_code}" https://better-github.dexter-de6.workers.dev/api/repos/dexhorthy/better-github/workflows` returns `401` for unauthenticated requests.

- Added Worker-backed workflow file write routes to `src/worker.ts`:
  - Wired `POST /api/repos/:owner/:repo/workflows` (create), `PUT /api/repos/:owner/:repo/workflows/:name` (update), and `DELETE /api/repos/:owner/:repo/workflows/:name` (delete) behind `requireAuth`.
  - All three call into the existing `saveWorkflowFile` / `deleteWorkflowFile` helpers in `freestyle-git.ts`; added a `bridgeFreestyleEnv()` helper that copies `c.env.FREESTYLE_API_KEY` / `c.env.FREESTYLE_REPO_ID` into `process.env` so the Freestyle SDK works in the Worker runtime.
  - POST auto-appends `.yml` if no extension; returns `201 { ok, name }`. PUT/DELETE return `200 { ok: true }`.
  - Added 6 worker tests asserting 401 on missing auth for each method, plus 400 when `name`/`content` is missing on POST and `content` is missing on PUT.
  - Deployed Worker version `49d2066b-e091-498b-8df7-0d43e60ee77e`; verified live `POST/PUT/DELETE` against the deployed endpoints return `401` without an auth token.
  - All 99 unit tests pass; biome check and `tsc --noEmit` are clean.

- Wired the deployed Worker's workflow file CRUD end-to-end against Freestyle Git:
  - Added a Worker test asserting `POST /workflows` with valid body but no Freestyle creds returns 500 `{ error: "Repository not found" }`.
  - Discovered the `contents.upsert` / `contents.delete` calls in `freestyle-git.ts` were `as`-cast against methods that don't exist in the Freestyle SDK; replaced them with the documented `repo.commits.create({ files: [{ path, content }] })` / `{ path, deleted: true }` API.
  - Discovered two CF-Workers-specific issues with the `freestyle` package: (a) the default lazy `freestyle` proxy triggers "Illegal invocation" on nested namespace calls, and (b) `ApiClient` stores `this.fetchFn = config.fetch || fetch` then calls it unbound, also "Illegal invocation". Switched to a singleton `new Freestyle({ apiKey, fetch: (input, init) => fetch(input, init) })` to fix both.
  - Documented findings in `research_findings/freestyle-sdk-cloudflare-workers.md`.
  - Deployed Worker version `d7b7f7ec-8a9a-4a92-bd25-db4f95e91f96`; verified live CRUD against `/api/repos/dexhorthy/better-github/workflows` with an AgentMail-issued JWT: list → POST `opus-test` → list (3 entries) → PUT (content updated) → DELETE → list (back to 2).
  - All 100 unit tests pass; biome check and `tsc --noEmit` are clean.

- Wired the workflow executor into the deployed Worker so `POST /api/repos/:owner/:repo/actions/runs` runs the workflow on a Freestyle VM and persists its terminal status to D1:
  - Added an injectable `WorkflowExecutor` in `src/worker.ts` (default: `executeWorkflowRun` from `workflows.ts`); after inserting the queued run, the handler kicks off an async chain that flips status to `in_progress`, awaits the executor, then writes back `status` (`success`/`failure`/`cancelled`), `conclusion`, `completedAt`, `logs`, and `steps` via `updateWorkflowRunD1`.
  - Wraps the chain in `c.executionCtx?.waitUntil()` (try/catch — Hono throws on the getter when there's no execution context, e.g. in tests) so Cloudflare keeps the Worker alive past the response. Errors during execution write a `failure` row with the error message as `logs`.
  - Exposed `setWorkflowExecutor` / `resetWorkflowExecutor` and `_getLastRunPromise` so tests can stub the executor and await the background work deterministically.
  - Added `src/worker.test.ts` case "POST actions/runs executes workflow and persists success+logs+steps to D1" that stubs the executor with a fake success result, fires the POST, awaits `_getLastRunPromise()`, and asserts the row flips to `status=success`/`conclusion=success` with the fake logs and one persisted step.
  - Updated the prior "creates a queued workflow run" test to drain the run promise (avoids races with the new in_progress write).
  - Deployed Worker version `35846949-011b-42d5-81f8-8b4d2540309a` to `https://better-github.dexter-de6.workers.dev`.
  - All 101 unit tests pass; biome check and `tsc --noEmit` are clean.

- Surfaced real-time workflow run status updates on the deployed Worker via Cloudflare Durable Objects:
  - Added `src/worker-broadcaster-do.ts` exporting a `WorkflowBroadcaster` Durable Object: accepts WS upgrades on `/ws` (`WebSocketPair` + `server.accept()`), tracks subscribe/unsubscribe per runId, and accepts `POST /broadcast` with a `WorkflowRun` body to fan messages out. Subscribed sockets get the full `{ type: "run_update", run }`; other sockets get a summary (no `logs`/`steps`).
  - Wired `worker.ts` to forward `GET /ws` (with `Upgrade: websocket`) to the singleton DO instance (`idFromName("global")`).
  - Added an injectable `Broadcaster` in `worker.ts` (default: POSTs the run to the DO via `WS_BROADCASTER` binding); the executor lifecycle now broadcasts on `queued`, `in_progress`, and final `success`/`failure`/`cancelled`. Cancellation of queued runs also broadcasts the cancelled state.
  - `wrangler.toml` declares the `WS_BROADCASTER` binding and a `do_v1` migration with `new_sqlite_classes = ["WorkflowBroadcaster"]` (free-plan-compatible).
  - Added Worker tests asserting `GET /ws` returns 400 without an upgrade header, forwards to the DO with the upgrade header, and that the run lifecycle broadcasts `queued → in_progress → success` for a single run id.
  - Deployed Worker version `486ab6ce-23ef-45ec-9025-ddbbea5653ab`. Verified `wss://better-github.dexter-de6.workers.dev/ws` opens and closes cleanly via a Bun WebSocket client (`OPEN` / `CLOSE 1000`).
  - Hardened the long-running `completed run includes logs and steps in detail response` test by giving it a 60s timeout (it was flaky at the default 5s when running against real Freestyle VMs).
  - All 104 unit tests pass; biome check and `tsc --noEmit` are clean.

- Cached latest WorkflowRun state in the `WorkflowBroadcaster` Durable Object and replay it on subscribe:
  - Added `latestRuns: Map<runId, WorkflowRun>` populated by every `broadcast(run)` call.
  - When a WebSocket client sends `{ type: "subscribe", runId }`, the DO now immediately sends the cached `run_update` (full detail) for that runId if one exists, so late subscribers see the queued/in_progress state instead of waiting for the next transition.
  - Made `attach`/`broadcast` public on `WorkflowBroadcaster` so unit tests can drive the DO without a Cloudflare runtime.
  - Added Worker test (`WorkflowBroadcaster replays latest cached run on subscribe`) that constructs the DO directly, broadcasts an `in_progress` run, attaches a fake `EventTarget`-based WebSocket, dispatches a `subscribe` message, and asserts the fake socket received the cached `run_update` with full steps.
  - Deployed Worker version `332228b8-ea05-4abc-a998-92382a93bf81` to `https://better-github.dexter-de6.workers.dev`.
  - All 105 unit tests pass; typecheck and Biome lint are clean.

## Highest Priority Next Task
<guidance>make this the smallest independently testable next step</guidance>

Task: Auto-trigger the deploy workflow on push to main. Currently `.better-github/workflows/deploy.yml` exists but nothing pushes a webhook to the deployed Worker on commits — manual UI clicks are still the only trigger path. Add a `POST /api/webhooks/push` route to `src/worker.ts` (D1-backed) that mirrors the local Bun server's webhook: verify `X-Hub-Signature-256` against `WEBHOOK_SECRET`, fetch workflow files via `fetchWorkflowFiles`, run `parseWorkflow` + `shouldTrigger` for the push event, and insert+execute matching workflow runs.
Automated Verification: Add Worker tests asserting (a) missing/invalid signature returns 401, (b) valid signature with no matching workflows returns 200 with empty `triggered`, (c) valid signature with a matching workflow inserts a row into the fake D1.
Browser Verification: After deploy, run `curl -X POST https://better-github.dexter-de6.workers.dev/api/webhooks/push` with a valid signature and the deploy.yml-matching payload; verify a new run appears in the Actions tab UI.

## Next Up

- build a github actions clone on freestyle sandboxes/vms - ONLY the bare minimum to deploy better-github itself w/ wrangler on pushes
- add .better-github/workflows/ci.yml to run tests on push/merge to main
- add .better-github/workflows/deploy.yml to deploy cloudflare stack on push/merge to main

## Long Term Goals

- Add public/private repo specifications and add a public repo list to the default un-authed route, move signin to its own route with a "log in or sign up" button in the header
- reskin the app to have a minimalist terminal-ui theme - all font the same size, fixed width font everywhere, only colors/dimming/bold for differentiation
- add hotkeys for nav, arrows and vim-style j/k/h/l/esc using useHotkeys
- Add repository navigation for Actions (placeholder for now), and Settings.
- Add file contents view after nested directory browsing exists.

## Out of scope

- pull requests
- issues
