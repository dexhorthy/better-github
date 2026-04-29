# better-github

A GitHub-like repository UI backed by [Freestyle Git](https://freestyle.sh) for live repository data. The stack is Vite (React) for the UI and Hono (running on Bun) for the API.

## Prerequisites

- [Bun](https://bun.com) v1.3+
- A Freestyle account with an API key

## Setup

Install dependencies:

```bash
bun install
```

Create a `.env` file at the repo root with your Freestyle credentials:

```bash
FREESTYLE_API_KEY=fs_...           # required: Freestyle API key
FREESTYLE_REPO_ID=...              # optional: pin a specific Freestyle repo id
```

`FREESTYLE_API_KEY` is required to fetch live repository data. If
`FREESTYLE_REPO_ID` is unset the API will look the repo up by name; if no
matching Freestyle repo is found the API falls back to seeded fixture data so
the UI still renders.

## Seed a Freestyle repository

Push the tracked files in this workspace into a Freestyle Git repo (only
`git ls-files` entries are uploaded, so `.env` and ignored files stay local):

```bash
bun run seed:freestyle better-github
```

The first run creates the Freestyle repo and prints its id; export that as
`FREESTYLE_REPO_ID` (or store it in `.env`) to pin future API requests to it.

## Run the app locally

In two terminals:

```bash
# terminal 1 — Hono API on http://localhost:8787
bun run api

# terminal 2 — Vite dev server on http://127.0.0.1:5173
bun run dev
```

Open `http://127.0.0.1:5173/` to see the repository overview. The Vite dev
server proxies `/api/*` requests to the Hono API at port 8787.

## Tests and type checking

```bash
bun test          # run the bun test suite
bun run typecheck # tsc --noEmit
bun run lint      # alias for typecheck
```
