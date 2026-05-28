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
} from "./blocks";

export const markdownParser = seq(
  [
    optional(spaces),
    sepBy(
      spaces,
      or(
        setextHeadingParser,
        horizontalRuleParser,
        headingParser,
        codeBlockParser,
        blockQuoteParser,
        paragraphParser,
        imageParser
      )
    ),
    optional(spaces),
  ],
  (r) => r[1]
);
