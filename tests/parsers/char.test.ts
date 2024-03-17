import { char } from "@/lib/parsers.js";
import { describe, it, expect } from "vitest";
import { success, failure } from "vitest.globals";

describe("char parser", () => {
  it("should parse correct character", () => {
    const parser = char("a");
    console.log(success({ match: "a", rest: "bc" }));
    expect(parser("abc")).toEqual(success({ match: "a", rest: "bc" }));
  });

  it("should handle unexpected end of input", () => {
    const parser = char("a");
    expect(parser("")).toEqual(
      failure({
        rest: "",
        message: "unexpected end of input",
      })
    );
  });

  it("should handle incorrect character", () => {
    const parser = char("a");
    expect(parser("bcd")).toEqual(
      failure({
        rest: "bcd",
        message: "expected a, got b",
      })
    );
  });
});
