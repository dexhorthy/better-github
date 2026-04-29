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

## Highest Priority Next Task
<guidance>make this the smallest independently testable next step</guidance>

Task: Add nested directory browsing for one live Freestyle directory, starting with clicking `src`.
Automated Verification: API/unit test for requesting and returning child entries for a directory path.
Browser Verification: Click `src` in the file list and confirm the UI updates to show files such as `App.tsx` and `server.ts`.


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
