import { describe, expect, it, test } from "vitest";
import { between, capture, seq } from "./combinators";
import {
  alphanum,
  anyChar,
  char,
  digit,
  letter,
  num,
  quote,
  space,
  spaces,
  str,
  word,
} from "./parsers";
import { captureSuccess, failure, success } from "./types.js";
describe("Parser Tests", () => {
  describe("space parser", () => {
    it("should parse a space character", () => {
      const result = space(" ");
      expect(result).toEqual(success(" ", ""));
    });

    it("should fail if the character is not a space", () => {
      const result = space("a");
      expect(result).toEqual(
        failure("expected  , got a", "a")
      );
    });
  });

  describe("spaces parser", () => {
    it("should parse multiple space characters", () => {
      const result = spaces("  ");
      expect(result).toEqual(success("  ", ""));
    });

    it("should fail if no space characters found", () => {
      const result = spaces("abc");
      expect(result).toEqual(
        failure("expected at least one match", "abc")
      );
    });
  });

  describe("digit parser", () => {
    it("should parse a single digit", () => {
      const result = digit("1");
      expect(result).toEqual(success("1", ""));
    });

    it("should fail if the character is not a digit", () => {
      const result = digit("a");
      expect(result).toEqual(
        failure("expected one of 0123456789", "a")
      );
    });
  });

  describe("letter parser", () => {
    it("should parse a single letter", () => {
      const result = letter("a");
      expect(result).toEqual(success("a", ""));
    });

    it("should fail if the character is not a letter", () => {
      const result = letter("1");
      expect(result).toEqual(
        failure("expected one of abcdefghijklmnopqrstuvwxyz", "1")
      );
    });
  });

  describe("alphanum parser", () => {
    it("should parse a single alphanumeric character", () => {
      const result = alphanum("1");
      expect(result).toEqual(success("1", ""));
    });

    it("should fail if the character is not alphanumeric", () => {
      const result = alphanum("_");
      expect(result).toEqual(
        failure("expected one of abcdefghijklmnopqrstuvwxyz0123456789", "_")
      );
    });
  });

  describe("word parser", () => {
    const parser = word;

    it("should parse a single word", () => {
      const result = parser("hello");
      expect(result).toEqual(success("hello", ""));
    });

    it("should fail if no word characters found", () => {
      const result = parser("123");
      expect(result).toEqual(
        failure("expected at least one match", "123")
      );
    });
  });

  describe("number parser", () => {
    const parser = num;

    it("should parse a single number", () => {
      const result = parser("123");
      expect(result).toEqual(success("123", ""));
    });

    it("should fail if no number characters found", () => {
      const result = parser("abc");
      expect(result).toEqual(
        failure("expected at least one match", "abc")
      );
    });
  });
});

describe("seq parser - hello world", () => {
  it("multiple char parsers", () => {
    const parser = seq([char("h"), char("e"), char("l"), char("l"), char("o")]);
    const result = parser("hello world");
    expect(result).toEqual(
      captureSuccess("hello", " world", {})
    );
  });

  it("multiple str parsers", () => {
    const parser = seq([str("hello"), space, str("world")]);
    const result = parser("hello world");
    expect(result).toEqual(
      captureSuccess("hello world", "", {})
    );
  });

  it("multiple str parsers + capture", () => {
    const parser = seq([str("hello"), space, capture(str("world"), "name")]);
    const result = parser("hello world");
    expect(result).toEqual(
      captureSuccess("hello world", "", { name: "world" })
    );
  });
});

describe("quote parser", () => {
  test("quote parser - single quote", () => {
    const input = "'";
    const result = quote(input);
    expect(result).toEqual(captureSuccess("'", "", {}));
  });

  test("quote parser - double quote", () => {
    const input = '"';
    const result = quote(input);
    expect(result).toEqual(captureSuccess('"', "", {}));
  });

  test("quote parser - invalid quote", () => {
    const input = "`";
    const result = quote(input);
    expect(result).toEqual(
      failure("unexpected end of input", "`")
    );
  });
});

describe("between parser", () => {
  // Test for between parser
  test("between parser - valid input", () => {
    const open = quote;
    const close = quote;
    const parser = anyChar;
    const input = "'abc'";
    const result = between(open, close, parser)(input);
    expect(result).toEqual(captureSuccess("a", "", {}));
  });

  test("between parser - invalid input", () => {
    const open = quote;
    const close = quote;
    const parser = anyChar;
    const input = "\"abc'";
    const result = between(open, close, parser)(input);
    expect(result).toEqual(
      failure("unexpected end of input", "abc'")
    );
  });
});
