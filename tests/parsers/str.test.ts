import { str } from "@/lib/parsers";
import { describe, expect, it } from "vitest";
import { success, failure } from "../../lib/types";

describe("str parser", () => {
  it("should parse correct string", () => {
    const parser = str("hello");
    expect(parser("hello world")).toEqual(success("hello", " world"));
  });

  it("should handle incorrect string", () => {
    const parser = str("hello");
    expect(parser("hi there")).toEqual(
      failure("expected hello, got hi th", "hi there")
    );
  });

  it("should handle unexpected end of input", () => {
    const parser = str("hello");
    expect(parser("hel")).toEqual(failure("expected hello, got hel", "hel"));
  });
});
