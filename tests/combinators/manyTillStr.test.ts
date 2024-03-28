import { iManyTillStr, manyTillStr } from "@/lib/combinators";
import { char } from "@/lib/parsers";
import { failure, success } from "@/lib/types";
import { test, expect, describe } from "vitest";

const parser = manyTillStr("b");

describe("manyTillStr combinator", () => {
  test("manyTillStr should consume input until the provided parser succeeds", () => {
    const result = parser("aabbcc");

    expect(result).toEqual(success("aa", "bbcc"));
  });

  test("manyTillStr should succeed if it consumes no input", () => {
    const result = parser("bbcc");

    expect(result).toEqual(success("", "bbcc"));
  });

  test("manyTillStr should pass if it consumes the entire input string without matching the given parser.", () => {
    const result = parser("aacc");

    expect(result).toEqual(success("aacc", ""));
  });

  test("manyTillStr should support strings of > 1 character.", () => {
    const parser2 = manyTillStr("bc");
    const result = parser2("aabbcc");

    expect(result).toEqual(success("aab", "bcc"));
  });

  test("manyTillStr can be case insensitive", () => {
    const parser2 = manyTillStr("bc", { caseInsensitive: true });
    const result = parser2("AABBCC");

    expect(result).toEqual(success("AAB", "BCC"));
  });

  test("iManyTillStr is case insensitive", () => {
    const parser2 = iManyTillStr("bc");
    const result = parser2("AABBCC");

    expect(result).toEqual(success("AAB", "BCC"));
  });
});
