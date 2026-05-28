import { describe, it, expect } from "vitest";
import { success } from "@/lib/types";
import {
  codeBlockParser,
  paragraphParser,
  horizontalRuleParser,
  setextHeadingParser,
  indentedCodeBlockParser,
  blockQuoteParser,
} from "./blocks";

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

describe("horizontalRuleParser", () => {
  it.each(["---", "***", "___", "- - -", "* * * *", "  ---  "])(
    "parses %j as a horizontal rule",
    (input) => {
      const res = horizontalRuleParser(input);
      expect(res.success).toBe(true);
      if (res.success) expect(res.result).toEqual({ type: "horizontal-rule" });
    }
  );

  it("rejects only two hyphens", () => {
    expect(horizontalRuleParser("--").success).toBe(false);
  });

  it("rejects -a- (mixed chars)", () => {
    expect(horizontalRuleParser("-a-").success).toBe(false);
  });

  it("leaves following input untouched", () => {
    const res = horizontalRuleParser("---\nfoo");
    expect(res.success).toBe(true);
    if (res.success) expect(res.rest).toBe("foo");
  });
});

describe("blockQuoteParser multi-line and nested", () => {
  it("parses a multi-line block quote into one node", () => {
    const input = "> line 1\n> line 2";
    const out = blockQuoteParser(input);
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.result.type).toBe("block-quote");
      expect(Array.isArray(out.result.content)).toBe(true);
      // some inline-text node must mention "line 1" and "line 2"
      const allText = (out.result.content as any[])
        .filter((x) => x.type === "inline-text")
        .map((x) => x.content)
        .join("");
      expect(allText).toContain("line 1");
      expect(allText).toContain("line 2");
    }
  });

  it("parses a nested block quote", () => {
    const out = blockQuoteParser("> outer\n> > inner");
    expect(out.success).toBe(true);
    if (out.success) {
      const nested = (out.result.content as any[]).find(
        (x) => x && x.type === "block-quote"
      );
      expect(nested).toBeDefined();
    }
  });
});

describe("indentedCodeBlockParser", () => {
  it("parses an indented code block", () => {
    const input = "    let x = 1;\n    let y = 2;\nrest";
    expect(indentedCodeBlockParser(input)).toEqual(
      success(
        { type: "code-block", language: null, content: "let x = 1;\nlet y = 2;\n" },
        "rest"
      )
    );
  });

  it("rejects when first line has fewer than 4 spaces", () => {
    expect(indentedCodeBlockParser("   x\n").success).toBe(false);
  });

  it("accepts tab as the indent", () => {
    const res = indentedCodeBlockParser("\tabc\n");
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.content).toBe("abc\n");
  });
});

describe("setextHeadingParser", () => {
  it("parses setext H1", () => {
    const res = setextHeadingParser("Title\n=====");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({ type: "heading", level: 1, content: "Title" });
  });

  it("parses setext H2", () => {
    const res = setextHeadingParser("Title\n--");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({ type: "heading", level: 2, content: "Title" });
  });

  it("rejects when the underline contains other chars", () => {
    expect(setextHeadingParser("Title\n==x").success).toBe(false);
  });

  it("rejects when the underline mixes = and -", () => {
    expect(setextHeadingParser("Title\n==--").success).toBe(false);
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
