import { describe, it, expect } from "vitest";
import { many1TillOneOf } from "@/lib/combinators";
import { compareSuccess } from "../../vitest.globals";
import { success } from "../../lib/types";

describe("many1TillOneOf", () => {
  const untilQuoteOrSlash = many1TillOneOf(['"', "/"]);

  it("consumes up to the nearest stop string", () => {
    compareSuccess(untilQuoteOrSlash('abc"def'), success("abc", '"def'));
    compareSuccess(untilQuoteOrSlash("ab/cd"), success("ab", "/cd"));
  });

  it("consumes everything when no stop is present", () => {
    compareSuccess(untilQuoteOrSlash("abcdef"), success("abcdef", ""));
  });

  it("fails when a stop is at position 0 (zero consumption)", () => {
    const result = untilQuoteOrSlash('"abc');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.rest).toBe('"abc');
    }
  });

  it("fails on empty input", () => {
    expect(untilQuoteOrSlash("").success).toBe(false);
  });
});
