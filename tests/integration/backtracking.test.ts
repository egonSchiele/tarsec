import { seq } from "@/lib/combinators";
import { space, str } from "@/lib/parsers";
import { describe, expect, it } from "vitest";
import { success } from "../../lib/types";
import { getResults, optional, or } from "../../lib/combinators";

describe("backtracking", () => {
  it("parses", () => {
    const parser = seq(
      [
        str("the robot"),
        space,
        str("ate"),
        space,
        or([str("the"), str("the cake")]),
        optional(str(" pie")),
      ],
      getResults
    );
    // without needing to backtrack
    const resultPie = parser("the robot ate the pie");
    expect(resultPie).toEqual(
      success(["the robot", " ", "ate", " ", "the", " pie"], "")
    );

    // we need to backtrack to parse `the cake`
    const resultCake = parser("the robot ate the cake");
    expect(resultCake).toEqual(
      success(["the robot", " ", "ate", " ", "the cake"], "")
    );
  });
});
