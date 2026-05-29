export * from "./types.js";
export * from "./inline.js";
export * from "./blocks.js";
export * from "./references.js";
export * from "./frontmatter.js";

import { seq, sepBy, or, optional, many1, map } from "../../combinators.js";
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

// Block separator: one or more newlines (with optional trailing horizontal
// whitespace). Crucially this does NOT consume leading indentation on the
// next block — so a 4-space indented code block isn't dewhitespaced before
// indentedCodeBlockParser ever sees it.
const blockSeparator = many1(newline);

const _markdownParser = seq(
  [
    optional(frontmatterParser),
    optional(spaces),
    sepBy(
      blockSeparator,
      or(
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
      )
    ),
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
