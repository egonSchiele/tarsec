import { describe, it, expect } from "vitest";
import { success } from "@/lib/types";
import {
  codeBlockParser,
  paragraphParser,
  horizontalRuleParser,
  setextHeadingParser,
  indentedCodeBlockParser,
  blockQuoteParser,
  listParser,
  tableParser,
  htmlBlockParser,
  headingParser,
} from "@/lib/parsers/markdown/blocks";

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

describe("ATX heading level cap", () => {
  it("parses heading levels 1–6", () => {
    for (let n = 1; n <= 6; n++) {
      const res = headingParser("#".repeat(n) + " Title");
      expect(res.success).toBe(true);
      if (res.success) expect(res.result.level).toBe(n);
    }
  });

  it("rejects 7+ '#' as a heading", () => {
    expect(headingParser("####### Title").success).toBe(false);
  });
});

describe("ATX heading trailing '#' stripping", () => {
  it("strips a trailing '#' run preceded by a space", () => {
    const res = headingParser("## Heading ##");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result.content).toEqual([
        { type: "inline-text", content: "Heading" },
      ]);
  });

  it("does not strip when there's no separating space", () => {
    const res = headingParser("## Heading##");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result.content).toEqual([
        { type: "inline-text", content: "Heading##" },
      ]);
  });

  it("strips trailing '#' followed by trailing spaces and newline", () => {
    const res = headingParser("## Heading ###  \nrest");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.content).toEqual([
        { type: "inline-text", content: "Heading" },
      ]);
      expect(res.rest).toBe("rest");
    }
  });
});

describe("ATX heading inline content", () => {
  it("parses bold inside a heading", () => {
    const res = headingParser("# hello **world**");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.content).toEqual([
        { type: "inline-text", content: "hello " },
        {
          type: "inline-bold",
          content: [{ type: "inline-text", content: "world" }],
        },
      ]);
    }
  });
});

describe("htmlBlockParser", () => {
  it("passes through a <div>...</div> block until a blank line", () => {
    const input = "<div>\nhi\n</div>\n\nafter";
    const res = htmlBlockParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result).toEqual({
        type: "html-block",
        content: "<div>\nhi\n</div>",
      });
      expect(res.rest.startsWith("\n\n")).toBe(true);
    }
  });

  it("passes through a self-closing <hr /> tag", () => {
    const input = "<hr />";
    const res = htmlBlockParser(input);
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.content).toBe("<hr />");
  });

  it("rejects when the input does not start with an html-like tag", () => {
    expect(htmlBlockParser("hi <div>").success).toBe(false);
    expect(htmlBlockParser("<3 you").success).toBe(false);
  });
});

describe("tableParser", () => {
  it("parses a table with header, alignments, and rows", () => {
    const input =
      "| h1 | h2 | h3 |\n" +
      "|:---|---:|:---:|\n" +
      "| a  | b  | c  |\n" +
      "| d  | e  | f  |";
    const res = tableParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.headers).toEqual(["h1", "h2", "h3"]);
      expect(res.result.alignments).toEqual(["left", "right", "center"]);
      expect(res.result.rows).toEqual([
        ["a", "b", "c"],
        ["d", "e", "f"],
      ]);
    }
  });

  it("fails when the separator row is missing", () => {
    const input = "| h1 | h2 |\n| a | b |";
    expect(tableParser(input).success).toBe(false);
  });
});

describe("listParser unordered", () => {
  it("parses a flat unordered list", () => {
    const res = listParser("- a\n- b\n- c");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.type).toBe("list");
      expect(res.result.ordered).toBe(false);
      expect(res.result.items.map((i) => i.content)).toEqual([
        [{ type: "paragraph", content: [{ type: "inline-text", content: "a" }] }],
        [{ type: "paragraph", content: [{ type: "inline-text", content: "b" }] }],
        [{ type: "paragraph", content: [{ type: "inline-text", content: "c" }] }],
      ]);
    }
  });

  it("accepts * and + as markers", () => {
    expect(listParser("* a\n* b").success).toBe(true);
    expect(listParser("+ a\n+ b").success).toBe(true);
  });
});

describe("listParser ordered", () => {
  it("parses a flat ordered list", () => {
    const res = listParser("1. a\n2. b\n3. c");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.ordered).toBe(true);
      expect(res.result.start).toBe(1);
      expect(res.result.items.length).toBe(3);
    }
  });

  it("preserves starting number", () => {
    const res = listParser("5. a\n6. b");
    if (res.success) expect(res.result.start).toBe(5);
  });
});

describe("task list items (GFM)", () => {
  it.each<[string, boolean]>([
    ["- [ ] todo", false],
    ["- [x] done", true],
    ["- [X] done", true],
    ["* [ ] asterisk", false],
    ["+ [x] plus", true],
    ["1. [ ] ordered", false],
  ])("parses %j as checked=%s", (input, checked) => {
    const res = listParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.items[0].checked).toBe(checked);
    }
  });

  it("leaves `checked` undefined on a plain item", () => {
    const res = listParser("- foo");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.items[0].checked).toBeUndefined();
    }
  });

  it("requires a space after the checkbox", () => {
    // `- [ ]foo` (no space) treats the brackets as inline content (a ref-link),
    // not a task-list checkbox.
    const res = listParser("- [ ]foo");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.items[0].checked).toBeUndefined();
    }
  });
});

describe("listParser nested", () => {
  it("parses a nested unordered list", () => {
    const input = "- a\n  - a1\n  - a2\n- b";
    const res = listParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.items.length).toBe(2);
      const first = res.result.items[0];
      // The sublist now lives inside the item's content blocks rather than
      // on a dedicated `sublist` field.
      const sublist = first.content.find((b) => b.type === "list");
      expect(sublist).toBeDefined();
      if (sublist && sublist.type === "list") {
        expect(sublist.items.length).toBe(2);
      }
    }
  });
});

describe("listParser nested blocks (minimum viable)", () => {
  it("nests a fenced code block inside a list item", () => {
    const input = [
      "- Run this:",
      "  ```ts",
      "  node main()",
      "  ```",
    ].join("\n");
    const res = listParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      const item = res.result.items[0];
      const types = item.content.map((b) => b.type);
      expect(types).toEqual(["paragraph", "code-block"]);
      const code = item.content[1] as any;
      expect(code.language).toBe("ts");
      expect(code.content).toBe("node main()\n");
    }
  });

  it("nests a fenced code block inside a sub-list item (the README case)", () => {
    const input = [
      "- Quick Start:",
      "  - Create a file:",
      "    ```ts",
      "    node main() {",
      "      print(1);",
      "    }",
      "    ```",
      "  - Run it.",
    ].join("\n");
    const res = listParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.items.length).toBe(1);
      const inner = res.result.items[0].content.find(
        (b) => b.type === "list"
      );
      expect(inner).toBeDefined();
      if (inner && inner.type === "list") {
        expect(inner.items.length).toBe(2);
        const firstInner = inner.items[0];
        const types = firstInner.content.map((b) => b.type);
        expect(types).toEqual(["paragraph", "code-block"]);
        const code = firstInner.content[1] as any;
        expect(code.language).toBe("ts");
      }
    }
  });

  it("nests a blockquote inside a list item", () => {
    const input = [
      "- top",
      "  > quoted",
    ].join("\n");
    const res = listParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      const types = res.result.items[0].content.map((b) => b.type);
      expect(types).toEqual(["paragraph", "block-quote"]);
    }
  });

  it("nests an ordered list inside an ordered item (k=3 continuation)", () => {
    // For `1. outer` (marker col 0, width 2, one space): k = 3.
    // Inner items at 3-space indent fall inside the outer item.
    const input = [
      "1. outer",
      "   1. inner",
      "   2. inner2",
    ].join("\n");
    const res = listParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      // outer ordered list with one item that contains an inner ordered list
      expect(res.result.ordered).toBe(true);
      const outer = res.result.items[0];
      const inner = outer.content.find((b) => b.type === "list");
      expect(inner).toBeDefined();
      if (inner && inner.type === "list") {
        expect(inner.ordered).toBe(true);
        expect(inner.items.length).toBe(2);
      }
    }
  });

  it("produces multiple paragraph blocks when items have blank-line-separated paragraphs", () => {
    const input = ["- first para", "", "  second para"].join("\n");
    const res = listParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      const types = res.result.items[0].content.map((b) => b.type);
      expect(types).toEqual(["paragraph", "paragraph"]);
    }
  });

  // --- Negative cases ---

  it("does not absorb a sibling item as continuation", () => {
    // `- second` at column 0 is a new sibling, not part of the first item.
    const res = listParser("- first\n- second\n");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.items.length).toBe(2);
      const firstTypes = res.result.items[0].content.map((b) => b.type);
      expect(firstTypes).toEqual(["paragraph"]);
    }
  });

  it("survives a trailing blank line after the last item", () => {
    const res = listParser("- one\n- two\n\n");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.items.length).toBe(2);
    }
  });

  // --- Known-broken (out of scope per spec) ---

  it.skip("[out of scope] handles lazy continuation of a paragraph in an item", () => {
    // Properly correct: one list, two items, the first contains a two-line
    // paragraph. Minimum viable produces: list(1) + paragraph + list(1).
    // See docs/superpowers/plans/2026-06-05-markdown-nested-blocks-in-list-items.md
    const input = [
      "- This is the first item with a paragraph",
      "that wraps onto a second line without indentation.",
      "- Second item.",
    ].join("\n");
    const res = listParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.items.length).toBe(2);
    }
  });

  it.skip("[out of scope] distinguishes loose lists by wrapping items in paragraph nodes", () => {
    // Loose vs tight lists not handled. See spec.
    const tight = "- one\n- two\n";
    const loose = "- one\n\n- two\n";
    const t = listParser(tight);
    const l = listParser(loose);
    expect(t.success && l.success).toBe(true);
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
      expect(res.result).toEqual({
        type: "heading",
        level: 1,
        content: [{ type: "inline-text", content: "Title" }],
      });
  });

  it("parses setext H2", () => {
    const res = setextHeadingParser("Title\n--");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({
        type: "heading",
        level: 2,
        content: [{ type: "inline-text", content: "Title" }],
      });
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

describe("paragraphParser soft-wrapping", () => {
  it("joins soft-wrapped lines into one paragraph with inline-soft-break", () => {
    const res = paragraphParser("one\ntwo\nthree");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result.content).toEqual([
        { type: "inline-text", content: "one" },
        { type: "inline-soft-break" },
        { type: "inline-text", content: "two" },
        { type: "inline-soft-break" },
        { type: "inline-text", content: "three" },
      ]);
  });

  it("terminates at a blank line, leaving the blank line in rest", () => {
    const res = paragraphParser("one\ntwo\n\nthree");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.content).toEqual([
        { type: "inline-text", content: "one" },
        { type: "inline-soft-break" },
        { type: "inline-text", content: "two" },
      ]);
      expect(res.rest).toBe("\n\nthree");
    }
  });

  it("does not insert a soft break before a hard break", () => {
    const res = paragraphParser("one  \ntwo");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result.content).toEqual([
        { type: "inline-text", content: "one" },
        { type: "inline-hard-break" },
        { type: "inline-text", content: "two" },
      ]);
  });

  it.each<[string, string]>([
    ["para\n# heading", "\n# heading"],
    ["para\n> quote", "\n> quote"],
    ["para\n- item", "\n- item"],
    ["para\n1. item", "\n1. item"],
    ["para\n```\ncode\n```", "\n```\ncode\n```"],
    ["para\n---", "\n---"],
    ["para\n| h | i |", "\n| h | i |"],
    ["para\n<div>", "\n<div>"],
  ])(
    "stops a soft-wrapped paragraph before a block opener (%j)",
    (input, expectedRest) => {
      const res = paragraphParser(input);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.result.content).toEqual([
          { type: "inline-text", content: "para" },
        ]);
        expect(res.rest).toBe(expectedRest);
      }
    }
  );
});
