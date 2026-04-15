import { quotedString } from "@/lib/parsers";
import { describe, expect, it } from "vitest";
import { success, failure } from "../../lib/types";

describe("quotedString parser", () => {
  it("should parse a double-quoted string", () => {
    expect(quotedString('"hello" world')).toEqual(
      success('"hello"', " world")
    );
  });

  it("should parse a single-quoted string", () => {
    expect(quotedString("'hello' world")).toEqual(
      success("'hello'", " world")
    );
  });

  it("should parse a backtick-quoted string", () => {
    expect(quotedString("`hello` world")).toEqual(
      success("`hello`", " world")
    );
  });

  it("should handle escaped quotes", () => {
    expect(quotedString('"a string with \\"another\\""')).toEqual(
      success('"a string with \\"another\\""', "")
    );
  });

  it("should handle escaped quotes in single-quoted strings", () => {
    expect(quotedString("'it\\'s a test'")).toEqual(
      success("'it\\'s a test'", "")
    );
  });

  it("should handle escaped backslash before closing quote", () => {
    expect(quotedString('"path\\\\"rest')).toEqual(
      success('"path\\\\"', "rest")
    );
  });

  it("should handle escaped backslash followed by escaped quote", () => {
    expect(quotedString('"a\\\\\\"b"')).toEqual(
      success('"a\\\\\\"b"', "")
    );
  });

  it("should fail on unclosed quote", () => {
    expect(quotedString('"no closing')).toEqual(
      failure('expected closing "\\""', '"no closing')
    );
  });

  it("should fail on unclosed quote when all quotes are escaped", () => {
    expect(quotedString('"all \\"escaped\\"')).toEqual(
      failure('expected closing "\\""', '"all \\"escaped\\"')
    );
  });

  it("should fail on empty input", () => {
    expect(quotedString("")).toEqual(failure("unexpected end of input", ""));
  });

  it("should fail on non-quote character", () => {
    expect(quotedString("hello")).toEqual(
      failure('expected a quote, got "h"', "hello")
    );
  });
});
