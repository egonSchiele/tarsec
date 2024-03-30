import { manyTillOneOf } from "@/lib/combinators";
import { char } from "@/lib/parsers";
import { failure, success } from "@/lib/types";
import { test, expect, describe } from "vitest";

const parser = manyTillOneOf(["b"]);

describe("manyTillOneOf combinator", () => {
  test("manyTillOneOf should consume input until the provided parser succeeds", () => {
    const result = parser("aabbcc");

    expect(result).toEqual(success("aa", "bbcc"));
  });

  test("manyTillOneOf should succeed if it consumes no input", () => {
    const result = parser("bbcc");

    expect(result).toEqual(success("", "bbcc"));
  });

  test("manyTillOneOf should pass if it consumes the entire input string without matching the given parser.", () => {
    const result = parser("aacc");

    expect(result).toEqual(success("aacc", ""));
  });

  test("manyTillOneOf should support strings of > 1 character.", () => {
    const parser2 = manyTillOneOf(["bc"]);
    const result = parser2("aabbcc");

    expect(result).toEqual(success("aab", "bcc"));
  });

  test("manyTillOneOf should support multiple strings.", () => {
    const parser2 = manyTillOneOf(["one", "two"]);
    const result = parser2("helloonetwo");
    const result2 = parser2("hellotwoone");

    expect(result).toEqual(success("hello", "onetwo"));
    expect(result2).toEqual(success("hello", "twoone"));
  });

  test("manyTillOneOf can be case insensitive", () => {
    const parser2 = manyTillOneOf(["bc"], { insensitive: true });
    const result = parser2("AABBCC");

    expect(result).toEqual(success("AAB", "BCC"));
  });
});
