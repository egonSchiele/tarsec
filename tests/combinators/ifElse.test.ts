import { describe, expect, test } from "vitest";
import { ifElse } from "../../lib/combinators";
import { char, digit, str } from "../../lib/parsers";
import { Parser, ParserFailure, success } from "../../lib/types";

describe("ifElse", () => {
  test("ifElse function returns the result of the first parser if the condition is true", () => {
    const parser = ifElse(true, char("a"), str("ab"));
    const result = parser("abc");
    expect(result).toEqual(success("a", "bc"));
  });

  test("ifElse function returns the result of the second parser if the condition is false", () => {
    const parser = ifElse(false, char("a"), str("ab"));
    const result = parser("abc");
    expect(result).toEqual(success("ab", "c"));
  });
});
