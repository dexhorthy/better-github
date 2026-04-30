import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RepoBreadcrumb, RepoHomeLink } from "./repo-navigation";

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
