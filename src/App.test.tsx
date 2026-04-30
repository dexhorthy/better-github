import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	buildPathSearch,
	parseRoute,
	RunDetail,
	readPathFromSearch,
	WorkflowEditor,
} from "./App";
import type { WorkflowRun } from "./types";

describe("readPathFromSearch", () => {
	test("returns empty string when no path query is set", () => {
		expect(readPathFromSearch("")).toBe("");
		expect(readPathFromSearch("?other=1")).toBe("");
	});

	test("extracts a directory path from the query string", () => {
		expect(readPathFromSearch("?path=src")).toBe("src");
	});

	test("extracts a nested file path from the query string", () => {
		expect(readPathFromSearch("?path=src/App.tsx")).toBe("src/App.tsx");
	});

	test("trims surrounding slashes so the API receives a clean path", () => {
		expect(readPathFromSearch("?path=/src/App.tsx/")).toBe("src/App.tsx");
	});
});

describe("parseRoute", () => {
	test("returns repos page for root path", () => {
		expect(parseRoute("/")).toEqual({ page: "repos" });
		expect(parseRoute("")).toEqual({ page: "repos" });
	});

	test("returns repo page for /:owner/:repo", () => {
		expect(parseRoute("/dexhorthy/better-github")).toEqual({
			page: "repo",
			owner: "dexhorthy",
			repo: "better-github",
		});
	});

	test("returns repo page for /:owner/:repo/ (trailing slash)", () => {
		expect(parseRoute("/dexhorthy/hello-world/")).toEqual({
			page: "repo",
			owner: "dexhorthy",
			repo: "hello-world",
		});
	});
});

describe("buildPathSearch", () => {
	test("returns empty string when path is empty so the URL has no query", () => {
		expect(buildPathSearch("")).toBe("");
	});

	test("encodes a directory path", () => {
		expect(buildPathSearch("src")).toBe("?path=src");
	});

	test("encodes a nested file path", () => {
		expect(buildPathSearch("src/App.tsx")).toBe("?path=src%2FApp.tsx");
	});

	test("trims surrounding slashes before encoding", () => {
		expect(buildPathSearch("/src/")).toBe("?path=src");
	});

	test("round trips through readPathFromSearch", () => {
		expect(readPathFromSearch(buildPathSearch("src/App.tsx"))).toBe(
			"src/App.tsx",
		);
	});
});

describe("RunDetail", () => {
	test("renders run detail with steps", () => {
		const run: WorkflowRun = {
			id: "test-run-123",
			workflowName: "CI",
			repoOwner: "dexhorthy",
			repoName: "better-github",
			branch: "main",
			commitSha: "abc1234567890",
			status: "success",
			startedAt: "2024-01-01T10:00:00Z",
			completedAt: "2024-01-01T10:05:00Z",
			steps: [
				{ name: "Checkout", status: "success", logs: "Cloning repo..." },
				{ name: "Install", status: "success", logs: "Installing deps..." },
				{ name: "Test", status: "success", logs: "All tests passed!" },
			],
		};

		const html = renderToStaticMarkup(
			<RunDetail run={run} onBack={() => {}} />,
		);

		expect(html).toContain('data-testid="run-detail"');
		expect(html).toContain('data-testid="run-steps"');
		expect(html).toContain('data-testid="step-item"');
		expect(html).toContain("CI");
		expect(html).toContain("Checkout");
		expect(html).toContain("Install");
		expect(html).toContain("Test");
		expect(html).toContain("abc1234");
	});

	test("renders back button with data-testid", () => {
		const run: WorkflowRun = {
			id: "test-run-456",
			workflowName: "Build",
			repoOwner: "dexhorthy",
			repoName: "better-github",
			branch: "feature",
			commitSha: "def5678",
			status: "queued",
			startedAt: "2024-01-01T10:00:00Z",
		};

		const html = renderToStaticMarkup(
			<RunDetail run={run} onBack={() => {}} />,
		);

		expect(html).toContain('data-testid="run-detail-back"');
		expect(html).toContain("All workflow runs");
	});

	test("renders empty steps message when no steps available", () => {
		const run: WorkflowRun = {
			id: "test-run-789",
			workflowName: "Deploy",
			repoOwner: "dexhorthy",
			repoName: "better-github",
			branch: "main",
			commitSha: "ghi9012",
			status: "queued",
			startedAt: "2024-01-01T10:00:00Z",
			steps: [],
		};

		const html = renderToStaticMarkup(
			<RunDetail run={run} onBack={() => {}} />,
		);

		expect(html).toContain("No step details available yet");
	});

	test("renders Re-run button for completed runs (success)", () => {
		const run: WorkflowRun = {
			id: "test-run-completed",
			workflowName: "CI",
			repoOwner: "dexhorthy",
			repoName: "better-github",
			branch: "main",
			commitSha: "completed123",
			status: "success",
			startedAt: "2024-01-01T10:00:00Z",
			completedAt: "2024-01-01T10:05:00Z",
		};

		const html = renderToStaticMarkup(
			<RunDetail run={run} onBack={() => {}} onRerun={() => {}} />,
		);

		expect(html).toContain('data-testid="rerun-button"');
		expect(html).toContain("Re-run");
	});

	test("renders Re-run button for failed runs", () => {
		const run: WorkflowRun = {
			id: "test-run-failed",
			workflowName: "CI",
			repoOwner: "dexhorthy",
			repoName: "better-github",
			branch: "main",
			commitSha: "failed123",
			status: "failure",
			startedAt: "2024-01-01T10:00:00Z",
			completedAt: "2024-01-01T10:05:00Z",
		};

		const html = renderToStaticMarkup(
			<RunDetail run={run} onBack={() => {}} onRerun={() => {}} />,
		);

		expect(html).toContain('data-testid="rerun-button"');
	});

	test("does not render Re-run button for in_progress runs", () => {
		const run: WorkflowRun = {
			id: "test-run-progress",
			workflowName: "CI",
			repoOwner: "dexhorthy",
			repoName: "better-github",
			branch: "main",
			commitSha: "progress123",
			status: "in_progress",
			startedAt: "2024-01-01T10:00:00Z",
		};

		const html = renderToStaticMarkup(
			<RunDetail run={run} onBack={() => {}} onRerun={() => {}} />,
		);

		expect(html).not.toContain('data-testid="rerun-button"');
	});
});

describe("WorkflowEditor", () => {
	test("renders workflow editor with header and back button", () => {
		const html = renderToStaticMarkup(
			<WorkflowEditor
				auth={{ token: "test-token" }}
				owner="dexhorthy"
				repo="better-github"
				onBack={() => {}}
			/>,
		);

		expect(html).toContain('data-testid="workflow-editor"');
		expect(html).toContain('data-testid="workflow-editor-back"');
		expect(html).toContain("Workflow files");
		expect(html).toContain("Back to runs");
	});

	test("shows loading state initially", () => {
		const html = renderToStaticMarkup(
			<WorkflowEditor
				auth={{ token: "test-token" }}
				owner="dexhorthy"
				repo="better-github"
				onBack={() => {}}
			/>,
		);

		expect(html).toContain("Loading workflows...");
	});

	test("renders new workflow button", () => {
		const html = renderToStaticMarkup(
			<WorkflowEditor
				auth={{ token: "test-token" }}
				owner="dexhorthy"
				repo="better-github"
				onBack={() => {}}
			/>,
		);

		expect(html).toContain('data-testid="workflow-create-btn"');
		expect(html).toContain("New workflow");
	});
});
