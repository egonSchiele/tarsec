import { describe, test, expect } from "vitest";
import { sepBy } from "../../lib/combinators";
import { anyChar, char, letter, quote } from "../../lib/parsers";
import { failure, success } from "../../lib/types";

describe("sepBy", () => {
  test("sepBy parser - valid input", () => {
    const separator = anyChar;
    const parser = anyChar;
    const input = "a,b,c";
    const result = sepBy(separator, parser)(input);
    expect(result).toEqual(success(["a", "b", "c"], ""));
  });

  test("sepBy parser - valid input", () => {
    const separator = char(",");
    const parser = anyChar;
    const input = "a,b,c";
    const result = sepBy(separator, parser)(input);
    expect(result).toEqual(success(["a", "b", "c"], ""));
  });

  test("sepBy parser - partial match, found parser but not separator, still succeeds", () => {
    const separator = char(",");
    const parser = anyChar;
    const input = "ab,c";
    const result = sepBy(separator, parser)(input);
    expect(result).toEqual(success(["a"], "b,c"));
  });

  test("sepBy parser - partial match, doesn't consume full string, still succeeds", () => {
    const separator = char(",");
    const parser = letter;
    const input = "a,b!";
    const result = sepBy(separator, parser)(input);
    expect(result).toEqual(success(["a", "b"], "!"));
  });

  test("sepBy parser - invalid input, no match", () => {
    const separator = char(",");
    const parser = letter;
    const input = "1,2";
    const result = sepBy(separator, parser)(input);
    expect(result).toEqual(
      failure(
        'expected one of "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", got 1',
        "1,2"
      )
    );
  });
});
