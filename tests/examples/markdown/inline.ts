import {
  seqC,
  capture,
  or,
  manyTillStr,
  iManyTillStr,
  manyTillOneOf,
} from "@/lib/combinators";
import { str, set } from "@/lib/parsers";
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
  capture(manyTillOneOf(["*", "`", "[", "\n"]), "content")
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

export const inlineMarkdownParser: Parser<InlineMarkdown> = or(
  inlineBoldParser,
  inlineItalicParser,
  inlineLinkParser,
  inlineCodeParser,
  inlineTextParser
);
