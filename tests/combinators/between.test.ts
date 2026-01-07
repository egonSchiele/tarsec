import { between, between1 } from "@/lib/combinators";
import { quote, anyChar, letter } from "@/lib/parsers";
import { success, failure } from "@/lib/types";
import { describe, expect, test } from "vitest";

describe("between combinator", () => {
  test("between combinator - valid input", () => {
    const open = quote;
    const close = quote;
    const parser = anyChar;
    const input = "'abc'";
    const result = between(open, close, parser)(input);
    expect(result).toEqual(success(["a", "b", "c"], ""));
  });

  test("between combinator - valid input, returns rest of string", () => {
    const open = quote;
    const close = quote;
    const parser = anyChar;
    const input = "'abc' def";
    const result = between(open, close, parser)(input);
    expect(result).toEqual(success(["a", "b", "c"], " def"));
  });

  test("between combinator - two different types of quotes should still satisfy the quote parser", () => {
    const open = quote;
    const close = quote;
    const parser = anyChar;
    const input = "'abc\"";
    const result = between(open, close, parser)(input);
    expect(result).toEqual(success(["a", "b", "c"], ""));
  });

  test("between combinator - succeeds with zero instances of parser", () => {
    const open = quote;
    const close = quote;
    const parser = anyChar;
    const input = "''";
    const result = between(open, close, parser)(input);
    expect(result).toEqual(success([], ""));
  });

  test("between combinator - invalid input, no closing quote, should not consume input", () => {
    const open = quote;
    const close = quote;
    const parser = anyChar;
    const input = '"abc';
    const result = between(open, close, parser)(input);
    expect(result).toEqual(failure("unexpected end of input", '"abc'));
  });

  test("between combinator - invalid input, parser fails before close parser is found", () => {
    const open = quote;
    const close = quote;
    const parser = letter;
    const input = '"abc1"';
    const result = between(open, close, parser)(input);
    expect(result).toEqual(
      failure(
        'expected one of "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", got 1',
        '"abc1"'
      )
    );
  });
});

describe("between1 combinator", () => {
  test("between1 combinator - valid input", () => {
    const open = quote;
    const close = quote;
    const parser = anyChar;
    const input = "'abc'";
    const result = between1(open, close, parser)(input);
    expect(result).toEqual(success(["a", "b", "c"], ""));
  });

  test("between1 combinator - valid input, returns rest of string", () => {
    const open = quote;
    const close = quote;
    const parser = anyChar;
    const input = "'abc' def";
    const result = between1(open, close, parser)(input);
    expect(result).toEqual(success(["a", "b", "c"], " def"));
  });

  test("between1 combinator - two different types of quotes should still satisfy the quote parser", () => {
    const open = quote;
    const close = quote;
    const parser = anyChar;
    const input = "'abc\"";
    const result = between1(open, close, parser)(input);
    expect(result).toEqual(success(["a", "b", "c"], ""));
  });

  test("between1 combinator - fails with zero instances of parser", () => {
    const open = quote;
    const close = quote;
    const parser = anyChar;
    const input = "''";
    const result = between1(open, close, parser)(input);
    expect(result).toEqual(failure("expected at least one match", "''"));
  });

  test("between1 combinator - invalid input, no closing quote, should not consume input", () => {
    const open = quote;
    const close = quote;
    const parser = anyChar;
    const input = '"abc';
    const result = between1(open, close, parser)(input);
    expect(result).toEqual(failure("unexpected end of input", '"abc'));
  });

  test("between1 combinator - invalid input, parser fails before close parser is found", () => {
    const open = quote;
    const close = quote;
    const parser = letter;
    const input = '"abc1"';
    const result = between1(open, close, parser)(input);
    expect(result).toEqual(
      failure(
        'expected one of "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", got 1',
        '"abc1"'
      )
    );
  });
});
