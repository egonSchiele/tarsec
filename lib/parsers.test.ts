import { describe, expect, it } from "vitest";
import { char, str } from "./parsers";
import { success, failure } from "../vitest.setup.js";

describe("char parser", () => {
  it("should parse correct character", () => {
    const parser = char("a");
    expect(parser("abc")).toEqual(success({ match: "a", rest: "bc" }));
  });

  it("should handle unexpected end of input", () => {
    const parser = char("a");
    expect(parser("")).toEqual(
      failure({
        rest: "",
        message: "unexpected end of input",
      })
    );
  });

  it("should handle incorrect character", () => {
    const parser = char("a");
    expect(parser("bcd")).toEqual(
      failure({
        rest: "bcd",
        message: "expected a, got b",
      })
    );
  });
});

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
        rest: "i there",
        message: "expected e, got i",
      })
    );
  });

  it("should handle unexpected end of input", () => {
    const parser = str("hello");
    expect(parser("hel")).toEqual(
      failure({
        rest: "",
        message: "unexpected end of input",
      })
    );
  });
});
