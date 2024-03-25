import { seq, capture } from "@/lib/combinators";
import { char, str, space } from "@/lib/parsers";
import { describe, it, expect } from "vitest";
import { getCaptures, getResults } from "../../lib/combinators";
import { failure, success } from "../../lib/types";
import { word } from "../../lib/parsers";
import { seqC, seqR } from "../../lib/combinators/seq";

describe("seq parser", () => {
  const parser = seq([char("a"), char("b")], getResults);

  it("should parse both characters in sequence", () => {
    const result = parser("ab");
    expect(result).toEqual(success(["a", "b"], ""));
  });

  it("should fail if any of the parsers fail", () => {
    const result = parser("ac");
    // TODO should it consume input?
    expect(result).toEqual(failure('expected "b", got "c"', "ac"));
  });
});

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

describe("seqR and seqC", () => {
  it("seqR", () => {
    const parser = seqR(str("hello"), space, str("world"));
    const result = parser("hello world");
    expect(result).toEqual(success(["hello", " ", "world"], ""));
  });

  it("seqC", () => {
    const parser = seqC(str("hello"), space, capture(word, "name"));
    const result = parser("hello world");
    expect(result).toEqual(success({ name: "world" }, ""));
  });
});
