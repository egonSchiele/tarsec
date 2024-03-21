import { many1 } from "@/lib/combinators";
import { digit } from "@/lib/parsers";
import { describe, it, expect } from "vitest";
import { failure, success } from "../../lib/types";

describe("many1 combinator", () => {
  const parser = many1(digit);

  it("should parse multiple digits", () => {
    const result = parser("1234");
    expect(result).toEqual(success(["1", "2", "3", "4"], ""));
  });

  it("should fail if no matches found", () => {
    const result = parser("abc");
    expect(result).toEqual(failure("expected at least one match", "abc"));
  });
});
