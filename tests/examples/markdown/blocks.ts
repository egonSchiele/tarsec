import {
  seqC,
  seqR,
  capture,
  optional,
  many1Till,
  or,
  manyTillStr,
  count,
  iManyTillStr,
  many,
  many1,
  many1WithJoin,
  map,
  not,
} from "@/lib/combinators";
import {
  str,
  spaces,
  char,
  eof,
  set,
  alphanum,
  oneOf,
  noneOf,
} from "@/lib/parsers";
import { Parser, ParserResult, success } from "@/lib/types";
import { InlineMarkdown } from "./types";
import {
  Heading,
  CodeBlock,
  BlockQuote,
  Image,
  Paragraph,
  HorizontalRule,
} from "./types";
import { failure } from "@/lib/types";
import { inlineMarkdownParser, imageParser } from "./inline";
export { imageParser } from "./inline";

const languageChar = or(alphanum, oneOf("_+#.-"));
const languageTag = many1WithJoin(languageChar);

export const headingParser: Parser<Heading> = seqC(
  set("type", "heading"),
  capture(count(char("#")), "level"),
  spaces,
  capture(many1Till(or(char("\n"), eof)), "content")
);

export const codeBlockParser: Parser<CodeBlock> = seqC(
  set("type", "code-block"),
  str("```"),
  capture(optional(languageTag), "language"),
  optional(spaces),
  capture(manyTillStr("```"), "content"),
  str("```")
);

export const blockQuoteParser: Parser<BlockQuote> = seqC(
  set("type", "block-quote"),
  str(">"),
  spaces,
  capture(manyTillStr("\n"), "content")
);

/* Setext-style headings: a line of content followed by an underline of `=`
 * (level 1) or `-` (level 2), terminated by `\n` or end-of-input. */
const setextLine = many1WithJoin(noneOf("\n"));
const setextH1Underline = map(many1(char("=")), () => 1 as const);
const setextH2Underline = map(many1(char("-")), () => 2 as const);

export const setextHeadingParser: Parser<Heading> = seqC(
  set("type", "heading"),
  capture(setextLine, "content"),
  char("\n"),
  capture(or(setextH1Underline, setextH2Underline), "level"),
  or(char("\n"), eof)
);

/* Horizontal rules:  three-or-more of the same `-`, `*`, or `_`,
 * with optional spaces between, ending in newline or eof. */
const hrSpaces = many(char(" "));
const hrOf = (c: string): Parser<number> =>
  map(
    seqR(
      hrSpaces,
      char(c),
      count(seqR(hrSpaces, char(c))),
      hrSpaces,
      or(char("\n"), eof)
    ),
    (parts) => parts[2] as number
  );

const hrRule = (c: string): Parser<HorizontalRule> => (input) => {
  const res = hrOf(c)(input);
  if (!res.success) return res;
  if (res.result < 2) return failure("need 3+ HR chars", input);
  return { ...res, result: { type: "horizontal-rule" as const } };
};

export const horizontalRuleParser: Parser<HorizontalRule> = or(
  hrRule("-"),
  hrRule("*"),
  hrRule("_")
);

// "\n" followed by zero or more spaces/tabs followed by another "\n" or end of input.
export const blankLine: Parser<unknown> = seqR(
  char("\n"),
  many(oneOf(" \t")),
  or(char("\n"), eof)
);

const paragraphInline: Parser<InlineMarkdown> = map(
  seqR(not(blankLine), inlineMarkdownParser),
  (parts) => parts[1] as InlineMarkdown
);

export function paragraphParser(input: string): ParserResult<Paragraph> {
  const inline = many1(paragraphInline)(input);
  if (!inline.success) {
    return inline;
  }
  return success(
    {
      type: "paragraph",
      content: inline.result,
    },
    inline.rest
  );
}
