import { fail } from "@/lib/parsers.js";
import { describe, it, expect } from "vitest";
import { success, failure } from "../../lib/types";

describe("fail parser", () => {
  it("should always fail and return the given input as an error", () => {
    const parser = fail("an error");
    expect(parser("abc")).toEqual(failure("an error", "abc"));
  });
});
