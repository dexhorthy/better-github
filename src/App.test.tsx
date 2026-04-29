import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LineNumberedCode, readPathFromSearch } from "./App";

describe("LineNumberedCode", () => {
  test("renders one line-number cell per line of file text", () => {
    const html = renderToStaticMarkup(<LineNumberedCode text={"alpha\nbeta\n"} />);

    expect(html.match(/class="line-number"/g)?.length).toBe(3);
    expect(html).toContain(">1</span>");
    expect(html).toContain(">2</span>");
    expect(html).toContain(">3</span>");
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
