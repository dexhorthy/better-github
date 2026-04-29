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

## Highest Priority Next Task

Push actual repository content to a Freestyle Git repo so the UI shows real file names and commit history.

## Later

- Add repository navigation for Issues, Pull Requests, Actions, and Settings.
- Add file browsing for nested directories and file contents.
- Add authentication and current-user state.
- Add mutation flows for starring, watching, branching, and opening pull requests.
