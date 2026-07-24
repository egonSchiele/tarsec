import { describe, it, expect } from "vitest";
import { committed } from "@/lib/combinators";
import { str, word } from "@/lib/parsers";
import { isCommittedFailure, success } from "../../lib/types";
import { compareSuccess } from "../../vitest.globals";

describe("committed", () => {
  const literal = committed(str("[|"), str("body|]"));

  it("succeeds like a sequence, returning rest's result", () => {
    compareSuccess(literal("[|body|]tail"), success("body|]", "tail"));
  });

  it("a prefix failure is ordinary and backtrackable", () => {
    const result = literal("nope");
    expect(result.success).toBe(false);
    expect(isCommittedFailure(result)).toBe(false);
  });

  it("a failure after the prefix is committed", () => {
    const result = literal("[|broken");
    expect(result.success).toBe(false);
    expect(isCommittedFailure(result)).toBe(true);
    if (!result.success) {
      expect(result.rest).toBe("broken"); // failure position is inside the body
    }
  });

  it("an already-committed inner failure stays committed (no double wrap needed)", () => {
    const nested = committed(str("a"), committed(str("b"), str("c")));
    const result = nested("abX");
    expect(isCommittedFailure(result)).toBe(true);
  });
});
