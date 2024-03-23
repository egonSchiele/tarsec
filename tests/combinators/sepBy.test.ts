import { describe, test, expect } from "vitest";
import { sepBy } from "../../lib/combinators";
import { anyChar, quote } from "../../lib/parsers";
import { success } from "../../lib/types";

describe("sepBy", () => {
  test("sepBy parser - valid input", () => {
    const separator = anyChar;
    const parser = anyChar;
    const input = "a,b,c";
    const result = sepBy(separator, parser)(input);
    expect(result).toEqual(success(["a", "b", "c"], ""));
  });

  test.skip("sepBy parser - invalid input", () => {
    const separator = quote;
    const parser = anyChar;
    const input = '"a"bc';
    const result = sepBy(separator, parser)(input);
    expect(result).toEqual(success("a", "bc"));
  });
});
