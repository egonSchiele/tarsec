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
        content: "Install",
        level: 2,
      },
      {
        content: "npm install tarsec\n",
        language: null,
      },
    ];
    expect(markdownParser(input)).toEqual(success(expected, ""));
  });
});
