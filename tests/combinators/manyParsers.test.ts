import { manyParsers } from "@/lib/combinators";
import { char } from "@/lib/parsers";
import { describe, it, expect } from "vitest";
import { failure, success } from "../../lib/types";
import { compareSuccess, compareSuccessCaptures } from "../../vitest.globals";
import { digit, str, word } from "../../lib/parsers";
import { capture } from "../../lib/combinators";

describe("manyParsers parser", () => {
  const parser = manyParsers(char("a"), char("b"));

  it("should return all the results", () => {
    const result = parser("a");
    compareSuccess(
      result,
      success([success("a", ""), failure('expected "b", got "a"', "a")], "a")
    );
  });
});

describe("manyParsers with capture", () => {
  const parser = manyParsers(char("a"), capture(char("a"), "someChar"));

  it("should return all the results", () => {
    const result = parser("a");
    compareSuccess(
      result,
      success(
        [
          success("a", ""),
          { captures: { someChar: "a" }, rest: "", result: "a", success: true },
        ],
        "a"
      )
    );
  });
});
