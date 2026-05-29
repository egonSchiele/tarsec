import {
  seqC,
  seqR,
  capture,
  captureCaptures,
  or,
  not,
  map,
  many,
  many1,
  many1Till,
  many1WithJoin,
  manyWithJoin,
  manyTillStr,
  iManyTillStr,
  count,
  exactly,
  lazy,
} from "@/lib/combinators";
import { str, char, eof, set, oneOf, alphanum, noneOf, digit } from "@/lib/parsers";
import { Parser, success, failure } from "@/lib/types";
import {
  InlineMarkdown,
  InlineText,
  InlineBold,
  InlineItalic,
  InlineBoldItalic,
  InlineStrike,
  InlineHardBreak,
  InlineSoftBreak,
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
// composable rather than embedded inside a regex. `]` is included so that
// inline-text inside a link-text (`[...]`) terminates at the closing `]`.
const inlineTextStop: Parser<unknown> = or(
  oneOf("*_`[]!<~\\&\n"),
  str("  ")
);

export const inlineTextParser: Parser<InlineText> = map(
  many1Till(inlineTextStop),
  (content) => ({ type: "inline-text", content })
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

export const inlineBoldParser: Parser<InlineBold> = map(
  seqC(
    str("**"),
    capture(inlineSeqUntil(str("**")), "content"),
    str("**")
  ),
  ({ content }) => ({ type: "inline-bold" as const, content: content as InlineMarkdown[] })
);

export const inlineItalicParser: Parser<InlineItalic> = map(
  seqC(
    not(str("**")),
    char("*"),
    capture(inlineSeqUntil(char("*")), "content"),
    char("*")
  ),
  ({ content }) => ({ type: "inline-italic" as const, content: content as InlineMarkdown[] })
);

/* URL + optional title used by both inline-link and inline-image parsers.
 * `urlToken` is whitespace- and `)`-terminated. Empty destinations (`[a]()`)
 * are allowed via `manyWithJoin` (zero-or-more). `titleClause` is an
 * optional leading-space-separated `"..."` or `'...'`. Both are pure
 * combinator-based so the link/image parsers can share them. */
const urlToken: Parser<string> = manyWithJoin(noneOf(" \t\n)"));

const titleClause: Parser<string> = map(
  seqC(
    many1(char(" ")),
    captureCaptures(
      or(
        seqC(char('"'), capture(manyTillStr('"'), "title"), char('"')),
        seqC(char("'"), capture(manyTillStr("'"), "title"), char("'"))
      )
    )
  ),
  ({ title }) => title
);

export const inlineLinkParser: Parser<InlineLink> = map(
  seqC(
    char("["),
    capture(inlineSeqUntil(char("]")), "content"),
    str("]("),
    capture(urlToken, "url"),
    capture(optional(titleClause), "title"),
    char(")")
  ),
  ({ content, url, title }) => {
    const link: InlineLink = {
      type: "inline-link",
      content: content as InlineMarkdown[],
      url,
    };
    if (title != null) link.title = title;
    return link;
  }
);

/* Multi-backtick code spans.
 *
 *   `foo`            → "foo"
 *   ``a`b``          → "a`b"       (close on exactly N backticks)
 *   `` foo ``        → "foo"       (strip one space on each side when both)
 *   `   `            → "   "       (don't strip if content is all spaces)
 *
 * The opener is a run of N backticks; the closer is another run of *exactly*
 * N backticks. Body atoms are either a single non-tick char or a tick run
 * whose length is *not* N (so it can't be misread as the closer). The opener
 * count threads into the closer via a small wrapper — every other piece is
 * combinator-shaped. */
const tickRun: Parser<number> = count(char("`"));

const tickRunOf = (n: number): Parser<unknown> =>
  seqR(exactly(n, char("`")), or(not(char("`")), eof));

const codeBodyAtom = (n: number): Parser<string> =>
  or(
    noneOf("`"),
    map(
      seqR(not(tickRunOf(n)), many1(char("`"))),
      (parts) => (parts[1] as string[]).join("")
    )
  );

const codeBody = (n: number): Parser<string> =>
  manyWithJoin(codeBodyAtom(n));

const stripCodeSpan = (s: string): string =>
  s.length >= 2 && s.startsWith(" ") && s.endsWith(" ") && s.trim().length > 0
    ? s.slice(1, -1)
    : s;

export const inlineCodeParser: Parser<InlineCode> = (input) => {
  const opened = tickRun(input);
  if (!opened.success) return opened;
  const n = opened.result;
  const closed = map(
    seqR(codeBody(n), tickRunOf(n)),
    (parts) => stripCodeSpan(parts[0] as string)
  )(opened.rest);
  if (!closed.success) {
    return failure("unmatched code span fence", input);
  }
  return success(
    { type: "inline-code" as const, content: closed.result },
    closed.rest
  );
};

const ESCAPABLE = "\\`*_{}[]()#+-.!~<>|";
export const inlineEscapeParser: Parser<InlineText> = seqC(
  set("type", "inline-text"),
  char("\\"),
  capture(oneOf(ESCAPABLE), "content")
);

export const inlineBoldItalicParser: Parser<InlineBoldItalic> = or(
  map(
    seqC(
      str("***"),
      capture(inlineSeqUntil(str("***")), "content"),
      str("***")
    ),
    ({ content }) => ({
      type: "inline-bold-italic" as const,
      content: content as InlineMarkdown[],
    })
  ),
  map(
    seqC(
      str("___"),
      capture(inlineSeqUntil(str("___")), "content"),
      str("___")
    ),
    ({ content }) => ({
      type: "inline-bold-italic" as const,
      content: content as InlineMarkdown[],
    })
  )
);

export const inlineBoldUnderscoreParser: Parser<InlineBold> = map(
  seqC(
    str("__"),
    capture(inlineSeqUntil(str("__")), "content"),
    str("__"),
    not(alphanum)
  ),
  ({ content }) => ({ type: "inline-bold" as const, content: content as InlineMarkdown[] })
);

export const inlineItalicUnderscoreParser: Parser<InlineItalic> = map(
  seqC(
    not(str("__")),
    char("_"),
    capture(inlineSeqUntil(char("_")), "content"),
    char("_"),
    not(alphanum)
  ),
  ({ content }) => ({ type: "inline-italic" as const, content: content as InlineMarkdown[] })
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

// Wrap a literal string as the single-text content array used by InlineLink.
const asTextContent = (s: string): InlineMarkdown[] => [
  { type: "inline-text", content: s },
];

export const urlAutolinkParser: Parser<InlineLink> = map(
  seqC(char("<"), capture(urlBody, "url"), char(">")),
  ({ url }) => ({ type: "inline-link" as const, content: asTextContent(url), url })
);

export const emailAutolinkParser: Parser<InlineLink> = map(
  seqC(char("<"), capture(emailBody, "email"), char(">")),
  ({ email }) => ({
    type: "inline-link" as const,
    content: asTextContent(email),
    url: `mailto:${email}`,
  })
);

export const autolinkParser: Parser<InlineLink> = or(
  urlAutolinkParser,
  emailAutolinkParser
);

/* Bare-URL GFM autolinks: `http(s)://…` without surrounding `<>`. The body
 * is built from three kinds of atom so the punctuation/paren-balance rules
 * fall out of combinator composition:
 *   - `bareUrlParenGroup` — a balanced `(...)` (recursive via `lazy`), so
 *     Wikipedia-style URLs like `…Lisp_(programming_language)` keep their
 *     parens and an unmatched trailing `)` falls through to the surrounding
 *     text;
 *   - `bareUrlPunctMidway` — one of `.,!?;:` accepted *only* when at least
 *     one non-punct atom follows, so trailing sentence punctuation stays
 *     in the surrounding text (a `not(...)` lookahead does the work);
 *   - `bareUrlNormalChar` — any other URL char.
 *
 * `urlBodyStop` is the lookahead set that ends a URL outside a paren group:
 * whitespace, `<`, `>`, `)`, or end-of-input. */
const bareUrlScheme: Parser<string> = map(
  seqC(
    capture(str("http"), "scheme"),
    capture(optional(char("s")), "s"),
    str("://")
  ),
  ({ scheme, s }) => scheme + (s ?? "") + "://"
);

const urlBodyStop: Parser<unknown> = or(oneOf(" \t\n<>)"), eof);
const urlTrailingPunct: Parser<string> = oneOf(".,!?;:");

const bareUrlNormalChar: Parser<string> = noneOf(" \t\n<>().,!?;:");

const bareUrlPunctMidway: Parser<string> = map(
  seqC(
    capture(urlTrailingPunct, "p"),
    // Reject if the remainder is just more punct then a URL stop — that
    // would mean this `.` (or `,`/`!`/etc) is part of a trailing run.
    not(seqR(many(urlTrailingPunct), urlBodyStop))
  ),
  ({ p }) => p
);

const bareUrlAtom: Parser<string> = lazy(() =>
  or(bareUrlParenGroup, bareUrlPunctMidway, bareUrlNormalChar)
);

const bareUrlParenGroup: Parser<string> = map(
  seqC(
    capture(char("("), "open"),
    capture(manyWithJoin(bareUrlAtom), "inner"),
    capture(char(")"), "close")
  ),
  ({ open, inner, close }) => open + inner + close
);

const bareUrlBody: Parser<string> = many1WithJoin(bareUrlAtom);

export const bareUrlAutolinkParser: Parser<InlineLink> = map(
  seqC(capture(bareUrlScheme, "scheme"), capture(bareUrlBody, "body")),
  ({ scheme, body }) => {
    const url = scheme + body;
    return {
      type: "inline-link" as const,
      content: [{ type: "inline-text" as const, content: url }],
      url,
    };
  }
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

/** An inline image: ![alt](url) or ![alt](url "title"). Lives in `inline.ts`
 *  so it can participate in paragraph parsing without `blocks.ts` becoming a
 *  circular dep. */
export const imageParser: Parser<Image> = map(
  seqC(
    str("!["),
    capture(iManyTillStr("]("), "alt"),
    str("]("),
    capture(urlToken, "url"),
    capture(optional(titleClause), "title"),
    char(")")
  ),
  ({ alt, url, title }) => {
    const img: Image = { type: "image", alt, url };
    if (title != null) img.title = title;
    return img;
  }
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

/** A single `\n` that is *not* part of a blank line (which would terminate the
 *  enclosing paragraph). Hard breaks are matched earlier in `inlineMarkdownParser`'s
 *  `or` so a "  \n" stays a hard break, never a soft one. */
export const softBreakParser: Parser<InlineSoftBreak> = map(
  seqR(char("\n"), not(char("\n"))),
  () => ({ type: "inline-soft-break" as const })
);

export const inlineStrikeParser: Parser<InlineStrike> = map(
  seqC(
    str("~~"),
    capture(inlineSeqUntil(str("~~")), "content"),
    str("~~")
  ),
  ({ content }) => ({
    type: "inline-strike" as const,
    content: content as InlineMarkdown[],
  })
);

/* HTML entities. Decodes:
 *   - the five XML-core named entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`,
 *     `&apos;`) into their literal characters,
 *   - decimal numeric references (`&#NN;`),
 *   - hexadecimal numeric references (`&#xNN;` / `&#XNN;`).
 *
 * Unknown named entities (e.g. `&unknown;`) fail this parser and fall
 * through to `inlineLiteralCharParser`, which emits a literal `&`. */
const namedEntity: Parser<string> = or(
  map(str("&amp;"), () => "&"),
  map(str("&lt;"), () => "<"),
  map(str("&gt;"), () => ">"),
  map(str("&quot;"), () => '"'),
  map(str("&apos;"), () => "'")
);

const decimalEntity: Parser<string> = map(
  seqC(str("&#"), capture(many1WithJoin(digit), "digits"), char(";")),
  ({ digits }) => String.fromCodePoint(parseInt(digits, 10))
);

const hexEntity: Parser<string> = map(
  seqC(
    or(str("&#x"), str("&#X")),
    capture(many1WithJoin(oneOf("0123456789abcdefABCDEF")), "digits"),
    char(";")
  ),
  ({ digits }) => String.fromCodePoint(parseInt(digits, 16))
);

export const htmlEntityParser: Parser<InlineText> = map(
  or(hexEntity, decimalEntity, namedEntity),
  (content) => ({ type: "inline-text" as const, content })
);

/** Last-resort: consume a single delimiter char as literal text so unmatched
 *  delimiters (e.g. the `_` in snake_case_word, or a stray `*`) don't crash
 *  the paragraph. Matches one of the inline-text stop characters. */
export const inlineLiteralCharParser: Parser<InlineText> = seqC(
  set("type", "inline-text"),
  capture(oneOf("*_`[]!<~\\&"), "content")
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
  bareUrlAutolinkParser,
  imageParser,
  inlineRefImageParser,
  inlineFootnoteRefParser,
  inlineLinkParser,
  inlineRefLinkParser,
  inlineCodeParser,
  htmlEntityParser,
  inlineTextParser,
  inlineLiteralCharParser
);
