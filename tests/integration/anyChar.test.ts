import { describe, expect, test } from "vitest";
import { anyChar } from "../../lib/parsers";
import { success, failure } from "../../lib/types";

describe("anyChar", () => {
  test("anyChar parser - non-empty input", () => {
    const input = "abc";
    const result = anyChar(input);
    expect(result).toEqual(success("a", "bc"));
  });

  test("anyChar parser - empty input", () => {
    const input = "";
    const result = anyChar(input);
    expect(result).toEqual(failure("unexpected end of input", ""));
  });
});
