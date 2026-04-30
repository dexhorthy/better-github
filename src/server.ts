import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { requestMagicLink, verifyMagicLink, verifyToken } from "./auth";
import {
	deleteWorkflowFile,
	fetchFreestyleRepoData,
	fetchWorkflowFiles,
	saveWorkflowFile,
} from "./freestyle-git";
import {
	type RepositoryRouteVariables,
	registerRepositoryRoutes,
} from "./repo-routes";
import {
	broadcastRunUpdate,
	handleClose,
	handleMessage,
	handleOpen,
} from "./websocket";
import { postgresWorkflowRunRepo as runRepo } from "./workflow-db";
import {
	deriveTerminalStatus,
	executeWorkflowRun,
	type Workflow,
	type WorkflowRun,
} from "./workflows";

type ServerBindings = Record<string, never>;

export const app = new Hono<{
	Bindings: ServerBindings;
	Variables: RepositoryRouteVariables;
}>();

async function updateAndBroadcastRun(
	runId: string,
	updates: Partial<WorkflowRun>,
) {
	await runRepo.update(runId, updates);
	const run = await runRepo.get(runId);
	if (run) {
		broadcastRunUpdate(run);
	}
}

function startWorkflowExecution(
	runId: string,
	workflow: Workflow,
	branch: string,
	commitSha: string,
): void {
	(async () => {
		await updateAndBroadcastRun(runId, { status: "in_progress" });
		const repoUrl = `https://git.freestyle.sh/${process.env.FREESTYLE_REPO_ID}`;
		const result = await executeWorkflowRun(
			workflow,
			repoUrl,
			branch,
			commitSha,
			runId,
		);
		const { status, conclusion } = deriveTerminalStatus(result);
		await updateAndBroadcastRun(runId, {
			status,
			conclusion,
			completedAt: new Date().toISOString(),
			logs: result.logs,
			steps: result.steps,
		});
	})().catch(console.error);
}

app.get("/api/health", (c) => c.json({ ok: true }));

app.post("/api/auth/request-link", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as { email?: string };
	const baseUrl = new URL(c.req.url).origin;
	const result = await requestMagicLink(body.email ?? "", baseUrl);
	if (!result.ok) return c.json({ error: result.error }, 400);
	return c.json({ ok: true });
});

app.get("/api/auth/verify", async (c) => {
	const token = c.req.query("token") ?? "";
	const result = await verifyMagicLink(token);
	if (!result.ok) return c.json({ error: result.error }, 401);
	return c.json({ token: result.token, email: result.email });
});

const requireAuth: MiddlewareHandler<{
	Bindings: ServerBindings;
	Variables: RepositoryRouteVariables;
}> = async (c, next) => {
	const authHeader = c.req.header("Authorization");
	const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
	if (!token) return c.json({ error: "Authentication required" }, 401);
	const user = await verifyToken(token);
	if (!user) return c.json({ error: "Invalid or expired token" }, 401);
	c.set("user", user);
	await next();
};

registerRepositoryRoutes(app, {
	requireAuth,
	getRunRepo: () => runRepo,
	fetchRepoData: (repo, path) => fetchFreestyleRepoData(repo, path),
	fetchWorkflowFiles: (repo) => fetchWorkflowFiles(repo),
	saveWorkflowFile: (repo, fileName, content) =>
		saveWorkflowFile(repo, fileName, content),
	deleteWorkflowFile: (repo, fileName) => deleteWorkflowFile(repo, fileName),
	startWorkflowExecution: (_c, runId, workflow, branch, commitSha) =>
		startWorkflowExecution(runId, workflow, branch, commitSha),
	updateAndBroadcastRun: (_c, runId, updates) =>
		updateAndBroadcastRun(runId, updates),
});

app.use("/*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

if (import.meta.main) {
	const port = Number(process.env.PORT ?? 8787);
	Bun.serve({
		port,
		fetch(req, server) {
			const url = new URL(req.url);
			if (
				url.pathname === "/ws" &&
				req.headers.get("upgrade") === "websocket"
			) {
				const upgraded = server.upgrade(req, {
					data: { subscribedRunIds: new Set<string>() },
				});
				if (upgraded) return undefined;
				return new Response("WebSocket upgrade failed", { status: 400 });
			}
			return app.fetch(req, server);
		},
		websocket: {
			open: handleOpen,
			message: handleMessage,
			close: handleClose,
		},
	});
	console.log(`Hono API listening on http://localhost:${port}`);
}
