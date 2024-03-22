import { seq } from "@/lib/combinators";
import { space, str, eof } from "@/lib/parsers";
import { describe, expect, it } from "vitest";
import { success } from "../../lib/types";
import { getResults, optional, or } from "../../lib/combinators";

describe("backtracking - 1 level", () => {
  const parser = seq(
    [
      str("the robot"),
      space,
      str("ate"),
      space,
      or([str("the"), str("the cake")]),
      space,
      or([str("cake"), str("cake cake")]),
      str("!"),
      eof,
    ],
    getResults
  );
  it("parses with backtracking 1 level", () => {
    // we need to backtrack to parse `the cake`
    const resultCake = parser("the robot ate the cake cake!");
    expect(resultCake).toEqual(
      success(
        ["the robot", " ", "ate", " ", "the", " ", "cake cake", "!", null],
        ""
      )
    );
  });

  it("parses with backtracking 1 level - 2nd version", () => {
    // we need to backtrack to parse `the cake`
    const resultCake = parser("the robot ate the cake cake cake!");
    expect(resultCake).toEqual(
      success(
        ["the robot", " ", "ate", " ", "the cake", " ", "cake cake", "!", null],
        ""
      )
    );
  });
});
