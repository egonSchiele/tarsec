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
  many1,
  manyTillOneOf,
  exactly,
} from "@/lib/combinators";
import {
  str,
  spaces,
  word,
  char,
  eof,
  space,
  set,
  oneOf,
  noneOf,
} from "@/lib/parsers";
import { Parser, ParserResult, success } from "@/lib/types";

/* Still a work in progress */

/* Types */
type InlineMarkdown =
  | InlineText
  | InlineBold
  | InlineItalic
  | InlineLink
  | InlineCode
  | InlineStrikethrough;

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

type InlineStrikethrough = {
  type: "inline-strikethrough";
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

type HorizontalRule = {
  type: "horizontal-rule";
};

type List = {
  type: "list";
  ordered: boolean;
  items: ListItem[];
};

type ListItem = {
  content: InlineMarkdown[];
};

/* Parsers */
export const headingParser: Parser<Heading> = seqC(
  set("type", "heading"),
  capture(count(char("#")), "level"),
  spaces,
  capture(many1Till(or(char("\n"), eof)), "content")
);

export const codeBlockParser: Parser<CodeBlock> = seqC(
  set("type", "code-block"),
  str("```"),
  capture(optional(word), "language"),
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

export const inlineTextParser: Parser<InlineText> = seqC(
  set("type", "inline-text"),
  capture(manyTillOneOf(["*", "`", "[", "\n", "~"]), "content"),
  oneOf("*`[\n~")
);

export const unorderedListItemParser = seqC(
  oneOf("-*+"),
  spaces,
  capture(many1(inlineTextParser), "content")
);

export const orderedListItemParser = seqC(
  count(char("1234567890")),
  char("."),
  spaces,
  capture(many1(inlineTextParser), "content")
);

export const unorderedListParser: Parser<List> = seqC(
  set("type", "list"),
  set("ordered", false),
  capture(many1(unorderedListItemParser), "items")
);

export const orderedListParser: Parser<List> = seqC(
  set("type", "list"),
  set("ordered", true),
  capture(many1(orderedListItemParser), "items")
);

export const listParser: Parser<List> = or(
  unorderedListParser,
  orderedListParser
);

export const imageParser: Parser<Image> = seqC(
  set("type", "image"),
  str("!["),
  capture(iManyTillStr("]("), "alt"),
  str("]("),
  capture(iManyTillStr(")"), "url"),
  str(")")
);

/* Inline Parsers */

export const inlineBoldParser: Parser<InlineBold> = seqC(
  set("type", "inline-bold"),
  str("**"),
  capture(manyTillStr("**"), "content"),
  str("**")
);

export const inlineItalicParser: Parser<InlineItalic> = seqC(
  set("type", "inline-italic"),
  str("*"),
  capture(manyTillStr("*"), "content"),
  str("*")
);

export const inlineLinkParser: Parser<InlineLink> = seqC(
  set("type", "inline-link"),
  str("["),
  capture(iManyTillStr("]("), "content"),
  str("]("),
  capture(iManyTillStr(")"), "url"),
  str(")")
);

export const inlineCodeParser: Parser<InlineCode> = seqC(
  set("type", "inline-code"),
  str("`"),
  capture(manyTillStr("`"), "content"),
  str("`")
);

export const inlineStrikethroughParser: Parser<InlineStrikethrough> = seqC(
  set("type", "inline-strikethrough"),
  str("~~"),
  capture(manyTillStr("~~"), "content"),
  str("~~")
);

export const inlineMarkdownParser: Parser<InlineMarkdown> = or(
  inlineBoldParser,
  inlineItalicParser,
  inlineLinkParser,
  inlineCodeParser,
  inlineStrikethroughParser
  //inlineTextParser
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

/* Markdown Parser */
export const horizontalRuleParser: Parser<HorizontalRule> = seq(
  [
    or(exactly(3, char("-")), exactly(3, char("*")), exactly(3, char("_"))),
    optional(spaces),
  ],
  () => ({ type: "horizontal-rule" })
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
        horizontalRuleParser,
        paragraphParser,
        inlineTextParser,
        imageParser
      )
    ),
    optional(spaces),
  ],
  (r, c) => r[1]
);
