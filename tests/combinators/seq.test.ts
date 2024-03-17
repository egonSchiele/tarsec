import { seq, capture } from "@/lib/combinators";
import { char, str, space } from "@/lib/parsers";
import { describe, it, expect } from "vitest";
import { success } from "vitest.globals";

describe("seq parser - hello world", () => {
  it("multiple char parsers", () => {
    const parser = seq([char("h"), char("e"), char("l"), char("l"), char("o")]);
    const result = parser("hello world");
    expect(result).toEqual(
      success({
        match: ["h", "e", "l", "l", "o"],
        rest: " world",
        captures: {},
      })
    );
  });

  it("multiple str parsers", () => {
    const parser = seq([str("hello"), space, str("world")]);
    const result = parser("hello world");
    expect(result).toEqual(
      success({ match: ["hello", " ", "world"], rest: "", captures: {} })
    );
  });

  it("multiple str parsers + capture", () => {
    const parser = seq([str("hello"), space, capture(str("world"), "name")]);
    const result = parser("hello world");
    expect(result).toEqual(
      success({
        match: ["hello", " ", "world"],
        rest: "",
        captures: { name: "world" },
      })
    );
  });
});
