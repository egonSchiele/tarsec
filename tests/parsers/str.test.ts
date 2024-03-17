import { str } from "@/lib/parsers";
import { describe, expect, it } from "vitest";
import { success, failure } from "vitest.globals";

describe("str parser", () => {
  it("should parse correct string", () => {
    const parser = str("hello");
    expect(parser("hello world")).toEqual(
      success({
        match: "hello",
        rest: " world",
      })
    );
  });

  it("should handle incorrect string", () => {
    const parser = str("hello");
    expect(parser("hi there")).toEqual(
      failure({
        rest: "hi there",
        message: "expected hello, got hi th",
      })
    );
  });

  it("should handle unexpected end of input", () => {
    const parser = str("hello");
    expect(parser("hel")).toEqual(
      failure({
        rest: "hel",
        message: "expected hello, got hel",
      })
    );
  });
});
