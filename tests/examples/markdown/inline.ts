import {
  seqC,
  seqR,
  capture,
  or,
  not,
  map,
  many,
  many1Till,
  many1WithJoin,
  manyTillStr,
  iManyTillStr,
  lazy,
} from "@/lib/combinators";
import { str, char, set, oneOf, alphanum, noneOf } from "@/lib/parsers";
import { Parser } from "@/lib/types";
import {
  InlineMarkdown,
  InlineText,
  InlineBold,
  InlineItalic,
  InlineBoldItalic,
  InlineStrike,
  InlineHardBreak,
  InlineLink,
  InlineCode,
  Image,
  InlineRefLink,
  InlineRefImage,
  InlineFootnoteRef,
} from "./types";

import { optional, between } from "@/lib/combinators";

// Stop inline-text at any single delimiter char OR at a hard-break sequence
// ("  \n"+). Using many1Till with an `or` of delimiters makes the stop set
// composable rather than embedded inside a regex.
const inlineTextStop: Parser<unknown> = or(
  oneOf("*_`[!<~\\\n"),
  str("  ")
);

export const inlineTextParser: Parser<InlineText> = map(
  many1Till(inlineTextStop),
  (content) => ({ type: "inline-text", content })
);

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

// URL body inside <...>: http(s)://<non-space, non-< or >>
const urlBody = map(
  seqR(
    str("http"),
    or(str("s"), str("")),
    str("://"),
    many1WithJoin(noneOf(" \t\n<>"))
  ),
  (parts) => parts.join("")
);

// Email body: local@domain.tld — no spaces, no < > or duplicates of @ inside parts
const emailPart = many1WithJoin(noneOf(" \t\n<>@."));
const emailBody = map(
  seqR(emailPart, char("@"), emailPart, char("."), emailPart),
  (parts) => parts.join("")
);

export const urlAutolinkParser: Parser<InlineLink> = map(
  seqC(char("<"), capture(urlBody, "url"), char(">")),
  ({ url }) => ({ type: "inline-link" as const, content: url, url })
);

export const emailAutolinkParser: Parser<InlineLink> = map(
  seqC(char("<"), capture(emailBody, "email"), char(">")),
  ({ email }) => ({
    type: "inline-link" as const,
    content: email,
    url: `mailto:${email}`,
  })
);

export const autolinkParser: Parser<InlineLink> = or(
  urlAutolinkParser,
  emailAutolinkParser
);

// Footnote reference: `[^id]` (id has no `]`, `\n`, or spaces).
export const inlineFootnoteRefParser: Parser<InlineFootnoteRef> = seqC(
  set("type", "inline-footnote-ref"),
  str("[^"),
  capture(many1WithJoin(noneOf("] \n\t")), "id"),
  char("]")
);

// `[...]` where ... is one or more characters that aren't `]` or newline.
const bracketed = between(char("["), char("]"), noneOf("]\n"));
const bracketedAsString = map(bracketed, (chars) => (chars as string[]).join(""));

export const inlineRefLinkParser: Parser<InlineRefLink> = map(
  seqC(
    capture(bracketedAsString, "text"),
    capture(optional(bracketedAsString), "rawId"),
    not(char("(")) // disambiguate from inline link
  ),
  ({ text, rawId }) => ({
    type: "inline-ref-link" as const,
    text,
    id: rawId && rawId.length > 0 ? rawId : text,
  })
);

export const inlineRefImageParser: Parser<InlineRefImage> = map(
  seqC(
    char("!"),
    capture(bracketedAsString, "alt"),
    capture(optional(bracketedAsString), "rawId"),
    not(char("("))
  ),
  ({ alt, rawId }) => ({
    type: "inline-ref-image" as const,
    alt,
    id: rawId && rawId.length > 0 ? rawId : alt,
  })
);

/** An inline image: ![alt](url). Lives in `inline.ts` so it can participate
 *  in paragraph parsing without `blocks.ts` becoming a circular dep. */
export const imageParser: Parser<Image> = seqC(
  set("type", "image"),
  str("!["),
  capture(iManyTillStr("]("), "alt"),
  str("]("),
  capture(iManyTillStr(")"), "url"),
  str(")")
);

export const hardBreakParser: Parser<InlineHardBreak> = map(
  or(
    // two-or-more trailing spaces then newline
    seqR(str("  "), many(char(" ")), char("\n")),
    // backslash then newline
    seqR(char("\\"), char("\n"))
  ),
  () => ({ type: "inline-hard-break" as const })
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
  hardBreakParser,
  inlineEscapeParser,
  inlineBoldItalicParser,
  inlineBoldParser,
  inlineItalicParser,
  inlineBoldUnderscoreParser,
  inlineItalicUnderscoreParser,
  inlineStrikeParser,
  autolinkParser,
  imageParser,
  inlineRefImageParser,
  inlineFootnoteRefParser,
  inlineLinkParser,
  inlineRefLinkParser,
  inlineCodeParser,
  inlineTextParser,
  inlineLiteralCharParser
);

/**
 * Run `inlineMarkdownParser` repeatedly until `stop` would match at the
 * current position. The `stop` parser is a lookahead — it is *not* consumed.
 * Returns the list of inline nodes collected before `stop`.
 *
 * Used by every delimited inline parser (bold, italic, strike, link, …) so
 * that the content between delimiters is a sequence of inline nodes rather
 * than a flat string.
 */
export const inlineSeqUntil = (
  stop: Parser<unknown>
): Parser<InlineMarkdown[]> =>
  many(
    map(
      seqC(not(stop), capture(lazy(() => inlineMarkdownParser), "node")),
      ({ node }) => node as InlineMarkdown
    )
  );
