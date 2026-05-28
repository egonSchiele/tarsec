import { describe, it, expect } from "vitest";
import { success } from "@/lib/types";
import { codeBlockParser, paragraphParser } from "./blocks";

describe("codeBlockParser language tag", () => {
  it("accepts hyphens, plus, and digits in language", () => {
    const input = "```objective-c\nint x = 1;\n```";
    expect(codeBlockParser(input)).toEqual(
      success(
        { type: "code-block", language: "objective-c", content: "int x = 1;\n" },
        ""
      )
    );
  });

  it("accepts c++", () => {
    const input = "```c++\nint x;\n```";
    expect(codeBlockParser(input).success).toBe(true);
  });

  it("accepts ts2", () => {
    const input = "```ts2\nlet x;\n```";
    expect(codeBlockParser(input).success).toBe(true);
  });
});

describe("paragraph with inline image", () => {
  it("parses an image inside paragraph text", () => {
    const input = "see ![alt](u.png) end";
    const res = paragraphParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.content).toEqual([
        { type: "inline-text", content: "see " },
        { type: "image", url: "u.png", alt: "alt" },
        { type: "inline-text", content: " end" },
      ]);
    }
  });
});

describe("paragraphParser blank-line termination", () => {
  it("stops paragraph at a blank line and leaves the rest", () => {
    const input = "hello\n\nworld";
    const res = paragraphParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result).toEqual({
        type: "paragraph",
        content: [{ type: "inline-text", content: "hello" }],
      });
      expect(res.rest).toBe("\n\nworld");
    }
  });

  it("stops paragraph at blank line with trailing spaces", () => {
    const input = "hello\n   \nworld";
    const res = paragraphParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.rest.startsWith("\n")).toBe(true);
    }
  });

  it("stops paragraph at end of input", () => {
    const input = "hello";
    const res = paragraphParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.content).toEqual([
        { type: "inline-text", content: "hello" },
      ]);
      expect(res.rest).toBe("");
    }
  });
});
