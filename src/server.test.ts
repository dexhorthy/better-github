import { describe, expect, test } from "bun:test";
import { collectTrackedTextFiles } from "./seed-freestyle-repo";
import { app } from "./server";
import type { RepositoryOverview } from "./types";

async function getTestToken(): Promise<string> {
	const email = `test-${Date.now()}@example.com`;
	const res = await app.request("/api/auth/register", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password: "password123" }),
	});
	const body = (await res.json()) as { token: string };
	return body.token;
}

describe("auth api", () => {
	test("register returns a token and email", async () => {
		const email = `reg-${Date.now()}@example.com`;
		const response = await app.request("/api/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password: "password123" }),
		});
		const body = (await response.json()) as { token: string; email: string };

		expect(response.status).toBe(200);
		expect(typeof body.token).toBe("string");
		expect(body.token.length).toBeGreaterThan(10);
		expect(body.email).toBe(email);
	});

	test("login returns a token after registering", async () => {
		const email = `login-${Date.now()}@example.com`;
		await app.request("/api/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password: "password123" }),
		});

		const response = await app.request("/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password: "password123" }),
		});
		const body = (await response.json()) as { token: string };

		expect(response.status).toBe(200);
		expect(typeof body.token).toBe("string");
	});

	test("login returns 401 for wrong password", async () => {
		const email = `bad-${Date.now()}@example.com`;
		await app.request("/api/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password: "password123" }),
		});

		const response = await app.request("/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password: "wrongpassword" }),
		});

		expect(response.status).toBe(401);
	});

	test("register returns 400 for duplicate email", async () => {
		const email = `dup-${Date.now()}@example.com`;
		await app.request("/api/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password: "password123" }),
		});
		const response = await app.request("/api/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password: "password123" }),
		});

		expect(response.status).toBe(400);
	});
});

describe("repository api", () => {
	test("/api/repos without token returns 401", async () => {
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
