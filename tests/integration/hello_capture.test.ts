import { capture, many1WithJoin, seq } from "@/lib/combinators";
import { char, noneOf, space, str } from "@/lib/parsers";
import { describe, expect, it } from "vitest";
import { getCaptures } from "../../lib/combinators";
import { success } from "../../lib/types";

describe("hello world", () => {
  it("parses + captures name", () => {
    const parser = seq(
      [
        str("hello"),
        space,
        capture(many1WithJoin(noneOf("!")), "name"),
        char("!"),
      ],
      getCaptures
    );
    const result = parser("hello adit!");
    expect(result).toEqual(success({ name: "adit" }, ""));
  });
});
