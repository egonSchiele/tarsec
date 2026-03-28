import { describe, it, expect } from "vitest";
import { buildExpressionParser, map, optional } from "@/lib/combinators";
import { char, regex, str } from "@/lib/parsers";
import { Parser } from "@/lib/types";

// A simple integer parser
const integer: Parser<number> = (input: string) => {
  const match = input.match(/^\d+/);
  if (!match) return { success: false, rest: input, message: "expected number" };
  return { success: true, result: Number(match[0]), rest: input.slice(match[0].length) };
};

// optional whitespace parser
const ws: Parser<string> = (input: string) => {
  const match = input.match(/^\s*/);
  return { success: true, result: match![0], rest: input.slice(match![0].length) };
};

// integer with optional surrounding whitespace
const wsInt: Parser<number> = (input: string) => {
  const r1 = ws(input);
  if (!r1.success) return r1;
  const r2 = integer(r1.rest);
  if (!r2.success) return r2;
  const r3 = ws(r2.rest);
  if (!r3.success) return r3;
  return { success: true, result: r2.result, rest: r3.rest };
};

// operator parsers that consume surrounding whitespace
function wsOp(c: string): Parser<string> {
  return (input: string) => {
    const r1 = ws(input);
    if (!r1.success) return r1;
    const r2 = char(c)(r1.rest);
    if (!r2.success) return r2;
    const r3 = ws(r2.rest);
    if (!r3.success) return r3;
    return { success: true, result: c, rest: r3.rest };
  };
}

describe("buildExpressionParser", () => {
  const expr = buildExpressionParser(wsInt, [
    [
      { op: wsOp("*"), assoc: "left" as const, apply: (a: number, b: number) => a * b },
      { op: wsOp("/"), assoc: "left" as const, apply: (a: number, b: number) => a / b },
    ],
    [
      { op: wsOp("+"), assoc: "left" as const, apply: (a: number, b: number) => a + b },
      { op: wsOp("-"), assoc: "left" as const, apply: (a: number, b: number) => a - b },
    ],
  ]);

  it("should parse a single number", () => {
    const result = expr("42");
    expect(result.success).toBe(true);
    if (result.success) expect(result.result).toBe(42);
  });

  it("should parse addition", () => {
    const result = expr("1 + 2");
    expect(result.success).toBe(true);
    if (result.success) expect(result.result).toBe(3);
  });

  it("should parse multiplication before addition (precedence)", () => {
    const result = expr("1 + 2 * 3");
    expect(result.success).toBe(true);
    if (result.success) expect(result.result).toBe(7); // 1 + (2*3)
  });

  it("should parse left-associative subtraction", () => {
    const result = expr("10 - 3 - 2");
    expect(result.success).toBe(true);
    if (result.success) expect(result.result).toBe(5); // (10-3)-2
  });

  it("should parse parenthesized expressions", () => {
    const result = expr("(1 + 2) * 3");
    expect(result.success).toBe(true);
    if (result.success) expect(result.result).toBe(9);
  });

  it("should parse nested parentheses", () => {
    const result = expr("1 * (2 - (3 + 4))");
    expect(result.success).toBe(true);
    if (result.success) expect(result.result).toBe(-5); // 1 * (2 - 7)
  });

  it("should parse the motivating example", () => {
    const result = expr("1 * (2 - (3 / 4))");
    expect(result.success).toBe(true);
    if (result.success) expect(result.result).toBe(1.25); // 1 * (2 - 0.75)
  });

  it("should handle multiple operations at same precedence", () => {
    const result = expr("2 * 3 / 6");
    expect(result.success).toBe(true);
    if (result.success) expect(result.result).toBe(1); // (2*3)/6
  });

  it("should handle complex nested expression", () => {
    const result = expr("(1 + 2) * (3 + 4)");
    expect(result.success).toBe(true);
    if (result.success) expect(result.result).toBe(21);
  });

  it("should leave unconsumed input in rest", () => {
    const result = expr("1 + 2 hello");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toBe(3);
      expect(result.rest).toBe("hello");
    }
  });
});

describe("buildExpressionParser with right-associativity", () => {
  const expr = buildExpressionParser(wsInt, [
    [{ op: wsOp("^"), assoc: "right" as const, apply: (a: number, b: number) => a ** b }],
    [{ op: wsOp("+"), assoc: "left" as const, apply: (a: number, b: number) => a + b }],
  ]);

  it("should parse right-associative exponentiation", () => {
    const result = expr("2 ^ 3 ^ 2");
    expect(result.success).toBe(true);
    if (result.success) expect(result.result).toBe(512); // 2 ^ (3^2) = 2^9
  });

  it("should mix right-assoc and left-assoc", () => {
    const result = expr("1 + 2 ^ 3");
    expect(result.success).toBe(true);
    if (result.success) expect(result.result).toBe(9); // 1 + (2^3)
  });
});

describe("buildExpressionParser with custom paren parser", () => {
  // Use square brackets instead of parens
  const squareParen: Parser<number> = (input: string) => {
    if (input[0] !== "[") return { success: false, rest: input, message: "expected [" };
    const inner = expr(input.slice(1));
    if (!inner.success) return inner;
    if (inner.rest[0] !== "]") return { success: false, rest: input, message: "expected ]" };
    return { success: true, result: inner.result, rest: inner.rest.slice(1) };
  };

  const expr: Parser<number> = buildExpressionParser(
    wsInt,
    [
      [{ op: wsOp("*"), assoc: "left" as const, apply: (a: number, b: number) => a * b }],
      [{ op: wsOp("+"), assoc: "left" as const, apply: (a: number, b: number) => a + b }],
    ],
    squareParen,
  );

  it("should use custom paren parser", () => {
    const result = expr("[1 + 2] * 3");
    expect(result.success).toBe(true);
    if (result.success) expect(result.result).toBe(9);
  });

  it("should not accept round parens when custom paren parser is used", () => {
    const result = expr("(1 + 2) * 3");
    // ( isn't recognized as an atom or paren, so parsing fails
    expect(result.success).toBe(false);
  });
});
