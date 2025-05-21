import { success } from "@/lib/types";
import { describe, it, expect, test } from "vitest";
import {
  markdownParser,
  inlineStrikethroughParser,
  horizontalRuleParser,
  unorderedListParser,
  orderedListParser,
  listParser,
} from "../markdown";

describe("inlineStrikethroughParser", () => {
  it("should parse strikethrough text", () => {
    const input = "~~Strikethrough text~~";
    const expected = {
      type: "inline-strikethrough",
      content: "Strikethrough text",
    };
    expect(inlineStrikethroughParser(input)).toEqual(success(expected, ""));
  });
});

describe("horizontalRuleParser", () => {
  it("should parse horizontal rule with dashes", () => {
    const input = "---";
    const expected = {
      type: "horizontal-rule",
    };
    expect(horizontalRuleParser(input)).toEqual(success(expected, ""));
  });

  it("should parse horizontal rule with asterisks", () => {
    const input = "***";
    const expected = {
      type: "horizontal-rule",
    };
    expect(horizontalRuleParser(input)).toEqual(success(expected, ""));
  });

  it("should parse horizontal rule with underscores", () => {
    const input = "___";
    const expected = {
      type: "horizontal-rule",
    };
    expect(horizontalRuleParser(input)).toEqual(success(expected, ""));
  });
});

describe("unorderedListParser", () => {
  it("should parse unordered list with dash", () => {
    const input = "- List item 1\n- List item 2";
    const expected = {
      type: "list",
      ordered: false,
      items: [
        {
          content: [
            {
              type: "inline-text",
              content: "List item 1",
            },
          ],
        },
        {
          content: [
            {
              type: "inline-text",
              content: "List item 2",
            },
          ],
        },
      ],
    };
    expect(unorderedListParser(input)).toEqual(success(expected, ""));
  });

  it("should parse unordered list with asterisk", () => {
    const input = "* List item 1\n* List item 2";
    const expected = {
      type: "list",
      ordered: false,
      items: [
        {
          content: [
            {
              type: "inline-text",
              content: "List item 1",
            },
          ],
        },
        {
          content: [
            {
              type: "inline-text",
              content: "List item 2",
            },
          ],
        },
      ],
    };
    expect(unorderedListParser(input)).toEqual(success(expected, ""));
  });

  it("should parse unordered list with formatted text", () => {
    const input = "- Item with **bold** text\n- Item with *italic* text";
    const expected = {
      type: "list",
      ordered: false,
      items: [
        {
          content: [
            {
              type: "inline-text",
              content: "Item with ",
            },
            {
              type: "inline-bold",
              content: "bold",
            },
            {
              type: "inline-text",
              content: " text",
            },
          ],
        },
        {
          content: [
            {
              type: "inline-text",
              content: "Item with ",
            },
            {
              type: "inline-italic",
              content: "italic",
            },
            {
              type: "inline-text",
              content: " text",
            },
          ],
        },
      ],
    };
    expect(unorderedListParser(input)).toEqual(success(expected, ""));
  });
});

describe("orderedListParser", () => {
  it("should parse ordered list with numbers", () => {
    const input = "1. List item 1\n2. List item 2";
    const expected = {
      type: "list",
      ordered: true,
      items: [
        {
          content: [
            {
              type: "inline-text",
              content: "List item 1",
            },
          ],
        },
        {
          content: [
            {
              type: "inline-text",
              content: "List item 2",
            },
          ],
        },
      ],
    };
    expect(orderedListParser(input)).toEqual(success(expected, ""));
  });
});

describe("markdownParser - Complete", () => {
  it("should parse markdown with multiple elements", () => {
    const input = `# Tarsec
    
A TypeScript parser combinator library.

## Features

- Easy to use
- Type-safe
- Customizable

---

Code example:

\`\`\`typescript
import { str, many1 } from "tarsec";
const parser = many1(str("a"));
\`\`\`

> Built with TypeScript

Check out the [GitHub repository](https://github.com/example/tarsec) for more information.`;

    const result = markdownParser(input);
    expect(result.success).toBe(true);

    // Verify some specific elements
    if (result.success) {
      const parsedResult = result.result;

      // Check first element is heading
      expect(parsedResult[0].type).toBe("heading");
      expect(parsedResult[0].level).toBe(1);
      expect(parsedResult[0].content).toBe("Tarsec");

      // Check for the paragraph
      const paragraphIndex = parsedResult.findIndex(
        (el) =>
          el.type === "paragraph" &&
          el.content[0].type === "inline-text" &&
          el.content[0].content === "A TypeScript parser combinator library."
      );
      expect(paragraphIndex).toBeGreaterThan(-1);

      // Check for the unordered list
      const listIndex = parsedResult.findIndex(
        (el) => el.type === "list" && el.ordered === false
      );
      expect(listIndex).toBeGreaterThan(-1);

      // Check for horizontal rule
      const hrIndex = parsedResult.findIndex(
        (el) => el.type === "horizontal-rule"
      );
      expect(hrIndex).toBeGreaterThan(-1);

      // Check for code block
      const codeBlockIndex = parsedResult.findIndex(
        (el) => el.type === "code-block" && el.language === "typescript"
      );
      expect(codeBlockIndex).toBeGreaterThan(-1);

      // Check for blockquote
      const blockQuoteIndex = parsedResult.findIndex(
        (el) => el.type === "block-quote"
      );
      expect(blockQuoteIndex).toBeGreaterThan(-1);

      // Check that there's a paragraph with a link
      const linkParagraphIndex = parsedResult.findIndex(
        (el) =>
          el.type === "paragraph" &&
          el.content.some((c) => c.type === "inline-link")
      );
      expect(linkParagraphIndex).toBeGreaterThan(-1);
    }
  });
});
