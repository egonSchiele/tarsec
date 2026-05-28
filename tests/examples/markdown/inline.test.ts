import { describe, it, expect } from "vitest";
import { success } from "@/lib/types";
import {
  inlineMarkdownParser,
  inlineItalicParser,
  inlineTextParser,
  inlineEscapeParser,
  inlineItalicUnderscoreParser,
  inlineBoldUnderscoreParser,
} from "./inline";

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

describe("inlineTextParser stop set", () => {
  it.each<[string, string]>([
    ["abc*x*", "abc"],
    ["abc_x_", "abc"],
    ["abc`x`", "abc"],
    ["abc[x](y)", "abc"],
    ["abc![a](b)", "abc"],
    ["abc<x>", "abc"],
    ["abc~~x~~", "abc"],
    ["abc\nx", "abc"],
    ["abc\\*", "abc"],
  ])("stops inline text before delimiter in %j", (input, expected) => {
    const res = inlineTextParser(input);
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.content).toBe(expected);
  });

  it("fails on an empty match (so many1 cannot infinite-loop)", () => {
    expect(inlineTextParser("").success).toBe(false);
    expect(inlineTextParser("*x*").success).toBe(false);
  });
});

describe("inlineEscapeParser", () => {
  it("parses \\* as literal *", () => {
    expect(inlineEscapeParser("\\*rest")).toEqual(
      success({ type: "inline-text", content: "*" }, "rest")
    );
  });

  it("parses every escapable punctuation char", () => {
    const escapable = "\\`*_{}[]()#+-.!~<>|";
    for (const ch of escapable) {
      const res = inlineEscapeParser("\\" + ch);
      expect(res.success).toBe(true);
      if (res.success) expect(res.result.content).toBe(ch);
    }
  });

  it("fails on \\z (not an escapable char)", () => {
    expect(inlineEscapeParser("\\z").success).toBe(false);
  });

  it("dispatches via inlineMarkdownParser", () => {
    const res = inlineMarkdownParser("\\*not bold");
    expect(res.success).toBe(true);
    if (res.success) expect(res.result).toEqual({ type: "inline-text", content: "*" });
  });
});

describe("underscore emphasis", () => {
  it("parses _x_ as italic", () => {
    const res = inlineItalicUnderscoreParser("_x_");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({ type: "inline-italic", content: "x" });
  });

  it("parses __x__ as bold", () => {
    const res = inlineBoldUnderscoreParser("__x__");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({ type: "inline-bold", content: "x" });
  });

  it("dispatches _x_ via inlineMarkdownParser", () => {
    const res = inlineMarkdownParser("_hi_");
    if (res.success) expect(res.result.type).toBe("inline-italic");
  });

  it("dispatches __x__ via inlineMarkdownParser as bold", () => {
    const res = inlineMarkdownParser("__hi__");
    if (res.success) expect(res.result.type).toBe("inline-bold");
  });

  it("does NOT italicize the middle of snake_case_word", () => {
    // first match should be plain inline-text 'snake', not italic
    const res = inlineMarkdownParser("snake_case_word");
    expect(res.success).toBe(true);
    if (res.success) expect(res.result).toEqual({ type: "inline-text", content: "snake" });
  });
});

describe("literal-delimiter fallback", () => {
  it("falls back to literal _ when underscore italic does not apply", () => {
    // first take 'snake', then literal '_', then 'case', then '_', then 'word'
    const res = inlineMarkdownParser("_word");
    expect(res.success).toBe(true);
    if (res.success) expect(res.result).toEqual({ type: "inline-text", content: "_" });
  });
});
