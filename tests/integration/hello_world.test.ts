import { seq, capture } from "@/lib/combinators";
import { char, str, space } from "@/lib/parsers";
import { describe, it, expect } from "vitest";
import { success } from "vitest.globals";

describe("hello world", () => {
  it("parses", () => {
    const parser = seq([str("hello"), space, str("world")]);
    const result = parser("hello world");
    expect(result).toEqual(
      success({ match: ["hello", " ", "world"], rest: "", captures: {} })
    );
  });
});
