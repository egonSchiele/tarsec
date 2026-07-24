import { describe, it, expect } from "vitest";
import {
  failure,
  committedFailure,
  isCommittedFailure,
  success,
} from "@/lib/types";

describe("committed failures", () => {
  it("committedFailure sets the flag; failure does not", () => {
    const plain = failure("nope", "rest");
    const committed = committedFailure("nope", "rest");
    expect(isCommittedFailure(plain)).toBe(false);
    expect(isCommittedFailure(committed)).toBe(true);
    expect(committed).toEqual({
      success: false,
      message: "nope",
      rest: "rest",
      committed: true,
    });
  });

  it("successes are never committed failures", () => {
    expect(isCommittedFailure(success("x", ""))).toBe(false);
  });
});
