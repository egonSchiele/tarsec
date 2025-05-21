import { success } from "@/lib/types";
import { describe, it, expect, test } from "vitest";
import { markdownParser } from "../markdown";

test.skip("markdownParser - Full Document", () => {
  it("should parse a complete Markdown document", () => {
    const input = `# Tarsec: TypeScript Parser Combinator Library

Tarsec is a lightweight, type-safe parser combinator library for TypeScript.

## Installation

\`\`\`bash
npm install tarsec
\`\`\`

## Basic Usage

Here's how to use Tarsec to create parsers:

\`\`\`typescript
import { str, many1, or, seq } from "tarsec";

// Parse a sequence of 'a' characters
const aParser = many1(str("a"));

// Parse 'hello' or 'world'
const helloOrWorld = or(str("hello"), str("world"));

// Parse a simple greeting
const greeting = seq(
  [str("hello"), str(" "), str("world")],
  (results) => results.join("")
);

// Use the parsers
console.log(aParser("aaa"));  // Success: ["a", "a", "a"]
console.log(helloOrWorld("hello"));  // Success: "hello"
console.log(greeting("hello world"));  // Success: "hello world"
\`\`\`

## Features

Tarsec provides:

- **Type safety**: TypeScript types flow through parsers to ensure type correctness
- **Composition**: Combine simple parsers to create complex ones
- **Performance**: Optimized for speed and memory efficiency
- **Error handling**: Detailed error reporting

## Examples

### Parsing a JSON-like structure

\`\`\`typescript
import { str, many, sepBy, seqC, capture } from "tarsec";

// Define a simple object parser
const keyValueParser = seqC(
  capture(many(str("a-zA-Z")), "key"),
  str(":"),
  capture(many(str("a-zA-Z0-9")), "value")
);

// Parse multiple key-value pairs
const objectParser = seqC(
  str("{"),
  capture(sepBy(str(","), keyValueParser), "pairs"),
  str("}")
);

// Use the parser
const result = objectParser("{name:John,age:30}");
console.log(result);
\`\`\`

## Documentation

For more information, check the [complete documentation](https://example.com/docs).

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

> "Parser combinators are a beautiful way to build parsers" - Functional Programmer

## License

MIT © Tarsec Team`;

    const result = markdownParser(input);
    expect(result.success).toBe(true);

    if (result.success) {
      const parsedResult = result.result;

      // Count the elements by type to verify structure
      const elementCounts = parsedResult.reduce((counts, element) => {
        counts[element.type] = (counts[element.type] || 0) + 1;
        return counts;
      }, {});

      // Check for expected counts (approximate)
      expect(elementCounts["heading"]).toBeGreaterThanOrEqual(3);
      expect(elementCounts["paragraph"]).toBeGreaterThanOrEqual(5);
      expect(elementCounts["code-block"]).toBeGreaterThanOrEqual(3);
      expect(elementCounts["block-quote"]).toBeGreaterThanOrEqual(1);
      expect(elementCounts["horizontal-rule"]).toBeGreaterThanOrEqual(1);

      // Verify h1 title
      expect(parsedResult[0].type).toBe("heading");
      expect(parsedResult[0].level).toBe(1);
      expect(parsedResult[0].content).toBe(
        "Tarsec: TypeScript Parser Combinator Library"
      );

      // Find the installation section
      const installSection = parsedResult.findIndex(
        (el) =>
          el.type === "heading" &&
          el.level === 2 &&
          el.content === "Installation"
      );
      expect(installSection).toBeGreaterThan(0);

      // Verify code block after installation heading
      expect(parsedResult[installSection + 1].type).toBe("code-block");
      expect(parsedResult[installSection + 1].language).toBe("bash");

      // Find and check the features section - should have a list
      const featuresIndex = parsedResult.findIndex(
        (el) =>
          el.type === "heading" && el.level === 2 && el.content === "Features"
      );
      expect(featuresIndex).toBeGreaterThan(0);

      // The contributing section should have a blockquote
      const contributingIndex = parsedResult.findIndex(
        (el) =>
          el.type === "heading" &&
          el.level === 2 &&
          el.content === "Contributing"
      );
      expect(contributingIndex).toBeGreaterThan(0);

      // After contributing there should be a blockquote
      const blockquoteIndex = parsedResult
        .slice(contributingIndex)
        .findIndex((el) => el.type === "block-quote");
      expect(blockquoteIndex).toBeGreaterThan(-1);
    }
  });
});
