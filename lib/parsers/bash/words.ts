import { compileCharPredicate } from "../../parsers.js";
import { recordFailure } from "../../rightmostFailure.js";
import { failure, Parser, success } from "../../types.js";
import { committedFailure } from "./committed.js";
import { lx } from "./lexemes.js";
import { spanned } from "./spanned.js";
import { BashWord } from "./types.js";

const BACKSLASH = 0x5c;
const SINGLE_QUOTE = 0x27;
const DOUBLE_QUOTE = 0x22;
const DOLLAR = 0x24;
const OPEN_PAREN = 0x28;
const CLOSE_PAREN = 0x29;

/** Unquoted characters that end a word. `#` is deliberately absent: `a#b` is
 * one literal word — comment disambiguation is owned by this scanner (which
 * runs before the whitespace skipper ever sees a mid-word `#`). Backticks are
 * also absent: backtick substitution is unsupported, so `` `a b` `` splits at
 * the space (known limitation, pinned in tests). */
const isMetachar = compileCharPredicate(" \t\n|&;()<>");

/** Scan one word starting at index 0. Returns the end index (0 = no word
 * here), or -1 for an unterminated quote / substitution.
 *
 * All three scanners below are tight charCodeAt index loops (the same style
 * as `takeWhile`): every branch either advances the index or returns, so
 * they terminate. */
export function scanWord(input: string): number {
  let index = 0;
  const length = input.length;
  while (index < length) {
    const code = input.charCodeAt(index);
    if (code === BACKSLASH) {
      index = Math.min(index + 2, length); // escaped char; clamp at EOF
      continue;
    }
    if (code === SINGLE_QUOTE) {
      const closeIndex = input.indexOf("'", index + 1);
      if (closeIndex === -1) return -1;
      index = closeIndex + 1;
      continue;
    }
    if (code === DOUBLE_QUOTE) {
      const afterClose = scanDoubleQuote(input, index);
      if (afterClose === -1) return -1;
      index = afterClose;
      continue;
    }
    if (code === DOLLAR && input.charCodeAt(index + 1) === OPEN_PAREN) {
      const afterClose = scanDollarParen(input, index + 1);
      if (afterClose === -1) return -1;
      index = afterClose;
      continue;
    }
    if (isMetachar(code)) break;
    index++;
  }
  return index;
}

/** From an opening `"` at `start`, return the index just past the closing
 * quote, or -1. Handles backslash escapes and nested `$(...)`. */
function scanDoubleQuote(input: string, start: number): number {
  let index = start + 1;
  const length = input.length;
  while (index < length) {
    const code = input.charCodeAt(index);
    if (code === BACKSLASH) {
      index = Math.min(index + 2, length);
      continue;
    }
    if (code === DOUBLE_QUOTE) return index + 1;
    if (code === DOLLAR && input.charCodeAt(index + 1) === OPEN_PAREN) {
      const afterClose = scanDollarParen(input, index + 1);
      if (afterClose === -1) return -1;
      index = afterClose;
      continue;
    }
    index++;
  }
  return -1;
}

/** From a `(` at `openIndex` (part of `$(`), return the index just past the
 * matching `)`, or -1. Tracks paren nesting and quoting. */
function scanDollarParen(input: string, openIndex: number): number {
  let index = openIndex + 1;
  let depth = 1;
  const length = input.length;
  while (index < length) {
    const code = input.charCodeAt(index);
    if (code === BACKSLASH) {
      index = Math.min(index + 2, length);
      continue;
    }
    if (code === SINGLE_QUOTE) {
      const closeIndex = input.indexOf("'", index + 1);
      if (closeIndex === -1) return -1;
      index = closeIndex + 1;
      continue;
    }
    if (code === DOUBLE_QUOTE) {
      const afterClose = scanDoubleQuote(input, index);
      if (afterClose === -1) return -1;
      index = afterClose;
      continue;
    }
    if (code === OPEN_PAREN) depth++;
    if (code === CLOSE_PAREN) {
      depth--;
      if (depth === 0) return index + 1;
    }
    index++;
  }
  return -1;
}

const wordScan: Parser<Omit<BashWord, "span">> = (input: string) => {
  const end = scanWord(input);
  if (end === -1) {
    // A quote was opened, so this IS a word — a malformed one. Committed,
    // so callers report "unterminated quote" here instead of trying other
    // alternatives and failing somewhere later.
    recordFailure(input, "a closing quote");
    return committedFailure("unterminated quote", input);
  }
  if (end === 0) {
    recordFailure(input, "a word");
    return failure("expected a word", input);
  }
  return success(
    { type: "word" as const, text: input.slice(0, end) },
    input.slice(end),
  );
};

/** A word with span, NOT eating trailing whitespace (used inside assignments,
 * where the enclosing lexeme handles it). */
export const rawWord: Parser<BashWord> = spanned<BashWord>(wordScan);

/** A word with span, eating trailing whitespace. */
export const bashWord: Parser<BashWord> = lx.lexeme(rawWord);
