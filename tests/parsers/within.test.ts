import { describe, expect, test } from "vitest";
import { manyTill, manyWithJoin, seq, seqR } from "../../lib/combinators";
import { within, char, noneOf, quotedString, str } from "../../lib/parsers";
import { success } from "../../lib/types";

describe("within", () => {
  const quotesParser = within(quotedString);
  test("parses a single double quoted string inside a longer line", () => {
    const input = `this is a "quoted string" so what`;
    const result = quotesParser(input);
    const expectedResult = [
      {
        type: "unmatched",
        value: "this is a ",
      },
      {
        type: "matched",
        value: '"quoted string"',
      },
      {
        type: "unmatched",
        value: " so what",
      },
    ];
    expect(result).toEqual(success(expectedResult, ""));
  });

  test("parses a single single quoted string inside a longer line", () => {
    const input = `this is a 'quoted string' so what`;
    const result = quotesParser(input);
    const expectedResult = [
      {
        type: "unmatched",
        value: "this is a ",
      },
      {
        type: "matched",
        value: `'quoted string'`,
      },
      {
        type: "unmatched",
        value: " so what",
      },
    ];
    expect(result).toEqual(success(expectedResult, ""));
  });

  test("parses many double quoted strings inside a longer line", () => {
    const input = `this is a "quoted string" so "what" ?`;
    const result = quotesParser(input);
    const expectedResult = [
      {
        type: "unmatched",
        value: "this is a ",
      },
      {
        type: "matched",
        value: `"quoted string"`,
      },
      {
        type: "unmatched",
        value: " so ",
      },
      {
        type: "matched",
        value: `"what"`,
      },
      {
        type: "unmatched",
        value: " ?",
      },
    ];
    expect(result).toEqual(success(expectedResult, ""));
  });

  test("parses many single quoted strings inside a longer line", () => {
    const input = `this is a 'quoted string' so 'what' ?`;
    const result = quotesParser(input);
    const expectedResult = [
      {
        type: "unmatched",
        value: "this is a ",
      },
      {
        type: "matched",
        value: `'quoted string'`,
      },
      {
        type: "unmatched",
        value: " so ",
      },
      {
        type: "matched",
        value: `'what'`,
      },
      {
        type: "unmatched",
        value: " ?",
      },
    ];
    expect(result).toEqual(success(expectedResult, ""));
  });

  test("parses many quoted strings next to each other", () => {
    const input = `this is a 'quoted string' 'what'`;
    const result = quotesParser(input);
    const expectedResult = [
      {
        type: "unmatched",
        value: "this is a ",
      },
      {
        type: "matched",
        value: `'quoted string'`,
      },
      {
        type: "unmatched",
        value: " ",
      },

      {
        type: "matched",
        value: `'what'`,
      },
    ];
    expect(result).toEqual(success(expectedResult, ""));
  });
  test("parses many quoted strings next to each other with no space between", () => {
    const input = `this is a 'quoted string''what'`;
    const result = quotesParser(input);
    const expectedResult = [
      {
        type: "unmatched",
        value: "this is a ",
      },
      {
        type: "matched",
        value: `'quoted string'`,
      },
      {
        type: "matched",
        value: `'what'`,
      },
    ];
    expect(result).toEqual(success(expectedResult, ""));
  });
  test("parses many empty quoted strings next to each other with no space between", () => {
    const input = `this is a ''''`;
    const result = quotesParser(input);
    const expectedResult = [
      {
        type: "unmatched",
        value: "this is a ",
      },
      {
        type: "matched",
        value: `''`,
      },
      {
        type: "matched",
        value: `''`,
      },
    ];
    expect(result).toEqual(success(expectedResult, ""));
  });
  test("parses many empty quoted strings next to each other with no space between", () => {
    const input = `this is a '''' end`;
    const result = quotesParser(input);
    const expectedResult = [
      {
        type: "unmatched",
        value: "this is a ",
      },
      {
        type: "matched",
        value: `''`,
      },
      {
        type: "matched",
        value: `''`,
      },
      {
        type: "unmatched",
        value: " end",
      },
    ];
    expect(result).toEqual(success(expectedResult, ""));
  });

  test("fails on mismatched quotes", () => {
    const input = `this is a '''`;
    const result = quotesParser(input);
    const expectedResult = [
      {
        type: "unmatched",
        value: "this is a ",
      },
      {
        type: "matched",
        value: "''",
      },
      {
        type: "unmatched",
        value: "'",
      },
    ];
    expect(result).toEqual(success(expectedResult, ""));
  });
  test("fails on mismatched quotes", () => {
    const input = `this is a " hi`;
    const result = quotesParser(input);
    const expectedResult = [
      {
        type: "unmatched",
        value: 'this is a " hi',
      },
    ];
    expect(result).toEqual(success(expectedResult, ""));
  });

  /*
  We intentionally don't match the start and end separator.
  So even though we initially matched a double quote,
  that doesn't mean the end separator will also be a double quote.
  We do this to be able to support strings like `[test]`
  where the start and end are different.
  */
  test("doesn't handle nested quotes", () => {
    const input = `this is a "nested 'quote'"`;
    const result = quotesParser(input);
    const expectedResult = [
      {
        type: "unmatched",
        value: "this is a ",
      },
      {
        type: "matched",
        value: "\"nested '",
      },
      {
        type: "unmatched",
        value: "quote",
      },
      {
        type: "matched",
        value: "'\"",
      },
    ];
    expect(result).toEqual(success(expectedResult, ""));
  });
});

describe("brackets/braces", () => {
  const bracketedString = seq(
    [char("["), manyWithJoin(noneOf(`]`)), char("]")],
    (results: string[]) => results.join("")
  );

  const parser = within(bracketedString);
  test("parses a single bracketed string inside a longer line", () => {
    const input = `this is a [bracketed string] so what`;
    const result = parser(input);
    const expectedResult = [
      {
        type: "unmatched",
        value: "this is a ",
      },
      {
        type: "matched",
        value: "[bracketed string]",
      },
      {
        type: "unmatched",
        value: " so what",
      },
    ];
    expect(result).toEqual(success(expectedResult, ""));
  });
  test("parses string with just a bracketed word", () => {
    const input = `[what]`;
    const result = parser(input);
    const expectedResult = [
      {
        type: "matched",
        value: "[what]",
      },
    ];
    expect(result).toEqual(success(expectedResult, ""));
  });
});

describe("markdown", () => {
  const boldedString = seq(
    [str("***"), manyWithJoin(noneOf(`*`)), str("***")],
    (results: string[]) => results.join("")
  );

  test("parses a single bold string inside a longer line", () => {
    const parser = within(boldedString);
    const input = `this is a ***bold string*** so what`;
    const result = parser(input);
    const expectedResult = [
      {
        type: "unmatched",
        value: "this is a ",
      },
      {
        type: "matched",
        value: "***bold string***",
      },
      {
        type: "unmatched",
        value: " so what",
      },
    ];
    expect(result).toEqual(success(expectedResult, ""));
  });
  test("parses a code block over multiple lines", () => {
    const boldedString = seq(
      [str("```"), manyTill(str("```")), str("```")],
      (results: string[]) => results.join("")
    );
    const parser = within(boldedString);
    const input = `this is a code block
\`\`\`
code block
\`\`\`
so what`;
    const result = parser(input);
    const expectedResult = [
      {
        type: "unmatched",
        value: "this is a code block\n",
      },
      {
        type: "matched",
        value: "```\ncode block\n```",
      },
      {
        type: "unmatched",
        value: "\nso what",
      },
    ];
    expect(result).toEqual(success(expectedResult, ""));
  });
});
describe("parsing objects", () => {
  test("successfully uses a parser that returns an object instead of a string", () => {
    const boldedString = seqR(str("```"), manyTill(str("```")), str("```"));
    const parser = within(boldedString);
    const input = `this is a code block
\`\`\`
code block
\`\`\`
so what`;
    const result = parser(input);
    const expectedResult = [
      {
        type: "unmatched",
        value: "this is a code block\n",
      },
      {
        type: "matched",
        value: ["```", "\ncode block\n", "```"],
      },
      {
        type: "unmatched",
        value: "\nso what",
      },
    ];
    expect(result).toEqual(success(expectedResult, ""));
  });
});
