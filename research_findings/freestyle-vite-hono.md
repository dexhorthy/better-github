# Freestyle, Vite, And Hono Notes

- Freestyle's Vite framework docs recommend installing `hono` for SSR/API style Vite projects and `freestyle-sh` for Freestyle deployment tooling.
- Freestyle Git docs describe cloning hosted repositories with an API-key bearer header against `https://git.freestyle.sh/<repo-id>`.
- Hono provides Vite build and dev-server packages, but this first slice keeps Hono as a standalone Bun API and uses Vite's dev proxy for `/api`.

Sources checked on 2026-04-29:

- https://docs.freestyle.sh/web/frameworks/vite
- https://docs.freestyle.sh/web/frameworks/vite/ssr
- https://docs.freestyle.sh/v2/git
