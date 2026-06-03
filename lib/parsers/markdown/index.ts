export * from "./types.js";
export * from "./inline.js";
export * from "./blocks.js";
export * from "./references.js";
export * from "./frontmatter.js";

import { seq, or, optional, many, capture, seqC, map } from "../../combinators.js";
import { spaces, newline } from "../../parsers.js";
import {
  headingParser,
  codeBlockParser,
  blockQuoteParser,
  paragraphParser,
  imageParser,
  horizontalRuleParser,
  setextHeadingParser,
  indentedCodeBlockParser,
  listParser,
  tableParser,
  htmlBlockParser,
} from "./blocks.js";
import {
  linkDefinitionParser,
  footnoteDefinitionParser,
  resolveReferences,
} from "./references.js";
import { frontmatterParser } from "./frontmatter.js";
import { Frontmatter } from "./types.js";

import { Parser } from "../../types.js";

const blockAlt = or(
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

// A block followed by zero-or-more trailing newlines. Blocks differ in whether
// they consume their own terminating "\n" (e.g. headingParser does, codeBlock
// doesn't), so we can't use sepBy(many1(newline), block) — it would fail to
// separate two blocks when the first already ate its newline (e.g. a heading
// directly followed by a list with no intervening blank line).
const blockEntry = map(
  seqC(capture(blockAlt, "b"), many(newline)),
  ({ b }) => b
);

const _markdownParser = seq(
  [
    optional(frontmatterParser),
    optional(spaces),
    many(blockEntry),
    optional(spaces),
  ],
  (r) => {
    const fm = r[0] as Frontmatter | null;
    const blocks = r[2] as unknown[];
    return fm ? [fm, ...blocks] : blocks;
  }
);

// Resolve [id]: url definitions across the AST after parsing.
export const markdownParser: Parser<unknown[]> = map(
  _markdownParser,
  (nodes) => resolveReferences(nodes as unknown[])
);
