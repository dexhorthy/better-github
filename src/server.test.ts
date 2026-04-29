import { describe, expect, test } from "bun:test";
import { app } from "./server";
import { collectTrackedTextFiles } from "./seed-freestyle-repo";
import type { RepositoryOverview } from "./types";

describe("repository api", () => {
  test("returns repository overview (fixture fallback when no Freestyle repo found)", async () => {
    const response = await app.request("/api/repos/dexhorthy/better-github");
    const body = (await response.json()) as RepositoryOverview;

    expect(response.status).toBe(200);
    expect(body.repository.name).toBe("better-github");
    expect(body.repository.owner).toBe("dexhorthy");
    expect(body.branches.length).toBeGreaterThan(0);
    expect(body.commits.length).toBeGreaterThan(0);
    expect(body.files.length).toBeGreaterThan(0);
    expect(body.pullRequests).toBeDefined();
  });

  test("returns not found for missing repositories", async () => {
    const response = await app.request("/api/repos/dexhorthy/missing");
    expect(response.status).toBe(404);
  });
});

describe("freestyle seed files", () => {
  test("collects tracked repository content without ignored environment files", async () => {
    const files = await collectTrackedTextFiles();
    const paths = files.map((file) => file.path);

    expect(paths).toContain("src/App.tsx");
    expect(paths).toContain("package.json");
    expect(paths).not.toContain(".env");
    expect(paths).not.toContain("node_modules/freestyle/index.mjs");
  });
});
