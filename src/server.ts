import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { fetchFreestyleRepoData } from "./freestyle-git";
import { branches, commits, fileTree, pullRequests, repositories } from "./data";
import type { RepositoryOverview } from "./types";

export const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/repos/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();
  const fixture = repositories.find((item) => item.owner === owner && item.name === repo);

  if (!fixture) {
    return c.json({ message: "Repository not found" }, 404);
  }

  const liveData = await fetchFreestyleRepoData(repo);

  const overview: RepositoryOverview = {
    repository: liveData
      ? {
          ...fixture,
          defaultBranch: liveData.repository.defaultBranch,
          visibility: liveData.repository.visibility,
          updatedAt: liveData.repository.updatedAt,
        }
      : fixture,
    branches: liveData?.branches.length ? liveData.branches : branches,
    commits: liveData?.commits.length ? liveData.commits : commits,
    pullRequests,
    files: liveData?.files.length ? liveData.files : fileTree,
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
