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

## Highest Priority Next Task
<guidance>make this the smallest independently testable next step</guidance>

Task: Render basic syntax-friendly affordances on the file viewer — show a line-numbered gutter for plaintext files like `src/App.tsx`.
Automated Verification: Component or DOM-level test asserting the viewer renders one line-number cell per line of file text.
Browser Verification: Open `src/App.tsx` and confirm a left-aligned line-number gutter is shown next to the source.


## Later

- Add README that instructs how to run the app locally with a single bun command
- Add playwright test suite for UI integration tests to regular testing flow
- Add repository navigation for Issues, Pull Requests, Actions, and Settings.
- Add file contents view after nested directory browsing exists.
- Add authentication, sign up with email, and current-user state.
- Add mutation flows for starring, watching, branching, and opening pull requests.

## Long Term Goals

- Deploy to the cloud on cloudflare (api key can be used to create other api keys)
- build a github actions clone on cloudflare workers
- push and
- Add a second remote for this repo, and move development to that origin, remove the github remote from this repo
