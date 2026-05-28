import { describe, it, expect } from "vitest";
import { inlineMarkdownParser, inlineItalicParser } from "./inline";

describe("bold vs italic ordering", () => {
  it("parses ** as bold even when * could match first", () => {
    const res = inlineMarkdownParser("**hi**");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result).toEqual({ type: "inline-bold", content: "hi" });
    }
  });

  it("italic alone never consumes a bold opener", () => {
    const res = inlineItalicParser("**bold**");
    expect(res.success).toBe(false);
  });

  it("inline italic does not swallow the closing ** of bold", () => {
    const res = inlineMarkdownParser("*x* **y**");
    expect(res.success).toBe(true);
  });
});
