import { describe, it, expect, beforeEach } from "vitest";
import { setInputStr } from "@/lib/trace";
import { str, word } from "@/lib/parsers";
import { seqR } from "@/lib/combinators";
import {
  getOffset,
  getPosition,
  withSpan,
  buildLineTable,
  offsetToPosition,
} from "@/lib/position";

describe("buildLineTable", () => {
  it("should return [0] for a single line", () => {
    expect(buildLineTable("hello")).toEqual([0]);
  });

  it("should return line start offsets for multi-line input", () => {
    expect(buildLineTable("ab\ncd\nef")).toEqual([0, 3, 6]);
  });

  it("should handle empty string", () => {
    expect(buildLineTable("")).toEqual([0]);
  });

  it("should handle trailing newline", () => {
    expect(buildLineTable("ab\n")).toEqual([0, 3]);
  });
});

describe("offsetToPosition", () => {
  it("should return line 0 col 0 for offset 0", () => {
    const table = buildLineTable("hello\nworld");
    expect(offsetToPosition(table, 0)).toEqual({
      offset: 0,
      line: 0,
      column: 0,
    });
  });

  it("should compute position within first line", () => {
    const table = buildLineTable("hello\nworld");
    expect(offsetToPosition(table, 3)).toEqual({
      offset: 3,
      line: 0,
      column: 3,
    });
  });

  it("should compute position on second line", () => {
    const table = buildLineTable("hello\nworld");
    // offset 6 is 'w' on line 1
    expect(offsetToPosition(table, 6)).toEqual({
      offset: 6,
      line: 1,
      column: 0,
    });
  });

  it("should compute position mid-second line", () => {
    const table = buildLineTable("hello\nworld");
    // offset 8 is 'r' on line 1
    expect(offsetToPosition(table, 8)).toEqual({
      offset: 8,
      line: 1,
      column: 2,
    });
  });
});

describe("getOffset", () => {
  beforeEach(() => {
    setInputStr("hello world");
  });

  it("should return 0 at start of input", () => {
    const result = getOffset("hello world");
    expect(result).toEqual({
      success: true,
      result: 0,
      rest: "hello world",
    });
  });

  it("should return correct offset mid-input", () => {
    const result = getOffset(" world");
    expect(result).toEqual({
      success: true,
      result: 5,
      rest: " world",
    });
  });

  it("should return full length at end of input", () => {
    const result = getOffset("");
    expect(result).toEqual({
      success: true,
      result: 11,
      rest: "",
    });
  });
});

describe("getPosition", () => {
  it("should return line 0 col 0 at start", () => {
    setInputStr("hello\nworld");
    const result = getPosition("hello\nworld");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toEqual({ offset: 0, line: 0, column: 0 });
    }
  });

  it("should return correct position on second line", () => {
    setInputStr("hello\nworld");
    const result = getPosition("world");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toEqual({ offset: 6, line: 1, column: 0 });
    }
  });

  it("should return correct position mid-second line", () => {
    setInputStr("hello\nworld");
    const result = getPosition("rld");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toEqual({ offset: 8, line: 1, column: 2 });
    }
  });
});

describe("withSpan", () => {
  it("should wrap a parser result with span info", () => {
    setInputStr("hello world");
    const parser = withSpan(str("hello"));
    const result = parser("hello world");
    expect(result).toEqual({
      success: true,
      result: {
        value: "hello",
        span: {
          start: { offset: 0, line: 0, column: 0 },
          end: { offset: 5, line: 0, column: 5 },
        },
      },
      rest: " world",
    });
  });

  it("should propagate failure", () => {
    setInputStr("hello world");
    const parser = withSpan(str("goodbye"));
    const result = parser("hello world");
    expect(result.success).toBe(false);
  });

  it("should track span across lines", () => {
    const input = "line1\nline2\nline3";
    setInputStr(input);
    const parser = withSpan(str("line2"));
    // rest is "line2\nline3", meaning we've consumed "line1\n"
    const result = parser("line2\nline3");
    expect(result).toEqual({
      success: true,
      result: {
        value: "line2",
        span: {
          start: { offset: 6, line: 1, column: 0 },
          end: { offset: 11, line: 1, column: 5 },
        },
      },
      rest: "\nline3",
    });
  });

  it("should work when composed with seq", () => {
    const input = "hello world";
    setInputStr(input);
    const parser = seqR(str("hello "), withSpan(word));
    const result = parser(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toEqual([
        "hello ",
        {
          value: "world",
          span: {
            start: { offset: 6, line: 0, column: 6 },
            end: { offset: 11, line: 0, column: 11 },
          },
        },
      ]);
    }
  });
});
