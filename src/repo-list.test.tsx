import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RepoList } from "./repo-list";

describe("RepoList", () => {
	const auth = { token: "test-token", email: "user@example.com" };

	test("renders the topbar with the signed-in email and sign-out button", () => {
		const html = renderToStaticMarkup(
			<RepoList auth={auth} onSignOut={() => {}} onSelectRepo={() => {}} />,
		);

		expect(html).toContain("user@example.com");
		expect(html).toContain('data-testid="signout-button"');
		expect(html).toContain("Better GitHub");
	});

	test("renders the loading status on initial mount before fetch resolves", () => {
		const html = renderToStaticMarkup(
			<RepoList auth={auth} onSignOut={() => {}} onSelectRepo={() => {}} />,
		);

		expect(html).toContain("Loading repositories");
		expect(html).not.toContain('data-testid="repo-list"');
	});

	test("renders a Repositories heading and search input", () => {
		const html = renderToStaticMarkup(
			<RepoList auth={auth} onSignOut={() => {}} onSelectRepo={() => {}} />,
		);

		expect(html).toContain("Repositories");
		expect(html).toContain('aria-label="Search or jump to"');
	});
});
