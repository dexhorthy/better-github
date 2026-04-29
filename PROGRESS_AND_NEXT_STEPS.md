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

## Highest Priority Next Task
<guidance>make this the smallest independently testable next step</guidance>

Task: Add a clickable repository title in the header that links back to the repository root (`/`) so users can return from a deep file path without using the browser back button.
Automated Verification: Static render test asserting the header repo title is rendered as an anchor with `href="/"` and `data-testid="repo-home-link"`, and a unit test that clicking it resets `path` to the empty string.
Browser Verification: From `/?path=src/App.tsx`, clicking the repo title in the header navigates to `/` and renders the root file listing with the breadcrumb collapsed back to `better-github`.


## Next Up

- Add playwright test suite for UI integration tests to regular testing flow

## Long Term Goals

- Deploy to the cloud on cloudflare (api key can be used to create other api keys)
- build a github actions clone on cloudflare workers
- push and
- Add a second remote for this repo, and move development to that origin, remove the github remote from this repo
- Add support for actions matching the github actions yaml spec
- Add repository navigation for Actions (placeholder for now), and Settings.
- Add file contents view after nested directory browsing exists.
- Add authentication, sign up with email, and current-user state.

## Out of scope

- pull requests
- issues
