import { many1Till } from "@/lib/combinators";
import { char } from "@/lib/parsers";
import { failure, success } from "@/lib/types";
import { test, expect, describe } from "vitest";

const parser = many1Till(char("b"));

describe("many1Till combinator", () => {
  test("many1Till should consume input until the provided parser succeeds", () => {
    const result = parser("aabbcc");

    expect(result).toEqual(success("aa", "bbcc"));
  });

  test("many1Till should fail if it consumes no input", () => {
    const result = parser("bbcc");

    expect(result).toEqual(
      failure("expected to consume at least one character of input", "bbcc")
    );
  });

  test("many1Till should pass if it consumes the entire input string without matching the given parser.", () => {
    const result = parser("aacc");

    expect(result).toEqual(success("aacc", ""));
  });
});
