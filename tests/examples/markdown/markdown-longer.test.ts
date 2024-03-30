import { success } from "@/lib/types";
import { describe, it, expect } from "vitest";
import { markdownParser, headingParser } from "../markdown";

const input = `
## Install

\`\`\`
npm install tarsec
\`\`\`
`.trim();

describe("markdownParser", () => {
  it("should parse simple input", () => {
    const expected = [
      {
        type: "heading",
        content: "Install",
        level: 2,
      },
      {
        type: "code-block",
        content: "npm install tarsec\n",
        language: null,
      },
    ];
    expect(markdownParser(input)).toEqual(success(expected, ""));
  });
});
