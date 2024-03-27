import {
  capture,
  getResults,
  many,
  many1Till,
  manyTill,
  optional,
  or,
  seq,
  seqC,
} from "@/lib/combinators";
import { digit, space } from "@/lib/parsers";
import { describe, it, expect } from "vitest";
import { Parser, success } from "../../lib/types";

describe("many combinator", () => {
  const parser = many(digit);

  it("should parse multiple digits", () => {
    const result = parser("1234");
    expect(result).toEqual(success(["1", "2", "3", "4"], ""));
  });

  it("should return an empty string if no matches found", () => {
    const result = parser("abc");
    expect(result).toEqual(success([], "abc"));
  });

  it("should not loop infinitely on empty strings", () => {
    /* This should not loop infinitely, but it was. On an empty string,
    `manyTill` would succeed. So `many` thought the parser had succeeded,
    so would call it again */
    const infiniteParser = many(manyTill(space));
    const result = infiniteParser("");
    expect(result).toEqual(success([""], ""));
  });
});
