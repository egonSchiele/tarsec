import {
  seqC,
  seqR,
  capture,
  optional,
  or,
  manyTillStr,
  many1Till,
  exactly,
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
import { Parser } from "@/lib/types";
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
import { digit, letter } from "@/lib/parsers";
import { manyTill } from "@/lib/combinators";
import { inlineMarkdownParser, imageParser } from "./inline";
export { imageParser } from "./inline";

const languageChar = or(alphanum, oneOf("_+#.-"));
const languageTag = many1WithJoin(languageChar);

/* ATX heading marker: 1–6 consecutive `#`, not followed by another `#`.
 * Try widest first so `###` doesn't parse as level 1 and leave `##` behind.
 * `not(char("#"))` rejects 7+ `#` runs (they fall through to a paragraph). */
const atxMarker: Parser<number> = or(
  ...[6, 5, 4, 3, 2, 1].map(
    (n): Parser<number> =>
      map(seqR(exactly(n, char("#")), not(char("#"))), () => n)
  )
);

/* An optional trailing run of `#`s on an ATX heading: at least one separating
 * space, one or more `#`, optional trailing spaces, then end-of-line. */
const trailingHashRun: Parser<unknown> = seqR(
  many1(char(" ")),
  many1(char("#")),
  many(char(" ")),
  or(char("\n"), eof)
);

/* The heading body — everything up to (but not including) either the line end
 * or a trailing `#` run. We capture this as a raw string then re-parse it as
 * inline markdown so the body shape matches ATX/setext headings. */
const headingBody: Parser<string> = many1Till(or(char("\n"), trailingHashRun));

export const headingParser: Parser<Heading> = map(
  seqC(
    capture(atxMarker, "level"),
    spaces,
    capture(headingBody, "body"),
    optional(trailingHashRun),
    optional(char("\n"))
  ),
  ({ level, body }) => {
    const inner = many1(inlineMarkdownParser)(body as string);
    return {
      type: "heading" as const,
      level: level as number,
      content: inner.success
        ? (inner.result as Heading["content"])
        : [{ type: "inline-text" as const, content: body as string }],
    };
  }
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
  seqC(
    char(">"),
    optional(char(" ")),
    capture(manyTillStr("\n"), "line"),
    or(char("\n"), eof)
  ),
  ({ line }) => line
);

// Inside the joined inner text, accept either a nested blockquote (possibly
// after a leading newline), a soft newline between lines, or any inline node.
const softNewline: Parser<InlineMarkdown> = map(
  char("\n"),
  () => ({ type: "inline-text" as const, content: " " })
);

const nestedBlockQuote: Parser<BlockQuote> = lazy(() =>
  map(
    seqC(many(char("\n")), capture(blockQuoteParser, "quote")),
    ({ quote }) => quote
  )
);

const blockQuoteContent: Parser<BlockQuoteContent> = or(
  nestedBlockQuote,
  softNewline,
  inlineMarkdownParser
);

// Re-parse the joined inner text as a sequence of blockquote-content nodes.
// (We have to round-trip through a string because the `>` prefixes need to be
//  stripped before nested blockquotes can be recognised.)
const reparseInner = (innerText: string): BlockQuoteContent[] => {
  const inner = many1(blockQuoteContent)(innerText);
  return inner.success ? (inner.result as BlockQuoteContent[]) : [];
};

export const blockQuoteParser: Parser<BlockQuote> = map(
  many1(blockQuoteLine),
  (lines) => ({
    type: "block-quote",
    content: reparseInner((lines as string[]).join("\n")),
  })
);

/* Indented code block: one or more consecutive lines beginning with 4 spaces
 * or a tab. The indent is stripped from each line. */
const indentPrefix = or(str("    "), char("\t"));
const indentedLine: Parser<string> = map(
  seqC(
    indentPrefix,
    capture(manyTillStr("\n"), "line"),
    or(char("\n"), eof)
  ),
  ({ line }) => line + "\n"
);

const indentedLines: Parser<string> = map(many1(indentedLine), (lines) =>
  lines.join("")
);

export const indentedCodeBlockParser: Parser<CodeBlock> = seqC(
  set("type", "code-block"),
  set("language", null),
  capture(indentedLines, "content")
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
 * Each item is `marker + " " + line content + \n`. Markers are unordered
 * (`-`, `*`, `+`) or ordered (`<digits>.`). After parsing an item, we
 * recursively try to parse a sublist at `indent + 2`. The marker type of the
 * first item (ordered vs unordered) locks in the whole list; a marker-type
 * switch ends the list.
 *
 * We build two list parsers — one parameterised by `unorderedMarker`, one
 * by `orderedMarker` — and `or` them. That way the marker-type lock falls
 * out of `seqC` naturally; no manual loop / state needed. */
type Marker = { ord: boolean; start: number };

const unorderedMarker: Parser<Marker> = map(
  oneOf("-*+"),
  () => ({ ord: false, start: 1 })
);

const orderedMarker: Parser<Marker> = map(
  seqC(capture(many1WithJoin(digit), "digits"), char(".")),
  ({ digits }) => ({ ord: true, start: parseInt(digits, 10) })
);

const indentOf = (n: number): Parser<unknown> =>
  n > 0 ? str(" ".repeat(n)) : str("");

type RawItem = { marker: Marker; line: string };

const itemHeadOf = (
  indent: number,
  markerParser: Parser<Marker>
): Parser<RawItem> =>
  seqC(
    indentOf(indent),
    capture(markerParser, "marker"),
    char(" "),
    capture(manyTillStr("\n"), "line"),
    or(char("\n"), eof)
  );

const parseInline = (line: string): InlineMarkdown[] => {
  const inline = many1(inlineMarkdownParser)(line);
  return inline.success ? (inline.result as InlineMarkdown[]) : [];
};

// One list item: an item-head followed by an optional sublist at +2 indent.
const itemWithSublist = (
  indent: number,
  markerParser: Parser<Marker>
): Parser<{ marker: Marker; item: ListItem }> =>
  map(
    seqC(
      capture(itemHeadOf(indent, markerParser), "raw"),
      capture(optional(lazy(() => listParserAt(indent + 2))), "sublist")
    ),
    ({ raw, sublist }) => {
      const item: ListItem = { content: parseInline(raw.line) };
      if (sublist) item.sublist = sublist;
      return { marker: raw.marker, item };
    }
  );

// A list of one or more items that all share a marker family.
const listOf = (
  indent: number,
  markerParser: Parser<Marker>
): Parser<List> =>
  map(
    seqC(
      capture(itemWithSublist(indent, markerParser), "first"),
      capture(many(itemWithSublist(indent, markerParser)), "rest")
    ),
    ({ first, rest }) => ({
      type: "list",
      ordered: first.marker.ord,
      start: first.marker.start,
      items: [first.item, ...rest.map((r) => r.item)],
    })
  );

const listParserAt = (indent: number): Parser<List> =>
  or(listOf(indent, unorderedMarker), listOf(indent, orderedMarker));

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

const cellThenBar: Parser<string> = map(
  seqC(capture(cellContent, "cell"), char("|")),
  ({ cell }) => cell
);

const tableRow: Parser<string[]> = map(
  seqC(char("|"), capture(many1(cellThenBar), "cells"), or(char("\n"), eof)),
  ({ cells }) => cells as string[]
);

const sepCell: Parser<Alignment> = map(
  seqC(
    many(char(" ")),
    capture(optional(char(":")), "left"),
    many1(char("-")),
    capture(optional(char(":")), "right"),
    many(char(" "))
  ),
  ({ left, right }) => {
    const leftColon = left !== null;
    const rightColon = right !== null;
    if (leftColon && rightColon) return "center";
    if (rightColon) return "right";
    if (leftColon) return "left";
    return null;
  }
);

const sepCellThenBar: Parser<Alignment> = map(
  seqC(capture(sepCell, "cell"), char("|")),
  ({ cell }) => cell
);

const sepRow: Parser<Alignment[]> = map(
  seqC(char("|"), capture(many1(sepCellThenBar), "cells"), or(char("\n"), eof)),
  ({ cells }) => cells as Alignment[]
);

/* HTML blocks (passthrough subset).
 *
 * A line starting with `<` followed by a letter, `/`, `!`, or `?` is treated
 * as the start of a raw HTML block. The block extends until the next blank
 * line or end of input. We don't try to balance tags — the content is kept
 * as a single opaque string so downstream renderers can hand it to an HTML
 * renderer untouched. */
const htmlBlockOpen: Parser<unknown> = seqR(char("<"), or(letter, oneOf("/!?")));

// "\n" followed by zero or more spaces/tabs followed by another "\n" or end of input.
export const blankLine: Parser<unknown> = seqR(
  char("\n"),
  many(oneOf(" \t")),
  or(char("\n"), eof)
);

// Peek at the opening (`not(not(...))` is a non-consuming lookahead), then
// consume everything up to the next blank line or eof.
export const htmlBlockParser: Parser<HTMLBlock> = seqC(
  set("type", "html-block"),
  not(not(htmlBlockOpen)),
  capture(manyTill(or(blankLine, eof)), "content")
);

export const tableParser: Parser<Table> = seqC(
  set("type", "table"),
  capture(tableRow, "headers"),
  capture(sepRow, "alignments"),
  capture(many1(tableRow), "rows")
);

/* Horizontal rules:  three-or-more of the same `-`, `*`, or `_`,
 * with optional spaces between, ending in newline or eof. The "three or
 * more" rule is expressed structurally — three explicit `char(c)`s followed
 * by `many` more — so no count-and-validate wrapper is needed. */
const hrSpaces = many(char(" "));
const hrOf = (c: string): Parser<HorizontalRule> =>
  map(
    seqR(
      hrSpaces,
      char(c), hrSpaces,
      char(c), hrSpaces,
      char(c), hrSpaces,
      many(seqR(char(c), hrSpaces)),
      or(char("\n"), eof)
    ),
    () => ({ type: "horizontal-rule" as const })
  );

export const horizontalRuleParser: Parser<HorizontalRule> = or(
  hrOf("-"),
  hrOf("*"),
  hrOf("_")
);

// "\n" followed by zero or more spaces/tabs followed by another "\n" or end of input.
// (`blankLine` is declared near `htmlBlockParser` above, since both need it at
//  module-eval time.)

const paragraphInline: Parser<InlineMarkdown> = map(
  seqC(not(blankLine), capture(inlineMarkdownParser, "node")),
  ({ node }) => node as InlineMarkdown
);

export const paragraphParser: Parser<Paragraph> = map(
  many1(paragraphInline),
  (content) => ({ type: "paragraph", content: content as InlineMarkdown[] })
);
