import { expect, test } from "bun:test";
import type { D1Database } from "@cloudflare/workers-types";
import { signJwt } from "./auth-core";
import {
	_getLastRunPromise,
	getWorkflowRunD1,
	insertWorkflowRunD1,
	listWorkflowRunsD1,
	resetBroadcaster,
	resetWorkflowExecutor,
	setBroadcaster,
	setWorkflowExecutor,
	app as workerApp,
} from "./worker";
import { WorkflowBroadcaster } from "./worker-broadcaster-do";
import type { WorkflowRun } from "./workflows";

type Row = Record<string, unknown>;

function makeFakeD1(rows: Row[]): D1Database {
	const matchOwnerRepo = (owner: string, repo: string, limit: number): Row[] =>
		rows
			.filter((r) => r.repo_owner === owner && r.repo_name === repo)
			.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))
			.slice(0, limit);

	const prepare = (sql: string) => {
		let bound: unknown[] = [];
		const stmt = {
			bind(...args: unknown[]) {
				bound = args;
				return stmt;
			},
			async all<T = Row>() {
				if (sql.includes("WHERE repo_owner = ? AND repo_name = ?")) {
					const [owner, repo, limit] = bound as [string, string, number];
					return {
						results: matchOwnerRepo(owner, repo, limit) as T[],
						success: true,
						meta: {},
					};
				}
				return { results: [] as T[], success: true, meta: {} };
			},
			async first<T = Row>() {
				if (sql.includes("WHERE id = ?")) {
					const [id] = bound as [string];
					const found = rows.find((r) => r.id === id);
					return (found as T) ?? null;
				}
				return null;
			},
			async run() {
				if (sql.includes("INSERT INTO workflow_runs")) {
					const [
						id,
						workflowName,
						repoOwner,
						repoName,
						branch,
						commitSha,
						status,
						conclusion,
						startedAt,
						completedAt,
						logs,
						steps,
					] = bound;
					rows.push({
						id,
						workflow_name: workflowName,
						repo_owner: repoOwner,
						repo_name: repoName,
						branch,
						commit_sha: commitSha,
						status,
						conclusion,
						started_at: startedAt,
						completed_at: completedAt,
						logs,
						steps,
					});
				}
				if (sql.includes("UPDATE workflow_runs")) {
					const [status, conclusion, completedAt, logs, steps, id] = bound;
					const row = rows.find((r) => r.id === id);
					if (row) {
						if (status !== null) row.status = status;
						if (conclusion !== null) row.conclusion = conclusion;
						if (completedAt !== null) row.completed_at = completedAt;
						if (logs !== null) row.logs = logs;
						if (steps !== null) row.steps = steps;
					}
				}
				return { success: true, meta: {} };
			},
		};
		return stmt;
	};

	return { prepare } as unknown as D1Database;
}

test("listWorkflowRunsD1 maps rows to WorkflowRun shape", async () => {
	const db = makeFakeD1([
		{
			id: "run-1",
			workflow_name: "CI",
			repo_owner: "dexhorthy",
			repo_name: "better-github",
			branch: "main",
			commit_sha: "abc",
			status: "success",
			conclusion: "success",
			started_at: "2026-01-01T00:00:00Z",
			completed_at: "2026-01-01T00:01:00Z",
			logs: "ok",
			steps: JSON.stringify([
				{ name: "Test", status: "success", logs: "step ok" },
			]),
		},
	]);
	const runs = await listWorkflowRunsD1(db, "dexhorthy", "better-github");
	expect(runs).toHaveLength(1);
	const first = runs[0];
	if (!first) throw new Error("expected first run");
	expect(first.id).toBe("run-1");
	expect(first.workflowName).toBe("CI");
	expect(first.steps?.[0]?.logs).toBe("step ok");
});

test("getWorkflowRunD1 returns null for missing id", async () => {
	const db = makeFakeD1([]);
	const run = await getWorkflowRunD1(db, "missing");
	expect(run).toBeNull();
});

test("GET /api/repos/:owner/:repo/actions/runs returns persisted runs from D1", async () => {
	const jwtSecret = "test-secret";
	const token = await signJwt({ email: "test@example.com" }, jwtSecret);
	const db = makeFakeD1([
		{
			id: "run-a",
			workflow_name: "CI",
			repo_owner: "dexhorthy",
			repo_name: "better-github",
			branch: "main",
			commit_sha: "abc",
			status: "success",
			conclusion: "success",
			started_at: "2026-01-02T00:00:00Z",
			completed_at: null,
			logs: null,
			steps: null,
		},
		{
			id: "run-b",
			workflow_name: "Deploy",
			repo_owner: "dexhorthy",
			repo_name: "better-github",
			branch: "main",
			commit_sha: "def",
			status: "in_progress",
			conclusion: null,
			started_at: "2026-01-03T00:00:00Z",
			completed_at: null,
			logs: null,
			steps: null,
		},
		{
			id: "run-other",
			workflow_name: "CI",
			repo_owner: "dexhorthy",
			repo_name: "hello-world",
			branch: "main",
			commit_sha: "xyz",
			status: "success",
			conclusion: "success",
			started_at: "2026-01-04T00:00:00Z",
			completed_at: null,
			logs: null,
			steps: null,
		},
	]);

	const res = await workerApp.fetch(
		new Request(
			"http://localhost/api/repos/dexhorthy/better-github/actions/runs",
			{ headers: { Authorization: `Bearer ${token}` } },
		),
		{ DB: db, JWT_SECRET: jwtSecret },
	);
	expect(res.status).toBe(200);
	const body = (await res.json()) as { id: string }[];
	expect(body).toHaveLength(2);
	expect(body.map((r) => r.id).sort()).toEqual(["run-a", "run-b"]);
});

test("GET actions/runs requires auth", async () => {
	const db = makeFakeD1([]);
	const res = await workerApp.fetch(
		new Request(
			"http://localhost/api/repos/dexhorthy/better-github/actions/runs",
		),
		{ DB: db, JWT_SECRET: "test-secret" },
	);
	expect(res.status).toBe(401);
});

test("GET actions/runs/:runId returns 404 for unknown run", async () => {
	const jwtSecret = "test-secret";
	const token = await signJwt({ email: "test@example.com" }, jwtSecret);
	const db = makeFakeD1([]);
	const res = await workerApp.fetch(
		new Request(
			"http://localhost/api/repos/dexhorthy/better-github/actions/runs/missing",
			{ headers: { Authorization: `Bearer ${token}` } },
		),
		{ DB: db, JWT_SECRET: jwtSecret },
	);
	expect(res.status).toBe(404);
});

test("insertWorkflowRunD1 inserts a row into D1", async () => {
	const rows: Row[] = [];
	const db = makeFakeD1(rows);
	await insertWorkflowRunD1(db, {
		id: "run-inserted",
		workflowName: "CI",
		repoOwner: "dexhorthy",
		repoName: "better-github",
		branch: "main",
		commitSha: "abc",
		status: "queued",
		startedAt: "2026-01-05T00:00:00Z",
	});

	expect(rows).toHaveLength(1);
	expect(rows[0]?.id).toBe("run-inserted");
	expect(rows[0]?.workflow_name).toBe("CI");
});

test("POST actions/runs creates a queued workflow run in D1", async () => {
	const jwtSecret = "test-secret";
	const token = await signJwt({ email: "test@example.com" }, jwtSecret);
	const rows: Row[] = [];
	const db = makeFakeD1(rows);

	const res = await workerApp.fetch(
		new Request(
			"http://localhost/api/repos/dexhorthy/better-github/actions/runs",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					branch: "main",
					commitSha: "abc123",
					workflowContent:
						"name: Worker CI\non:\n  push:\njobs:\n  test:\n    runs-on: freestyle-vm\n    steps:\n      - name: Test\n        run: bun test",
				}),
			},
		),
		{ DB: db, JWT_SECRET: jwtSecret },
	);

	expect(res.status).toBe(201);
	const body = (await res.json()) as { id: string; status: string };
	expect(body.id).toBeString();
	expect(body.status).toBe("queued");
	expect(rows).toHaveLength(1);
	expect(rows[0]?.id).toBe(body.id);
	expect(rows[0]?.workflow_name).toBe("Worker CI");
	const pending = _getLastRunPromise();
	if (pending) await pending.catch(() => {});
});

test("GET workflows returns 401 without auth", async () => {
	const db = makeFakeD1([]);
	const res = await workerApp.fetch(
		new Request("http://localhost/api/repos/dexhorthy/better-github/workflows"),
		{ DB: db, JWT_SECRET: "test-secret" },
	);
	expect(res.status).toBe(401);
});

test("GET workflows returns array (empty when no FREESTYLE_API_KEY)", async () => {
	const jwtSecret = "test-secret";
	const token = await signJwt({ email: "test@example.com" }, jwtSecret);
	const db = makeFakeD1([]);
	const prevKey = process.env.FREESTYLE_API_KEY;
	delete process.env.FREESTYLE_API_KEY;
	try {
		const res = await workerApp.fetch(
			new Request(
				"http://localhost/api/repos/dexhorthy/better-github/workflows",
				{ headers: { Authorization: `Bearer ${token}` } },
			),
			{ DB: db, JWT_SECRET: jwtSecret },
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as unknown;
		expect(Array.isArray(body)).toBe(true);
	} finally {
		if (prevKey !== undefined) process.env.FREESTYLE_API_KEY = prevKey;
	}
});

test("POST workflows returns 401 without auth", async () => {
	const db = makeFakeD1([]);
	const res = await workerApp.fetch(
		new Request(
			"http://localhost/api/repos/dexhorthy/better-github/workflows",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "x.yml", content: "name: x" }),
			},
		),
		{ DB: db, JWT_SECRET: "test-secret" },
	);
	expect(res.status).toBe(401);
});

test("POST workflows returns 400 when name missing", async () => {
	const jwtSecret = "test-secret";
	const token = await signJwt({ email: "test@example.com" }, jwtSecret);
	const db = makeFakeD1([]);
	const res = await workerApp.fetch(
		new Request(
			"http://localhost/api/repos/dexhorthy/better-github/workflows",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ content: "name: x" }),
			},
		),
		{ DB: db, JWT_SECRET: jwtSecret },
	);
	expect(res.status).toBe(400);
});

test("POST workflows returns 400 when content missing", async () => {
	const jwtSecret = "test-secret";
	const token = await signJwt({ email: "test@example.com" }, jwtSecret);
	const db = makeFakeD1([]);
	const res = await workerApp.fetch(
		new Request(
			"http://localhost/api/repos/dexhorthy/better-github/workflows",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ name: "ci.yml" }),
			},
		),
		{ DB: db, JWT_SECRET: jwtSecret },
	);
	expect(res.status).toBe(400);
});

test("POST workflows returns 500 with 'Repository not found' when Freestyle creds missing", async () => {
	const jwtSecret = "test-secret";
	const token = await signJwt({ email: "test@example.com" }, jwtSecret);
	const db = makeFakeD1([]);
	const prevKey = process.env.FREESTYLE_API_KEY;
	const prevRepoId = process.env.FREESTYLE_REPO_ID;
	delete process.env.FREESTYLE_API_KEY;
	delete process.env.FREESTYLE_REPO_ID;
	try {
		const res = await workerApp.fetch(
			new Request(
				"http://localhost/api/repos/dexhorthy/better-github/workflows",
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ name: "ci", content: "name: CI\non: push" }),
				},
			),
			{ DB: db, JWT_SECRET: jwtSecret },
		);
		expect(res.status).toBe(500);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Repository not found");
	} finally {
		if (prevKey !== undefined) process.env.FREESTYLE_API_KEY = prevKey;
		if (prevRepoId !== undefined) process.env.FREESTYLE_REPO_ID = prevRepoId;
	}
});

test("PUT workflows/:name returns 401 without auth", async () => {
	const db = makeFakeD1([]);
	const res = await workerApp.fetch(
		new Request(
			"http://localhost/api/repos/dexhorthy/better-github/workflows/ci.yml",
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: "name: x" }),
			},
		),
		{ DB: db, JWT_SECRET: "test-secret" },
	);
	expect(res.status).toBe(401);
});

test("PUT workflows/:name returns 400 when content missing", async () => {
	const jwtSecret = "test-secret";
	const token = await signJwt({ email: "test@example.com" }, jwtSecret);
	const db = makeFakeD1([]);
	const res = await workerApp.fetch(
		new Request(
			"http://localhost/api/repos/dexhorthy/better-github/workflows/ci.yml",
			{
				method: "PUT",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			},
		),
		{ DB: db, JWT_SECRET: jwtSecret },
	);
	expect(res.status).toBe(400);
});

test("DELETE workflows/:name returns 401 without auth", async () => {
	const db = makeFakeD1([]);
	const res = await workerApp.fetch(
		new Request(
			"http://localhost/api/repos/dexhorthy/better-github/workflows/ci.yml",
			{ method: "DELETE" },
		),
		{ DB: db, JWT_SECRET: "test-secret" },
	);
	expect(res.status).toBe(401);
});

test("POST actions/runs executes workflow and persists success+logs+steps to D1", async () => {
	const jwtSecret = "test-secret";
	const token = await signJwt({ email: "test@example.com" }, jwtSecret);
	const rows: Row[] = [];
	const db = makeFakeD1(rows);

	setWorkflowExecutor(
		async (_workflow, _repoUrl, _branch, _commitSha, _runId) => ({
			success: true,
			cancelled: false,
			logs: "fake-execution-logs",
			steps: [
				{
					name: "Test",
					status: "success",
					logs: "fake step ok",
					startedAt: "2026-01-07T00:00:00Z",
					completedAt: "2026-01-07T00:00:01Z",
				},
			],
		}),
	);

	try {
		const res = await workerApp.fetch(
			new Request(
				"http://localhost/api/repos/dexhorthy/better-github/actions/runs",
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						branch: "main",
						commitSha: "abc123",
						workflowContent:
							"name: Worker CI\non:\n  push:\njobs:\n  test:\n    runs-on: freestyle-vm\n    steps:\n      - name: Test\n        run: bun test",
					}),
				},
			),
			{ DB: db, JWT_SECRET: jwtSecret },
		);
		expect(res.status).toBe(201);

		const pending = _getLastRunPromise();
		if (!pending) throw new Error("expected pending run promise");
		await pending;

		expect(rows).toHaveLength(1);
		const row = rows[0];
		if (!row) throw new Error("expected row");
		expect(row.status).toBe("success");
		expect(row.conclusion).toBe("success");
		expect(row.logs).toBe("fake-execution-logs");
		expect(row.completed_at).toBeString();
		const steps = JSON.parse(String(row.steps)) as { name: string }[];
		expect(steps).toHaveLength(1);
		expect(steps[0]?.name).toBe("Test");
	} finally {
		resetWorkflowExecutor();
	}
});

test("workflow run lifecycle broadcasts queued, in_progress, and final status", async () => {
	const jwtSecret = "test-secret";
	const token = await signJwt({ email: "test@example.com" }, jwtSecret);
	const rows: Row[] = [];
	const db = makeFakeD1(rows);
	const broadcasts: { id: string; status: string }[] = [];
	setBroadcaster((run: WorkflowRun) => {
		broadcasts.push({ id: run.id, status: run.status });
	});
	setWorkflowExecutor(async () => ({
		success: true,
		cancelled: false,
		logs: "ok",
		steps: [],
	}));

	try {
		const res = await workerApp.fetch(
			new Request(
				"http://localhost/api/repos/dexhorthy/better-github/actions/runs",
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						branch: "main",
						commitSha: "abc",
						workflowContent:
							"name: WS CI\non:\n  push:\njobs:\n  test:\n    runs-on: freestyle-vm\n    steps:\n      - name: Test\n        run: bun test",
					}),
				},
			),
			{ DB: db, JWT_SECRET: jwtSecret },
		);
		expect(res.status).toBe(201);
		const pending = _getLastRunPromise();
		if (!pending) throw new Error("expected pending run promise");
		await pending;

		expect(broadcasts.map((b) => b.status)).toEqual([
			"queued",
			"in_progress",
			"success",
		]);
		const ids = new Set(broadcasts.map((b) => b.id));
		expect(ids.size).toBe(1);
	} finally {
		resetBroadcaster();
		resetWorkflowExecutor();
	}
});

test("GET /ws returns 400 without upgrade header", async () => {
	const db = makeFakeD1([]);
	const res = await workerApp.fetch(new Request("http://localhost/ws"), {
		DB: db,
		JWT_SECRET: "test-secret",
	});
	expect(res.status).toBe(400);
});

test("GET /ws forwards to WS_BROADCASTER Durable Object", async () => {
	const db = makeFakeD1([]);
	let forwarded = false;
	const fakeStub = {
		fetch: async (req: Request) => {
			forwarded = true;
			expect(req.headers.get("upgrade")).toBe("websocket");
			return new Response("forwarded", { status: 200 });
		},
	};
	const fakeNamespace = {
		idFromName: (_name: string) => ({ toString: () => "id" }),
		get: (_id: unknown) => fakeStub,
	};
	const res = await workerApp.fetch(
		new Request("http://localhost/ws", {
			headers: { upgrade: "websocket" },
		}),
		{
			DB: db,
			JWT_SECRET: "test-secret",
			WS_BROADCASTER: fakeNamespace as unknown as never,
		} as never,
	);
	expect(forwarded).toBe(true);
	expect(res.status).toBe(200);
});

test("POST actions/runs/:runId/cancel cancels a queued run in D1", async () => {
	const jwtSecret = "test-secret";
	const token = await signJwt({ email: "test@example.com" }, jwtSecret);
	const rows: Row[] = [
		{
			id: "run-cancel",
			workflow_name: "CI",
			repo_owner: "dexhorthy",
			repo_name: "better-github",
			branch: "main",
			commit_sha: "abc",
			status: "queued",
			conclusion: null,
			started_at: "2026-01-06T00:00:00Z",
			completed_at: null,
			logs: null,
			steps: null,
		},
	];
	const db = makeFakeD1(rows);

	const res = await workerApp.fetch(
		new Request(
			"http://localhost/api/repos/dexhorthy/better-github/actions/runs/run-cancel/cancel",
			{
				method: "POST",
				headers: { Authorization: `Bearer ${token}` },
			},
		),
		{ DB: db, JWT_SECRET: jwtSecret },
	);

	expect(res.status).toBe(200);
	expect(rows[0]?.status).toBe("cancelled");
	expect(rows[0]?.conclusion).toBe("cancelled");
	expect(rows[0]?.completed_at).toBeString();
});

test("WorkflowBroadcaster replays latest cached run on subscribe", () => {
	const broadcaster = new WorkflowBroadcaster();
	const run: WorkflowRun = {
		id: "run-cached",
		workflowName: "CI",
		repoOwner: "dexhorthy",
		repoName: "better-github",
		branch: "main",
		commitSha: "abc",
		status: "in_progress",
		startedAt: "2026-04-29T00:00:00Z",
		logs: "queued line\n",
		steps: [
			{
				name: "checkout",
				status: "success",
				startedAt: "2026-04-29T00:00:00Z",
				completedAt: "2026-04-29T00:00:01Z",
				logs: "ok",
			},
		],
	};
	broadcaster.broadcast(run);

	const sent: string[] = [];
	const fakeWs = new EventTarget() as EventTarget & {
		send: (s: string) => void;
	};
	fakeWs.send = (s: string) => {
		sent.push(s);
	};
	broadcaster.attach(fakeWs as unknown as WebSocket);
	fakeWs.dispatchEvent(
		new MessageEvent("message", {
			data: JSON.stringify({ type: "subscribe", runId: "run-cached" }),
		}),
	);

	expect(sent).toHaveLength(1);
	const parsed = JSON.parse(sent[0] ?? "") as {
		type: string;
		run: WorkflowRun;
	};
	expect(parsed.type).toBe("run_update");
	expect(parsed.run.id).toBe("run-cached");
	expect(parsed.run.status).toBe("in_progress");
	expect(parsed.run.steps).toHaveLength(1);
});
