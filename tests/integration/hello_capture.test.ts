import { seq, capture, many1, many1WithJoin } from "@/lib/combinators";
import { char, str, space, noneOf } from "@/lib/parsers";
import { ParserSuccess } from "@/lib/types";
import { describe, it, expect } from "vitest";
import { success } from "vitest.globals";

describe("hello world", () => {
  it("parses + captures name", () => {
    const parser = seq([
      str("hello"),
      space,
      capture(many1WithJoin(noneOf("!")), "name"),
      char("!"),
    ]);
    const result = parser("hello adit!");
    expect(result.success).toEqual(true);
    expect((result as ParserSuccess<string[], string>).captures).toEqual({
      name: "adit",
    });
  });
});
