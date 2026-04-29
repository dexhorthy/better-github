# Freestyle, Vite, And Hono Notes

- Freestyle's Vite framework docs recommend installing `hono` for SSR/API style Vite projects and `freestyle-sh` for Freestyle deployment tooling.
- Freestyle Git docs describe cloning hosted repositories with an API-key bearer header against `https://git.freestyle.sh/<repo-id>`.
- Hono provides Vite build and dev-server packages, but this first slice keeps Hono as a standalone Bun API and uses Vite's dev proxy for `/api`.
- The installed `freestyle` SDK exposes `freestyle.git.repos.create({ name, public, defaultBranch, import })` for initial file imports, and `repo.commits.create({ branch, message, files, author })` for later pushes. File imports accept a path-to-content map; commit pushes accept an array of `{ path, content }` file entries.
- `repo.contents.get({ path: "" })` returns top-level entries after import, which the app can use to render live repository file names without cloning locally.
- `repo.contents.get({ path: "src" })` returns a directory response for a nested folder and includes child entries such as `App.tsx`, `server.ts`, and `styles.css`. This is enough for GitHub-like directory browsing without cloning the repository.
- `repo.contents.get({ path: "src/App.tsx" })` returns a `type: "file"` payload with fields `name`, `path`, `sha`, `size`, and `content` (base64). Decode with `Buffer.from(content, "base64").toString("utf8")` to render text. The same `contents.get` call switches between directory and file responses based on the path target — no separate file API needed.

Sources checked on 2026-04-29:

- https://docs.freestyle.sh/web/frameworks/vite
- https://docs.freestyle.sh/web/frameworks/vite/ssr
- https://docs.freestyle.sh/v2/git
- `node_modules/freestyle/index.d.mts`
- `node_modules/freestyle/README.md`
