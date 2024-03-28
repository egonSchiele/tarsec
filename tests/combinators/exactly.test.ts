import { describe, expect, test } from "vitest";
import { exactly } from "../../lib/combinators";
import { char, digit } from "../../lib/parsers";
import { Parser, ParserFailure, success } from "../../lib/types";

describe("exactly", () => {
  test("exactly function returns failure when the number of expected matches exceeds input", () => {
    const parser = exactly(3, char("a"));
    const result = parser("aa");
    expect(result.success).toBe(false);
    expect((result as ParserFailure).message).toBe("expected 3 matches, got 2");
  });
  test("exactly function returns success when the exact number of matches is present in the input", () => {
    const parser = exactly(3, char("a"));
    const result = parser("aaaab");
    expect(result).toEqual(success(["a", "a", "a"], "ab"));
  });
  test("exactly function works with a more complex parser", () => {
    const parser = exactly(2, digit);
    const result = parser("1234");
    expect(result).toEqual(success(["1", "2"], "34"));
  });
});
