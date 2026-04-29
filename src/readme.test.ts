import { describe, expect, test } from "bun:test";

const readme = await Bun.file(new URL("../README.md", import.meta.url)).text();

describe("README", () => {
	test("documents the local dev commands", () => {
		expect(readme).toContain("bun run dev");
		expect(readme).toContain("bun run api");
		expect(readme).toContain("bun run seed:freestyle");
		expect(readme).toContain("bun install");
	});

	test("documents required Freestyle env vars", () => {
		expect(readme).toContain("FREESTYLE_API_KEY");
		expect(readme).toContain("FREESTYLE_REPO_ID");
	});

	test("references the dev server URL", () => {
		expect(readme).toContain("127.0.0.1:5173");
	});
});
