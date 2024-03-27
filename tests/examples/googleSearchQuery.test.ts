import { describe, expect, it } from "vitest";
import { googleSearchQueryParser } from "./googleSearchQuery";
import { success } from "@/lib/types";

describe("google search query", () => {
  it("parses a simple query", () => {
    const input = 'hello -world site:example.com "exact match"';
    const parsed = googleSearchQueryParser(input);
    const expected = [
      {
        term: [
          {
            tag: "word",
            word: "hello",
          },
        ],
      },
      {
        term: [
          {
            phrase: "world",
            tag: "negation",
          },
        ],
      },
      {
        term: [
          {
            tag: "site",
            url: "example.com",
          },
        ],
      },
      {
        term: [
          {
            phrase: "exact match",
            tag: "exactMatch",
          },
        ],
      },
    ];

    expect(parsed).toEqual(success(expected, ""));
  });
});
