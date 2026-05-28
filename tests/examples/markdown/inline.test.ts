import { describe, it, expect } from "vitest";
import { success } from "@/lib/types";
import { str } from "@/lib/parsers";
import {
  inlineMarkdownParser,
  inlineItalicParser,
  inlineTextParser,
  inlineEscapeParser,
  inlineItalicUnderscoreParser,
  inlineBoldUnderscoreParser,
  inlineSeqUntil,
  inlineLinkParser,
  imageParser,
  inlineCodeParser,
} from "./inline";

describe("inlineSeqUntil", () => {
  it("collects inline nodes up to (but not including) the stop", () => {
    const p = inlineSeqUntil(str("**"));
    const res = p("foo bar**");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.rest).toBe("**");
      expect(res.result).toEqual([
        { type: "inline-text", content: "foo bar" },
      ]);
    }
  });

  it("returns an empty array when the stop matches immediately", () => {
    const p = inlineSeqUntil(str("**"));
    const res = p("**rest");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result).toEqual([]);
      expect(res.rest).toBe("**rest");
    }
  });

  it("collects through to the end of input when the stop never matches", () => {
    const p = inlineSeqUntil(str("**"));
    const res = p("foo");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.rest).toBe("");
      expect(res.result).toEqual([
        { type: "inline-text", content: "foo" },
      ]);
    }
  });
});

describe("bold vs italic ordering", () => {
  it("parses ** as bold even when * could match first", () => {
    const res = inlineMarkdownParser("**hi**");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result).toEqual({
        type: "inline-bold",
        content: [{ type: "inline-text", content: "hi" }],
      });
    }
  });

  it("bold content carries nested inline nodes (italic, code)", () => {
    const res = inlineMarkdownParser("**a *b* `c`**");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result).toEqual({
        type: "inline-bold",
        content: [
          { type: "inline-text", content: "a " },
          {
            type: "inline-italic",
            content: [{ type: "inline-text", content: "b" }],
          },
          { type: "inline-text", content: " " },
          { type: "inline-code", content: "c" },
        ],
      });
    }
  });

  it("italic content carries nested inline nodes (code)", () => {
    const res = inlineMarkdownParser("*see `here`*");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result).toEqual({
        type: "inline-italic",
        content: [
          { type: "inline-text", content: "see " },
          { type: "inline-code", content: "here" },
        ],
      });
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
      expect(res.result).toEqual({
        type: "inline-italic",
        content: [{ type: "inline-text", content: "x" }],
      });
  });

  it("parses __x__ as bold", () => {
    const res = inlineBoldUnderscoreParser("__x__");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({
        type: "inline-bold",
        content: [{ type: "inline-text", content: "x" }],
      });
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

describe("reference-style links and images", () => {
  it("parses [text][id] as a deferred ref link", () => {
    const res = inlineMarkdownParser("[hi][x]");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({ type: "inline-ref-link", text: "hi", id: "x" });
  });

  it("parses [text][] as a deferred ref link using text as id", () => {
    const res = inlineMarkdownParser("[hi][]");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({ type: "inline-ref-link", text: "hi", id: "hi" });
  });

  it("parses [text] (shortcut) as a deferred ref link", () => {
    const res = inlineMarkdownParser("[hi]");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({ type: "inline-ref-link", text: "hi", id: "hi" });
  });

  it("still prefers inline link form [text](url) when ( follows", () => {
    const res = inlineMarkdownParser("[hi](u)");
    if (res.success) expect(res.result.type).toBe("inline-link");
  });

  it("parses ![alt][id] as a deferred ref image", () => {
    const res = inlineMarkdownParser("![alt][img1]");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({ type: "inline-ref-image", alt: "alt", id: "img1" });
  });

  it("parses ![alt] (shortcut) as a deferred ref image", () => {
    const res = inlineMarkdownParser("![alt]");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({ type: "inline-ref-image", alt: "alt", id: "alt" });
  });
});

describe("hard line breaks", () => {
  it("parses two-trailing-spaces + newline as hard break", () => {
    const res = inlineMarkdownParser("  \n");
    expect(res.success).toBe(true);
    if (res.success) expect(res.result).toEqual({ type: "inline-hard-break" });
  });

  it("parses backslash + newline as hard break", () => {
    const res = inlineMarkdownParser("\\\n");
    expect(res.success).toBe(true);
    if (res.success) expect(res.result).toEqual({ type: "inline-hard-break" });
  });

  it("inline text stops before the trailing-spaces hard break", () => {
    const res = inlineTextParser("abc  \n");
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.content).toBe("abc");
  });
});

describe("autolinks", () => {
  it("parses <https://example.com> as a URL autolink", () => {
    const res = inlineMarkdownParser("<https://example.com>");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({
        type: "inline-link",
        content: [{ type: "inline-text", content: "https://example.com" }],
        url: "https://example.com",
      });
  });

  it("parses <http://x.y> as a URL autolink", () => {
    const res = inlineMarkdownParser("<http://x.y>");
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.type).toBe("inline-link");
  });

  it("parses <a@b.com> as an email autolink with mailto:", () => {
    const res = inlineMarkdownParser("<a@b.com>");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({
        type: "inline-link",
        content: [{ type: "inline-text", content: "a@b.com" }],
        url: "mailto:a@b.com",
      });
  });

  it("does not consume <not a url> as an autolink", () => {
    const res = inlineMarkdownParser("<not a url>");
    // either fails as autolink and gets handled as literal '<', either way success
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.type).not.toBe("inline-link");
  });
});

describe("strikethrough", () => {
  it("parses ~~gone~~", () => {
    const res = inlineMarkdownParser("~~gone~~");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({
        type: "inline-strike",
        content: [{ type: "inline-text", content: "gone" }],
      });
  });

  it("strike content carries nested inline nodes", () => {
    const res = inlineMarkdownParser("~~**bold** gone~~");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result).toEqual({
        type: "inline-strike",
        content: [
          {
            type: "inline-bold",
            content: [{ type: "inline-text", content: "bold" }],
          },
          { type: "inline-text", content: " gone" },
        ],
      });
    }
  });

  it("inline-link content carries nested inline nodes", () => {
    const res = inlineMarkdownParser("[a **b** `c`](u)");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result).toEqual({
        type: "inline-link",
        url: "u",
        content: [
          { type: "inline-text", content: "a " },
          {
            type: "inline-bold",
            content: [{ type: "inline-text", content: "b" }],
          },
          { type: "inline-text", content: " " },
          { type: "inline-code", content: "c" },
        ],
      });
    }
  });

  it("falls back to literal ~ when not paired", () => {
    const res = inlineMarkdownParser("~lone");
    if (res.success) expect(res.result).toEqual({ type: "inline-text", content: "~" });
  });
});

describe("bold-italic combined", () => {
  it("parses ***x*** as bold-italic", () => {
    const res = inlineMarkdownParser("***hey***");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({
        type: "inline-bold-italic",
        content: [{ type: "inline-text", content: "hey" }],
      });
  });

  it("parses ___x___ as bold-italic", () => {
    const res = inlineMarkdownParser("___hey___");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({
        type: "inline-bold-italic",
        content: [{ type: "inline-text", content: "hey" }],
      });
  });

  it("does not greedily eat ***x*** as bold of '*x*'", () => {
    const res = inlineMarkdownParser("***hey***");
    if (res.success) expect(res.result.type).toBe("inline-bold-italic");
  });
});

describe("inlineCodeParser multi-backtick", () => {
  it("parses a single-backtick code span", () => {
    expect(inlineCodeParser("`foo`")).toEqual(
      success({ type: "inline-code", content: "foo" }, "")
    );
  });

  it("parses a double-backtick code span containing a single backtick", () => {
    expect(inlineCodeParser("``a`b``")).toEqual(
      success({ type: "inline-code", content: "a`b" }, "")
    );
  });

  it("strips one leading and trailing space when both sides have one", () => {
    const res = inlineCodeParser("`` foo ``");
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.content).toBe("foo");
  });

  it("does not strip when only one side has a space", () => {
    const res = inlineCodeParser("` foo`");
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.content).toBe(" foo");
  });

  it("preserves all-space content unchanged", () => {
    const res = inlineCodeParser("`   `");
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.content).toBe("   ");
  });

  it("fails on unmatched backtick runs", () => {
    expect(inlineCodeParser("``foo`").success).toBe(false);
  });
});

describe("inline-link titles", () => {
  it("parses an inline link with an empty destination", () => {
    const res = inlineLinkParser(`[a]()`);
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.url).toBe("");
  });

  it("preserves an explicitly empty title", () => {
    const res = inlineLinkParser(`[a](u "")`);
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.title).toBe("");
  });

  it("parses an inline link with a double-quoted title", () => {
    const res = inlineLinkParser(`[a](u "t")`);
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({
        type: "inline-link",
        content: [{ type: "inline-text", content: "a" }],
        url: "u",
        title: "t",
      });
  });

  it("parses an inline link with a single-quoted title", () => {
    const res = inlineLinkParser(`[a](u 't')`);
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.title).toBe("t");
  });

  it("still parses a link without a title", () => {
    const res = inlineLinkParser(`[a](u)`);
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.title).toBeUndefined();
  });
});

describe("image titles", () => {
  it("parses an image with an empty destination", () => {
    const res = imageParser(`![alt]()`);
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.url).toBe("");
  });

  it("preserves an explicitly empty title", () => {
    const res = imageParser(`![alt](u "")`);
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.title).toBe("");
  });

  it("parses an image with a double-quoted title", () => {
    const res = imageParser(`![alt](u "t")`);
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({
        type: "image",
        alt: "alt",
        url: "u",
        title: "t",
      });
  });

  it("parses an image with a single-quoted title", () => {
    const res = imageParser(`![alt](u 't')`);
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.title).toBe("t");
  });

  it("still parses an image without a title", () => {
    const res = imageParser(`![alt](u)`);
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.title).toBeUndefined();
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
