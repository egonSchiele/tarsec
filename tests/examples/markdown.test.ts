import { assert, describe, expect, it } from "vitest";
import {
  headingParser,
  codeBlockParser,
  blockQuoteParser,
  paragraphParser,
  imageParser,
  inlineBoldParser,
  inlineCodeParser,
  inlineItalicParser,
  inlineLinkParser,
  inlineTextParser,
  inlineMarkdownParser,
  inlineStrikethroughParser,
  horizontalRuleParser,
  listParser,
  unorderedListParser,
  orderedListParser,
  markdownParser,
} from "./markdown";
import { success } from "@/lib/types";
import { compareSuccess } from "vitest.globals";

describe("headingParser", () => {
  it("should parse heading level 1", () => {
    const input = "# Heading 1";
    const expected = {
      type: "heading",
      level: 1,
      content: "Heading 1",
    };
    expect(headingParser(input)).toEqual(success(expected, ""));
  });

  it("should parse heading level 2", () => {
    const input = "## Heading 2";
    const expected = {
      type: "heading",
      level: 2,
      content: "Heading 2",
    };
    expect(headingParser(input)).toEqual(success(expected, ""));
  });
});

describe("codeBlockParser", () => {
  it("should parse code block", () => {
    const input = "```javascript\nconst a = 10;\n```";
    const expected = {
      type: "code-block",
      language: "javascript",
      content: "const a = 10;\n",
    };
    expect(codeBlockParser(input)).toEqual(success(expected, ""));
  });

  it("should parse code block with no language", () => {
    const input = "```\nconst a = 10;\n```";
    const expected = {
      type: "code-block",
      language: null,
      content: "const a = 10;\n",
    };
    expect(codeBlockParser(input)).toEqual(success(expected, ""));
  });
});

describe("blockQuoteParser", () => {
  it("should parse block quote", () => {
    const input = "> Blockquote";
    const expected = {
      type: "block-quote",
      content: "Blockquote",
    };
    expect(blockQuoteParser(input)).toEqual(success(expected, ""));
  });
});

describe("listParser", () => {
  it("should parse unordered list item", () => {
    const input = "- Item 1";
    const expected = {
      type: "list",
      ordered: false,
      items: [
        {
          content: [
            {
              type: "inline-text",
              content: "Item 1",
            },
          ],
        },
      ],
    };
    expect(unorderedListParser(input)).toEqual(success(expected, ""));
  });

  it("should parse ordered list item", () => {
    const input = "1. Item 1";
    const expected = {
      type: "list",
      ordered: true,
      items: [
        {
          content: [
            {
              type: "inline-text",
              content: "Item 1",
            },
          ],
        },
      ],
    };
    expect(orderedListParser(input)).toEqual(success(expected, ""));
  });
});

describe("paragraphParser", () => {
  it("should parse paragraph", () => {
    const input = "This is a paragraph.";
    const expected = {
      type: "paragraph",
      content: [{ type: "inline-text", content: "This is a paragraph." }],
    };
    expect(paragraphParser(input)).toEqual(success(expected, ""));
  });

  it("should parse a paragraph with mixed content", () => {
    const input =
      "tarsec sits in the place between regular expressions and a full-blown parser generator like [nearley](https://nearley.js.org/) or [yacc](https://silcnitc.github.io/yacc.html).";
    const expected = {
      type: "paragraph",
      content: [
        {
          type: "inline-text",
          content:
            "tarsec sits in the place between regular expressions and a full-blown parser generator like ",
        },
        {
          type: "inline-link",
          content: "nearley",
          url: "https://nearley.js.org/",
        },
        {
          type: "inline-text",
          content: " or ",
        },
        {
          type: "inline-link",
          content: "yacc",
          url: "https://silcnitc.github.io/yacc.html",
        },
        {
          type: "inline-text",
          content: ".",
        },
      ],
    };
    expect(paragraphParser(input)).toEqual(success(expected, ""));
  });
});

describe("imageParser", () => {
  it("should parse image", () => {
    const input = "![Alt Text](https://example.com/image.jpg)";
    const expected = {
      type: "image",
      alt: "Alt Text",
      url: "https://example.com/image.jpg",
    };
    expect(imageParser(input)).toEqual(success(expected, ""));
  });
});

describe("inlineTextParser", () => {
  it("should parse inline text", () => {
    const input = "This is inline text.";
    const expected = {
      type: "inline-text",
      content: "This is inline text.",
    };
    expect(inlineTextParser(input)).toEqual(success(expected, ""));
  });
});

describe("inlineBoldParser", () => {
  it("should parse inline bold", () => {
    const input = "**This is bold text**";
    const expected = {
      type: "inline-bold",
      content: "This is bold text",
    };
    expect(inlineBoldParser(input)).toEqual(success(expected, ""));
  });
});

describe("inlineItalicParser", () => {
  it("should parse inline italic", () => {
    const input = "*This is italic text*";
    const expected = {
      type: "inline-italic",
      content: "This is italic text",
    };
    expect(inlineItalicParser(input)).toEqual(success(expected, ""));
  });
});

describe("inlineLinkParser", () => {
  it("should parse inline link", () => {
    const input = "[Link Text](https://example.com)";
    const expected = {
      type: "inline-link",
      content: "Link Text",
      url: "https://example.com",
    };
    expect(inlineLinkParser(input)).toEqual(success(expected, ""));
  });
});

describe("inlineCodeParser", () => {
  it("should parse inline code", () => {
    const input = "`console.log('Hello World')`";
    const expected = {
      type: "inline-code",
      content: "console.log('Hello World')",
    };
    expect(inlineCodeParser(input)).toEqual(success(expected, ""));
  });
});

describe("inlineMarkdownParser", () => {
  it("should parse inline text", () => {
    const input = "This is inline text.";
    const expected = success(
      {
        type: "inline-text",
        content: "This is inline text.",
      },
      ""
    );
    compareSuccess(inlineMarkdownParser(input), expected);
  });

  it("should parse inline bold", () => {
    const input = "**This is bold text**";
    const expected = success(
      {
        type: "inline-bold",
        content: "This is bold text",
      },
      ""
    );
    compareSuccess(inlineMarkdownParser(input), expected);
  });

  it("should parse inline italic", () => {
    const input = "*This is italic text*";
    const expected = success(
      {
        type: "inline-italic",
        content: "This is italic text",
      },
      ""
    );
    compareSuccess(inlineMarkdownParser(input), expected);
  });

  it("should parse inline link", () => {
    const input = "[Link Text](https://example.com)";
    const expected = success(
      {
        type: "inline-link",
        content: "Link Text",
        url: "https://example.com",
      },
      ""
    );
    compareSuccess(inlineMarkdownParser(input), expected);
  });

  it("should parse inline code", () => {
    const input = "`console.log('Hello World')`";
    const expected = success(
      {
        type: "inline-code",
        content: "console.log('Hello World')",
      },
      ""
    );
    compareSuccess(inlineMarkdownParser(input), expected);
  });
});
/* describe("inlineMarkdownParser", () => {
  it("should parse inline markdown", () => {
    const input =
      "This is **bold** and *italic* text with a [link](https://example.com) and some `code`";
    const expected = {
      type: "inline-text",
      content: "This is ",
      children: [
        {
          type: "inline-bold",
          content: "bold",
        },
        {
          type: "inline-text",
          content: " and ",
          children: [
            {
              type: "inline-italic",
              content: "italic",
            },
            {
              type: "inline-text",
              content: " text with a ",
              children: [
                {
                  type: "inline-link",
                  content: "link",
                  url: "https://example.com",
                },
                {
                  type: "inline-text",
                  content: " and some ",
                  children: [
                    {
                      type: "inline-code",
                      content: "code",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(inlineMarkdownParser(input)).toEqual(success(expected, ""));
  });
});
 */
