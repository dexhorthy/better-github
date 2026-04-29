# Agent Browser UI Verification Notes

- `npx agent-browser --help` shows the installed CLI supports persistent browser sessions through the daemon, plus `open`, `click`, `wait`, `snapshot`, and `eval` commands for local UI verification.
- In this repo, Vite serves the frontend on `http://127.0.0.1:5173/` and proxies `/api` to the Hono server on `http://localhost:8787`, so browser QA needs both `bun run dev` and `bun run api` running.
- The current React app stores the repository path only in component state; opening `/?path=src` does not initialize the view from the URL query string yet.
- For this line-number gutter change, `agent-browser eval` verified that opening `src/App.tsx` produced 222 `.line-number` cells, with the first six labels `1` through `6`, a right-aligned gutter, and a solid divider.

Sources checked on 2026-04-29:

- `npx agent-browser --help`
- Local browser verification against `http://127.0.0.1:5173/`
