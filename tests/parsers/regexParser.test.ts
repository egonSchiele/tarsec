import { regexParser } from "@/lib/parsers";
import { Parser, success, failure } from "@/lib/types";
import { describe, expect, test } from "vitest";

describe("regexParser", () => {
  test("regexParser returns success when input matches regex pattern", () => {
    const input = "123abc";
    const pattern = /[0-9]+[a-z]/;
    const parser: Parser<string> = regexParser(pattern);

    const result = parser(input);

    expect(result).toEqual(success("123a", "bc"));
  });

  test("regexParser returns failure when input does not match regex pattern", () => {
    const input = "abc123";
    const pattern = /[0-9]+[a-z]+/;
    const parser: Parser<string> = regexParser(pattern);

    const result = parser(input);

    expect(result).toEqual(
      failure("expected /[0-9]+[a-z]+/, got abc123", "abc123")
    );
  });

  test("regexParser returns success when input matches string pattern", () => {
    const input = "hello world";
    const pattern = "hello";
    const parser: Parser<string> = regexParser(pattern);

    const result = parser(input);

    expect(result).toEqual(success("hello", " world"));
  });

  test("regexParser returns failure when input does not match string pattern", () => {
    const input = "world hello";
    const pattern = "hello";
    const parser: Parser<string> = regexParser(pattern);

    const result = parser(input);

    expect(result).toEqual(
      failure("expected hello, got world hell", "world hello")
    );
  });
});
