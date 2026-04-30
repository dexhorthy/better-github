import type {
	D1Database,
	DurableObjectNamespace,
} from "@cloudflare/workers-types";
import { Hono } from "hono";
import type { MagicLinkResult, VerifyResult } from "./auth-core";
import { requestMagicLink, verifyMagicLink, verifyToken } from "./auth-core";
import { makeD1AuthDb } from "./auth-d1";
import { type AuthRouteVariables, registerAuthRoutes } from "./auth-routes";
import {
	deleteWorkflowFile,
	fetchFreestyleRepoData,
	fetchWorkflowFiles,
	saveWorkflowFile,
} from "./freestyle-git";
import { registerRepositoryRoutes } from "./repo-routes";
import { makeD1WorkflowRunRepo } from "./workflow-db-d1";
import {
	deriveTerminalStatus,
	executeWorkflowRun,
	type Workflow,
	type WorkflowRun,
	type WorkflowRunResult,
} from "./workflows";

export { WorkflowBroadcaster } from "./worker-broadcaster-do";

export type WorkflowExecutor = (
	workflow: Workflow,
	repoUrl: string,
	branch: string,
	commitSha: string,
	runId: string,
) => Promise<WorkflowRunResult>;

let workflowExecutor: WorkflowExecutor = executeWorkflowRun;

export function setWorkflowExecutor(fn: WorkflowExecutor): void {
	workflowExecutor = fn;
}

export function resetWorkflowExecutor(): void {
	workflowExecutor = executeWorkflowRun;
}

let lastRunPromise: Promise<void> | null = null;

export function _getLastRunPromise(): Promise<void> | null {
	return lastRunPromise;
}

type Env = {
	DB: D1Database;
	JWT_SECRET?: string;
	FREESTYLE_API_KEY?: string;
	FREESTYLE_REPO_ID?: string;
	RESEND_API_KEY?: string;
	RESEND_API_DOMAN?: string;
	WEBHOOK_SECRET?: string;
	WS_BROADCASTER?: DurableObjectNamespace;
};

export type Broadcaster = (run: WorkflowRun, env: Env) => void | Promise<void>;

async function defaultBroadcaster(run: WorkflowRun, env: Env): Promise<void> {
	if (!env.WS_BROADCASTER) return;
	try {
		const id = env.WS_BROADCASTER.idFromName("global");
		const stub = env.WS_BROADCASTER.get(id);
		await stub.fetch("https://do/broadcast", {
			method: "POST",
			body: JSON.stringify(run),
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		console.error("broadcast failed", err);
	}
}

let broadcaster: Broadcaster = defaultBroadcaster;

export function setBroadcaster(fn: Broadcaster): void {
	broadcaster = fn;
}

export function resetBroadcaster(): void {
	broadcaster = defaultBroadcaster;
}

export type WorkflowFileFetcher = (
	repoName: string,
) => Promise<{ name: string; content: string }[]>;

let workflowFileFetcher: WorkflowFileFetcher = fetchWorkflowFiles;

export function setWorkflowFileFetcher(fn: WorkflowFileFetcher): void {
	workflowFileFetcher = fn;
}

export function resetWorkflowFileFetcher(): void {
	workflowFileFetcher = fetchWorkflowFiles;
}

type Variables = AuthRouteVariables;

export const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/ws", (c) => {
	if (c.req.header("upgrade") !== "websocket") {
		return c.text("expected websocket", 400);
	}
	if (!c.env.WS_BROADCASTER) {
		return c.text("WebSocket not configured", 500);
	}
	const id = c.env.WS_BROADCASTER.idFromName("global");
	const stub = c.env.WS_BROADCASTER.get(id) as unknown as {
		fetch: (req: Request) => Promise<Response>;
	};
	return stub.fetch(
		new Request("https://do/ws", {
			headers: { upgrade: "websocket" },
		}),
	);
});

const requireAuth = registerAuthRoutes(app, {
	async requestMagicLink(c, email, baseUrl): Promise<MagicLinkResult> {
		const db = makeD1AuthDb(c.env.DB);
		return requestMagicLink(
			db,
			email,
			baseUrl,
			c.env.RESEND_API_KEY,
			c.env.RESEND_API_DOMAN ?? "better-github.com",
		);
	},
	async verifyMagicLink(c, token): Promise<VerifyResult> {
		const db = makeD1AuthDb(c.env.DB);
		const jwtSecret = c.env.JWT_SECRET ?? "dev-secret-change-in-production";
		return verifyMagicLink(db, token, jwtSecret);
	},
	async verifyToken(c, token) {
		const jwtSecret = c.env.JWT_SECRET ?? "dev-secret-change-in-production";
		return verifyToken(token, jwtSecret);
	},
});

function startWorkflowExecution(
	env: Env,
	runId: string,
	workflow: Workflow,
	branch: string,
	commitSha: string,
	c?: { executionCtx?: { waitUntil?: (p: Promise<unknown>) => void } },
): Promise<void> {
	const runRepo = makeD1WorkflowRunRepo(env.DB);
	const repoUrl = `https://git.freestyle.sh/${env.FREESTYLE_REPO_ID ?? ""}`;
	const execPromise = (async () => {
		try {
			await runRepo.update(runId, { status: "in_progress" });
			const inProgress = await runRepo.get(runId);
			if (inProgress) await broadcaster(inProgress, env);
			const result = await workflowExecutor(
				workflow,
				repoUrl,
				branch,
				commitSha,
				runId,
			);
			const { status, conclusion } = deriveTerminalStatus(result);
			await runRepo.update(runId, {
				status,
				conclusion,
				completedAt: new Date().toISOString(),
				logs: result.logs,
				steps: result.steps,
			});
			const finalRun = await runRepo.get(runId);
			if (finalRun) await broadcaster(finalRun, env);
		} catch (err) {
			console.error("workflow execution failed", err);
			await runRepo
				.update(runId, {
					status: "failure",
					conclusion: "failure",
					completedAt: new Date().toISOString(),
					logs: err instanceof Error ? err.message : String(err),
				})
				.catch(() => {});
			const failedRun = await runRepo.get(runId).catch(() => null);
			if (failedRun) {
				try {
					await broadcaster(failedRun, env);
				} catch {
					// drop
				}
			}
		}
	})();

	lastRunPromise = execPromise;
	try {
		c?.executionCtx?.waitUntil?.(execPromise);
	} catch {
		// no executionCtx in test environments
	}
	return execPromise;
}

function bridgeFreestyleEnv(env: Env): void {
	if (env.FREESTYLE_API_KEY) {
		process.env.FREESTYLE_API_KEY = env.FREESTYLE_API_KEY;
	}
	if (env.FREESTYLE_REPO_ID) {
		process.env.FREESTYLE_REPO_ID = env.FREESTYLE_REPO_ID;
	}
}

registerRepositoryRoutes(app, {
	requireAuth,
	getRunRepo: (c) => makeD1WorkflowRunRepo(c.env.DB),
	fetchRepoData: (repo, path, c) => {
		bridgeFreestyleEnv(c.env);
		return fetchFreestyleRepoData(repo, path);
	},
	fetchWorkflowFiles: (repo, c) => {
		bridgeFreestyleEnv(c.env);
		return workflowFileFetcher(repo);
	},
	saveWorkflowFile: (repo, fileName, content, c) => {
		bridgeFreestyleEnv(c.env);
		return saveWorkflowFile(repo, fileName, content);
	},
	deleteWorkflowFile: (repo, fileName, c) => {
		bridgeFreestyleEnv(c.env);
		return deleteWorkflowFile(repo, fileName);
	},
	startWorkflowExecution: (c, runId, workflow, branch, commitSha) => {
		bridgeFreestyleEnv(c.env);
		startWorkflowExecution(c.env, runId, workflow, branch, commitSha, c);
	},
	broadcastRun: (run, c) => broadcaster(run, c.env),
	updateAndBroadcastRun: async (c, runId, updates) => {
		const runRepo = makeD1WorkflowRunRepo(c.env.DB);
		await runRepo.update(runId, updates);
		const run = await runRepo.get(runId);
		if (run) await broadcaster(run, c.env);
	},
	webhookSecret: (c) => c.env.WEBHOOK_SECRET,
});

export default {
	fetch: app.fetch,
};
