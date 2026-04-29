import { describe, expect, test } from "bun:test";
import { app } from "./server";
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
