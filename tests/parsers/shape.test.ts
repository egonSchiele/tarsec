import { istr, shape } from "@/lib/parsers.js";
import { describe, it, expect } from "vitest";
import { success, failure } from "../../lib/types";
import { seqC, and, seqR } from "@/lib/combinators";

type Chapter = { title: string; text: string };

describe("shape parser", () => {
  const titleParser = seqR(
    shape((c: Chapter) => c.title),
    istr("Once upon a time")
  );

  const textParser = seqR(
    shape((c: Chapter) => c.text),
    istr("There was a princess")
  );

  const parser = and(titleParser, textParser);

  it("should succeed", () => {
    const input = {
      title: "Once upon a time",
      text: "There was a princess",
    };

    const result = parser(input);
    expect(result).toEqual(
      success(
        [
          [null, "Once upon a time"],
          [null, "There was a princess"],
        ],
        input
      )
    );
  });
});
