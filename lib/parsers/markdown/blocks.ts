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
} from "../../combinators.js";
import {
  str,
  spaces,
  char,
  eof,
  set,
  alphanum,
  oneOf,
  noneOf,
  newline,
} from "../../parsers.js";
import { Parser, success, failure } from "../../types.js";
import { InlineMarkdown } from "./types.js";
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
  Block,
} from "./types.js";
import {
  linkDefinitionParser,
  footnoteDefinitionParser,
} from "./references.js";
import { digit, letter } from "../../parsers.js";
import { manyTill } from "../../combinators.js";
import { inlineMarkdownParser, imageParser, softBreakParser } from "./inline.js";
export { imageParser } from "./inline.js";

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
 * A list item is a container of blocks. Its body spans the first line and any
 * subsequent lines indented to the continuation column k = c + m + 1, where c
 * is the marker column and m is the marker width. The marker family (ordered
 * vs unordered) is locked by the first item; later items whose family doesn't
 * match end the list.
 *
 * The body lines are stripped of their k-space indent (via `indentOf(k)`) as
 * part of the parse, joined, and reparsed through the top-level block
 * dispatcher (`blockEntry`). Nested lists, code blocks, paragraphs, etc.
 * inside an item fall out of that reparse — no special case for sublists. */
type Marker = { ord: boolean; start: number; width: number };

const unorderedMarker: Parser<Marker> = map(
  oneOf("-*+"),
  () => ({ ord: false, start: 1, width: 1 })
);

const orderedMarker: Parser<Marker> = map(
  seqC(capture(many1WithJoin(digit), "digits"), char(".")),
  ({ digits }) => ({
    ord: true,
    start: parseInt(digits, 10),
    width: digits.length + 1,
  })
);

const anyMarker: Parser<Marker> = or(unorderedMarker, orderedMarker);

const indentOf = (n: number): Parser<unknown> =>
  n > 0 ? str(" ".repeat(n)) : str("");

/* GFM task-list checkbox: `[ ]` (unchecked), `[x]` or `[X]` (checked).
 * Must be followed by a single space (consumed) to count as a checkbox. */
const taskCheckbox: Parser<boolean> = map(
  seqC(
    char("["),
    capture(or(char(" "), char("x"), char("X")), "mark"),
    str("] ")
  ),
  ({ mark }) => mark !== " "
);

/* The first line of an item's content — everything after the marker+space
 * (and optional checkbox), up to `\n`. */
const itemFirstLine: Parser<string> = map(
  seqC(capture(manyTillStr("\n"), "line"), or(char("\n"), eof)),
  ({ line }) => line
);

/* A continuation line: exactly k spaces of indent, then the rest of the line.
 * The strip IS the parse — `indentOf(k)` consumes the leading indent. */
const continuationLine = (k: number): Parser<string> =>
  map(
    seqC(indentOf(k), capture(manyTillStr("\n"), "line"), or(char("\n"), eof)),
    ({ line }) => line
  );

/* A blank line at line-start. `blocks.ts` already defines `blankLine` below,
 * but that variant starts with `\n` (designed for inter-block separators).
 * Here we're already past the previous `\n`, so we need a line-start variant.
 *
 * We do NOT allow `eof` here: at end-of-input with no trailing whitespace
 * this would succeed without consuming anything, and `many(itemContentLine(k))`
 * would either spin or append a phantom blank. The final line of an item body
 * is handled by `continuationLine`'s own `or(char("\n"), eof)`. The matched
 * value isn't used as data; itemBody normalises blanks to "". */
const blankContinuation: Parser<unknown> = seqR(
  many(oneOf(" \t")),
  char("\n")
);

/* One line of item body (after the first). Heterogeneous return type:
 *   - continuationLine -> string (the dedented line text)
 *   - blankContinuation -> unknown (discardable seqR output)
 * itemBody normalises blanks to "" inline so a wrapper `map` is unnecessary. */
const itemContentLine = (k: number): Parser<string | unknown> =>
  or(continuationLine(k), blankContinuation);

/* Reparse an item's collected body as a sequence of blocks via `blockEntry`.
 *
 * List item bodies can legitimately begin with blank lines — e.g.
 * `- \n\n  - inner` collects `"\n- inner"`, and `- ` alone collects `"\n"`.
 * Strip leading newlines (they carry no AST content) before handing to
 * `many1(blockEntry)`. After trimming, the invariant `non-empty buf =>
 * at least one block` holds (CommonMark falls back to a paragraph), so a
 * parse failure here is a genuine parser bug worth surfacing. */
const reparseBlocks = (buf: string): Block[] => {
  const trimmed = buf.replace(/^\n+/, "");
  if (trimmed === "") return [];
  const r = many1(lazy(() => blockEntry))(trimmed);
  if (!r.success) {
    throw new Error(
      `reparseBlocks: failed on non-empty buffer: ${JSON.stringify(trimmed)}`
    );
  }
  return r.result as Block[];
};

/* Full item content: first line + zero-or-more continuation lines, joined
 * with `\n` and reparsed. */
const itemBody = (k: number): Parser<Block[]> =>
  map(
    seqC(
      capture(itemFirstLine, "first"),
      capture(many(itemContentLine(k)), "rest")
    ),
    ({ first, rest }) => {
      const lines = [
        first,
        ...rest.map((r) => (typeof r === "string" ? r : "")),
      ];
      return reparseBlocks(lines.join("\n"));
    }
  );

type ParsedItem = { marker: Marker; item: ListItem };

/* Item parser at marker column c. Handwritten because `k` is derived from the
 * parsed marker's width — `seqC` runs its children in fixed order with no data
 * flow between them, so we sequence by hand to thread `marker.width` into
 * `itemBody(k)`. Same shape as `inlineCodeParser` (inline.ts:179), which
 * threads the opener's tick count into its closer for the same reason. */
const itemParser = (c: number): Parser<ParsedItem> => (input: string) => {
  const head = seqC(
    indentOf(c),
    capture(anyMarker, "marker"),
    char(" "),
    capture(optional(taskCheckbox), "checked")
  )(input);
  if (!head.success) return head;

  const { marker, checked } = head.result as {
    marker: Marker;
    checked: boolean | null;
  };
  const k = c + marker.width + 1;

  const body = itemBody(k)(head.rest);
  if (!body.success) return body;

  const item: ListItem = { content: body.result };
  if (checked !== null) item.checked = checked;
  return success({ marker, item }, body.rest);
};

/* An item whose marker family matches the locked one. Fails (without
 * consuming) if the family changed. */
const itemMatching = (c: number, ord: boolean): Parser<ParsedItem> =>
  (input: string) => {
    const r = itemParser(c)(input);
    if (!r.success) return r;
    if (r.result.marker.ord !== ord) {
      return failure("list marker family changed", input);
    }
    return r;
  };

/* A list at column c. Marker family locked by the first item; subsequent
 * items use `itemMatching` to enforce the lock. */
const listOf = (c: number): Parser<List> => (input: string) => {
  const first = itemParser(c)(input);
  if (!first.success) return first;
  const ord = first.result.marker.ord;
  const rest = many(itemMatching(c, ord))(first.rest);
  if (!rest.success) return rest;
  const items = [
    first.result.item,
    ...(rest.result as ParsedItem[]).map((r) => r.item),
  ];
  return success(
    {
      type: "list" as const,
      ordered: ord,
      start: first.result.marker.start,
      items,
    },
    rest.rest
  );
};

const listParserAt = (indent: number): Parser<List> => listOf(indent);

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

/* Block-level constructs that, if they would start at the *current* line
 * position, must interrupt a soft-wrapped paragraph instead of being eaten
 * as inline content. Setext is intentionally excluded — its underline is
 * resolved by `setextHeadingParser` running ahead of `paragraphParser` in
 * the top-level dispatch. */
const blockInterrupt: Parser<unknown> = or(
  // ATX heading (1–6 `#` then a space)
  seqR(atxMarker, char(" ")),
  // Block quote
  char(">"),
  // Fenced code block
  str("```"),
  // Horizontal rule (3+ of -, *, or _ with optional intervening spaces)
  horizontalRuleParser,
  // List marker (unordered or `<digits>.`) followed by a space
  seqR(or(oneOf("-*+"), seqR(many1(digit), char("."))), char(" ")),
  // Table row
  char("|"),
  // HTML block opener
  seqR(char("<"), or(letter, oneOf("/!?")))
);

/* A paragraph node: an inline node OR a soft line break (single `\n` that
 * isn't the start of a blank line *and* doesn't precede a block opener).
 * Hard breaks ("  \n" / "\\\n") win over soft breaks because they're
 * matched earlier inside `inlineMarkdownParser`'s `or`. */
const paragraphSoftBreak: Parser<InlineMarkdown> = map(
  seqR(softBreakParser, not(blockInterrupt)),
  () => ({ type: "inline-soft-break" as const })
);

const paragraphInline: Parser<InlineMarkdown> = map(
  seqC(
    not(blankLine),
    capture(or(paragraphSoftBreak, inlineMarkdownParser), "node")
  ),
  ({ node }) => node as InlineMarkdown
);

export const paragraphParser: Parser<Paragraph> = map(
  many1(paragraphInline),
  (content) => ({ type: "paragraph", content: content as InlineMarkdown[] })
);

/* Top-level block dispatcher. Lives here (rather than in index.ts) so
 * `listParser`'s `reparseBlocks` can recurse through it via `lazy`. */
export const blockAlt: Parser<Block> = or(
  setextHeadingParser,
  horizontalRuleParser,
  headingParser,
  codeBlockParser,
  indentedCodeBlockParser,
  tableParser,
  blockQuoteParser,
  listParser,
  htmlBlockParser,
  linkDefinitionParser,
  footnoteDefinitionParser,
  paragraphParser,
  imageParser
);

/* A block followed by zero-or-more trailing newlines. Blocks differ in
 * whether they consume their own terminating "\n" (e.g. headingParser does,
 * codeBlock doesn't), so `sepBy(many1(newline), block)` won't work — it
 * would fail to separate two blocks when the first already ate its newline. */
export const blockEntry: Parser<Block> = map(
  seqC(capture(blockAlt, "b"), many(newline)),
  ({ b }) => b as Block
);
