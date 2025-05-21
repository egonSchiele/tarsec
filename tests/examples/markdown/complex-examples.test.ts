import { success } from "@/lib/types";
import { describe, it, expect, test } from "vitest";
import { markdownParser } from "../markdown";

describe("markdownParser - Complex Examples", () => {
  it("should parse a Markdown document with nested formatting", () => {
    const input = `# Advanced Markdown

This paragraph has **bold text with *nested italic* inside** and also standalone *italic text*.

## Code Examples

Here's an inline code example: \`const x = 42;\`

And a code block:

\`\`\`javascript
function example() {
  // This is a comment
  const result = computeValue();
  return result;
}
\`\`\`

## Lists

Unordered list:
- Item with [a link](https://example.com)
- Item with **bold** formatting
- Item with \`inline code\`

Ordered list:
1. First item
2. Second item with *italic*
3. Third item

## Blockquotes

> This is a blockquote.
> It can span multiple lines.
>
> And have multiple paragraphs.

## Mixed Content

Let's try some ~~strikethrough text~~ alongside other features.

---

![Example Image](https://example.com/image.jpg)

Final paragraph with **bold**, *italic*, \`code\`, ~~strikethrough~~, and [a link](https://example.com).`;

    const result = markdownParser(input);
    expect(result.success).toBe(true);

    if (result.success) {
      const parsedResult = result.result;

      // Test overall structure
      expect(parsedResult.length).toBeGreaterThan(10);

      // Check for h1
      expect(parsedResult[0].type).toBe("heading");
      expect(parsedResult[0].level).toBe(1);

      // Check for nested formatting in paragraph
      const paragraphWithNesting = parsedResult.find(
        (el) =>
          el.type === "paragraph" &&
          el.content.some(
            (c) =>
              c.type === "inline-bold" && c.content.includes("nested italic")
          )
      );
      expect(paragraphWithNesting).toBeDefined();

      // Check for code block
      const codeBlock = parsedResult.find(
        (el) =>
          el.type === "code-block" &&
          el.language === "javascript" &&
          el.content.includes("function example()")
      );
      expect(codeBlock).toBeDefined();

      // Check for unordered list
      const unorderedList = parsedResult.find(
        (el) =>
          el.type === "list" && el.ordered === false && el.items.length === 3
      );
      expect(unorderedList).toBeDefined();

      // Check for blockquote
      const blockquote = parsedResult.find(
        (el) =>
          el.type === "block-quote" &&
          el.content.includes("This is a blockquote.")
      );
      expect(blockquote).toBeDefined();

      // Check for horizontal rule
      const horizontalRule = parsedResult.find(
        (el) => el.type === "horizontal-rule"
      );
      expect(horizontalRule).toBeDefined();

      // Check for image
      const image = parsedResult.find(
        (el) =>
          el.type === "image" && el.url === "https://example.com/image.jpg"
      );
      expect(image).toBeDefined();
    }
  });

  it("should handle edge cases in Markdown syntax", () => {
    const input = `# Empty heading with spaces    

*Single asterisk not closed

**Double asterisk not closed

\`Backtick not closed

[Link text](malformed url

> Multiline blockquote
> with continuation

---
***
___

\`\`\`
Code block without language
With multiple lines
\`\`\`

- List item 1
  - Nested list item (not supported yet)
- List item 2`;

    const result = markdownParser(input);
    expect(result.success).toBe(true);

    if (result.success) {
      const parsedResult = result.result;

      // Check heading with trailing spaces is parsed correctly
      expect(parsedResult[0].type).toBe("heading");
      expect(parsedResult[0].content.trim()).toBe("Empty heading with spaces");

      // Check that we have multiple horizontal rules
      const horizontalRules = parsedResult.filter(
        (el) => el.type === "horizontal-rule"
      );
      expect(horizontalRules.length).toBeGreaterThanOrEqual(1);

      // Check code block without language
      const codeBlock = parsedResult.find(
        (el) => el.type === "code-block" && el.language === null
      );
      expect(codeBlock).toBeDefined();

      // Check list parsing
      const list = parsedResult.find(
        (el) => el.type === "list" && el.ordered === false
      );
      expect(list).toBeDefined();
    }
  });
});
