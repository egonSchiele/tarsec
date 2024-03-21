import { seq } from "@/lib/combinators";
import { space, str } from "@/lib/parsers";
import { describe, expect, it } from "vitest";
import { success } from "../../lib/types";
import { getResults } from "../../lib/combinators";

describe("hello world", () => {
  it("parses", () => {
    const parser = seq([str("hello"), space, str("world")], getResults);
    const result = parser("hello world");
    expect(result).toEqual(success(["hello", " ", "world"], ""));
  });
});
