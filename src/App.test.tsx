import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	buildPathSearch,
	LineNumberedCode,
	parseRoute,
	ReadmePreview,
	RepoBreadcrumb,
	RepoHomeLink,
	RunDetail,
	readPathFromSearch,
	WorkflowEditor,
} from "./App";
import type { WorkflowRun } from "./types";

describe("RepoBreadcrumb", () => {
	test("renders a link to / with data-testid=repo-breadcrumb-home and owner text", () => {
		const html = renderToStaticMarkup(
			<RepoBreadcrumb onBack={() => {}} owner="dexhorthy" />,
		);

		expect(html).toContain('data-testid="repo-breadcrumb-home"');
		expect(html).toContain('href="/"');
		expect(html).toContain("Better GitHub");
		expect(html).toContain("dexhorthy");
	});

	test("clicking invokes onBack and prevents default navigation", () => {
		let backCalls = 0;
		const rendered = RepoBreadcrumb({
			onBack: () => (backCalls += 1),
			owner: "dexhorthy",
		});

		let preventDefaultCalls = 0;
		const fakeEvent = {
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
			altKey: false,
			preventDefault: () => {
				preventDefaultCalls += 1;
			},
		};
		rendered.props.children[0].props.onClick(fakeEvent);

		expect(preventDefaultCalls).toBe(1);
		expect(backCalls).toBe(1);
	});

	test("clicking with a modifier key preserves default browser navigation", () => {
		let backCalls = 0;
		const rendered = RepoBreadcrumb({
			onBack: () => (backCalls += 1),
			owner: "dexhorthy",
		});

		let preventDefaultCalls = 0;
		const fakeEvent = {
			metaKey: true,
			ctrlKey: false,
			shiftKey: false,
			altKey: false,
			preventDefault: () => {
				preventDefaultCalls += 1;
			},
		};
		rendered.props.children[0].props.onClick(fakeEvent);

		expect(preventDefaultCalls).toBe(0);
		expect(backCalls).toBe(0);
	});
});

describe("ReadmePreview", () => {
	test("renders readme text inside data-testid=repo-readme", () => {
		const html = renderToStaticMarkup(
			<ReadmePreview text="# Hello\nbun run start" />,
		);

		expect(html).toContain('data-testid="repo-readme"');
		expect(html).toContain("# Hello");
		expect(html).toContain("bun run start");
	});
});

describe("LineNumberedCode", () => {
	test("renders one line-number cell per line of file text", () => {
		const html = renderToStaticMarkup(
			<LineNumberedCode text={"alpha\nbeta\n"} />,
		);

		expect(html.match(/class="line-number"/g)?.length).toBe(3);
		expect(html).toContain(">1</span>");
		expect(html).toContain(">2</span>");
		expect(html).toContain(">3</span>");
	});
});

describe("RepoHomeLink", () => {
	test("renders an anchor with href=/ and the repo-home-link testid", () => {
		const html = renderToStaticMarkup(
			<RepoHomeLink name="better-github" onHome={() => {}} />,
		);

		expect(html).toContain('data-testid="repo-home-link"');
		expect(html).toContain('href="/"');
		expect(html).toContain("<strong>better-github</strong>");
	});

	test("clicking invokes onHome and prevents default navigation", () => {
		let homeCalls = 0;
		const rendered = RepoHomeLink({
			name: "better-github",
			onHome: () => (homeCalls += 1),
		});

		let preventDefaultCalls = 0;
		const fakeEvent = {
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
			altKey: false,
			preventDefault: () => {
				preventDefaultCalls += 1;
			},
		};
		rendered.props.onClick(fakeEvent);

		expect(preventDefaultCalls).toBe(1);
		expect(homeCalls).toBe(1);
	});

	test("clicking with a modifier key preserves default browser navigation", () => {
		let homeCalls = 0;
		const rendered = RepoHomeLink({
			name: "better-github",
			onHome: () => (homeCalls += 1),
		});

		let preventDefaultCalls = 0;
		const fakeEvent = {
			metaKey: true,
			ctrlKey: false,
			shiftKey: false,
			altKey: false,
			preventDefault: () => {
				preventDefaultCalls += 1;
			},
		};
		rendered.props.onClick(fakeEvent);

		expect(preventDefaultCalls).toBe(0);
		expect(homeCalls).toBe(0);
	});
});

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
});
