import {
  seqC,
  capture,
  optional,
  many1Till,
  or,
  manyTillStr,
  count,
  iManyTillStr,
  many1,
  many1WithJoin,
} from "@/lib/combinators";
import {
  str,
  spaces,
  char,
  eof,
  set,
  alphanum,
  oneOf,
} from "@/lib/parsers";
import { Parser, ParserResult, success } from "@/lib/types";
import {
  Heading,
  CodeBlock,
  BlockQuote,
  Image,
  Paragraph,
} from "./types";
import { inlineMarkdownParser } from "./inline";

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

export const imageParser: Parser<Image> = seqC(
  set("type", "image"),
  str("!["),
  capture(iManyTillStr("]("), "alt"),
  str("]("),
  capture(iManyTillStr(")"), "url"),
  str(")")
);

export function paragraphParser(input: string): ParserResult<Paragraph> {
  const inline = many1(inlineMarkdownParser)(input);
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
