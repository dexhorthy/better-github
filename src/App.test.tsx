import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	buildPathSearch,
	LineNumberedCode,
	ReadmePreview,
	RepoHomeLink,
	readPathFromSearch,
	parseRoute,
} from "./App";

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
