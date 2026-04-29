import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { login, register, verifyToken } from "./auth";
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

app.post("/api/auth/register", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as {
		email?: string;
		password?: string;
	};
	const result = await register(body.email ?? "", body.password ?? "");
	if (!result.ok) return c.json({ error: result.error }, 400);
	return c.json({ token: result.token, email: result.email });
});

app.post("/api/auth/login", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as {
		email?: string;
		password?: string;
	};
	const result = await login(body.email ?? "", body.password ?? "");
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
		fetch: app.fetch,
	});
	console.log(`Hono API listening on http://localhost:${port}`);
}
