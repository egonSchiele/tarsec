import { describe, expect, it } from "vitest";
import {
  alphanum,
  char,
  digit,
  letter,
  many,
  many1,
  noneOf,
  not,
  num,
  oneOf,
  optional,
  or,
  seq,
  space,
  spaces,
  str,
  word,
} from "./parsers";
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

describe("Parser Tests", () => {
  describe("many parser", () => {
    const parser = many(digit);

    it("should parse multiple digits", () => {
      const result = parser("1234");
      expect(result).toEqual(success({ rest: "", match: "1234" }));
    });

    it("should return an empty string if no matches found", () => {
      const result = parser("abc");
      expect(result).toEqual(success({ rest: "abc", match: "" }));
    });
  });

  describe("many1 parser", () => {
    const parser = many1(digit);

    it("should parse multiple digits", () => {
      const result = parser("1234");
      expect(result).toEqual(success({ rest: "", match: "1234" }));
    });

    it("should fail if no matches found", () => {
      const result = parser("abc");
      expect(result).toEqual(
        failure({ rest: "abc", message: "expected at least one match" })
      );
    });
  });

  describe("oneOf parser", () => {
    const parser = oneOf("abc");

    it("should parse any one of the given characters", () => {
      const result = parser("b");
      expect(result).toEqual(success({ rest: "", match: "b" }));
    });

    it("should fail if none of the characters match", () => {
      const result = parser("d");
      expect(result).toEqual(
        failure({ rest: "d", message: "expected one of abc" })
      );
    });
  });

  describe("noneOf parser", () => {
    const parser = noneOf("xyz");

    it("should parse any character that is not one of the given characters", () => {
      const result = parser("a");
      expect(result).toEqual(success({ rest: "", match: "a" }));
    });

    it("should fail if any of the given characters match", () => {
      const result = parser("x");
      expect(result).toEqual(
        failure({ rest: "x", message: "expected none of xyz" })
      );
    });
  });

  describe("or parser", () => {
    const parser = or(char("a"), char("b"));

    it("should parse the first parser if it succeeds", () => {
      const result = parser("a");
      expect(result).toEqual(success({ rest: "", match: "a" }));
    });

    it("should parse the second parser if the first one fails", () => {
      const result = parser("b");
      expect(result).toEqual(success({ rest: "", match: "b" }));
    });

    it("should fail if all parsers fail", () => {
      const result = parser("c");
      expect(result).toEqual(
        failure({ rest: "c", message: "all parsers failed" })
      );
    });
  });

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
      const parser2 = optional(seq(many1(letter), char("!")));
      const result1 = parser2("hello!");
      expect(result1).toEqual(success({ rest: "", match: "hello!" }));

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
  const parser = seq(char("a"), char("b"));

  it("should parse both characters in sequence", () => {
    const result = parser("ab");
    expect(result).toEqual(success({ rest: "", match: "ab" }));
  });

  it("should fail if any of the parsers fail", () => {
    const result = parser("ac");
    expect(result).toEqual(
      failure({ rest: "c", message: "expected b, got c" })
    );
  });
});

/* test("quote parser - single quote", () => {
  const input = "'";
  const result = quote(input);
  expect(result).toEqual(success({ rest: "", match: "'", matches: {} }));
});

test("quote parser - double quote", () => {
  const input = '"';
  const result = quote(input);
  expect(result).toEqual(success({ rest: "", match: '"', matches: {} }));
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
  expect(result).toEqual(success({ rest: "bc", match: "a", matches: {} }));
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
  expect(result).toEqual(success({ rest: "", match: "a", matches: {} }));
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
  expect(result).toEqual(success({ rest: "", match: "abc", matches: {} }));
});

test("sepBy parser - invalid input", () => {
  const separator = quote;
  const parser = anyChar;
  const input = '"a"bc';
  const result = sepBy(separator, parser)(input);
  expect(result).toEqual(success({ rest: "bc", match: "a", matches: {} }));
});
 */
