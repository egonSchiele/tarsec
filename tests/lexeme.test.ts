import { describe, expect, it } from "vitest";
import { makeLexemes } from "@/lib/lexeme";
import { capture, seqC } from "@/lib/combinators";
import { word } from "@/lib/parsers";

const lx = makeLexemes({ whitespace: " \t", lineComment: "#" });

describe("whitespace", () => {
  it("eats whitespace and always succeeds", () => {
    expect(lx.whitespace("  \thi")).toEqual({ success: true, result: null, rest: "hi" });
    expect(lx.whitespace("hi")).toEqual({ success: true, result: null, rest: "hi" });
    expect(lx.whitespace("")).toEqual({ success: true, result: null, rest: "" });
  });

  it("skipWhitespace is the same skipper as a plain function", () => {
    expect(lx.skipWhitespace("  \thi")).toEqual("hi");
    expect(lx.skipWhitespace("hi")).toEqual("hi");
    expect(lx.skipWhitespace("")).toEqual("");
  });

  it("eats line comments but stops at the newline", () => {
    expect(lx.skipWhitespace("# hey\nnext")).toEqual("\nnext");
    expect(lx.skipWhitespace("  # hey")).toEqual("");
  });

  it("supports multi-character comment markers", () => {
    const slashes = makeLexemes({ whitespace: " ", lineComment: "//" });
    expect(slashes.skipWhitespace("// c\nx")).toEqual("\nx");
    expect(slashes.skipWhitespace("/ x")).toEqual("/ x");
  });

  it("does not eat newlines when they are not in the charset", () => {
    expect(lx.skipWhitespace("\nfoo")).toEqual("\nfoo");
  });

  it("eats line continuations when configured", () => {
    const continued = makeLexemes({ whitespace: " \t", lineContinuation: true });
    expect(continued.skipWhitespace("\\\n  next")).toEqual("next");
    // backslash NOT followed by newline is left alone
    expect(continued.skipWhitespace("\\x")).toEqual("\\x");
  });

  it("line continuation defaults to off", () => {
    expect(lx.skipWhitespace("\\\nx")).toEqual("\\\nx");
  });

  it("treats an empty lineComment as absent (no infinite loop)", () => {
    const empty = makeLexemes({ whitespace: " ", lineComment: "" });
    expect(empty.skipWhitespace("\nx")).toEqual("\nx");
    expect(empty.skipWhitespace("  abc")).toEqual("abc");
  });
});

describe("symbol and lexeme", () => {
  it("symbol matches and eats trailing whitespace", () => {
    expect(lx.symbol("+")("+  2")).toEqual({ success: true, result: "+", rest: "2" });
  });

  it("symbol does not eat leading whitespace", () => {
    expect(lx.symbol("+")("  +").success).toEqual(false);
  });

  it("lexeme leaves rest untouched when the inner parser fails", () => {
    const result = lx.symbol("+")("-  2");
    expect(result.success).toEqual(false);
    expect(result.rest).toEqual("-  2");
  });

  it("lexeme preserves captures at runtime and in types", () => {
    const parser = seqC(lx.lexeme(capture(word, "name")), lx.symbol("!"));
    const result = parser("hello   ! ");
    expect(result).toEqual({ success: true, result: { name: "hello" }, rest: "" });
    if (result.success) {
      // Type-level check: only `npm run test:tsc` enforces this line (vitest
      // strips types without checking). Don't weaken it with `any`.
      const name: string = result.result.name;
      expect(name).toEqual("hello");
    }
  });
});

describe("identifier and keyword", () => {
  const kw = makeLexemes({
    whitespace: " \t",
    keywords: ["if", "then"],
  });

  it("parses identifiers and eats trailing whitespace", () => {
    expect(kw.identifier("foo_1  bar")).toEqual({
      success: true,
      result: "foo_1",
      rest: "bar",
    });
  });

  it("rejects keywords as identifiers", () => {
    expect(kw.identifier("if x").success).toEqual(false);
  });

  it("accepts identifiers that merely start with a keyword", () => {
    expect(kw.identifier("ifx ")).toEqual({ success: true, result: "ifx", rest: "" });
  });

  it("keyword matches exactly", () => {
    expect(kw.keyword("if")("if x").rest).toEqual("x");
  });

  it("keyword rejects longer words", () => {
    expect(kw.keyword("if")("ifx").success).toEqual(false);
  });

  it("keyword matches at the exact end of input", () => {
    expect(kw.keyword("if")("if")).toEqual({ success: true, result: "if", rest: "" });
  });

  it("identifier fails on empty input and non-start chars", () => {
    expect(kw.identifier("").success).toEqual(false);
    expect(kw.identifier("1abc").success).toEqual(false);
  });

  it("supports custom charsets", () => {
    const custom = makeLexemes({ whitespace: " ", identStart: "@", identRest: "0123456789" });
    expect(custom.identifier("@42 x")).toEqual({ success: true, result: "@42", rest: "x" });
  });

  it("supports CharPredicate functions for identifier charsets", () => {
    const AT_SIGN = 0x40;
    const isDigitCode = (code: number) => code >= 0x30 && code <= 0x39;
    const custom = makeLexemes({
      whitespace: " ",
      identStart: (code) => code === AT_SIGN,
      identRest: isDigitCode,
    });
    expect(custom.identifier("@42 x")).toEqual({ success: true, result: "@42", rest: "x" });
    expect(custom.identifier("a42").success).toEqual(false);
  });
});

describe("operator", () => {
  it("matches an operator and eats trailing whitespace", () => {
    expect(lx.operator("<")("< 2")).toEqual({ success: true, result: "<", rest: "2" });
  });

  it("rejects a longer operator (longest match)", () => {
    expect(lx.operator("<")("<= 2").success).toEqual(false);
    expect(lx.operator("<=")("<= 2")).toEqual({ success: true, result: "<=", rest: "2" });
    expect(lx.operator("|")("|| x").success).toEqual(false);
  });

  it("matches at the exact end of input", () => {
    expect(lx.operator("+")("+")).toEqual({ success: true, result: "+", rest: "" });
  });

  it("stops rejecting at non-operator characters", () => {
    expect(lx.operator("<")("<2")).toEqual({ success: true, result: "<", rest: "2" });
  });

  it("supports a custom operator charset", () => {
    const arrows = makeLexemes({ whitespace: " ", operatorChars: "-></" });
    expect(arrows.operator("->")("->> x").success).toEqual(false);
    expect(arrows.operator("->")("-> x")).toEqual({ success: true, result: "->", rest: "x" });
  });
});

describe("brackets and lists", () => {
  it("parens wraps a parser between ( and ), whitespace handled", () => {
    const inner = lx.lexeme(word);
    expect(lx.parens(inner)("( hello )!")).toEqual({
      success: true,
      result: "hello",
      rest: "!",
    });
  });

  it("brackets and braces use their own delimiters", () => {
    const inner = lx.lexeme(word);
    expect(lx.brackets(inner)("[hi] x")).toEqual({ success: true, result: "hi", rest: "x" });
    expect(lx.braces(inner)("{hi} x")).toEqual({ success: true, result: "hi", rest: "x" });
  });

  it("parens fails without consuming input when the close is missing", () => {
    const result = lx.parens(lx.lexeme(word))("(hello");
    expect(result.success).toEqual(false);
    expect(result.rest).toEqual("(hello");
  });

  it("commaSep parses zero, one, and many items", () => {
    const items = lx.commaSep(lx.lexeme(word));
    expect(items("")).toEqual({ success: true, result: [], rest: "" });
    expect(items("a")).toEqual({ success: true, result: ["a"], rest: "" });
    expect(items("a, b ,c d")).toEqual({ success: true, result: ["a", "b", "c"], rest: "d" });
  });

  it("commaSep1 requires at least one item", () => {
    expect(lx.commaSep1(lx.lexeme(word))(", x").success).toEqual(false);
  });

  it("composes into an argument-list parser", () => {
    const args = lx.parens(lx.commaSep(lx.identifier));
    expect(args("(a, b, c) rest")).toEqual({
      success: true,
      result: ["a", "b", "c"],
      rest: "rest",
    });
  });
});

