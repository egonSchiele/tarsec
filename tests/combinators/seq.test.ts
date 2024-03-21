import { seq, capture } from "@/lib/combinators";
import { char, str, space } from "@/lib/parsers";
import { describe, it, expect } from "vitest";
import { getCaptures, getResults } from "../../lib/combinators";
import { success } from "../../lib/types";

describe("seq parser - hello world", () => {
  it("multiple char parsers", () => {
    const parser = seq(
      [char("h"), char("e"), char("l"), char("l"), char("o")],
      getResults
    );
    const result = parser("hello world");
    expect(result).toEqual(success(["h", "e", "l", "l", "o"], " world"));
  });

  it("multiple str parsers", () => {
    const parser = seq([str("hello"), space, str("world")], getResults);
    const result = parser("hello world");
    expect(result).toEqual(success(["hello", " ", "world"], ""));
  });

  it("multiple str parsers + capture", () => {
    const parser = seq(
      [str("hello"), space, capture(str("world"), "name")],
      getCaptures
    );
    const result = parser("hello world");
    expect(result).toEqual(success({ name: "world" }, ""));
  });
});
