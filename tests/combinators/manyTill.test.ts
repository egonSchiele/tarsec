import { manyTill } from "@/lib/combinators";
import { char } from "@/lib/parsers";
import { failure, success } from "@/lib/types";
import { test, expect, describe } from "vitest";

const parser = manyTill(char("b"));

describe("manyTill combinator", () => {
  test("manyTill should consume input until the provided parser succeeds", () => {
    const result = parser("aabbcc");

    expect(result).toEqual(success("aa", "bbcc"));
  });

  test("manyTill should succeed if it consumes no input", () => {
    const result = parser("bbcc");

    expect(result).toEqual(success("", "bbcc"));
  });

  test("manyTill should pass if it consumes the entire input string without matching the given parser.", () => {
    const result = parser("aacc");

    expect(result).toEqual(success("aacc", ""));
  });
});
