import type { D1Database } from "@cloudflare/workers-types";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AuthDB, MagicLinkResult, VerifyResult } from "./auth-core";
import { requestMagicLink, verifyMagicLink, verifyToken } from "./auth-core";
import { repositories } from "./data";
import {
	deleteWorkflowFile,
	fetchFreestyleRepoData,
	fetchWorkflowFiles,
	saveWorkflowFile,
} from "./freestyle-git";
import { buildRepositoryOverview } from "./repository-overview";
import type { WorkflowStepResult } from "./types";
import {
	parseWorkflow,
	requestCancellation,
	type WorkflowRun,
} from "./workflows";

type Env = {
	DB: D1Database;
	JWT_SECRET?: string;
	FREESTYLE_API_KEY?: string;
	FREESTYLE_REPO_ID?: string;
	RESEND_API_KEY?: string;
	RESEND_API_DOMAN?: string;
};

type Variables = {
	user: { email: string };
};

function makeD1Db(db: D1Database): AuthDB {
	let initialized = false;

	return {
		async init() {
			if (initialized) return;
			await db
				.prepare(
					`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )`,
				)
				.run();
			await db
				.prepare(
					`CREATE TABLE IF NOT EXISTS magic_link_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            token TEXT UNIQUE NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )`,
				)
				.run();
			initialized = true;
		},
		async upsertUser(email) {
			await db
				.prepare(
					"INSERT INTO users (email) VALUES (?) ON CONFLICT (email) DO NOTHING",
				)
				.bind(email)
				.run();
		},
		async deleteTokensByEmail(email) {
			await db
				.prepare("DELETE FROM magic_link_tokens WHERE email = ?")
				.bind(email)
				.run();
		},
		async insertToken(email, token, expiresAt) {
			await db
				.prepare(
					"INSERT INTO magic_link_tokens (email, token, expires_at) VALUES (?, ?, ?)",
				)
				.bind(email, token, expiresAt)
				.run();
		},
		async getToken(token) {
			return db
				.prepare(
					"SELECT email, expires_at FROM magic_link_tokens WHERE token = ?",
				)
				.bind(token)
				.first<{ email: string; expires_at: string }>();
		},
		async deleteToken(token) {
			await db
				.prepare("DELETE FROM magic_link_tokens WHERE token = ?")
				.bind(token)
				.run();
		},
		async hasPendingToken(email, now) {
			const row = await db
				.prepare(
					"SELECT id FROM magic_link_tokens WHERE email = ? AND expires_at > ?",
				)
				.bind(email, now)
				.first<{ id: number }>();
			return row !== null;
		},
	};
}

export const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get("/api/health", (c) => c.json({ ok: true }));

app.post("/api/auth/request-link", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as { email?: string };
	const baseUrl = new URL(c.req.url).origin;
	const db = makeD1Db(c.env.DB);
	const jwtSecret = c.env.JWT_SECRET ?? "dev-secret-change-in-production";
	const result: MagicLinkResult = await requestMagicLink(
		db,
		body.email ?? "",
		baseUrl,
		c.env.RESEND_API_KEY,
		c.env.RESEND_API_DOMAN ?? "better-github.com",
	);
	// jwtSecret is used in verifyMagicLink, not requestMagicLink — silence unused var
	void jwtSecret;
	if (!result.ok) return c.json({ error: result.error }, 400);
	return c.json({ ok: true });
});

app.get("/api/auth/verify", async (c) => {
	const token = c.req.query("token") ?? "";
	const db = makeD1Db(c.env.DB);
	const jwtSecret = c.env.JWT_SECRET ?? "dev-secret-change-in-production";
	const result: VerifyResult = await verifyMagicLink(db, token, jwtSecret);
	if (!result.ok) return c.json({ error: result.error }, 401);
	return c.json({ token: result.token, email: result.email });
});

const requireAuth: MiddlewareHandler<{
	Bindings: Env;
	Variables: Variables;
}> = async (c, next) => {
	const authHeader = c.req.header("Authorization");
	const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
	if (!token) return c.json({ error: "Authentication required" }, 401);
	const jwtSecret = c.env.JWT_SECRET ?? "dev-secret-change-in-production";
	const user = await verifyToken(token, jwtSecret);
	if (!user) return c.json({ error: "Invalid or expired token" }, 401);
	c.set("user", user);
	await next();
};

app.get("/api/repos", requireAuth, (c) => {
	return c.json(repositories);
});

type WorkflowRunRow = {
	id: string;
	workflow_name: string;
	repo_owner: string;
	repo_name: string;
	branch: string;
	commit_sha: string;
	status: string;
	conclusion: string | null;
	started_at: string;
	completed_at: string | null;
	logs: string | null;
	steps: string | null;
};

function parseStepsField(
	steps: string | null,
): WorkflowStepResult[] | undefined {
	if (!steps) return undefined;
	try {
		const parsed = JSON.parse(steps) as unknown;
		if (typeof parsed === "string") return parseStepsField(parsed);
		return Array.isArray(parsed) ? (parsed as WorkflowStepResult[]) : undefined;
	} catch {
		return undefined;
	}
}

function rowToRun(row: WorkflowRunRow): WorkflowRun {
	return {
		id: row.id,
		workflowName: row.workflow_name,
		repoOwner: row.repo_owner,
		repoName: row.repo_name,
		branch: row.branch,
		commitSha: row.commit_sha,
		status: row.status as WorkflowRun["status"],
		conclusion: (row.conclusion ?? undefined) as WorkflowRun["conclusion"],
		startedAt: row.started_at,
		completedAt: row.completed_at ?? undefined,
		logs: row.logs ?? undefined,
		steps: parseStepsField(row.steps),
	};
}

export async function listWorkflowRunsD1(
	db: D1Database,
	owner: string,
	repo: string,
	limit = 20,
): Promise<WorkflowRun[]> {
	const result = await db
		.prepare(
			"SELECT * FROM workflow_runs WHERE repo_owner = ? AND repo_name = ? ORDER BY started_at DESC LIMIT ?",
		)
		.bind(owner, repo, limit)
		.all<WorkflowRunRow>();
	const rows = result.results ?? [];
	return rows.map(rowToRun);
}

export async function getWorkflowRunD1(
	db: D1Database,
	runId: string,
): Promise<WorkflowRun | null> {
	const row = await db
		.prepare("SELECT * FROM workflow_runs WHERE id = ?")
		.bind(runId)
		.first<WorkflowRunRow>();
	if (!row) return null;
	return rowToRun(row);
}

export async function insertWorkflowRunD1(
	db: D1Database,
	run: WorkflowRun,
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO workflow_runs (
        id,
        workflow_name,
        repo_owner,
        repo_name,
        branch,
        commit_sha,
        status,
        conclusion,
        started_at,
        completed_at,
        logs,
        steps
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			run.id,
			run.workflowName,
			run.repoOwner,
			run.repoName,
			run.branch,
			run.commitSha,
			run.status,
			run.conclusion ?? null,
			run.startedAt,
			run.completedAt ?? null,
			run.logs ?? null,
			run.steps ? JSON.stringify(run.steps) : null,
		)
		.run();
}

export async function updateWorkflowRunD1(
	db: D1Database,
	id: string,
	updates: Partial<
		Pick<
			WorkflowRun,
			"status" | "conclusion" | "completedAt" | "logs" | "steps"
		>
	>,
): Promise<void> {
	await db
		.prepare(
			`UPDATE workflow_runs
      SET
        status = COALESCE(?, status),
        conclusion = COALESCE(?, conclusion),
        completed_at = COALESCE(?, completed_at),
        logs = COALESCE(?, logs),
        steps = COALESCE(?, steps)
      WHERE id = ?`,
		)
		.bind(
			updates.status ?? null,
			updates.conclusion ?? null,
			updates.completedAt ?? null,
			updates.logs ?? null,
			updates.steps ? JSON.stringify(updates.steps) : null,
			id,
		)
		.run();
}

app.get(
	"/api/repos/:owner/:repo/actions/runs/:runId",
	requireAuth,
	async (c) => {
		const { runId } = c.req.param();
		const run = await getWorkflowRunD1(c.env.DB, runId);
		if (!run) return c.json({ message: "Run not found" }, 404);
		return c.json(run);
	},
);

app.get("/api/repos/:owner/:repo/actions/runs", requireAuth, async (c) => {
	const { owner, repo } = c.req.param();
	const runs = await listWorkflowRunsD1(c.env.DB, owner, repo);
	return c.json(runs);
});

app.post("/api/repos/:owner/:repo/actions/runs", requireAuth, async (c) => {
	const { owner, repo } = c.req.param();
	const body = (await c.req.json().catch(() => ({}))) as {
		branch?: string;
		commitSha?: string;
		workflowContent?: string;
		rerunOf?: string;
	};

	let branch = body.branch ?? "main";
	let commitSha = body.commitSha ?? "manual";

	if (body.rerunOf) {
		const originalRun = await getWorkflowRunD1(c.env.DB, body.rerunOf);
		if (!originalRun) {
			return c.json({ error: "Original run not found" }, 404);
		}
		branch = originalRun.branch;
		commitSha = originalRun.commitSha;
	}

	const workflowContent =
		body.workflowContent ??
		`name: CI\non:\n  push:\n    branches: [main]\njobs:\n  test:\n    runs-on: freestyle-vm\n    steps:\n      - name: Checkout\n        uses: checkout\n      - name: Install\n        run: bun install\n      - name: Test\n        run: bun test`;

	const workflow = parseWorkflow(workflowContent);
	if (!workflow) {
		return c.json({ error: "Invalid workflow YAML" }, 400);
	}

	const runId = crypto.randomUUID();
	const run: WorkflowRun = {
		id: runId,
		workflowName: workflow.name,
		repoOwner: owner,
		repoName: repo,
		branch,
		commitSha,
		status: "queued",
		startedAt: new Date().toISOString(),
	};

	await insertWorkflowRunD1(c.env.DB, run);
	return c.json({ id: runId, status: "queued" }, 201);
});

app.post(
	"/api/repos/:owner/:repo/actions/runs/:runId/cancel",
	requireAuth,
	async (c) => {
		const { runId } = c.req.param();
		const run = await getWorkflowRunD1(c.env.DB, runId);
		if (!run) return c.json({ error: "Run not found" }, 404);
		if (run.status !== "queued" && run.status !== "in_progress") {
			return c.json({ error: "Run is not cancellable" }, 400);
		}
		requestCancellation(runId);
		if (run.status === "queued") {
			await updateWorkflowRunD1(c.env.DB, runId, {
				status: "cancelled",
				conclusion: "cancelled",
				completedAt: new Date().toISOString(),
			});
		}
		return c.json({ ok: true });
	},
);

function bridgeFreestyleEnv(env: Env): void {
	if (env.FREESTYLE_API_KEY) {
		process.env.FREESTYLE_API_KEY = env.FREESTYLE_API_KEY;
	}
	if (env.FREESTYLE_REPO_ID) {
		process.env.FREESTYLE_REPO_ID = env.FREESTYLE_REPO_ID;
	}
}

app.get("/api/repos/:owner/:repo/workflows", requireAuth, async (c) => {
	const { repo } = c.req.param();
	bridgeFreestyleEnv(c.env);
	const workflowFiles = await fetchWorkflowFiles(repo);
	return c.json(workflowFiles);
});

app.post("/api/repos/:owner/:repo/workflows", requireAuth, async (c) => {
	const { repo } = c.req.param();
	const body = (await c.req.json().catch(() => ({}))) as {
		name?: string;
		content?: string;
	};

	if (!body.name) return c.json({ error: "Missing name" }, 400);
	if (!body.content) return c.json({ error: "Missing content" }, 400);

	let fileName = body.name;
	if (!fileName.endsWith(".yml") && !fileName.endsWith(".yaml")) {
		fileName = `${fileName}.yml`;
	}

	bridgeFreestyleEnv(c.env);
	const result = await saveWorkflowFile(repo, fileName, body.content);
	if (!result.ok) return c.json({ error: result.error }, 500);
	return c.json({ ok: true, name: fileName }, 201);
});

app.put("/api/repos/:owner/:repo/workflows/:name", requireAuth, async (c) => {
	const { repo, name } = c.req.param();
	const body = (await c.req.json().catch(() => ({}))) as { content?: string };

	if (!body.content) return c.json({ error: "Missing content" }, 400);

	bridgeFreestyleEnv(c.env);
	const result = await saveWorkflowFile(repo, name, body.content);
	if (!result.ok) return c.json({ error: result.error }, 500);
	return c.json({ ok: true });
});

app.delete(
	"/api/repos/:owner/:repo/workflows/:name",
	requireAuth,
	async (c) => {
		const { repo, name } = c.req.param();
		bridgeFreestyleEnv(c.env);
		const result = await deleteWorkflowFile(repo, name);
		if (!result.ok) return c.json({ error: result.error }, 500);
		return c.json({ ok: true });
	},
);

app.get("/api/repos/:owner/:repo", requireAuth, async (c) => {
	const { owner, repo } = c.req.param();
	const path = c.req.query("path") ?? "";
	const fixture = repositories.find(
		(item) => item.owner === owner && item.name === repo,
	);

	if (!fixture) {
		return c.json({ message: "Repository not found" }, 404);
	}

	// Set env vars from bindings so freestyle-git.ts can read process.env
	if (c.env.FREESTYLE_API_KEY) {
		process.env.FREESTYLE_API_KEY = c.env.FREESTYLE_API_KEY;
	}
	if (c.env.FREESTYLE_REPO_ID) {
		process.env.FREESTYLE_REPO_ID = c.env.FREESTYLE_REPO_ID;
	}

	const liveData = await fetchFreestyleRepoData(repo, path);
	return c.json(buildRepositoryOverview(fixture, path, liveData));
});

export default {
	fetch: app.fetch,
};
