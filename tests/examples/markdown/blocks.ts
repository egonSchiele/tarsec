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
  BlockQuoteContent,
  Image,
  Paragraph,
  HorizontalRule,
  List,
  ListItem,
  Table,
  Alignment,
  HTMLBlock,
} from "./types";
import { failure } from "@/lib/types";
import { digit, letter } from "@/lib/parsers";
import { manyTill } from "@/lib/combinators";
import { inlineMarkdownParser, imageParser } from "./inline";
export { imageParser } from "./inline";

const languageChar = or(alphanum, oneOf("_+#.-"));
const languageTag = many1WithJoin(languageChar);

export const headingParser: Parser<Heading> = seqC(
  set("type", "heading"),
  capture(count(char("#")), "level"),
  spaces,
  capture(many1(inlineMarkdownParser), "content"),
  optional(char("\n"))
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
 * (level 1) or `-` (level 2), terminated by `\n` or end-of-input. We capture
 * the first line as a raw string, then re-parse it as inline markdown so the
 * heading's content has the same shape as ATX headings. */
const setextLine = many1WithJoin(noneOf("\n"));
const setextH1Underline = map(many1(char("=")), () => 1 as const);
const setextH2Underline = map(many1(char("-")), () => 2 as const);

const _setextRaw = seqC(
  set("type", "heading"),
  capture(setextLine, "content"),
  char("\n"),
  capture(or(setextH1Underline, setextH2Underline), "level"),
  or(char("\n"), eof)
);

export const setextHeadingParser: Parser<Heading> = map(
  _setextRaw,
  (caps: any) => {
    const inner = many1(inlineMarkdownParser)(caps.content);
    return {
      type: "heading" as const,
      level: caps.level as number,
      content: inner.success
        ? (inner.result as Heading["content"])
        : [{ type: "inline-text" as const, content: caps.content }],
    };
  }
);

/* Lists.
 *
 * `listParserAt(indent)` parses a list whose items are indented by `indent`
 * spaces. Each item is `marker + " " + line content + \n`. Markers are
 * unordered (`-`, `*`, `+`) or ordered (`<digits>.`). After parsing an item,
 * we recursively try to parse a sublist at `indent + 2`. If we find one,
 * it becomes that item's `sublist`. The marker type of the first item locks
 * in `ordered`; a marker-type switch ends the list. */
type Marker = { ord: boolean; start: number };

const unorderedMarker: Parser<Marker> = map(
  oneOf("-*+"),
  () => ({ ord: false, start: 1 })
);

const orderedMarker: Parser<Marker> = map(
  seqR(many1WithJoin(digit), char(".")),
  (parts) => ({ ord: true, start: parseInt(parts[0] as string, 10) })
);

const itemMarker: Parser<Marker> = or(unorderedMarker, orderedMarker);

const indentOf = (n: number): Parser<unknown> =>
  n > 0 ? str(" ".repeat(n)) : str("");

const itemHead = (indent: number): Parser<{ marker: Marker; line: string }> =>
  map(
    seqR(
      indentOf(indent),
      itemMarker,
      char(" "),
      manyTillStr("\n"),
      or(char("\n"), eof)
    ),
    (parts) => ({
      marker: parts[1] as Marker,
      line: parts[3] as string,
    })
  );

function listParserAt(indent: number): Parser<List> {
  return (input) => {
    const items: ListItem[] = [];
    let rest = input;
    let firstMarker: Marker | null = null;

    while (rest.length > 0) {
      const it = itemHead(indent)(rest);
      if (!it.success) break;

      const m = it.result.marker;
      if (firstMarker === null) {
        firstMarker = m;
      } else if (firstMarker.ord !== m.ord) {
        break;
      }

      const inline = many1(inlineMarkdownParser)(it.result.line);
      const content = inline.success
        ? (inline.result as ListItem["content"])
        : [];

      const item: ListItem = { content };
      rest = it.rest;

      // Try to recurse for a sublist at +2 indentation.
      const sub = listParserAt(indent + 2)(rest);
      if (sub.success && sub.rest.length < rest.length) {
        item.sublist = sub.result;
        rest = sub.rest;
      }

      items.push(item);
    }

    if (items.length === 0 || firstMarker === null) {
      return failure("expected a list item", input);
    }
    return success(
      {
        type: "list",
        ordered: firstMarker.ord,
        start: firstMarker.start,
        items,
      },
      rest
    );
  };
}

export const listParser: Parser<List> = listParserAt(0);

/* Tables.
 *
 * Pipe-delimited GFM-style. A table is:
 *
 *   | h1 | h2 |     ← header row
 *   |----|:--:|     ← separator row, with alignment markers
 *   | a  | b  |     ← one or more data rows
 *
 * Each cell is `noneOf("|\n")`. We `map` the captured content to `.trim()`
 * so headers/rows aren't padded with spaces. */
const cellContent = map(many1WithJoin(noneOf("|\n")), (s) => s.trim());

const tableRow: Parser<string[]> = map(
  seqR(
    char("|"),
    many1(map(seqR(cellContent, char("|")), (p) => p[0] as string)),
    or(char("\n"), eof)
  ),
  (parts) => parts[1] as string[]
);

const sepCell: Parser<Alignment> = map(
  seqR(
    many(char(" ")),
    optional(char(":")),
    many1(char("-")),
    optional(char(":")),
    many(char(" "))
  ),
  (parts) => {
    const leftColon = parts[1] !== null;
    const rightColon = parts[3] !== null;
    if (leftColon && rightColon) return "center";
    if (rightColon) return "right";
    if (leftColon) return "left";
    return null;
  }
);

const sepRow: Parser<Alignment[]> = map(
  seqR(
    char("|"),
    many1(map(seqR(sepCell, char("|")), (p) => p[0] as Alignment)),
    or(char("\n"), eof)
  ),
  (parts) => parts[1] as Alignment[]
);

/* HTML blocks (passthrough subset).
 *
 * A line starting with `<` followed by a letter, `/`, `!`, or `?` is treated
 * as the start of a raw HTML block. The block extends until the next blank
 * line or end of input. We don't try to balance tags — the content is kept
 * as a single opaque string so downstream renderers can hand it to an HTML
 * renderer untouched. */
const htmlBlockOpen: Parser<unknown> = seqR(char("<"), or(letter, oneOf("/!?")));

export const htmlBlockParser: Parser<HTMLBlock> = (input) => {
  const peek = htmlBlockOpen(input);
  if (!peek.success) return peek;
  const consume = manyTill(or(blankLine, eof))(input);
  if (!consume.success) return consume;
  return success(
    { type: "html-block", content: consume.result as string },
    consume.rest
  );
};

export const tableParser: Parser<Table> = map(
  seqR(tableRow, sepRow, many1(tableRow)),
  (parts) => ({
    type: "table",
    headers: parts[0] as string[],
    alignments: parts[1] as Alignment[],
    rows: parts[2] as string[][],
  })
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
