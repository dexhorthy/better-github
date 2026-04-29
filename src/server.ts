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
import { fetchFreestyleRepoData } from "./freestyle-git";
import type { RepositoryOverview } from "./types";
import {
	getWorkflowRun,
	insertWorkflowRun,
	listWorkflowRuns,
	updateWorkflowRun,
} from "./workflow-db";
import {
	executeWorkflowRun,
	parseWorkflow,
	type WorkflowRun,
} from "./workflows";

export const app = new Hono();

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

app.get("/api/repos/:owner/:repo/actions/runs", requireAuth, async (c) => {
	const { owner, repo } = c.req.param();
	const runs = await listWorkflowRuns(owner, repo);
	return c.json(runs);
});

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
		await updateWorkflowRun(runId, { status: "in_progress" });
		const repoUrl = `https://git.freestyle.sh/${process.env.FREESTYLE_REPO_ID}`;
		const result = await executeWorkflowRun(
			workflow,
			repoUrl,
			branch,
			commitSha,
		);
		await updateWorkflowRun(runId, {
			status: result.success ? "success" : "failure",
			conclusion: result.success ? "success" : "failure",
			completedAt: new Date().toISOString(),
			logs: result.logs,
		});
	})().catch(console.error);

	return c.json({ id: runId, status: "queued" }, 201);
});

app.use("/*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

if (import.meta.main) {
	const port = Number(process.env.PORT ?? 8787);
	Bun.serve({
		port,
		fetch: app.fetch,
	});
	console.log(`Hono API listening on http://localhost:${port}`);
}
