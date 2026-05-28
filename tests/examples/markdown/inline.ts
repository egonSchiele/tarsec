import {
  seqC,
  capture,
  or,
  not,
  manyTillStr,
  iManyTillStr,
  manyTillOneOf,
} from "@/lib/combinators";
import { str, char, set, oneOf, alphanum } from "@/lib/parsers";
import { Parser } from "@/lib/types";
import {
  InlineMarkdown,
  InlineText,
  InlineBold,
  InlineItalic,
  InlineBoldItalic,
  InlineStrike,
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

export const inlineBoldItalicParser: Parser<InlineBoldItalic> = or(
  seqC(
    set("type", "inline-bold-italic"),
    str("***"),
    capture(manyTillStr("***"), "content"),
    str("***")
  ),
  seqC(
    set("type", "inline-bold-italic"),
    str("___"),
    capture(manyTillStr("___"), "content"),
    str("___")
  )
);

export const inlineBoldUnderscoreParser: Parser<InlineBold> = seqC(
  set("type", "inline-bold"),
  str("__"),
  capture(manyTillStr("__"), "content"),
  str("__"),
  not(alphanum)
);

export const inlineItalicUnderscoreParser: Parser<InlineItalic> = seqC(
  set("type", "inline-italic"),
  not(str("__")),
  char("_"),
  capture(manyTillStr("_"), "content"),
  char("_"),
  not(alphanum)
);

export const inlineStrikeParser: Parser<InlineStrike> = seqC(
  set("type", "inline-strike"),
  str("~~"),
  capture(manyTillStr("~~"), "content"),
  str("~~")
);

/** Last-resort: consume a single delimiter char as literal text so unmatched
 *  delimiters (e.g. the `_` in snake_case_word, or a stray `*`) don't crash
 *  the paragraph. Matches one of the inline-text stop characters. */
export const inlineLiteralCharParser: Parser<InlineText> = seqC(
  set("type", "inline-text"),
  capture(oneOf("*_`[!<~\\"), "content")
);

export const inlineMarkdownParser: Parser<InlineMarkdown> = or(
  inlineEscapeParser,
  inlineBoldItalicParser,
  inlineBoldParser,
  inlineItalicParser,
  inlineBoldUnderscoreParser,
  inlineItalicUnderscoreParser,
  inlineStrikeParser,
  inlineLinkParser,
  inlineCodeParser,
  inlineTextParser,
  inlineLiteralCharParser
);
