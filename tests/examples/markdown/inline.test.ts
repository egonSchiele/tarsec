import { describe, it, expect } from "vitest";
import { success } from "@/lib/types";
import {
  inlineMarkdownParser,
  inlineItalicParser,
  inlineTextParser,
  inlineEscapeParser,
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
