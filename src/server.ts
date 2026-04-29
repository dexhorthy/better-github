import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { branches, commits, fileTree, pullRequests, repositories } from "./data";
import type { RepositoryOverview } from "./types";

export const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/repos/:owner/:repo", (c) => {
  const { owner, repo } = c.req.param();
  const repository = repositories.find((item) => item.owner === owner && item.name === repo);

  if (!repository) {
    return c.json({ message: "Repository not found" }, 404);
  }

  const overview: RepositoryOverview = {
    repository,
    branches,
    commits,
    pullRequests,
    files: fileTree,
  };

  return c.json(overview);
});

app.use("/*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 8787);
  Bun.serve({
    port,
    fetch: app.fetch,
  });
  console.log(`Hono API listening on http://localhost:${port}`);
}
