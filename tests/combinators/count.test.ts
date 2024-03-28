import { describe, expect, test } from "vitest";
import { count } from "../../lib/combinators";
import { char, digit } from "../../lib/parsers";
import { failure, Parser, ParserFailure, success } from "../../lib/types";

describe("count", () => {
  test("count counts the number of matches", () => {
    const parser = count(char("a"));
    const result = parser("aaaab");
    expect(result).toEqual(success(4, "b"));
  });

  test("count function fails on empty strings", () => {
    const parser = count(char("a"));
    const result = parser("");
    expect(result).toEqual(failure("expected at least one match", ""));
  });
  test("count function works with a more complex parser", () => {
    const parser = count(digit);
    const result = parser("1234");
    expect(result).toEqual(success(4, ""));
  });
});
