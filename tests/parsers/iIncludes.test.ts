import { iIncludes } from "@/lib/parsers";
import { describe, it, expect } from "vitest";
import { success, failure } from "../../lib/types";

describe("iIncludes parser", () => {
  const parser = iIncludes("xyz");

  it("should return true if the given input contains the substring", () => {
    const input = "alphabets: wxyz!";
    const result = parser(input);
    expect(result).toEqual(success("xyz", input));
  });

  it("should return false if the given input does not contain the substring", () => {
    const input = "hello!";
    const result = parser(input);
    expect(result).toEqual(
      failure('expected "hello!" to include "xyz" (case-insensitive)', input)
    );
  });
});

describe("case-insensitive iIncludes parser", () => {
  const parser = iIncludes("XYZ");

  it("should return true if the given input contains the substring", () => {
    const input = "alphabets: wxyz!";
    const result = parser(input);
    expect(result).toEqual(success("XYZ", input));
  });

  it("should return false if the given input does not contain the substring", () => {
    const input = "hello!";
    const result = parser(input);
    expect(result).toEqual(
      failure('expected "hello!" to include "XYZ" (case-insensitive)', input)
    );
  });
});
