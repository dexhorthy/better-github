import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	fullyParallel: false,
	retries: 1,
	timeout: 30_000,
	use: {
		baseURL: "http://127.0.0.1:5173",
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: [
		{
			command: "/Users/dex/.bun/bin/bun run src/server.ts",
			url: "http://localhost:8787/api/health",
			reuseExistingServer: true,
			timeout: 15_000,
		},
		{
			command: "node_modules/.bin/vite --host 127.0.0.1",
			url: "http://127.0.0.1:5173",
			reuseExistingServer: true,
			timeout: 30_000,
		},
	],
});
