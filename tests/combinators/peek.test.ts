import { describe, it, expect } from "vitest";
import {
  capture,
  getResults,
  not,
  or,
  peek,
  seq,
  seqR,
} from "../../lib/combinators";
import { char, digit, str, word } from "../../lib/parsers";
import { compareSuccessCaptures } from "../../vitest.globals";

describe("peek", () => {
  it("returns the result but does not consume input on success", () => {
    const result = peek(str("hi"))("hi!");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toBe("hi");
      expect(result.rest).toBe("hi!");
    }
  });

  it("fails without consuming input when the inner parser fails", () => {
    const result = peek(str("hi"))("bye");
    expect(result.success).toBe(false);
    expect(result.rest).toBe("bye");
  });

  it("disambiguates alternatives inside `or` without backtracking", () => {
    const parser = or(
      seqR(peek(str("hello!")), str("hello!")),
      str("hello"),
    );

    const exclaim = parser("hello!");
    expect(exclaim.success).toBe(true);
    if (exclaim.success) {
      expect(exclaim.rest).toBe("");
    }

    const plain = parser("hello");
    expect(plain.success).toBe(true);
    if (plain.success) {
      expect(plain.result).toBe("hello");
      expect(plain.rest).toBe("");
    }
  });

  it("preserves captures from the inner parser", () => {
    const result = peek(capture(word, "name"))("adit rest");
    compareSuccessCaptures(result, { name: "adit" }, "adit rest");
  });

  it("fails on empty input when the inner parser requires content", () => {
    const result = peek(char("a"))("");
    expect(result.success).toBe(false);
    expect(result.rest).toBe("");
  });

  it("leaves input available for the next parser in a seq", () => {
    const parser = seq([peek(str("hi")), str("hi")], getResults);
    const result = parser("hi!");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toEqual(["hi", "hi"]);
      expect(result.rest).toBe("!");
    }
  });

  it("nested peek still consumes nothing", () => {
    const result = peek(peek(str("hi")))("hi!");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toBe("hi");
      expect(result.rest).toBe("hi!");
    }
  });

  it("does not consume even when the inner parser would consume all input", () => {
    const result = peek(word)("everything");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toBe("everything");
      expect(result.rest).toBe("everything");
    }
  });

  it("composes with `not` as a guard against an alternative", () => {
    // match a digit only when not followed by another digit (i.e., a single digit at the end)
    const parser = seq([digit, not(peek(digit))], getResults);
    const single = parser("5");
    expect(single.success).toBe(true);
    if (single.success) expect(single.rest).toBe("");

    const followed = parser("55");
    expect(followed.success).toBe(false);
    expect(followed.rest).toBe("55");
  });

  it("a seq containing a failing peek does not consume input", () => {
    const parser = seq([str("hello"), peek(str("!"))], getResults);
    const result = parser("hello?");
    expect(result.success).toBe(false);
    expect(result.rest).toBe("hello?");
  });
});
