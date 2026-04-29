import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { requestMagicLink, verifyMagicLink, verifyToken } from "./auth";
import {
	branches,
	commits,
	getFixtureFilesForPath,
	pullRequests,
	repositories,
} from "./data";
import type { FreestyleRepoData } from "./freestyle-git";
import { fetchFreestyleRepoData, fetchWorkflowFiles } from "./freestyle-git";
import type { RepositoryOverview } from "./types";
import { verifyWebhookSignature } from "./webhook-signature";
import {
	broadcastRunUpdate,
	handleClose,
	handleMessage,
	handleOpen,
} from "./websocket";
import {
	getWorkflowRun,
	insertWorkflowRun,
	listWorkflowRuns,
	updateWorkflowRun,
} from "./workflow-db";
import {
	executeWorkflowRun,
	parseWorkflow,
	requestCancellation,
	shouldTrigger,
	type WorkflowRun,
} from "./workflows";

export const app = new Hono();

async function updateAndBroadcastRun(
	runId: string,
	updates: Partial<WorkflowRun>,
) {
	await updateWorkflowRun(runId, updates);
	const run = await getWorkflowRun(runId);
	if (run) {
		broadcastRunUpdate(run);
	}
}

function buildRepositoryOverview(
	fixture: (typeof repositories)[number],
	path: string,
	liveData: FreestyleRepoData | null,
): RepositoryOverview {
	return {
		repository: liveData
			? {
					...fixture,
					defaultBranch: liveData.repository.defaultBranch,
					visibility: liveData.repository.visibility,
					updatedAt: liveData.repository.updatedAt,
				}
			: fixture,
		branches: liveData?.branches.length ? liveData.branches : branches,
		commits: liveData?.commits.length ? liveData.commits : commits,
		pullRequests,
		path,
		files: liveData?.fileContent
			? []
			: liveData?.files.length
				? liveData.files
				: getFixtureFilesForPath(path),
		fileContent: liveData?.fileContent,
		readme: liveData?.readme,
	};
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

const requireAuth: MiddlewareHandler = async (c, next) => {
	const authHeader = c.req.header("Authorization");
	const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
	if (!token) return c.json({ error: "Authentication required" }, 401);
	const user = await verifyToken(token);
	if (!user) return c.json({ error: "Invalid or expired token" }, 401);
	c.set("user", user);
	await next();
};

app.get("/api/repos", requireAuth, (c) => {
	return c.json(repositories);
});

// Webhook endpoint for push events
app.post("/api/webhooks/push", async (c) => {
	const rawBody = await c.req.text();
	const signatureHeader = c.req.header("X-Hub-Signature-256");

	const isValid = await verifyWebhookSignature(rawBody, signatureHeader);
	if (!isValid) {
		return c.json({ error: "Invalid webhook signature" }, 401);
	}

	const body = JSON.parse(rawBody) as {
		owner?: string;
		repo?: string;
		branch?: string;
		commitSha?: string;
	};

	const { owner, repo, branch, commitSha } = body;

	if (!owner || !repo || !branch || !commitSha) {
		return c.json(
			{ error: "Missing required fields: owner, repo, branch, commitSha" },
			400,
		);
	}

	const workflowFiles = await fetchWorkflowFiles(repo);
	if (workflowFiles.length === 0) {
		return c.json({ message: "No workflows found", triggered: [] });
	}

	const triggered: { id: string; workflowName: string }[] = [];

	for (const wf of workflowFiles) {
		const workflow = parseWorkflow(wf.content);
		if (!workflow) continue;

		if (!shouldTrigger(workflow, "push", branch)) continue;

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

		await insertWorkflowRun(run);
		triggered.push({ id: runId, workflowName: workflow.name });

		// Execute in background
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
			const status = result.cancelled ? "cancelled" : result.success ? "success" : "failure";
			const conclusion = result.cancelled ? "cancelled" : result.success ? "success" : "failure";
			await updateAndBroadcastRun(runId, {
				status,
				conclusion,
				completedAt: new Date().toISOString(),
				logs: result.logs,
				steps: result.steps,
			});
		})().catch(console.error);
	}

	return c.json({ message: "Push event processed", triggered });
});

// More specific routes must come before less specific ones
app.get(
	"/api/repos/:owner/:repo/actions/runs/:runId",
	requireAuth,
	async (c) => {
		const { runId } = c.req.param();
		const run = await getWorkflowRun(runId);
		if (!run) return c.json({ message: "Run not found" }, 404);
		return c.json(run);
	},
);

app.get("/api/repos/:owner/:repo/actions/runs", requireAuth, async (c) => {
	const { owner, repo } = c.req.param();
	const runs = await listWorkflowRuns(owner, repo);
	return c.json(runs);
});

app.post("/api/repos/:owner/:repo/actions/runs", requireAuth, async (c) => {
	const { owner, repo } = c.req.param();
	const body = (await c.req.json().catch(() => ({}))) as {
		branch?: string;
		commitSha?: string;
		workflowContent?: string;
	};

	const branch = body.branch ?? "main";
	const commitSha = body.commitSha ?? "manual";

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

	await insertWorkflowRun(run);

	// Execute in background
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
		const status = result.cancelled ? "cancelled" : result.success ? "success" : "failure";
		const conclusion = result.cancelled ? "cancelled" : result.success ? "success" : "failure";
		await updateAndBroadcastRun(runId, {
			status,
			conclusion,
			completedAt: new Date().toISOString(),
			logs: result.logs,
			steps: result.steps,
		});
	})().catch(console.error);

	return c.json({ id: runId, status: "queued" }, 201);
});

app.post(
	"/api/repos/:owner/:repo/actions/runs/:runId/cancel",
	requireAuth,
	async (c) => {
		const { runId } = c.req.param();
		const run = await getWorkflowRun(runId);
		if (!run) return c.json({ error: "Run not found" }, 404);
		if (run.status !== "queued" && run.status !== "in_progress") {
			return c.json({ error: "Run is not cancellable" }, 400);
		}
		requestCancellation(runId);
		if (run.status === "queued") {
			await updateAndBroadcastRun(runId, {
				status: "cancelled",
				conclusion: "cancelled",
				completedAt: new Date().toISOString(),
			});
		}
		return c.json({ ok: true });
	},
);

// Less specific route comes after more specific /actions/runs routes
app.get("/api/repos/:owner/:repo", requireAuth, async (c) => {
	const { owner, repo } = c.req.param();
	const path = c.req.query("path") ?? "";
	const fixture = repositories.find(
		(item) => item.owner === owner && item.name === repo,
	);

	if (!fixture) {
		return c.json({ message: "Repository not found" }, 404);
	}

	const liveData = await fetchFreestyleRepoData(repo, path);
	return c.json(buildRepositoryOverview(fixture, path, liveData));
});

app.use("/*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

if (import.meta.main) {
	const port = Number(process.env.PORT ?? 8787);
	Bun.serve({
		port,
		fetch(req, server) {
			const url = new URL(req.url);
			if (url.pathname === "/ws" && req.headers.get("upgrade") === "websocket") {
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
