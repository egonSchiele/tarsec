import { char } from "@/lib/parsers.js";
import { describe, it, expect } from "vitest";
import { success, failure } from "../../lib/types";

describe("char parser", () => {
  it("should parse correct character", () => {
    const parser = char("a");
    expect(parser("abc")).toEqual(success("a", "bc"));
  });

  it("should handle unexpected end of input", () => {
    const parser = char("a");
    expect(parser("")).toEqual(failure("unexpected end of input", ""));
  });

  it("should handle incorrect character", () => {
    const parser = char("a");
    expect(parser("bcd")).toEqual(failure('expected "a", got "b"', "bcd"));
  });
});
