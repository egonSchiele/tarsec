import { or } from "@/lib/combinators";
import { char } from "@/lib/parsers";
import { describe, it, expect } from "vitest";
import { failure, success } from "../../lib/types";
import { compareSuccess } from "../../vitest.globals";

describe("or parser", () => {
  const parser = or<string>([char("a"), char("b")]);

  it("should parse the first parser if it succeeds", () => {
    const result = parser("a");
    compareSuccess(result, success("a", ""));
  });

  it("should parse the second parser if the first one fails", () => {
    const result = parser("b");
    expect(result).toEqual(success("b", ""));
  });

  it("should fail if all parsers fail", () => {
    const result = parser("c");
    expect(result).toEqual(failure("all parsers failed", "c"));
  });
});
