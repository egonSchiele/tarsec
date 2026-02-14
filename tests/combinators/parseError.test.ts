import { capture, seqC, parseError } from "@/lib/combinators";
import { str, word, space } from "@/lib/parsers";
import { describe, it, expect } from "vitest";
import { setInputStr } from "../../lib/trace";
import { TarsecError } from "../../lib/tarsecError";

describe("parseError", () => {
  describe("when parsing succeeds", () => {
    it("should return a successful result with no captures", () => {
      const input = "hello";
      setInputStr(input);
      const parser = parseError("should not fail", str("hello"));
      const result = parser(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toEqual({});
        expect(result.rest).toBe("");
      }
    });

    it("should work with multiple parsers (seqC internally)", () => {
      const input = "hello world";
      setInputStr(input);
      const parser = parseError(
        "should not fail",
        str("hello"),
        space,
        str("world"),
      );
      const result = parser(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toEqual({});
        expect(result.rest).toBe("");
      }
    });

    it("should return captures when using capture parsers", () => {
      const input = "hello world";
      setInputStr(input);
      const parser = parseError(
        "should not fail",
        str("hello"),
        space,
        capture(word, "name"),
      );
      const result = parser(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toEqual({ name: "world" });
        expect(result.rest).toBe("");
      }
    });

    it("should leave remaining input unconsumed", () => {
      const input = "hello world";
      setInputStr(input);
      const parser = parseError("should not fail", str("hello"));
      const result = parser(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.rest).toBe(" world");
      }
    });
  });

  describe("when parsing fails", () => {
    it("should throw a TarsecError", () => {
      const input = "goodbye";
      setInputStr(input);
      const parser = parseError("expected hello", str("hello"));
      expect(() => parser(input)).toThrow(TarsecError);
    });

    it("should include the custom message in the error", () => {
      const input = "goodbye";
      setInputStr(input);
      const parser = parseError("expected hello", str("hello"));
      expect(() => parser(input)).toThrow("expected hello");
    });

    it("should include 'Near:' context in the error message", () => {
      const input = "goodbye";
      setInputStr(input);
      const parser = parseError("expected hello", str("hello"));
      expect(() => parser(input)).toThrow(/Near:/);
    });

    it("should throw when a later parser in the sequence fails", () => {
      const input = "hello goodbye";
      setInputStr(input);
      const parser = parseError(
        "expected 'world' after 'hello'",
        str("hello"),
        space,
        str("world"),
      );
      expect(() => parser(input)).toThrow("expected 'world' after 'hello'");
    });

    it("should work when used inside seqC", () => {
      const input = "import;";
      setInputStr(input);
      const parser = seqC(
        str("import"),
        parseError(
          "expected string after `import` keyword",
          space,
          capture(word, "moduleName"),
        ),
      );
      expect(() => parser(input)).toThrow(
        "expected string after `import` keyword",
      );
    });

    it("should handle empty remaining input", () => {
      const input = "hello";
      setInputStr(input);
      const parser = seqC(
        str("hello"),
        parseError("expected more input", space, str("world")),
      );
      expect(() => parser(input)).toThrow("expected more input");
    });
  });
});
