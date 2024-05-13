import { and } from "@/lib/combinators";
import { char } from "@/lib/parsers";
import { describe, it, expect } from "vitest";
import { failure, success } from "../../lib/types";
import { compareSuccess, compareSuccessCaptures } from "../../vitest.globals";
import { digit, str, word } from "../../lib/parsers";
import { capture } from "../../lib/combinators";

describe("and parser", () => {
  const parser = and(char("a"), str("ab"));

  it("should return all the results if all succeed", () => {
    const result = parser("ab");
    compareSuccess(result, success(["a", "ab"], "ab"));
  });

  it("should return a failure if any fail", () => {
    const result = parser("a");
    expect(result).toEqual(failure("not all parsers succeeded", "a"));
  });
});
