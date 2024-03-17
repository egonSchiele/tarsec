import { many } from "@/lib/combinators";
import { digit } from "@/lib/parsers";
import { describe, it, expect } from "vitest";
import { success } from "vitest.globals";

describe("many combinator", () => {
  const parser = many(digit);

  it("should parse multiple digits", () => {
    const result = parser("1234");
    expect(result).toEqual(success({ rest: "", match: ["1", "2", "3", "4"] }));
  });

  it("should return an empty string if no matches found", () => {
    const result = parser("abc");
    expect(result).toEqual(success({ rest: "abc", match: [] }));
  });
});
