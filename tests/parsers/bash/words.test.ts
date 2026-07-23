import { describe, expect, it } from "vitest";
import { bashWord, scanWord } from "@/lib/parsers/bash/words";
import { setInputStr } from "@/lib/trace";
import { BashWord } from "@/lib/parsers/bash/types";

function parseWordOk(input: string): { word: BashWord; rest: string } {
  setInputStr(input); // spans need the full source registered
  const result = bashWord(input);
  if (!result.success) throw new Error(result.message);
  return { word: result.result, rest: result.rest };
}

describe("scanWord", () => {
  it("scans plain words and stops at metacharacters", () => {
    expect(scanWord("foo bar")).toEqual(3);
    expect(scanWord("foo|bar")).toEqual(3);
    expect(scanWord("foo>out")).toEqual(3);
    expect(scanWord("a#b ")).toEqual(3); // '#' mid-word is literal
    expect(scanWord("")).toEqual(0);
    expect(scanWord("| x")).toEqual(0);
  });

  it("treats quoted segments as part of one word", () => {
    expect(scanWord('foo"bar baz"qux etc')).toEqual(15);
    expect(scanWord("'a b' c")).toEqual(5);
    expect(scanWord("a\\ b c")).toEqual(4); // escaped space
    expect(scanWord("a'b'c d")).toEqual(5); // single-quote fusion
    expect(scanWord('"a\\"b" c')).toEqual(6); // escaped quote inside double quotes
  });

  it("keeps dollar expansions as raw word text", () => {
    expect(scanWord("$VAR x")).toEqual(4);
    expect(scanWord("${x:-y} z")).toEqual(7);
  });

  it("balances nested command substitution", () => {
    expect(scanWord("$(echo $(date))x y")).toEqual(16);
    expect(scanWord('"$(echo ")")" z')).toEqual(13);
  });

  it("does not understand backticks (known limitation: they split at spaces)", () => {
    expect(scanWord("`date` x")).toEqual(6); // works by accident: no space inside
    expect(scanWord("`a b` x")).toEqual(2); // splits at the space
  });

  it("survives a trailing backslash", () => {
    expect(scanWord("a\\")).toEqual(2);
  });

  it("returns -1 on unterminated quotes", () => {
    expect(scanWord("'oops")).toEqual(-1);
    expect(scanWord('"oops')).toEqual(-1);
    expect(scanWord("$(oops")).toEqual(-1);
  });
});

describe("bashWord", () => {
  it("produces a word node with span excluding trailing whitespace", () => {
    const { word, rest } = parseWordOk("hello   world");
    expect(word.type).toEqual("word");
    expect(word.text).toEqual("hello");
    expect(word.span.start.offset).toEqual(0);
    expect(word.span.end.offset).toEqual(5);
    expect(rest).toEqual("world");
  });

  it("fails on unterminated quotes", () => {
    setInputStr("'oops");
    const result = bashWord("'oops");
    expect(result.success).toEqual(false);
    if (!result.success) expect(result.message).toContain("unterminated quote");
  });

  it("fails on empty input", () => {
    setInputStr("");
    expect(bashWord("").success).toEqual(false);
  });
});
