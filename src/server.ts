import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { requestMagicLink, verifyMagicLink, verifyToken } from "./auth";
import { type AuthRouteVariables, registerAuthRoutes } from "./auth-routes";
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
	Variables: AuthRouteVariables & RepositoryRouteVariables;
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

const requireAuth = registerAuthRoutes(app, {
	requestMagicLink: (_c, email, baseUrl) => requestMagicLink(email, baseUrl),
	verifyMagicLink: (_c, token) => verifyMagicLink(token),
	verifyToken: (_c, token) => verifyToken(token),
});

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
