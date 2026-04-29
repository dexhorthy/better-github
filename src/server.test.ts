import { describe, expect, test } from "bun:test";
import { app } from "./server";
import type { RepositoryOverview } from "./types";

describe("repository api", () => {
  test("returns the seeded repository overview", async () => {
    const response = await app.request("/api/repos/dexhorthy/better-github");
    const body = (await response.json()) as RepositoryOverview;

    expect(response.status).toBe(200);
    expect(body.repository.name).toBe("better-github");
    expect(body.branches).toHaveLength(3);
    expect(body.files.some((file: { name: string }) => file.name === "README.md")).toBe(true);
  });

  test("returns not found for missing repositories", async () => {
    const response = await app.request("/api/repos/dexhorthy/missing");
    expect(response.status).toBe(404);
  });
});
