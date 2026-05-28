export * from "./types";
export * from "./inline";
export * from "./blocks";
export * from "./references";

import { seq, sepBy, or, optional, many1 } from "@/lib/combinators";
import { spaces, newline } from "@/lib/parsers";
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
} from "./blocks";
import {
  linkDefinitionParser,
  footnoteDefinitionParser,
  resolveReferences,
} from "./references";

import { Parser, success } from "@/lib/types";

// Block separator: one or more newlines (with optional trailing horizontal
// whitespace). Crucially this does NOT consume leading indentation on the
// next block — so a 4-space indented code block isn't dewhitespaced before
// indentedCodeBlockParser ever sees it.
const blockSeparator = many1(newline);

const _markdownParser = seq(
  [
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
  (r) => r[1]
);

// Resolve [id]: url definitions across the AST after parsing.
export const markdownParser: Parser<unknown[]> = (input) => {
  const res = _markdownParser(input);
  if (!res.success) return res;
  return success(resolveReferences(res.result as unknown[]), res.rest);
};
