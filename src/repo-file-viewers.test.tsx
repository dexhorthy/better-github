import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LineNumberedCode, ReadmePreview } from "./repo-file-viewers";

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
