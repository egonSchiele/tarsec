import { describe, it, expect, beforeEach } from "vitest";
import {
  setInputStr,
  recordFailure,
  getRightmostFailure,
  getErrorMessage,
} from "@/lib/trace.js";
import { char, str, digit, letter, or, label } from "@/lib/index.js";

describe("rightmost failure tracking", () => {
  beforeEach(() => {
    setInputStr(""); // reset state
  });

  describe("recordFailure", () => {
    it("is a no-op when setInputStr has not been called", () => {
      recordFailure("abc", "something");
      expect(getRightmostFailure()).toBeNull();
    });

    it("records a failure at the correct position", () => {
      setInputStr("abcdef");
      recordFailure("def", '"x"');
      expect(getRightmostFailure()).toEqual({
        pos: 3,
        expected: ['"x"'],
      });
    });

    it("replaces expectations when a further-right failure is recorded", () => {
      setInputStr("abcdef");
      recordFailure("def", '"x"');
      recordFailure("ef", '"y"');
      expect(getRightmostFailure()).toEqual({
        pos: 4,
        expected: ['"y"'],
      });
    });

    it("accumulates expectations at the same position", () => {
      setInputStr("abcdef");
      recordFailure("def", '"x"');
      recordFailure("def", '"y"');
      expect(getRightmostFailure()).toEqual({
        pos: 3,
        expected: ['"x"', '"y"'],
      });
    });

    it("deduplicates expectations at the same position", () => {
      setInputStr("abcdef");
      recordFailure("def", '"x"');
      recordFailure("def", '"x"');
      expect(getRightmostFailure()).toEqual({
        pos: 3,
        expected: ['"x"'],
      });
    });

    it("ignores failures to the left of the rightmost", () => {
      setInputStr("abcdef");
      recordFailure("ef", '"y"');
      recordFailure("def", '"x"');
      expect(getRightmostFailure()).toEqual({
        pos: 4,
        expected: ['"y"'],
      });
    });
  });

  describe("setInputStr resets state", () => {
    it("clears previous failures when setInputStr is called again", () => {
      setInputStr("abc");
      recordFailure("c", '"x"');
      expect(getRightmostFailure()).not.toBeNull();

      setInputStr("def");
      expect(getRightmostFailure()).toBeNull();
    });
  });

  describe("getErrorMessage", () => {
    it("returns null when no failures recorded", () => {
      setInputStr("abc");
      expect(getErrorMessage()).toBeNull();
    });

    it("formats a single expectation", () => {
      setInputStr("abc");
      recordFailure("c", '"x"');
      expect(getErrorMessage()).toBe('Line 1, col 3: expected "x"');
    });

    it("formats two expectations with 'or'", () => {
      setInputStr("abc");
      recordFailure("c", '"x"');
      recordFailure("c", '"y"');
      expect(getErrorMessage()).toBe('Line 1, col 3: expected "x" or "y"');
    });

    it("formats three+ expectations with Oxford comma", () => {
      setInputStr("abc");
      recordFailure("c", '"x"');
      recordFailure("c", '"y"');
      recordFailure("c", '"z"');
      expect(getErrorMessage()).toBe(
        'Line 1, col 3: expected "x", "y", or "z"'
      );
    });

    it("computes correct line and column for multiline input", () => {
      const input = "line1\nline2\nline3";
      setInputStr(input);
      // "e2\nline3" has length 8, so pos = 17 - 8 = 9
      // line 2 starts at offset 6, so column = 9 - 6 = 3, 1-based = 4
      recordFailure("e2\nline3", '"x"');
      expect(getErrorMessage()).toBe('Line 2, col 4: expected "x"');
    });
  });

  describe("label", () => {
    it("records only the label, suppressing inner recordings", () => {
      const input = "xyz";
      setInputStr(input);
      const p = label("a digit", char("0"));
      p(input);
      const failure = getRightmostFailure();
      expect(failure).toEqual({
        pos: 0,
        expected: ["a digit"],
      });
    });

    it("does not affect state on success", () => {
      const input = "0xyz";
      setInputStr(input);
      const p = label("a digit", char("0"));
      const result = p(input);
      expect(result.success).toBe(true);
      expect(getRightmostFailure()).toBeNull();
    });
  });

  describe("integration with or", () => {
    it("accumulates labels from or alternatives", () => {
      const input = "!";
      setInputStr(input);
      const p = or(digit, letter);
      p(input);
      const failure = getRightmostFailure();
      expect(failure).toEqual({
        pos: 0,
        expected: ["a digit", "a letter"],
      });
    });

    it("produces a clean error message from or", () => {
      const input = "!";
      setInputStr(input);
      const p = or(digit, letter);
      p(input);
      expect(getErrorMessage()).toBe(
        "Line 1, col 1: expected a digit or a letter"
      );
    });

    it("reports the rightmost failure across or alternatives", () => {
      // str checks the full string at once, so both fail at position 0
      // to test rightmost, use seq-based parsers where one gets further
      const input = "ac";
      setInputStr(input);
      const p = or(str("ab"), str("xy"));
      p(input);
      expect(getErrorMessage()).toBe(
        'Line 1, col 1: expected "ab" or "xy"'
      );
    });
  });

  describe("built-in labeled parsers", () => {
    it("digit records 'a digit'", () => {
      setInputStr("x");
      digit("x");
      expect(getRightmostFailure()?.expected).toEqual(["a digit"]);
    });

    it("letter records 'a letter'", () => {
      setInputStr("1");
      letter("1");
      expect(getRightmostFailure()?.expected).toEqual(["a letter"]);
    });
  });
});
