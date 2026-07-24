import { beforeEach, describe, expect, it } from "vitest";
import { alt } from "@/lib/combinators";
import { str, word } from "@/lib/parsers";
import { getRightmostFailure, resetRightmostFailure } from "@/lib/rightmostFailure";
import { setInputStr } from "@/lib/trace";
import { committedFailure, failure, Parser, success } from "@/lib/types";

beforeEach(resetRightmostFailure);

describe("alt", () => {
  it("returns the first success, like or", () => {
    const parser = alt(str("a"), str("b"));
    expect(parser("b rest")).toEqual({ success: true, result: "b", rest: " rest" });
  });

  it("returns a committed failure immediately without trying later alternatives", () => {
    let laterTried = false;
    const committed: Parser<string> = (input) =>
      committedFailure("malformed thing", input);
    const later: Parser<string> = (input) => {
      laterTried = true;
      return success("x", input);
    };
    const result = alt(committed, later)("input");
    expect(result.success).toEqual(false);
    if (!result.success) expect(result.message).toEqual("malformed thing");
    expect(laterTried).toEqual(false);
  });

  it("discards rejected alternatives' failure recordings", () => {
    setInputStr("zzz");
    const result = alt(word, str("a"), str("b"))("zzz!");
    expect(result.success).toEqual(true);
    expect(getRightmostFailure()).toEqual(null);
  });

  it("keeps a committed failure's recordings", () => {
    setInputStr("zzz");
    const committed: Parser<string> = (input) => {
      // recordFailure is what a real committed parser does before failing
      return committedFailure("broken", input);
    };
    const result = alt(str("a"), committed)("zzz");
    expect(result.success).toEqual(false);
    // the str("a") recording was wiped; nothing else recorded
    expect(getRightmostFailure()).toEqual(null);
  });

  it("returns the last failure when all alternatives fail", () => {
    const first: Parser<string> = (input) => failure("first failed", input);
    const second: Parser<string> = (input) => failure("second failed", input);
    const result = alt(first, second)("x");
    expect(result.success).toEqual(false);
    if (!result.success) expect(result.message).toEqual("second failed");
  });
});
