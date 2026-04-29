# Agent Browser UI Verification Notes

- `npx agent-browser --help` shows the installed CLI supports persistent browser sessions through the daemon, plus `open`, `click`, `wait`, `snapshot`, and `eval` commands for local UI verification.
- In this repo, Vite serves the frontend on `http://127.0.0.1:5173/` and proxies `/api` to the Hono server on `http://localhost:8787`, so browser QA needs both `bun run dev` and `bun run api` running.
- The current React app stores the repository path only in component state; opening `/?path=src` does not initialize the view from the URL query string yet.
- For this line-number gutter change, `agent-browser eval` verified that opening `src/App.tsx` produced 222 `.line-number` cells, with the first six labels `1` through `6`, a right-aligned gutter, and a solid divider.
- For workflow log persistence verification, inserted a completed workflow run through `src/workflow-db.ts`, opened `http://127.0.0.1:5173/dexhorthy/better-github`, navigated to Actions, selected the run detail, and confirmed the page rendered both full logs (`full stdout line`, `full stderr line`) and expanded step logs (`step stdout line`, `step stderr line`).
- Browser QA surfaced that older/stale API processes may return `steps` as a JSON-encoded string; the UI expects an array. The API normalization now handles double-encoded step JSON before returning run details.
- For deployed Worker Actions write-route verification, created a temporary AgentMail inbox, requested a magic link from `https://better-github.dexter-de6.workers.dev/api/auth/request-link`, opened the received `/?token=...` URL with `npx agent-browser`, navigated to `dexhorthy/better-github` → Actions, and confirmed clicking "Run workflow" rendered a new queued `CI` run.
- Remote D1 initially returned 500 for `GET /api/repos/:owner/:repo/actions/runs` because the already-applied production `0001` migration did not include `workflow_runs`; adding and applying `migrations/0002_workflow_runs.sql` fixed the deployed Actions page.

Sources checked on 2026-04-29:

- `npx agent-browser --help`
- Local browser verification against `http://127.0.0.1:5173/`
- Deployed browser verification against `https://better-github.dexter-de6.workers.dev/`
- AgentMail docs `https://docs.agentmail.to/llms.txt` and `https://docs.agentmail.to/api-reference/inboxes/create.mdx`
