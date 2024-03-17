import { describe, expect, it, test } from "vitest";
import {
  alphanum,
  digit,
  letter,
  noneOf,
  num,
  oneOf,
  space,
  spaces,
  str,
  word,
} from "./parsers";
import { char } from "./char";
import { success, failure } from "../vitest.globals.js";
import {
  capture,
  many,
  many1,
  many1WithJoin,
  not,
  optional,
  or,
  seq,
} from "./combinators";
test.skip("hello", () => {
  describe("Parser Tests", () => {
    describe("optional parser", () => {
      const parser = optional(char("a"));

      it("should parse the character if it exists", () => {
        const result = parser("a");
        expect(result).toEqual(success({ rest: "", match: "a" }));
      });

      it("should return an empty string if the character is missing", () => {
        const result = parser("b");
        expect(result).toEqual(success({ rest: "b", match: "" }));
      });

      it("should not consume any input if it fails", () => {
        // @ts-ignore
        const parser2 = optional(seq(many1WithJoin(letter), char("!")));
        const result1 = parser2("hello!");
        expect(result1).toEqual(
          success({ rest: "", match: "hello!", captures: {} })
        );

        const result2 = parser2("hello");
        expect(result2).toEqual(success({ rest: "hello", match: "" }));
      });
    });

    describe("not parser", () => {
      const parser = not(char("a"));

      it("should fail if the character is present", () => {
        const result = parser("a");
        expect(result).toEqual(
          failure({ rest: "a", message: "unexpected match" })
        );
      });

      it("should return an empty string if the character is missing", () => {
        const result = parser("b");
        expect(result).toEqual(success({ rest: "b", match: "" }));
      });
    });

    describe("space parser", () => {
      it("should parse a space character", () => {
        const result = space(" ");
        expect(result).toEqual(success({ rest: "", match: " " }));
      });

      it("should fail if the character is not a space", () => {
        const result = space("a");
        expect(result).toEqual(
          failure({ rest: "a", message: "expected  , got a" })
        );
      });
    });

    describe("spaces parser", () => {
      it("should parse multiple space characters", () => {
        const result = spaces("  ");
        expect(result).toEqual(success({ rest: "", match: "  " }));
      });

      it("should fail if no space characters found", () => {
        const result = spaces("abc");
        expect(result).toEqual(
          failure({ rest: "abc", message: "expected at least one match" })
        );
      });
    });

    describe("digit parser", () => {
      it("should parse a single digit", () => {
        const result = digit("1");
        expect(result).toEqual(success({ rest: "", match: "1" }));
      });

      it("should fail if the character is not a digit", () => {
        const result = digit("a");
        expect(result).toEqual(
          failure({ rest: "a", message: "expected one of 0123456789" })
        );
      });
    });

    describe("letter parser", () => {
      it("should parse a single letter", () => {
        const result = letter("a");
        expect(result).toEqual(success({ rest: "", match: "a" }));
      });

      it("should fail if the character is not a letter", () => {
        const result = letter("1");
        expect(result).toEqual(
          failure({
            rest: "1",
            message: "expected one of abcdefghijklmnopqrstuvwxyz",
          })
        );
      });
    });

    describe("alphanum parser", () => {
      it("should parse a single alphanumeric character", () => {
        const result = alphanum("1");
        expect(result).toEqual(success({ rest: "", match: "1" }));
      });

      it("should fail if the character is not alphanumeric", () => {
        const result = alphanum("_");
        expect(result).toEqual(
          failure({
            rest: "_",
            message: "expected one of abcdefghijklmnopqrstuvwxyz0123456789",
          })
        );
      });
    });

    describe("word parser", () => {
      const parser = word;

      it("should parse a single word", () => {
        const result = parser("hello");
        expect(result).toEqual(success({ rest: "", match: "hello" }));
      });

      it("should fail if no word characters found", () => {
        const result = parser("123");
        expect(result).toEqual(
          failure({ rest: "123", message: "expected at least one match" })
        );
      });
    });

    describe("number parser", () => {
      const parser = num;

      it("should parse a single number", () => {
        const result = parser("123");
        expect(result).toEqual(success({ rest: "", match: "123" }));
      });

      it("should fail if no number characters found", () => {
        const result = parser("abc");
        expect(result).toEqual(
          failure({ rest: "abc", message: "expected at least one match" })
        );
      });
    });
  });

  describe("seq parser", () => {
    const parser = seq([char("a"), char("b")]);

    it("should parse both characters in sequence", () => {
      const result = parser("ab");
      expect(result).toEqual(success({ rest: "", match: "ab", captures: {} }));
    });

    it("should fail if any of the parsers fail", () => {
      const result = parser("ac");
      expect(result).toEqual(
        failure({ rest: "c", message: "expected b, got c" })
      );
    });
  });

  describe("seq parser - hello world", () => {
    it("multiple char parsers", () => {
      const parser = seq([
        char("h"),
        char("e"),
        char("l"),
        char("l"),
        char("o"),
      ]);
      const result = parser("hello world");
      expect(result).toEqual(
        success({ match: "hello", rest: " world", captures: {} })
      );
    });

    it("multiple str parsers", () => {
      const parser = seq([str("hello"), space, str("world")]);
      const result = parser("hello world");
      expect(result).toEqual(
        success({ match: "hello world", rest: "", captures: {} })
      );
    });

    it("multiple str parsers + capture", () => {
      const parser = seq([str("hello"), space, capture(str("world"), "name")]);
      const result = parser("hello world");
      expect(result).toEqual(
        success({ match: "hello world", rest: "", captures: { name: "world" } })
      );
    });
  });

  /* test("quote parser - single quote", () => {
  const input = "'";
  const result = quote(input);
  expect(result).toEqual(success({ rest: "", match: "'", captures: {} }));
});

test("quote parser - double quote", () => {
  const input = '"';
  const result = quote(input);
  expect(result).toEqual(success({ rest: "", match: '"', captures: {} }));
});

test("quote parser - invalid quote", () => {
  const input = "`";
  const result = quote(input);
  expect(result).toEqual(
    failure({ rest: "`", message: "unexpected end of input" })
  );
});

// Test for anyChar parser
test("anyChar parser - non-empty input", () => {
  const input = "abc";
  const result = anyChar(input);
  expect(result).toEqual(success({ rest: "bc", match: "a", captures: {} }));
});

test("anyChar parser - empty input", () => {
  const input = "";
  const result = anyChar(input);
  expect(result).toEqual(
    failure({ rest: "", message: "unexpected end of input" })
  );
});

// Test for between parser
test("between parser - valid input", () => {
  const open = quote;
  const close = quote;
  const parser = anyChar;
  const input = "'abc'";
  const result = between(open, close, parser)(input);
  expect(result).toEqual(success({ rest: "", match: "a", captures: {} }));
});

test("between parser - invalid input", () => {
  const open = quote;
  const close = quote;
  const parser = anyChar;
  const input = "\"abc'";
  const result = between(open, close, parser)(input);
  expect(result).toEqual(
    failure({ rest: "abc'", message: "unexpected end of input" })
  );
});

// Test for sepBy parser
test("sepBy parser - valid input", () => {
  const separator = anyChar;
  const parser = anyChar;
  const input = "a,b,c";
  const result = sepBy(separator, parser)(input);
  expect(result).toEqual(success({ rest: "", match: "abc", captures: {} }));
});

test("sepBy parser - invalid input", () => {
  const separator = quote;
  const parser = anyChar;
  const input = '"a"bc';
  const result = sepBy(separator, parser)(input);
  expect(result).toEqual(success({ rest: "bc", match: "a", captures: {} }));
});
 */
});
