import { beforeEach, describe, expect, it } from "vitest";
import { required } from "@/lib/combinators";
import { str } from "@/lib/parsers";
import { getRightmostFailure, resetRightmostFailure } from "@/lib/rightmostFailure";
import { setInputStr } from "@/lib/trace";
import { committedFailure, isCommittedFailure, Parser } from "@/lib/types";

beforeEach(resetRightmostFailure);

describe("required", () => {
  it("passes success through unchanged", () => {
    const parser = required("a greeting", str("hello"));
    expect(parser("hello!")).toEqual({ success: true, result: "hello", rest: "!" });
  });

  it("turns an ordinary failure into a clean committed failure", () => {
    setInputStr("goodbye");
    const parser = required("a greeting", str("hello"));
    const result = parser("goodbye");
    expect(result.success).toEqual(false);
    expect(isCommittedFailure(result)).toEqual(true);
    if (!result.success) {
      expect(result.message).toEqual("expected a greeting");
      expect(result.rest).toEqual("goodbye"); // failure sits where the thing was required
    }
    expect(getRightmostFailure()?.expected).toEqual(["a greeting"]);
  });

  it("passes an inner committed failure through with its own message", () => {
    const inner: Parser<string> = (input) =>
      committedFailure("unterminated quote", input);
    const result = required("a greeting", inner)("'oops");
    expect(result.success).toEqual(false);
    if (!result.success) expect(result.message).toEqual("unterminated quote");
  });
});
