import { expect, test } from "@playwright/test";
import { _insertTestToken } from "../src/auth";

async function authenticate(page: import("@playwright/test").Page) {
	const email = `e2e-${Date.now()}-${Math.random()}@example.com`;
	const rawToken = `e2e-token-${crypto.randomUUID()}`;
	await _insertTestToken(email, rawToken, Date.now() + 60_000);
	const response = await page.request.get(
		`/api/auth/verify?token=${encodeURIComponent(rawToken)}`,
	);
	const body = (await response.json()) as { token: string };
	await page.addInitScript(
		({ token, email }) => {
			localStorage.setItem("better-github-token", token);
			localStorage.setItem("better-github-email", email);
		},
		{ token: body.token, email },
	);
}

test.beforeEach(async ({ page }) => {
	await authenticate(page);
});

test.describe("root page", () => {
	test("renders file list and README section", async ({ page }) => {
		await page.goto("/dexhorthy/better-github");
		await page.waitForSelector(".file-row");

		const fileRows = page.locator(".file-row");
		await expect(fileRows).toHaveCount(await fileRows.count());
		expect(await fileRows.count()).toBeGreaterThan(0);

		// src directory should appear in the file list
		await expect(page.getByRole("button", { name: "src" })).toBeVisible();

		// README section appears at root
		await expect(page.locator('[data-testid="repo-readme"]')).toBeVisible();
	});
});

test.describe("directory navigation", () => {
	test("clicking src renders src file entries", async ({ page }) => {
		await page.goto("/dexhorthy/better-github");
		await page.waitForSelector(".file-row");

		await page.getByRole("button", { name: "src" }).click();

		// Wait for file list to update
		await page.waitForSelector(".file-row");

		// App.tsx should appear in src listing
		await expect(page.getByRole("button", { name: "App.tsx" })).toBeVisible();

		// README section should be hidden in subdirectory
		await expect(page.locator('[data-testid="repo-readme"]')).not.toBeVisible();
	});

	test("clicking App.tsx renders file viewer with line numbers", async ({
		page,
	}) => {
		await page.goto("/dexhorthy/better-github?path=src");
		await page.waitForSelector(".file-row");

		await page.getByRole("button", { name: "App.tsx" }).click();

		// Wait for file viewer to appear
		await page.waitForSelector(".file-viewer");

		await expect(page.locator(".file-viewer")).toBeVisible();
		await expect(page.locator(".line-number").first()).toBeVisible();

		// Breadcrumb should show App.tsx
		const breadcrumbs = page.locator(".path-breadcrumbs");
		await expect(breadcrumbs).toContainText("App.tsx");
	});
});

test.describe("repo home link", () => {
	test("clicking the repo name from a file view resets to root", async ({
		page,
	}) => {
		await page.goto("/dexhorthy/better-github?path=src/App.tsx");
		await page.waitForSelector(".file-viewer");

		// Click the repo home link
		await page.locator('[data-testid="repo-home-link"]').click();

		// File viewer should disappear, file list should appear
		await page.waitForSelector(".file-row");
		await expect(page.locator(".file-viewer")).not.toBeVisible();

		// src directory should be visible in root listing
		await expect(page.getByRole("button", { name: "src" })).toBeVisible();

		// README section appears again
		await expect(page.locator('[data-testid="repo-readme"]')).toBeVisible();
	});
});
