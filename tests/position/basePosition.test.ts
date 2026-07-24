import { describe, it, expect, afterEach } from "vitest";
import {
  composePosition,
  getPosition,
  getOffset,
  withSpan,
} from "@/lib/position";
import { str } from "@/lib/parsers";
import { setInputStr } from "@/lib/trace";
import { createParseState, swapParseState } from "@/lib/parseState";
import type { ParseState } from "@/lib/parseState";

describe("composePosition", () => {
  const base = { offset: 100, line: 40, column: 6 };

  it("adds offset and line", () => {
    expect(composePosition(base, { offset: 12, line: 2, column: 3 })).toEqual({
      offset: 112,
      line: 42,
      column: 3, // not on the base line: column passes through
    });
  });

  it("adds column only on the inner first line (line 0)", () => {
    expect(composePosition(base, { offset: 4, line: 0, column: 4 })).toEqual({
      offset: 104,
      line: 40,
      column: 10,
    });
  });

  it("zero base is the identity", () => {
    const pos = { offset: 7, line: 1, column: 2 };
    expect(
      composePosition({ offset: 0, line: 0, column: 0 }, pos),
    ).toEqual(pos);
  });
});

describe("derived positions respect basePosition", () => {
  let saved: ParseState | null = null;
  afterEach(() => {
    if (saved) swapParseState(saved);
    saved = null;
  });

  function enterOffsetState(
    input: string,
    base: { offset: number; line: number; column: number },
  ) {
    saved = swapParseState(createParseState(input, base));
  }

  it("getOffset and getPosition report enclosing coordinates", () => {
    enterOffsetState("x + 1\ny", { offset: 200, line: 40, column: 6 });
    const afterX = str("x")("x + 1\ny");
    if (!afterX.success) throw new Error("setup parse failed");

    const offsetResult = getOffset(afterX.rest);
    if (!offsetResult.success) throw new Error("getOffset failed");
    expect(offsetResult.result).toBe(201); // 200 + 1

    const posResult = getPosition(afterX.rest);
    if (!posResult.success) throw new Error("getPosition failed");
    expect(posResult.result).toEqual({ offset: 201, line: 40, column: 7 });
  });

  it("withSpan spans compose, including past the first line", () => {
    enterOffsetState("ab\ncd", { offset: 200, line: 40, column: 6 });
    const spanned = withSpan(str("ab\ncd"))("ab\ncd");
    if (!spanned.success) throw new Error("withSpan failed");
    expect(spanned.result.span.start).toEqual({
      offset: 200,
      line: 40,
      column: 6, // inner line 0: column composes
    });
    expect(spanned.result.span.end).toEqual({
      offset: 205,
      line: 41,
      column: 2, // inner line 1: column passes through
    });
  });

  it("top-level parses (zero base) are unchanged", () => {
    setInputStr("ab");
    const posResult = getPosition("b");
    if (!posResult.success) throw new Error("getPosition failed");
    expect(posResult.result).toEqual({ offset: 1, line: 0, column: 1 });
  });
});
