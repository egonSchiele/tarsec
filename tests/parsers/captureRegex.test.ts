import { captureRegex } from "@/lib/parsers";
import { Parser, success, failure } from "@/lib/types";
import { describe, expect, test } from "vitest";

describe("captureRegex", () => {
  test("captureRegex returns success when input matches regex pattern", () => {
    const input = "123abc";
    const pattern = /[0-9]+[a-z]/;
    const parser = captureRegex(pattern);

    const result = parser(input);

    expect(result).toEqual(success({}, "bc"));
  });

  test("captureRegex returns failure when input does not match regex pattern", () => {
    const input = "abc123";
    const pattern = /[0-9]+[a-z]+/;
    const parser = captureRegex(pattern);

    const result = parser(input);

    expect(result).toEqual(
      failure("expected /[0-9]+[a-z]+/, got abc123", "abc123")
    );
  });

  test("captureRegex returns success when input matches string pattern", () => {
    const input = "hello world";
    const pattern = "hello";
    const parser = captureRegex(pattern);

    const result = parser(input);

    expect(result).toEqual(success({}, " world"));
  });

  test("captureRegex returns failure when input does not match string pattern", () => {
    const input = "world hello";
    const pattern = "hello";
    const parser = captureRegex(pattern);

    const result = parser(input);

    expect(result).toEqual(
      failure("expected hello, got world hell", "world hello")
    );
  });

  test("a string with capture groups", () => {
    const input = "-world";
    const pattern = "-([^ ]+)";
    const parser = captureRegex(pattern, "", "word");

    const result = parser(input);

    expect(result).toEqual(success({ word: "world" }, ""));
  });

  test("multiple capture groups", () => {
    const re = new RegExp(/([a-z]+) ([0-9]+)/);

    const parser = captureRegex(re, "", "first", "second");
    const result = parser("hello 123");

    expect(result).toEqual(success({ first: "hello", second: "123" }, ""));
  });

  test("more capture groups than names", () => {
    const re = new RegExp(/([a-z]+) ([0-9]+) ([0-9]+) ([0-9]+)/);

    const parser = captureRegex(re, "", "first", "second");
    const result = parser("hello 123 456 789");

    expect(result).toEqual(
      failure(
        "more capture groups than names. 4 capture groups, 2 names",
        "hello 123 456 789"
      )
    );
  });

  test("more names than capture groups", () => {
    const re = new RegExp(/([a-z]+)/);

    const parser = captureRegex(re, "", "first", "second");
    const result = parser("hello");

    expect(result).toEqual(
      failure(
        "fewer capture groups than names. 1 capture groups, 2 names",
        "hello"
      )
    );
  });
});
