import { describe, it, expect } from "vitest";
import { markdownParser } from "./index";

describe("markdownParser integration", () => {
  it("parses a mixed-feature document end-to-end", () => {
    const input = [
      "# Title",
      "",
      "Some _italic_ and **bold** and a [ref][1].",
      "",
      "- one",
      "- two",
      "  - nested",
      "",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "> a quote with `code`",
      "",
      "---",
      "",
      "    indented code",
      "",
      "[1]: https://example.com",
    ].join("\n");

    const res = markdownParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      const types = (res.result as any[]).map((b) => b.type);
      expect(types).toContain("heading");
      expect(types).toContain("paragraph");
      expect(types).toContain("list");
      expect(types).toContain("table");
      expect(types).toContain("block-quote");
      expect(types).toContain("horizontal-rule");
      expect(types).toContain("code-block");
      // link-definition was stripped by resolveReferences
      expect(types).not.toContain("link-definition");
    }
  });

  it("parses the project README without crashing", () => {
    const fs = require("fs");
    const path = require("path");
    const readme = fs.readFileSync(
      path.resolve(__dirname, "../../../README.md"),
      "utf8"
    );
    const res = markdownParser(readme);
    expect(res.success).toBe(true);
  });

  it("parses the 5-minute intro tutorial without crashing", () => {
    const fs = require("fs");
    const path = require("path");
    const tut = fs.readFileSync(
      path.resolve(__dirname, "../../../tutorials/5-minute-intro.md"),
      "utf8"
    );
    const res = markdownParser(tut);
    expect(res.success).toBe(true);
  });

  it("resolves a reference link from a [id]: url definition", () => {
    const input = ["[hi][x]", "", "[x]: https://example.com"].join("\n");
    const res = markdownParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      const paragraph = (res.result as any[])[0];
      expect(paragraph.type).toBe("paragraph");
      expect(paragraph.content[0]).toEqual({
        type: "inline-link",
        content: [{ type: "inline-text", content: "hi" }],
        url: "https://example.com",
      });
    }
  });

  it("rounds-trips inline HTML inside a paragraph", () => {
    const res = markdownParser(`Hello <span class="hi">world</span>!`);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result).toEqual([
        {
          type: "paragraph",
          content: [
            { type: "inline-text", content: "Hello " },
            { type: "inline-html", content: `<span class="hi">` },
            { type: "inline-text", content: "world" },
            { type: "inline-html", content: "</span>" },
            { type: "inline-text", content: "!" },
          ],
        },
      ]);
    }
  });

  it("nested inlines round-trip through markdownParser", () => {
    const res = markdownParser(
      "Try **[the docs](https://x.dev)** or *`run --help`* now."
    );
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result).toEqual([
        {
          type: "paragraph",
          content: [
            { type: "inline-text", content: "Try " },
            {
              type: "inline-bold",
              content: [
                {
                  type: "inline-link",
                  url: "https://x.dev",
                  content: [{ type: "inline-text", content: "the docs" }],
                },
              ],
            },
            { type: "inline-text", content: " or " },
            {
              type: "inline-italic",
              content: [{ type: "inline-code", content: "run --help" }],
            },
            { type: "inline-text", content: " now." },
          ],
        },
      ]);
    }
  });
});
