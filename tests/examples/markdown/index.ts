export * from "./types";
export * from "./inline";
export * from "./blocks";
export * from "./references";

import { seq, sepBy, or, optional } from "@/lib/combinators";
import { spaces } from "@/lib/parsers";
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

const _markdownParser = seq(
  [
    optional(spaces),
    sepBy(
      spaces,
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
