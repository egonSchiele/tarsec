import { seqC, capture, many1Till, count, or } from "@/lib/combinators";
import { set, char, spaces, eof } from "@/lib/parsers";
import { failure, Parser, success } from "@/lib/types";
import { describe, expect, it } from "vitest";
type Heading = {
  type: "heading";
  level: number;
  content: string;
};
const headingParser: Parser<Heading> = seqC(
  set("type", "heading"),
  capture(count(char("#")), "level"),
  spaces,
  capture(many1Till(or(char("\n"), eof)), "content")
);

describe("set", () => {
  it("should set a key-value pair", () => {
    const result = headingParser("# Hello");
    expect(result).toEqual(
      success({ type: "heading", level: 1, content: "Hello" }, "")
    );
  });
  it("shouldn't set a key-value pair on failure", () => {
    const result = headingParser("Hello");
    expect(result).toEqual(failure("expected at least one match", "Hello"));
  });
});
