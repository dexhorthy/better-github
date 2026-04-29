import { describe, expect, test } from "bun:test";

const pkg = (await Bun.file(
	new URL("../package.json", import.meta.url),
).json()) as {
	scripts: Record<string, string>;
};
const startScriptSrc = await Bun.file(
	new URL("./start.ts", import.meta.url),
).text();

describe("bun run start", () => {
	test("package.json declares a start script", () => {
		const startScript = pkg.scripts.start;
		expect(typeof startScript).toBe("string");
		expect(startScript ?? "").not.toBe("");
	});

	test("start script boots both the API server and Vite", () => {
		expect(startScriptSrc).toContain("src/server.ts");
		expect(startScriptSrc).toContain("vite");
	});
});
