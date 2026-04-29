import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LineNumberedCode } from "./App";

describe("LineNumberedCode", () => {
  test("renders one line-number cell per line of file text", () => {
    const html = renderToStaticMarkup(<LineNumberedCode text={"alpha\nbeta\n"} />);

    expect(html.match(/class="line-number"/g)?.length).toBe(3);
    expect(html).toContain(">1</span>");
    expect(html).toContain(">2</span>");
    expect(html).toContain(">3</span>");
  });
});
