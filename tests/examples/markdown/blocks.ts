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
  lazy,
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

/* Multi-line and nested block quotes.
 *
 *  - Consume consecutive lines beginning with "> " (the space is optional).
 *  - Join their stripped content with newlines.
 *  - Recursively re-parse the inner text: a sub-blockquote OR inline markdown.
 *
 *  `lazy` defers the self-reference so we can recurse for nesting. */
const blockQuoteLine: Parser<string> = map(
  seqR(
    char(">"),
    optional(char(" ")),
    manyTillStr("\n"),
    or(char("\n"), eof)
  ),
  (parts) => parts[2] as string
);

// Inside the joined inner text, accept either a nested blockquote (possibly
// after a leading newline), a soft newline between lines, or any inline node.
const softNewline: Parser<InlineMarkdown> = map(
  char("\n"),
  () => ({ type: "inline-text" as const, content: " " })
);

const blockQuoteContent: Parser<unknown> = lazy(() =>
  or(
    map(seqR(many(char("\n")), blockQuoteParser), (parts) => parts[1] as BlockQuote),
    softNewline,
    inlineMarkdownParser
  )
);

export const blockQuoteParser: Parser<BlockQuote> = (input) => {
  const lines = many1(blockQuoteLine)(input);
  if (!lines.success) return lines;
  const innerText = (lines.result as string[]).join("\n");
  const inner = many1(blockQuoteContent)(innerText);
  const content = inner.success ? (inner.result as BlockQuoteContent[]) : [];
  return success({ type: "block-quote", content }, lines.rest);
};

/* Indented code block: one or more consecutive lines beginning with 4 spaces
 * or a tab. The indent is stripped from each line. */
const indentPrefix = or(str("    "), char("\t"));
const indentedLine: Parser<string> = map(
  seqR(indentPrefix, manyTillStr("\n"), or(char("\n"), eof)),
  (parts) => (parts[1] as string) + "\n"
);

export const indentedCodeBlockParser: Parser<CodeBlock> = map(
  many1(indentedLine),
  (lines) => ({
    type: "code-block" as const,
    language: null,
    content: (lines as string[]).join(""),
  })
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
