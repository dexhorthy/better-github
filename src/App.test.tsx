import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LineNumberedCode, buildPathSearch, readPathFromSearch } from "./App";

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
    expect(readPathFromSearch(buildPathSearch("src/App.tsx"))).toBe("src/App.tsx");
  });
});
