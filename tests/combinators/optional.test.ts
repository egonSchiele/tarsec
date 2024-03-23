import { describe, it, expect } from "vitest";
import { optional } from "../../lib/combinators";
import { char, str } from "../../lib/parsers";
import { failure, success } from "../../lib/types";

describe("optional", () => {
  const parser = optional(char("a"));

  it("should parse the character if it exists", () => {
    const result = parser("a");
    expect(result).toEqual(success("a", ""));
  });

  it("should return null if the character is missing", () => {
    const result = parser("b");
    expect(result).toEqual(success(null, "b"));
  });

  it("should not consume any input if it fails", () => {
    // @ts-ignore
    const parser2 = optional(str("hello"));
    const result1 = parser2("hella");
    expect(result1.success).toEqual(true);
    expect(result1.rest).toEqual("hella");
  });
});
