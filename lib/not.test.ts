import { describe, it, expect } from "vitest";
import { not } from "./combinators";
import { char } from "./parsers";
import { failure, success } from "./types";

describe("not parser", () => {
  const parser = not(char("a"));

  it("should fail if the character is present", () => {
    const result = parser("a");
    expect(result).toEqual(failure("unexpected match", "a"));
  });

  it("should return null if the character is missing", () => {
    const result = parser("b");
    expect(result).toEqual(success(null, "b"));
  });
});
