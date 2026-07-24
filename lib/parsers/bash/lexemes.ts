/** Lexeme layer and shared tokens for the bash grammar. */
import { many, or, peek, seq } from "../../combinators.js";
import { makeLexemes } from "../../lexeme.js";
import { char, eof, oneOf, str } from "../../parsers.js";
import { Parser } from "../../types.js";

/** Words that are reserved at command position (and rejected as
 * identifiers). Includes constructs this parser deliberately does not
 * support — `select`, `coproc`, `time`, `[[ ]]` — so they fail the parse
 * instead of parsing as ordinary words. */
export const WORD_RESERVED = [
  "if", "then", "elif", "else", "fi",
  "do", "done", "while", "until", "for", "in",
  "case", "esac", "function",
  "select", "coproc", "time", "[[", "]]",
];

const RESERVED_TOKENS = [...WORD_RESERVED, "{", "}", "!"];

export const bashLexemes = makeLexemes({
  // Newlines are command separators, never skippable whitespace.
  whitespace: " \t",
  lineComment: "#",
  lineContinuation: true,
  operatorChars: "&|;<>",
  keywords: WORD_RESERVED,
});

/** Characters that end a word. `{` and `}` are metacharacters here
 * (unlike bash) because brace expansion is unsupported: a brace can only
 * be a group delimiter or quoted. */
export const METACHARACTERS = " \t\n|&;()<>{}";

/** The next character (unconsumed) would end a word, or input is done. */
export const wordBoundary = or(peek(oneOf(METACHARACTERS)), eof);

/** A reserved word as a whole token. Order doesn't matter: each
 * alternative carries its own boundary check, so `do` cannot steal the
 * front of `done`. */
export const reservedToken: Parser<string> = or(
  ...RESERVED_TOKENS.map((word) =>
    seq([str(word), wordBoundary], (results) => results[0] as string),
  ),
);

const whitespaceOrEnd = or(peek(oneOf(" \t\n")), eof);

/** `{`, `}`, and `!` must be followed by whitespace. This is stricter
 * than bash on purpose: `!(` is extglob syntax (unsupported), not
 * negation. */
export const groupOpen = bashLexemes.lexeme(
  seq([str("{"), whitespaceOrEnd], () => "{"),
);
export const groupClose = bashLexemes.lexeme(
  seq([str("}"), wordBoundary], () => "}"),
);
export const bangToken = bashLexemes.lexeme(
  seq([str("!"), whitespaceOrEnd], () => "!"),
);

/** A significant newline, with trailing blanks and comments skipped. */
export const newlineToken = bashLexemes.lexeme(char("\n"));

/** Zero or more blank (or comment-only) lines. */
export const linebreak = many(newlineToken);
