import { many1 } from "@/lib/combinators";
import { digit } from "@/lib/parsers";
import { describe, it, expect } from "vitest";
import { success, failure } from "vitest.globals";

describe("many1 combinator", () => {
  const parser = many1(digit);

  it("should parse multiple digits", () => {
    const result = parser("1234");
    expect(result).toEqual(success({ rest: "", match: ["1", "2", "3", "4"] }));
  });

  it("should fail if no matches found", () => {
    const result = parser("abc");
    expect(result).toEqual(
      failure({ rest: "abc", message: "expected at least one match" })
    );
  });
});
