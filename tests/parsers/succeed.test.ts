import { succeed } from "@/lib/parsers.js";
import { describe, it, expect } from "vitest";
import { success, failure } from "../../lib/types";

describe("succeed parser", () => {
  it("should always succeed and return the given input as a result", () => {
    const parser = succeed("a result");
    expect(parser("abc")).toEqual(success("a result", "abc"));
  });
});
