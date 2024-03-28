import {
  seqC,
  capture,
  optional,
  many1Till,
  or,
  manyTillStr,
  count,
  iManyTillStr,
  sepBy,
  seq,
} from "@/lib/combinators";
import { str, spaces, word, char, eof, space } from "@/lib/parsers";

type InlineMarkdown =
  | InlineText
  | InlineBold
  | InlineItalic
  | InlineLink
  | InlineCode;

type InlineText = {
  type: "inline-text";
  content: string;
};

type InlineBold = {
  type: "inline-bold";
  content: string;
};

type InlineItalic = {
  type: "inline-italic";
  content: string;
};

type InlineLink = {
  type: "inline-link";
  content: string;
  url: string;
};

type InlineCode = {
  type: "inline-code";
  content: string;
};

type Paragraph = {
  type: "paragraph";
  content: InlineMarkdown[];
};

type Heading = {
  type: "heading";
  level: number;
  content: string;
};

type CodeBlock = {
  type: "code-block";
  content: string;
  language: string | null;
};

type BlockQuote = {
  type: "block-quote";
  content: string;
};

type Image = {
  type: "image";
  url: string;
  alt: string;
};

type List = {
  type: "list";
  ordered: boolean;
  items: string[];
};

export const headingParser = seqC(
  capture(count(char("#")), "level"),
  spaces,
  capture(many1Till(or(char("\n"), eof)), "content")
);

export const codeBlockParser = seqC(
  str("```"),
  capture(optional(word), "language"),
  optional(spaces),
  capture(manyTillStr("```"), "content"),
  str("```")
);

export const blockQuoteParser = seqC(
  str(">"),
  spaces,
  capture(manyTillStr("\n"), "content")
);

export const listParser = seqC(
  capture(char("-"), "char"),
  spaces,
  capture(manyTillStr("\n"), "content")
);

export const paragraphParser = seqC(capture(manyTillStr("\n"), "content"));

export const imageParser = seqC(
  str("!["),
  capture(iManyTillStr("]("), "alt"),
  str("]("),
  capture(iManyTillStr(")"), "url"),
  str(")")
);

export const markdownParser = seq(
  [
    optional(spaces),
    sepBy(
      spaces,
      or(
        headingParser,
        codeBlockParser,
        blockQuoteParser,
        listParser,
        paragraphParser,
        imageParser
      )
    ),
    optional(spaces),
  ],
  (r, c) => r[1]
);
