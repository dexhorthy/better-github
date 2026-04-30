import type { Context, Hono, MiddlewareHandler } from "hono";
import { repositories } from "./data";
import { buildRepositoryOverview } from "./repository-overview";
import { verifyWebhookSignature } from "./webhook-signature";
import type { WorkflowRunRepository } from "./workflow-run-row";
import {
	DEFAULT_WORKFLOW_CONTENT,
	newQueuedRun,
	parseWorkflow,
	requestCancellation,
	shouldTrigger,
	type Workflow,
	type WorkflowRun,
} from "./workflows";

export type RepositoryRouteVariables = {
	user: { email: string };
};

type WorkflowFile = {
	name: string;
	content: string;
};

type SaveResult = { ok: true } | { ok: false; error: string };

type RouteContext<Bindings extends object> = Context<{
	Bindings: Bindings;
	Variables: RepositoryRouteVariables;
}>;

export type RepositoryRouteDeps<Bindings extends object> = {
	requireAuth: MiddlewareHandler<{
		Bindings: Bindings;
		Variables: RepositoryRouteVariables;
	}>;
	getRunRepo: (c: RouteContext<Bindings>) => WorkflowRunRepository;
	fetchRepoData: (
		repo: string,
		path: string,
		c: RouteContext<Bindings>,
	) => Promise<Parameters<typeof buildRepositoryOverview>[2]>;
	fetchWorkflowFiles: (
		repo: string,
		c: RouteContext<Bindings>,
	) => Promise<WorkflowFile[]>;
	saveWorkflowFile: (
		repo: string,
		fileName: string,
		content: string,
		c: RouteContext<Bindings>,
	) => Promise<SaveResult>;
	deleteWorkflowFile: (
		repo: string,
		fileName: string,
		c: RouteContext<Bindings>,
	) => Promise<SaveResult>;
	startWorkflowExecution: (
		c: RouteContext<Bindings>,
		runId: string,
		workflow: Workflow,
		branch: string,
		commitSha: string,
	) => void | Promise<void>;
	broadcastRun?: (
		run: WorkflowRun,
		c: RouteContext<Bindings>,
	) => void | Promise<void>;
	updateAndBroadcastRun: (
		c: RouteContext<Bindings>,
		runId: string,
		updates: Partial<WorkflowRun>,
	) => Promise<void>;
	webhookSecret?: (c: RouteContext<Bindings>) => string | undefined;
};

export function registerRepositoryRoutes<Bindings extends object>(
	app: Hono<{ Bindings: Bindings; Variables: RepositoryRouteVariables }>,
	deps: RepositoryRouteDeps<Bindings>,
): void {
	const routeContext = (c: unknown) => c as RouteContext<Bindings>;

	app.get("/api/repos", deps.requireAuth, (c) => {
		return c.json(repositories);
	});

	app.post("/api/webhooks/push", async (c) => {
		const rawBody = await c.req.text();
		const signatureHeader = c.req.header("X-Hub-Signature-256");

		const isValid = await verifyWebhookSignature(
			rawBody,
			signatureHeader,
			deps.webhookSecret?.(routeContext(c)),
		);
		if (!isValid) {
			return c.json({ error: "Invalid webhook signature" }, 401);
		}

		let body: {
			owner?: string;
			repo?: string;
			branch?: string;
			commitSha?: string;
		};
		try {
			body = JSON.parse(rawBody);
		} catch {
			return c.json({ error: "Invalid JSON body" }, 400);
		}

		const { owner, repo, branch, commitSha } = body;
		if (!owner || !repo || !branch || !commitSha) {
			return c.json(
				{ error: "Missing required fields: owner, repo, branch, commitSha" },
				400,
			);
		}

		const workflowFiles = await deps.fetchWorkflowFiles(repo, routeContext(c));
		if (workflowFiles.length === 0) {
			return c.json({ message: "No workflows found", triggered: [] });
		}

		const runRepo = deps.getRunRepo(routeContext(c));
		const triggered: { id: string; workflowName: string }[] = [];
		for (const wf of workflowFiles) {
			const workflow = parseWorkflow(wf.content);
			if (!workflow) continue;
			if (!shouldTrigger(workflow, "push", branch)) continue;

			const run = newQueuedRun({
				workflowName: workflow.name,
				repoOwner: owner,
				repoName: repo,
				branch,
				commitSha,
			});
			await runRepo.insert(run);
			await deps.broadcastRun?.(run, routeContext(c));
			triggered.push({ id: run.id, workflowName: workflow.name });
			deps.startWorkflowExecution(
				routeContext(c),
				run.id,
				workflow,
				branch,
				commitSha,
			);
		}

		return c.json({ message: "Push event processed", triggered });
	});

	app.get(
		"/api/repos/:owner/:repo/actions/runs/:runId",
		deps.requireAuth,
		async (c) => {
			const { runId } = c.req.param();
			const run = await deps.getRunRepo(routeContext(c)).get(runId);
			if (!run) return c.json({ message: "Run not found" }, 404);
			return c.json(run);
		},
	);

	app.get(
		"/api/repos/:owner/:repo/actions/runs",
		deps.requireAuth,
		async (c) => {
			const { owner, repo } = c.req.param();
			const runs = await deps.getRunRepo(routeContext(c)).list(owner, repo);
			return c.json(runs);
		},
	);

	app.post(
		"/api/repos/:owner/:repo/actions/runs",
		deps.requireAuth,
		async (c) => {
			const { owner, repo } = c.req.param();
			const body = (await c.req.json().catch(() => ({}))) as {
				branch?: string;
				commitSha?: string;
				workflowContent?: string;
				rerunOf?: string;
			};

			const runRepo = deps.getRunRepo(routeContext(c));
			let branch = body.branch ?? "main";
			let commitSha = body.commitSha ?? "manual";

			if (body.rerunOf) {
				const originalRun = await runRepo.get(body.rerunOf);
				if (!originalRun) {
					return c.json({ error: "Original run not found" }, 404);
				}
				branch = originalRun.branch;
				commitSha = originalRun.commitSha;
			}

			const workflow = parseWorkflow(
				body.workflowContent ?? DEFAULT_WORKFLOW_CONTENT,
			);
			if (!workflow) {
				return c.json({ error: "Invalid workflow YAML" }, 400);
			}

			const run = newQueuedRun({
				workflowName: workflow.name,
				repoOwner: owner,
				repoName: repo,
				branch,
				commitSha,
			});

			await runRepo.insert(run);
			await deps.broadcastRun?.(run, routeContext(c));
			deps.startWorkflowExecution(
				routeContext(c),
				run.id,
				workflow,
				branch,
				commitSha,
			);

			return c.json({ id: run.id, status: "queued" }, 201);
		},
	);

	app.post(
		"/api/repos/:owner/:repo/actions/runs/:runId/cancel",
		deps.requireAuth,
		async (c) => {
			const { runId } = c.req.param();
			const runRepo = deps.getRunRepo(routeContext(c));
			const run = await runRepo.get(runId);
			if (!run) return c.json({ error: "Run not found" }, 404);
			if (run.status !== "queued" && run.status !== "in_progress") {
				return c.json({ error: "Run is not cancellable" }, 400);
			}
			requestCancellation(runId);
			if (run.status === "queued") {
				await deps.updateAndBroadcastRun(routeContext(c), runId, {
					status: "cancelled",
					conclusion: "cancelled",
					completedAt: new Date().toISOString(),
				});
			}
			return c.json({ ok: true });
		},
	);

	app.get("/api/repos/:owner/:repo/workflows", deps.requireAuth, async (c) => {
		const { repo } = c.req.param();
		const workflowFiles = await deps.fetchWorkflowFiles(repo, routeContext(c));
		return c.json(workflowFiles);
	});

	app.post("/api/repos/:owner/:repo/workflows", deps.requireAuth, async (c) => {
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

		const result = await deps.saveWorkflowFile(
			repo,
			fileName,
			body.content,
			routeContext(c),
		);
		if (!result.ok) return c.json({ error: result.error }, 500);
		return c.json({ ok: true, name: fileName }, 201);
	});

	app.put(
		"/api/repos/:owner/:repo/workflows/:name",
		deps.requireAuth,
		async (c) => {
			const { repo, name } = c.req.param();
			const body = (await c.req.json().catch(() => ({}))) as {
				content?: string;
			};

			if (!body.content) return c.json({ error: "Missing content" }, 400);

			const result = await deps.saveWorkflowFile(
				repo,
				name,
				body.content,
				routeContext(c),
			);
			if (!result.ok) return c.json({ error: result.error }, 500);
			return c.json({ ok: true });
		},
	);

	app.delete(
		"/api/repos/:owner/:repo/workflows/:name",
		deps.requireAuth,
		async (c) => {
			const { repo, name } = c.req.param();
			const result = await deps.deleteWorkflowFile(repo, name, routeContext(c));
			if (!result.ok) return c.json({ error: result.error }, 500);
			return c.json({ ok: true });
		},
	);

	app.get("/api/repos/:owner/:repo", deps.requireAuth, async (c) => {
		const { owner, repo } = c.req.param();
		const path = c.req.query("path") ?? "";
		const fixture = repositories.find(
			(item) => item.owner === owner && item.name === repo,
		);

		if (!fixture) {
			return c.json({ message: "Repository not found" }, 404);
		}

		const liveData = await deps.fetchRepoData(repo, path, routeContext(c));
		return c.json(buildRepositoryOverview(fixture, path, liveData));
	});
}
