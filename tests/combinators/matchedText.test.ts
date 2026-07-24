import { describe, it, expect } from "vitest";
import { matchedText, seqR, many1 } from "@/lib/combinators";
import { str, digit, char } from "@/lib/parsers";
import { compareSuccess } from "../../vitest.globals";
import { success } from "../../lib/types";

describe("matchedText", () => {
  it("returns the exact consumed slice instead of the structured result", () => {
    const number = matchedText(many1(digit));
    compareSuccess(number("123abc"), success("123", "abc"));
  });

  it("preserves the raw text exactly — no normalization", () => {
    const quoted = matchedText(seqR(char('"'), str("a\\n"), char('"')));
    compareSuccess(quoted('"a\\n"rest'), success('"a\\n"', "rest"));
  });

  it("propagates failure untouched", () => {
    const number = matchedText(many1(digit));
    const result = number("abc");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.rest).toBe("abc");
    }
  });

  it("consuming nothing yields the empty string", () => {
    const nothing = matchedText(str(""));
    compareSuccess(nothing("abc"), success("", "abc"));
  });
});
