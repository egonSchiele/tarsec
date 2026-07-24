import { describe, it, expect } from "vitest";
import {
  repeatTill,
  matchedText,
  many1TillOneOf,
  or,
  seqR,
} from "@/lib/combinators";
import { str, char, anyChar } from "@/lib/parsers";
import { compareSuccess } from "../../vitest.globals";
import { success } from "../../lib/types";

describe("repeatTill", () => {
  it("repeats the chunk until the terminator, leaving the terminator unconsumed", () => {
    const parser = repeatTill(str("ab"), str(";"));
    compareSuccess(parser("abab;rest"), success(["ab", "ab"], ";rest"));
  });

  it("zero repetitions when the terminator is immediate", () => {
    const parser = repeatTill(str("ab"), str(";"));
    compareSuccess(parser(";rest"), success([], ";rest"));
  });

  it("fails when input ends before the terminator", () => {
    const parser = repeatTill(str("ab"), str(";"));
    const result = parser("abab");
    expect(result.success).toBe(false);
  });

  it("propagates a chunk failure", () => {
    const parser = repeatTill(str("ab"), str(";"));
    const result = parser("abXX;");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.rest).toBe("XX;");
    }
  });

  it("tries the terminator before the chunk, so a greedy chunk cannot eat it", () => {
    // anyChar would happily consume ";" — terminator-first order protects it.
    const parser = repeatTill(anyChar, str(";"));
    compareSuccess(parser("ab;rest"), success(["a", "b"], ";rest"));
  });

  it("fails instead of looping when a chunk succeeds without consuming", () => {
    const zeroWidth = str("");
    const result = repeatTill(zeroWidth, str(";"))("abc");
    expect(result.success).toBe(false);
  });

  it("terminators inside skipped regions are inert (the literal-scan use case)", () => {
    // Mini string parser: "..." with no escapes, for the test's purposes.
    const quoted = matchedText(
      seqR(char('"'), many1TillOneOf(['"']), char('"')),
    );
    const bodyChunk = or(
      many1TillOneOf(['"', "|"]), // bulk inert text (user-provided triggers)
      quoted, //                     strings: a |] inside is inert
      anyChar, //                    a lone trigger char that started nothing
    );
    const bodyText = matchedText(repeatTill(bodyChunk, str("|]")));

    const result = bodyText('say("look: |] fake") |] tail');
    compareSuccess(result, success('say("look: |] fake") ', "|] tail"));
  });
});
