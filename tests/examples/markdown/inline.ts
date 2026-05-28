import {
  seqC,
  capture,
  or,
  not,
  manyTillStr,
  iManyTillStr,
  manyTillOneOf,
} from "@/lib/combinators";
import { str, char, set, oneOf } from "@/lib/parsers";
import { Parser } from "@/lib/types";
import {
  InlineMarkdown,
  InlineText,
  InlineBold,
  InlineItalic,
  InlineLink,
  InlineCode,
} from "./types";

import { failure } from "@/lib/types";

const _inlineTextParser = seqC(
  set("type", "inline-text"),
  capture(
    manyTillOneOf(["*", "_", "`", "[", "!", "<", "~", "\\", "\n"]),
    "content"
  )
);
export const inlineTextParser: Parser<InlineText> = (input) => {
  const res = _inlineTextParser(input);
  if (res.success && (res.result as InlineText).content === "") {
    return failure("empty inline text", input);
  }
  return res;
};

export const inlineBoldParser: Parser<InlineBold> = seqC(
  set("type", "inline-bold"),
  str("**"),
  capture(manyTillStr("**"), "content"),
  str("**")
);

export const inlineItalicParser: Parser<InlineItalic> = seqC(
  set("type", "inline-italic"),
  not(str("**")),
  char("*"),
  capture(manyTillStr("*"), "content"),
  char("*")
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

const ESCAPABLE = "\\`*_{}[]()#+-.!~<>|";
export const inlineEscapeParser: Parser<InlineText> = seqC(
  set("type", "inline-text"),
  char("\\"),
  capture(oneOf(ESCAPABLE), "content")
);

export const inlineMarkdownParser: Parser<InlineMarkdown> = or(
  inlineEscapeParser,
  inlineBoldParser,
  inlineItalicParser,
  inlineLinkParser,
  inlineCodeParser,
  inlineTextParser
);
