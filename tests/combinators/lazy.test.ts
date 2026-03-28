import { describe, it, expect } from "vitest";
import { lazy, or, map, seqR } from "@/lib/combinators";
import { char, str, regexParser } from "@/lib/parsers";
import { success } from "@/lib/types";

describe("lazy", () => {
  it("should defer parser evaluation", () => {
    // A simple recursive parser: nested parens around a letter
    // e.g. "a", "(a)", "((a))"
    const atom = regexParser("^[a-z]");
    const expr: ReturnType<typeof or> = or(
      atom,
      map(seqR(char("("), lazy(() => expr), char(")")), ([_o, inner, _c]) => inner),
    );

    const r1 = expr("a");
    expect(r1.success).toBe(true);
    if (r1.success) { expect(r1.result).toBe("a"); expect(r1.rest).toBe(""); }

    const r2 = expr("(a)");
    expect(r2.success).toBe(true);
    if (r2.success) { expect(r2.result).toBe("a"); expect(r2.rest).toBe(""); }

    const r3 = expr("((a))");
    expect(r3.success).toBe(true);
    if (r3.success) { expect(r3.result).toBe("a"); expect(r3.rest).toBe(""); }
  });

  it("should work with mutually recursive parsers", () => {
    // list = "[" items "]"
    // items = item ("," item)*
    // item = letter+ | list
    const letter = regexParser("^[a-z]+");
    const item: ReturnType<typeof or> = or(
      lazy(() => list),
      letter,
    );

    const items = map(
      seqR(item, map(seqR(char(","), item), ([_comma, i]) => i)),
      ([first, second]) => [first, second],
    );

    const list = map(
      seqR(char("["), items, char("]")),
      ([_o, inner, _c]) => inner,
    );

    const result = list("[a,b]");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toEqual(["a", "b"]);
    }
  });
});
