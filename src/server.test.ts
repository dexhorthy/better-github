import { describe, expect, test } from "bun:test";
import { _hasPendingToken, _insertTestToken } from "./auth";
import { collectTrackedTextFiles } from "./seed-freestyle-repo";
import { app } from "./server";
import type { RepositoryOverview } from "./types";

async function getTestToken(): Promise<string> {
	const email = `test-${Date.now()}@example.com`;
	const rawToken = `test-token-${Date.now()}`;
	await _insertTestToken(email, rawToken, Date.now() + 60_000);
	const res = await app.request(
		`/api/auth/verify?token=${encodeURIComponent(rawToken)}`,
	);
	const body = (await res.json()) as { token: string };
	return body.token;
}

describe("auth api", () => {
	test("request-link with missing email returns 400", async () => {
		const response = await app.request("/api/auth/request-link", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(response.status).toBe(400);
	});

	test("request-link with invalid email returns 400", async () => {
		const response = await app.request("/api/auth/request-link", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "not-an-email" }),
		});
		expect(response.status).toBe(400);
	});

	test("verify with a valid token returns JWT and email", async () => {
		const email = `verify-${Date.now()}@example.com`;
		const rawToken = `verify-token-${Date.now()}`;
		await _insertTestToken(email, rawToken, Date.now() + 60_000);

		const response = await app.request(
			`/api/auth/verify?token=${encodeURIComponent(rawToken)}`,
		);
		const body = (await response.json()) as { token: string; email: string };

		expect(response.status).toBe(200);
		expect(typeof body.token).toBe("string");
		expect(body.token.length).toBeGreaterThan(10);
		expect(body.email).toBe(email);
	});

	test("verify with an expired token returns 401", async () => {
		const email = `expired-${Date.now()}@example.com`;
		const rawToken = `expired-token-${Date.now()}`;
		// expiresAt in the past
		await _insertTestToken(email, rawToken, Date.now() - 1_000);

		const response = await app.request(
			`/api/auth/verify?token=${encodeURIComponent(rawToken)}`,
		);
		expect(response.status).toBe(401);
	});

	test("verify with an unknown token returns 401", async () => {
		const response = await app.request(
			"/api/auth/verify?token=totally-bogus-token",
		);
		expect(response.status).toBe(401);
	});

	test("verify consumes the token (second use returns 401)", async () => {
		const email = `onetime-${Date.now()}@example.com`;
		const rawToken = `onetime-token-${Date.now()}`;
		await _insertTestToken(email, rawToken, Date.now() + 60_000);

		await app.request(`/api/auth/verify?token=${encodeURIComponent(rawToken)}`);
		const second = await app.request(
			`/api/auth/verify?token=${encodeURIComponent(rawToken)}`,
		);
		expect(second.status).toBe(401);
	});

	test("_hasPendingToken returns true after _insertTestToken", async () => {
		const email = `pending-${Date.now()}@example.com`;
		const rawToken = `pending-token-${Date.now()}`;
		await _insertTestToken(email, rawToken, Date.now() + 60_000);
		expect(await _hasPendingToken(email)).toBe(true);
	});
});

describe("repository api", () => {
	test("/api/repos without token returns 401", async () => {
		const response = await app.request("/api/repos");
		expect(response.status).toBe(401);
	});

	test("/api/repos returns list of repositories", async () => {
		const token = await getTestToken();
		const response = await app.request("/api/repos", {
			headers: { Authorization: `Bearer ${token}` },
		});
		const body = (await response.json()) as { name: string; owner: string }[];

		expect(response.status).toBe(200);
		expect(Array.isArray(body)).toBe(true);
		expect(body.length).toBeGreaterThanOrEqual(2);
		expect(body.map((r) => r.name)).toContain("better-github");
		expect(body.map((r) => r.name)).toContain("hello-world");
	});

	test("/api/repos/:owner/:repo without token returns 401", async () => {
		const response = await app.request("/api/repos/dexhorthy/better-github");
		expect(response.status).toBe(401);
	});

	test("returns repository overview (fixture fallback when no Freestyle repo found)", async () => {
		const token = await getTestToken();
		const response = await app.request("/api/repos/dexhorthy/better-github", {
			headers: { Authorization: `Bearer ${token}` },
		});
		const body = (await response.json()) as RepositoryOverview;

		expect(response.status).toBe(200);
		expect(body.repository.name).toBe("better-github");
		expect(body.repository.owner).toBe("dexhorthy");
		expect(body.branches.length).toBeGreaterThan(0);
		expect(body.commits.length).toBeGreaterThan(0);
		expect(body.files.length).toBeGreaterThan(0);
		expect(body.pullRequests).toBeDefined();
	});

	test("returns child entries for a requested directory path", async () => {
		const token = await getTestToken();
		const response = await app.request(
			"/api/repos/dexhorthy/better-github?path=src",
			{ headers: { Authorization: `Bearer ${token}` } },
		);
		const body = (await response.json()) as RepositoryOverview;

		expect(response.status).toBe(200);
		expect(body.path).toBe("src");
		expect(body.files.map((file) => file.name)).toContain("App.tsx");
		expect(body.files.map((file) => file.name)).toContain("server.ts");
	});

	test("returns file contents when path points at a tracked file", async () => {
		const token = await getTestToken();
		const response = await app.request(
			"/api/repos/dexhorthy/better-github?path=src/App.tsx",
			{ headers: { Authorization: `Bearer ${token}` } },
		);
		const body = (await response.json()) as RepositoryOverview;

		expect(response.status).toBe(200);
		expect(body.path).toBe("src/App.tsx");
		expect(body.fileContent).toBeDefined();
		expect(body.fileContent?.name).toBe("App.tsx");
		expect(body.fileContent?.text).toContain("function App()");
		expect(body.files.length).toBe(0);
	});

	test("returns not found for missing repositories", async () => {
		const token = await getTestToken();
		const response = await app.request("/api/repos/dexhorthy/missing", {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(response.status).toBe(404);
	});

	test("returns readme.text at root path", async () => {
		const token = await getTestToken();
		const response = await app.request("/api/repos/dexhorthy/better-github", {
			headers: { Authorization: `Bearer ${token}` },
		});
		const body = (await response.json()) as RepositoryOverview;

		expect(response.status).toBe(200);
		expect(body.readme).toBeDefined();
		expect(typeof body.readme?.text).toBe("string");
		expect(body.readme?.text.length).toBeGreaterThan(0);
	});

	test("does not return readme when browsing a subdirectory", async () => {
		const token = await getTestToken();
		const response = await app.request(
			"/api/repos/dexhorthy/better-github?path=src",
			{ headers: { Authorization: `Bearer ${token}` } },
		);
		const body = (await response.json()) as RepositoryOverview;

		expect(response.status).toBe(200);
		expect(body.readme).toBeUndefined();
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
