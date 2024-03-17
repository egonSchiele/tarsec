/* import { describe, it, expect } from "vitest";
import { char, many, noneOf, quote, str } from "./parsers";
import { Subject } from "./subject";
import { success, failure } from "../vitest.setup.js";

describe(".parse examples", () => {
  it("multiple char parsers", () => {
    const s = new Subject("hello world");
    const result = s.parse([
      char("h"),
      char("e"),
      char("l"),
      char("l"),
      char("o"),
    ]);
    expect(result).toEqual(
      success({ match: "hello", rest: " world", matches: {} })
    );
  });

  it("multiple str parsers", () => {
    const s = new Subject("hello world");
    const result = s.parse([str("hello"), str(" "), str("world")]);
    expect(result).toEqual(
      success({ match: "hello world", rest: "", matches: {} })
    );
  });

  it("multiple str parsers + matchTo", () => {
    const s = new Subject("hello world");
    const result = s.parse([
      str("hello"),
      str(" "),
      [str("world"), { capture: "name" }],
    ]);
    expect(result).toEqual(
      success({ match: "hello world", rest: "", matches: { name: "world" } })
    );
  });

  it("words in quotes", () => {
    const s = new Subject('one "two" three');
    const result = s.parse([
      many(noneOf('"')),
      quote,
      [many(noneOf('"')), { capture: "word" }],
      quote,
    ]);
    expect(result).toEqual(
      success({
        match: 'one "two"',
        rest: " three",
        matches: { word: "two" },
      })
    );
  });
});
 */
