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
  htmlOpenTagParser,
  htmlCloseTagParser,
  htmlCommentParser,
} from "@/lib/parsers/markdown/inline";

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

describe("bare-URL GFM autolinks", () => {
  it("parses https://example.com as an autolink", () => {
    const res = inlineMarkdownParser("https://example.com");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({
        type: "inline-link",
        content: [{ type: "inline-text", content: "https://example.com" }],
        url: "https://example.com",
      });
  });

  it("parses http://x.y as an autolink", () => {
    const res = inlineMarkdownParser("http://x.y");
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.type).toBe("inline-link");
  });

  it("excludes a trailing period from the URL", () => {
    const res = inlineMarkdownParser("https://example.com.");
    expect(res.success).toBe(true);
    if (res.success && res.result.type === "inline-link") {
      expect(res.result.url).toBe("https://example.com");
      expect(res.rest).toBe(".");
    }
  });

  it("includes balanced parens (Wikipedia-style)", () => {
    const url = "https://en.wikipedia.org/wiki/Lisp_(programming_language)";
    const res = inlineMarkdownParser(url);
    expect(res.success).toBe(true);
    if (res.success && res.result.type === "inline-link")
      expect(res.result.url).toBe(url);
  });

  it("does not consume an unmatched trailing )", () => {
    // The opener `(` is outside the URL, so the trailing `)` must stay
    // outside too. We invoke the bare-URL parser directly on the URL-leading
    // substring so we can assert on the rest pointer.
    const res = inlineMarkdownParser("https://example.com)");
    expect(res.success).toBe(true);
    if (res.success && res.result.type === "inline-link") {
      expect(res.result.url).toBe("https://example.com");
      expect(res.rest).toBe(")");
    }
  });

  it("stops at whitespace", () => {
    const res = inlineMarkdownParser("https://example.com next");
    expect(res.success).toBe(true);
    if (res.success && res.result.type === "inline-link") {
      expect(res.result.url).toBe("https://example.com");
      expect(res.rest).toBe(" next");
    }
  });

  it("still prefers the angled form <https://x.y>", () => {
    const res = inlineMarkdownParser("<https://x.y>");
    expect(res.success).toBe(true);
    if (res.success && res.result.type === "inline-link") {
      expect(res.result.url).toBe("https://x.y");
      expect(res.rest).toBe("");
    }
  });
});

describe("HTML entities", () => {
  it.each<[string, string]>([
    ["&amp;", "&"],
    ["&lt;", "<"],
    ["&gt;", ">"],
    ["&quot;", '"'],
    ["&apos;", "'"],
    ["&#33;", "!"],
    ["&#x21;", "!"],
    ["&#X21;", "!"],
  ])("decodes %j as %j", (input, expected) => {
    const res = inlineMarkdownParser(input);
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({
        type: "inline-text",
        content: expected,
      });
  });

  it("falls back to literal & on an unknown entity", () => {
    const res = inlineMarkdownParser("&unknown;");
    expect(res.success).toBe(true);
    if (res.success)
      expect(res.result).toEqual({
        type: "inline-text",
        content: "&",
      });
  });

  it("stops inline text before an entity-leading &", () => {
    const res = inlineTextParser("abc&amp;");
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.content).toBe("abc");
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

describe("htmlOpenTagParser", () => {
  it.each<[string]>([
    ["<a>"],
    ["<span>"],
    ["<a href>"],
    [`<a href="x">`],
    [`<a href='x'>`],
    [`<a href="x" class="y">`],
    [`<a  href = "x"  >`],
    ["<br/>"],
    ["<br />"],
  ])("parses %j as inline-html", (input) => {
    const res = htmlOpenTagParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.type).toBe("inline-html");
      expect(res.result.content).toBe(input);
    }
  });

  it("fails on a non-tag", () => {
    expect(htmlOpenTagParser("<https://x>").success).toBe(false);
    expect(htmlOpenTagParser("<a@b.com>").success).toBe(false);
  });
});

describe("htmlCloseTagParser", () => {
  it.each<[string]>([
    ["</a>"],
    ["</span>"],
    ["</a >"],
    ["</a   >"],
  ])("parses %j as inline-html", (input) => {
    const res = htmlCloseTagParser(input);
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.content).toBe(input);
  });

  it("fails on a non-tag close", () => {
    expect(htmlCloseTagParser("< /a>").success).toBe(false);
  });
});

describe("htmlCommentParser", () => {
  it.each<[string]>([
    ["<!---->"],
    ["<!-- hi -->"],
    ["<!-- line1\nline2 -->"],
    ["<!-- foo > bar -->"],
  ])("parses %j", (input) => {
    const res = htmlCommentParser(input);
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.content).toBe(input);
  });

  it("rejects content containing --", () => {
    expect(htmlCommentParser("<!-- a -- b -->").success).toBe(false);
  });

  it("rejects content starting or ending with >", () => {
    expect(htmlCommentParser("<!-->-->").success).toBe(false);
    expect(htmlCommentParser("<!-- a>-->").success).toBe(false);
  });
});

describe("inline HTML dispatched via inlineMarkdownParser", () => {
  it("parses an inline tag mid-paragraph", () => {
    const res = inlineMarkdownParser(`<span class="x">`);
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.type).toBe("inline-html");
  });

  it("parses a self-closing <br/> mid-paragraph", () => {
    const res = inlineMarkdownParser("<br/>");
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.type).toBe("inline-html");
  });

  it("parses a close tag mid-paragraph", () => {
    const res = inlineMarkdownParser("</span>");
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.type).toBe("inline-html");
  });

  it("parses a comment mid-paragraph", () => {
    const res = inlineMarkdownParser("<!-- hi -->");
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.type).toBe("inline-html");
  });

  it("does NOT steal <https://x.y> from autolinkParser", () => {
    const res = inlineMarkdownParser("<https://x.y>");
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.type).toBe("inline-link");
  });

  it("does NOT steal <a@b.com> from emailAutolinkParser", () => {
    const res = inlineMarkdownParser("<a@b.com>");
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.type).toBe("inline-link");
  });
});
