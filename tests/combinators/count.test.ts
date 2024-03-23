import { describe, expect, test } from "vitest";
import { count } from "../../lib/combinators";
import { char, digit } from "../../lib/parsers";
import { Parser, ParserFailure, success } from "../../lib/types";

describe("count", () => {
  test("count function returns failure when the number of expected matches exceeds input", () => {
    const parser = count(3, char("a"));
    const result = parser("aa");
    expect(result.success).toBe(false);
    expect((result as ParserFailure).message).toBe("expected 3 matches, got 2");
  });
  test("count function returns success when the exact number of matches is present in the input", () => {
    const parser = count(3, char("a"));
    const result = parser("aaaab");
    expect(result).toEqual(success(["a", "a", "a"], "ab"));
  });
  test("count function works with a more complex parser", () => {
    const parser = count(2, digit);
    const result = parser("1234");
    expect(result).toEqual(success(["1", "2"], "34"));
  });
});
