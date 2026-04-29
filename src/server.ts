import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { fetchFreestyleRepoData } from "./freestyle-git";
import { branches, commits, getFixtureFilesForPath, pullRequests, repositories } from "./data";
import type { RepositoryOverview } from "./types";
import type { FreestyleRepoData } from "./freestyle-git";

export const app = new Hono();

function buildRepositoryOverview(
  fixture: (typeof repositories)[number],
  path: string,
  liveData: FreestyleRepoData | null,
): RepositoryOverview {
  return {
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
    path,
    files: liveData?.fileContent ? [] : liveData?.files.length ? liveData.files : getFixtureFilesForPath(path),
    fileContent: liveData?.fileContent,
    readme: liveData?.readme,
  };
}

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/repos/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();
  const path = c.req.query("path") ?? "";
  const fixture = repositories.find((item) => item.owner === owner && item.name === repo);

  if (!fixture) {
    return c.json({ message: "Repository not found" }, 404);
  }

  const liveData = await fetchFreestyleRepoData(repo, path);
  return c.json(buildRepositoryOverview(fixture, path, liveData));
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
