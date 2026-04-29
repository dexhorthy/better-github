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

## Highest Priority Next Task
<guidance>make this the smallest independently testable next step</guidance>

Task: Deploy to the cloud on Cloudflare Workers (api key can be used to create other api keys). Use the Cloudflare Workers + Hono stack — move the Hono API from a local Bun server to a Cloudflare Worker, and serve the Vite-built frontend from Cloudflare Pages or as static assets alongside the Worker.
Automated Verification: `bun run deploy` script succeeds; `curl https://<worker>.workers.dev/api/health` returns `{ok:true}`.
Browser Verification: Open the deployed URL and verify the login flow, repos list, and repo browser all work as expected.

## Next Up

- Deploy to the cloud on cloudflare (api key can be used to create other api keys)

## Long Term Goals

- Deploy to the cloud on cloudflare (api key can be used to create other api keys)
- build a github actions clone on freestyle sandboxes
- Add a second remote for this repo, and move development to that origin, update PROMPT.md with 5-10 word note to push to both remotes
- add .better-github/workflows/ci.yml to run tests on push/merge to main
- add .better-github/workflows/deploy.yml to deploy cloudflare stack on push/merge to main
- Add repository navigation for Actions (placeholder for now), and Settings.
- Add file contents view after nested directory browsing exists.

## Out of scope

- pull requests
- issues
