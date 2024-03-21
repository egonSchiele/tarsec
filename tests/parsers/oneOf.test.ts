import { oneOf } from "@/lib/parsers";
import { describe, it, expect } from "vitest";
import { success, failure } from "../../lib/types";

describe("oneOf parser", () => {
  const parser = oneOf("abc");

  it("should parse any one of the given characters", () => {
    const result = parser("b");
    expect(result).toEqual(success("b", ""));
  });

  it("should fail if none of the characters match", () => {
    const result = parser("d");
    expect(result).toEqual(failure('expected one of "abc", got d', "d"));
  });
});
