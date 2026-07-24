import { describe, it, expect } from "vitest";
import {
  committed,
  or,
  many,
  many1,
  optional,
  exactly,
  sepBy,
  seqR,
  seq,
  between,
  manyTill,
  buildExpressionParser,
  getResults,
} from "@/lib/combinators";
import { char, digit } from "@/lib/parsers";
import { runNested } from "@/lib/runNested";
import { getErrorMessage } from "@/lib/rightmostFailure";
import { str, word, label } from "@/lib/parsers";
import { peek, not } from "@/lib/combinators";
import { within } from "@/lib/parsers/within";
import { setInputStr } from "@/lib/trace";
import { getParseState } from "@/lib/parseState";
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

describe("committed failure propagation", () => {
  const committedBranch = committed(str("[|"), str("body|]"));

  it("or() returns a committed failure instead of trying later alternatives", () => {
    // The fallback WOULD succeed on this input — commit must forbid it.
    const fallback = str("[|broken");
    const parser = or(committedBranch, fallback);
    const result = parser("[|broken");
    expect(result.success).toBe(false);
    expect(isCommittedFailure(result)).toBe(true);
  });

  it("or() still tries alternatives past an ordinary prefix failure", () => {
    const parser = or(committedBranch, word);
    compareSuccess(parser("hello"), success("hello", ""));
  });

  it("many fails the whole repetition on a committed chunk failure", () => {
    const result = many(committedBranch)("[|body|][|broken");
    expect(result.success).toBe(false);
    expect(isCommittedFailure(result)).toBe(true);
  });

  it("many still returns collected results on an ordinary chunk failure", () => {
    compareSuccess(
      many(committedBranch)("[|body|]xyz"),
      success(["body|]"], "xyz"),
    );
  });

  it("many1 propagates a committed failure", () => {
    const result = many1(committedBranch)("[|broken");
    expect(result.success).toBe(false);
    expect(isCommittedFailure(result)).toBe(true);
  });

  it("optional propagates a committed failure instead of succeeding with null", () => {
    const result = optional(committedBranch)("[|broken");
    expect(result.success).toBe(false);
    expect(isCommittedFailure(result)).toBe(true);
  });

  it("optional still converts an ordinary failure to a null success", () => {
    compareSuccess(optional(committedBranch)("zzz"), success(null, "zzz"));
  });

  it("exactly propagates a committed failure", () => {
    const result = exactly(2, committedBranch)("[|body|][|broken");
    expect(result.success).toBe(false);
    expect(isCommittedFailure(result)).toBe(true);
  });

  it("sepBy fails the whole repetition on a committed item failure", () => {
    const result = sepBy(str(","), committedBranch)("[|body|],[|broken");
    expect(result.success).toBe(false);
    expect(isCommittedFailure(result)).toBe(true);
  });
});

describe("committed failures: label pass-through, lookahead containment", () => {
  const committedBranch = committed(str("[|"), str("body|]"));

  it("label passes a committed failure through untouched", () => {
    setInputStr("[|broken");
    const labeled = label("a code literal", committedBranch);
    const result = labeled("[|broken");
    expect(result.success).toBe(false);
    expect(isCommittedFailure(result)).toBe(true);
    if (!result.success) {
      expect(result.rest).toBe("broken"); // position preserved
    }
  });

  it("not() contains a commit: the probe's commitment never escapes", () => {
    const result = not(committedBranch)("[|broken");
    // committedBranch FAILED, so not() succeeds — and the commitment
    // inside the speculative probe is discarded, not propagated.
    expect(result.success).toBe(true);
  });

  it("peek() strips the committed flag and keeps rest reset to the input", () => {
    const result = peek(committedBranch)("[|broken");
    expect(result.success).toBe(false);
    expect(isCommittedFailure(result)).toBe(false);
    if (!result.success) {
      expect(result.rest).toBe("[|broken"); // peek's existing contract
    }
  });

  it("lookahead restores the committedFailure slot (no leak into error reporting)", () => {
    setInputStr("[|broken");
    const before = getParseState().committedFailure;
    not(committedBranch)("[|broken");
    expect(getParseState().committedFailure).toBe(before);
    peek(committedBranch)("[|broken");
    expect(getParseState().committedFailure).toBe(before);
  });

  it("within contains commits from its probes (a search is speculation)", () => {
    setInputStr("[|broken text");
    const before = getParseState().committedFailure;
    const result = within(committedBranch)("[|broken text");
    expect(result.success).toBe(true); // within always succeeds
    expect(getParseState().committedFailure).toBe(before);
  });
});

describe("committed failures win error reporting end-to-end", () => {
  it("getErrorMessage prefers the committed failure over a deeper rightmost record", () => {
    setInputStr("[|ab");
    // The fallback runs FIRST and wanders DEEPER (records pos 3) than the
    // committed failure (pos 2). Without the preference, getErrorMessage
    // reports the fallback's pos-3 record — the exact bug F3 exists to kill.
    const fallback = seqR(str("[|a"), str("Z")); // records rightmost at pos 3
    const committedLiteral = committed(str("[|"), str("XX")); // committed at pos 2
    const parser = or(fallback, committedLiteral);
    const result = parser("[|ab");

    expect(result.success).toBe(false);
    expect(isCommittedFailure(result)).toBe(true);
    if (!result.success) {
      expect(result.rest).toBe("ab"); // committed position, pos 2
    }
    // The message channel agrees with the result: pos 2 → Line 1, col 3.
    expect(getErrorMessage()).toMatch(/^Line 1, col 3: /);
  });

  it("with no committed failure, getErrorMessage falls back to the rightmost record", () => {
    setInputStr("abc");
    str("abX")("abc"); // ordinary failure, records rightmost
    const message = getErrorMessage();
    expect(message).not.toBeNull();
    expect(message).toMatch(/^Line 1, col /);
  });
});

describe("committed failures survive rewrapping combinators", () => {
  const committedBranch = committed(str("[|"), str("body|]"));

  it("seq preserves the flag AND the failure position", () => {
    const parser = seq([str("a"), committedBranch], getResults);
    const result = parser("a[|broken");
    expect(result.success).toBe(false);
    expect(isCommittedFailure(result)).toBe(true);
    if (!result.success) {
      expect(result.rest).toBe("broken"); // not reset to the sequence start
    }
  });

  it("between passes a committed failure through unwrapped", () => {
    const parser = between(char("("), char(")"), committedBranch);
    const result = parser("([|broken)");
    expect(result.success).toBe(false);
    expect(isCommittedFailure(result)).toBe(true);
  });
});

describe("committed slot containment in speculative scans", () => {
  const committedBranch = committed(str("[|"), str("body|]"));

  it("manyTill's stop probes do not pollute the slot", () => {
    setInputStr("abc[|broken");
    const before = getParseState().committedFailure;
    manyTill(committedBranch)("abc[|broken"); // probe at "[|" commits, is discarded
    expect(getParseState().committedFailure).toBe(before);
  });

  it("buildExpressionParser's fold probes do not pollute the slot", () => {
    // Operand after "+" is a committed literal that fails; the fold
    // discards it and returns the left side — the slot must not keep
    // the discarded commit, or it would mask every later error message.
    const atom = or(digit, committedBranch);
    const expr = buildExpressionParser(atom, [
      [{ op: char("+"), assoc: "left" as const, apply: (a: string, b: string) => a + b }],
    ]);
    setInputStr("1+[|broken");
    const before = getParseState().committedFailure;
    const result = expr("1+[|broken");
    expect(result.success).toBe(true); // folds back to "1"
    expect(getParseState().committedFailure).toBe(before);
  });
});

describe("committed × runNested", () => {
  it("an inner commit stays in the inner state and surfaces via the result flag", () => {
    setInputStr("outer text");
    const outerSlotBefore = getParseState().committedFailure;
    const inner = committed(str("[|"), str("body|]"));

    const result = runNested(inner, "[|broken", {
      basePosition: { offset: 6, line: 0, column: 6 },
    });

    // The commitment reaches the caller through the result...
    expect(result.success).toBe(false);
    expect(isCommittedFailure(result)).toBe(true);
    // ...but never through the outer state's slot or message channel.
    expect(getParseState().committedFailure).toBe(outerSlotBefore);
    expect(getErrorMessage()).toBeNull();
  });

  it("inside the nested parse, getErrorMessage composes the committed position with basePosition", () => {
    setInputStr("outer");
    runNested(
      (input) => {
        const inner = committed(str("[|"), str("body|]"));
        inner(input); // committed failure at inner pos 2
        // inner pos 2 + base col 6 → col 9 (1-based), base line 40 → line 41
        expect(getErrorMessage()).toMatch(/^Line 41, col 9: /);
        return { success: true as const, result: null, rest: input };
      },
      "[|broken",
      { basePosition: { offset: 100, line: 40, column: 6 } },
    );
  });
});
