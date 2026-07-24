import { describe, it, expect } from "vitest";
import {
  committed,
  or,
  many,
  many1,
  optional,
  exactly,
  sepBy,
} from "@/lib/combinators";
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
