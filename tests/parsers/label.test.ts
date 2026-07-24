import { describe, it, expect } from "vitest";
import { label, str, space, char } from "@/lib/parsers";
import { seqR, or } from "@/lib/combinators";
import { setInputStr } from "@/lib/trace";
import { getErrorMessage, getRightmostFailure } from "@/lib/rightmostFailure";

describe("label keeps deeper failures", () => {
  it("keeps a child record that is strictly inside the labeled region", () => {
    // "block" = "{" then "return": on "{x", the child gets past the
    // label's start (consumes "{") and fails at pos 1 wanting "return".
    const block = label(
      "a block",
      seqR(str("{"), label("a return statement", str("return"))),
    );
    setInputStr("{x");
    block("{x");
    const message = getErrorMessage();
    // The deep, specific expectation survives; the outer label does not
    // overwrite it.
    expect(message).toBe("Line 1, col 2: expected a return statement");
  });

  it("nested labels preserve the deepest record through every level", () => {
    const inner = label("a return statement", str("return"));
    const middle = label("a statement", seqR(str("{"), inner));
    const outer = label("a block", middle);
    setInputStr("{x");
    outer("{x");
    expect(getErrorMessage()).toBe(
      "Line 1, col 2: expected a return statement",
    );
  });

  it("still suppresses same-position internals (label's documented purpose)", () => {
    // space = label("whitespace", oneOf(" \t\n\r")): the child fails at
    // the label's own position, so the label replaces its noisy record.
    setInputStr("x");
    space("x");
    expect(getErrorMessage()).toBe("Line 1, col 1: expected whitespace");
    // Critically: NOT '...expected one of " \t\n\r" or whitespace'
    const record = getRightmostFailure();
    expect(record?.expected).toEqual(["whitespace"]);
  });

  it("same-position labels still merge into 'A or B'", () => {
    const aOrB = or(label("an a", char("a")), label("a b", char("b")));
    setInputStr("z");
    aOrB("z");
    expect(getErrorMessage()).toBe("Line 1, col 1: expected an a or a b");
  });

  it("does not resurrect a pre-existing deeper record from a sibling", () => {
    // A sibling already failed deep at pos 3; then a label fails at pos 0.
    // The sibling's deeper record must survive untouched — the rule
    // compares the child record to the LABEL's position, and pos 3 > 0
    // means the record predating the label is kept, exactly as before.
    setInputStr("abcd");
    const deepSibling = seqR(str("abc"), str("X")); // fails at pos 3
    const labeled = label("a thing", str("z")); // fails at pos 0
    or(deepSibling, labeled)("abcd");
    const record = getRightmostFailure();
    expect(record?.pos).toBe(3); // the position is the invariant
  });
});
