import { match } from "@/lib/combinators";
import { char, str } from "@/lib/parsers";
import { describe, expect, it } from "vitest";

describe("match", () => {
  it("returns true if the parser succeeds and consumes all input", () => {
    expect(match("a", char("a"))).toBe(true);
  });
  it("returns false if the parser succeeds but doesn't consume all input", () => {
    expect(match("a", str("abc"))).toBe(false);
  });
  it("returns false if the parser fails", () => {
    expect(match("a", char("b"))).toBe(false);
  });
});
