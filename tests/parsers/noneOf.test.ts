import { noneOf } from "@/lib/parsers";
import { describe, it, expect } from "vitest";
import { success, failure } from "vitest.globals";

describe("noneOf parser", () => {
  const parser = noneOf("xyz");

  it("should parse any character that is not one of the given characters", () => {
    const result = parser("a");
    expect(result).toEqual(success({ rest: "", match: "a" }));
  });

  it("should fail if any of the given characters match", () => {
    const result = parser("x");
    expect(result).toEqual(
      failure({ rest: "x", message: "expected none of xyz" })
    );
  });
});
