import { describe, expect, test } from "vitest";
import {
  getResults,
  manyTill,
  optional,
  or,
  search,
  seq,
  transform,
} from "../../lib/combinators";
import {
  anyChar,
  char,
  eof,
  quotedString,
  space,
  str,
} from "../../lib/parsers";
import { success, failure, Parser, ParserSuccess } from "../../lib/types";
import { seqR } from "../../lib/combinators";

const _siteParser: Parser<["site:", string | null, string]> = seqR(
  str("site:"),
  optional(space),
  manyTill(or(str(" "), eof))
);
const siteParser = transform(_siteParser, (results) =>
  results.filter(Boolean).join("")
);
const notParser = transform(
  seqR(char("-"), manyTill(or(str(" "), eof))),
  (results: string[]) => results.join("")
);

describe("search", () => {
  test("search parser with anyChar", () => {
    const parser = anyChar;
    const input = "abc";
    const result = search(parser)(input);
    expect(result).toEqual(success(["a", "b", "c"], ""));
  });

  test("search parser - no matches", () => {
    const parser = str("a");
    const input = "bbb ccc";
    const result = search(parser)(input);
    expect(result).toEqual(success([], "bbb ccc"));
  });

  test("search parser with quotedString", () => {
    const input = `"hi" there 'how' are "you"`;
    const result = search(quotedString)(input);
    expect(result).toEqual(
      success([`"hi"`, `'how'`, `"you"`], " there   are ")
    );
  });

  test("search parser with quotedString in seq", () => {
    const input = `"hi" there 'how' are "you"`;
    const seqParser = seq([search(quotedString)], getResults);
    const result = seqParser(input);
    expect(result).toEqual(
      success([[`"hi"`, `'how'`, `"you"`]], " there   are ")
    );
  });

  test("siteParser", () => {
    const input = `site:adit.io`;
    const result = siteParser(input);
    expect(result).toEqual(success("site:adit.io", ""));
  });

  test("notParser", () => {
    const input = `-foo`;
    const result = notParser(input);
    expect(result).toEqual(success("-foo", ""));
  });

  test("notParser in search in seq", () => {
    const parser = seq([search(notParser)], getResults);
    const input = `-foo`;
    const result = parser(input);
    expect(result).toEqual(success([["-foo"]], ""));
  });

  test("search with seq", () => {
    const input = "site:adit.io -hey 'hello there' -foo";
    const parser = seq(
      [search(quotedString), search(siteParser), search(notParser)],
      getResults
    );
    const result = parser(input);
    const expectedResult = [
      ["'hello there'"],
      ["site:adit.io"],
      ["-hey", "-foo"],
    ];
    expect(result.success).toEqual(true);
    expect((result as ParserSuccess<string[][]>).result).toEqual(
      expectedResult
    );
  });
});
