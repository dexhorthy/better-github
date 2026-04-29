import { describe, expect, test } from "bun:test";
import { _hasPendingToken, _insertTestToken } from "./auth";
import { collectTrackedTextFiles } from "./seed-freestyle-repo";
import { app } from "./server";
import type { RepositoryOverview } from "./types";
import { computeWebhookSignature } from "./webhook-signature";

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

describe("workflows endpoint", () => {
	test("returns workflow files for a repository", async () => {
		const token = await getTestToken();
		const response = await app.request(
			"/api/repos/dexhorthy/better-github/workflows",
			{ headers: { Authorization: `Bearer ${token}` } },
		);

		expect(response.status).toBe(200);
		const workflows = (await response.json()) as {
			name: string;
			content: string;
		}[];
		expect(Array.isArray(workflows)).toBe(true);
	});

	test("requires authentication", async () => {
		const response = await app.request(
			"/api/repos/dexhorthy/better-github/workflows",
		);
		expect(response.status).toBe(401);
	});

	test("PUT workflow returns 400 when content is missing", async () => {
		const token = await getTestToken();
		const response = await app.request(
			"/api/repos/dexhorthy/better-github/workflows/ci.yml",
			{
				method: "PUT",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			},
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: string };
		expect(body.error).toBe("Missing content");
	});

	test("PUT workflow requires authentication", async () => {
		const response = await app.request(
			"/api/repos/dexhorthy/better-github/workflows/ci.yml",
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: "name: CI\non: push\njobs: {}" }),
			},
		);
		expect(response.status).toBe(401);
	});

	test("POST workflow returns 400 when name is missing", async () => {
		const token = await getTestToken();
		const response = await app.request(
			"/api/repos/dexhorthy/better-github/workflows",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ content: "name: Test\non: push\njobs: {}" }),
			},
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: string };
		expect(body.error).toBe("Missing name");
	});

	test("POST workflow returns 400 when content is missing", async () => {
		const token = await getTestToken();
		const response = await app.request(
			"/api/repos/dexhorthy/better-github/workflows",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ name: "test.yml" }),
			},
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: string };
		expect(body.error).toBe("Missing content");
	});

	test("POST workflow requires authentication", async () => {
		const response = await app.request(
			"/api/repos/dexhorthy/better-github/workflows",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "test.yml", content: "name: CI\non: push\njobs: {}" }),
			},
		);
		expect(response.status).toBe(401);
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

describe("workflow runs api", () => {
	test("GET /api/repos/:owner/:repo/actions/runs/:runId returns run with steps field", async () => {
		const token = await getTestToken();

		// Create a workflow run
		const createRes = await app.request(
			"/api/repos/dexhorthy/better-github/actions/runs",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ branch: "main" }),
			},
		);
		expect(createRes.status).toBe(201);
		const { id: runId } = (await createRes.json()) as { id: string };

		// Fetch the run detail
		const getRes = await app.request(
			`/api/repos/dexhorthy/better-github/actions/runs/${runId}`,
			{
				headers: { Authorization: `Bearer ${token}` },
			},
		);
		expect(getRes.status).toBe(200);

		const run = (await getRes.json()) as {
			id: string;
			workflowName: string;
			status: string;
			steps?: Array<{ name: string; status: string; logs: string }>;
		};

		expect(run.id).toBe(runId);
		expect(run.workflowName).toBeDefined();
		expect(run.status).toBeDefined();
		// steps field may be undefined for a queued run or defined as an array
		expect(run.steps === undefined || Array.isArray(run.steps)).toBe(true);
	});

	test("GET /api/repos/:owner/:repo/actions/runs/:runId returns 404 for unknown run", async () => {
		const token = await getTestToken();
		const res = await app.request(
			"/api/repos/dexhorthy/better-github/actions/runs/nonexistent-id",
			{
				headers: { Authorization: `Bearer ${token}` },
			},
		);
		expect(res.status).toBe(404);
	});

	test("POST /api/repos/:owner/:repo/actions/runs/:runId/cancel returns 200 for queued run", async () => {
		const token = await getTestToken();

		// Create a workflow run
		const createRes = await app.request(
			"/api/repos/dexhorthy/better-github/actions/runs",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ branch: "main" }),
			},
		);
		expect(createRes.status).toBe(201);
		const { id: runId } = (await createRes.json()) as { id: string };

		// Cancel the run
		const cancelRes = await app.request(
			`/api/repos/dexhorthy/better-github/actions/runs/${runId}/cancel`,
			{
				method: "POST",
				headers: { Authorization: `Bearer ${token}` },
			},
		);
		expect(cancelRes.status).toBe(200);
		const body = (await cancelRes.json()) as { ok: boolean };
		expect(body.ok).toBe(true);
	});

	test("POST /api/repos/:owner/:repo/actions/runs/:runId/cancel returns 404 for unknown run", async () => {
		const token = await getTestToken();
		const res = await app.request(
			"/api/repos/dexhorthy/better-github/actions/runs/nonexistent-id/cancel",
			{
				method: "POST",
				headers: { Authorization: `Bearer ${token}` },
			},
		);
		expect(res.status).toBe(404);
	});

	test("POST /api/repos/:owner/:repo/actions/runs/:runId/cancel without auth returns 401", async () => {
		const res = await app.request(
			"/api/repos/dexhorthy/better-github/actions/runs/some-id/cancel",
			{
				method: "POST",
			},
		);
		expect(res.status).toBe(401);
	});

	test("POST /api/repos/:owner/:repo/actions/runs with rerunOf creates a new run with same branch/commit", async () => {
		const token = await getTestToken();

		// Create an initial workflow run
		const createRes = await app.request(
			"/api/repos/dexhorthy/better-github/actions/runs",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ branch: "feature-branch", commitSha: "abc123" }),
			},
		);
		expect(createRes.status).toBe(201);
		const { id: originalRunId } = (await createRes.json()) as { id: string };

		// Re-run the workflow
		const rerunRes = await app.request(
			"/api/repos/dexhorthy/better-github/actions/runs",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ rerunOf: originalRunId }),
			},
		);
		expect(rerunRes.status).toBe(201);
		const { id: newRunId } = (await rerunRes.json()) as { id: string };

		// Verify the new run has a different ID
		expect(newRunId).not.toBe(originalRunId);

		// Fetch the new run and verify it inherited branch/commit from original
		const getRes = await app.request(
			`/api/repos/dexhorthy/better-github/actions/runs/${newRunId}`,
			{
				headers: { Authorization: `Bearer ${token}` },
			},
		);
		expect(getRes.status).toBe(200);
		const newRun = (await getRes.json()) as {
			id: string;
			branch: string;
			commitSha: string;
		};
		expect(newRun.branch).toBe("feature-branch");
		expect(newRun.commitSha).toBe("abc123");
	});

	test("POST /api/repos/:owner/:repo/actions/runs with invalid rerunOf returns 404", async () => {
		const token = await getTestToken();
		const res = await app.request(
			"/api/repos/dexhorthy/better-github/actions/runs",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ rerunOf: "nonexistent-run-id" }),
			},
		);
		expect(res.status).toBe(404);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Original run not found");
	});
});

describe("webhook api", () => {
	test("POST /api/webhooks/push without signature returns 401", async () => {
		const response = await app.request("/api/webhooks/push", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ owner: "dexhorthy" }),
		});
		expect(response.status).toBe(401);
		const body = (await response.json()) as { error: string };
		expect(body.error).toContain("Invalid webhook signature");
	});

	test("POST /api/webhooks/push with invalid signature returns 401", async () => {
		const payload = JSON.stringify({ owner: "dexhorthy" });
		const response = await app.request("/api/webhooks/push", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Hub-Signature-256": "sha256=invalid",
			},
			body: payload,
		});
		expect(response.status).toBe(401);
		const body = (await response.json()) as { error: string };
		expect(body.error).toContain("Invalid webhook signature");
	});

	test("POST /api/webhooks/push with missing fields returns 400", async () => {
		const payload = JSON.stringify({ owner: "dexhorthy" });
		const signature = await computeWebhookSignature(payload);
		const response = await app.request("/api/webhooks/push", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Hub-Signature-256": signature,
			},
			body: payload,
		});
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: string };
		expect(body.error).toContain("Missing required fields");
	});

	test("POST /api/webhooks/push with valid signature and payload returns triggered workflows", async () => {
		const payload = JSON.stringify({
			owner: "dexhorthy",
			repo: "better-github",
			branch: "main",
			commitSha: "abc1234",
		});
		const signature = await computeWebhookSignature(payload);
		const response = await app.request("/api/webhooks/push", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Hub-Signature-256": signature,
			},
			body: payload,
		});
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			message: string;
			triggered: { id: string; workflowName: string }[];
		};
		expect(body.message).toBeDefined();
		expect(Array.isArray(body.triggered)).toBe(true);
	});

	test("POST /api/webhooks/push does not require Bearer auth token", async () => {
		const payload = JSON.stringify({
			owner: "dexhorthy",
			repo: "better-github",
			branch: "main",
			commitSha: "def5678",
		});
		const signature = await computeWebhookSignature(payload);
		const response = await app.request("/api/webhooks/push", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Hub-Signature-256": signature,
			},
			body: payload,
		});
		expect(response.status).toBe(200);
	});
});
