import { many1 } from "@/lib/combinators";
import { digit } from "@/lib/parsers";
import { describe, it, expect } from "vitest";
import { failure, success } from "../../lib/types";
import { or, capture } from "../../lib/combinators";
import { word } from "../../lib/parsers";
import { compareSuccessCaptures } from "../../vitest.globals";

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

describe("many1 with captures", () => {
  const orParser = or(capture(digit, "num"), capture(word, "name"));
  const parser = many1(orParser);
  it("returns captures", () => {
    const result = parser("1abc2");
    const expectedCaptures = {
      captures: [{ num: "1" }, { name: "abc" }, { num: "2" }],
    };
    compareSuccessCaptures(result, expectedCaptures, "");
  });
});
