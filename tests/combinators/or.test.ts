import { or } from "@/lib/combinators";
import { char } from "@/lib/parsers";
import { describe, it, expect } from "vitest";
import { failure, success } from "../../lib/types";
import { compareSuccess, compareSuccessCaptures } from "../../vitest.globals";
import { digit, str, word } from "../../lib/parsers";
import { capture } from "../../lib/combinators";

describe("or parser", () => {
  const parser = or(char("a"), char("b"));

  it("should parse the first parser if it succeeds", () => {
    const result = parser("a");
    compareSuccess(result, success("a", ""));
  });

  it("should parse the second parser if the first one fails", () => {
    const result = parser("b");
    expect(result).toEqual(success("b", ""));
  });

  it("should fail if all parsers fail", () => {
    const result = parser("c");
    expect(result).toEqual(failure("all parsers failed", "c"));
  });

  it("returns a nextParser", () => {
    const parser = or(str("hello"), str("hello!"));
    const result = parser("hello");
    compareSuccess(result, success("hello", ""));
    if (result.success) {
      expect(result.nextParser).toBeDefined();
      const result2 = result.nextParser!("hello!");
      compareSuccess(result2, success("hello!", ""));
    }
  });
});

describe("or parser with captures", () => {
  const parser = or(capture(digit, "num"), capture(word, "name"));

  it("returns captures for the first parser", () => {
    const result = parser("123");
    compareSuccessCaptures(result, { num: "1" }, "23");
  });

  it("returns captures for the second parser", () => {
    const result = parser("hi");
    compareSuccessCaptures(result, { name: "hi" }, "");
  });

  it("returns a nextParser with captures", () => {
    const result = parser("123");
    compareSuccessCaptures(result, { num: "1" }, "23");
    if (result.success) {
      expect(result.nextParser).toBeDefined();
      const result2 = result.nextParser!("hi");
      compareSuccessCaptures(result2, { name: "hi" }, "");
    }
  });
});
