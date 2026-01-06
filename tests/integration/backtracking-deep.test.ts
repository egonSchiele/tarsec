import { seq } from "@/lib/combinators";
import { space, str, eof } from "@/lib/parsers";
import { describe, expect, it, test } from "vitest";
import { success } from "../../lib/types";
import { getResults, optional, or } from "../../lib/combinators";

describe("backtracking - 1 level", () => {
  const parser = seq(
    [
      str("the robot"),
      space,
      str("ate"),
      space,
      or(str("the"), str("the cake")),
      space,
      or(str("cake"), str("cake cake")),
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

test("backtracking - see comment", () => {
  describe("backtracking - 2 levels", () => {
    const parser = seq(
      [
        str("the robot"),
        space,
        str("ate"),
        space,
        or(str("the"), str("the cake-")), // or#1
        space,
        or(str("cake"), str("cake cake")), // or#2
        str("!"),
        eof,
      ],
      getResults
    );

    it("parses with backtracking 2 levels", () => {
      const resultCake = parser("the robot ate the cake- cake!");

      /* we need to backtrack to OR #1 to parse `the cake-`.
    Before that, we will already have backtracked to OR #2.
    After backtracking to OR #1, we need to then start over on OR #2 to parse `cake`.

    This is a test to make sure we start over on OR #2 after backtracking to OR #1.
    
    */

      expect(resultCake).toEqual(
        success(
          ["the robot", " ", "ate", " ", "the cake-", " ", "cake", "!", null],
          ""
        )
      );
    });
  });
});
