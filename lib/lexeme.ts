import { CharPredicate, compileCharPredicate, str } from "./parsers.js";
import { trace } from "./trace.js";
import { recordFailure } from "./rightmostFailure.js";
import {
  CaptureParser,
  failure,
  GeneralParser,
  Parser,
  PlainObject,
  success,
} from "./types.js";

const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const BACKSLASH_CODE = 0x5c;
const NEWLINE = "\n";

/** Configuration for `makeLexemes`. */
export type LexemeConfig = {
  /** Characters eaten after every lexeme, e.g. " \t". */
  whitespace: string;
  /** Line-comment marker (e.g. "#" or "//"); comments are eaten as whitespace,
   * up to but NOT including the newline (newlines may be significant). */
  lineComment?: string;
  /** When true, `\` followed by a newline is also eaten as whitespace. */
  lineContinuation?: boolean;
  /** Charset or predicate for an identifier's first character.
   * Defaults to letters and "_". */
  identStart?: string | CharPredicate;
  /** Charset or predicate for subsequent identifier characters.
   * Defaults to letters, digits, and "_". */
  identRest?: string | CharPredicate;
  /** Words `identifier` refuses to match (and `keyword` accepts). */
  keywords?: string[];
};

export type Lexemes = {
  /** Whitespace/comment skipper as a parser. Always succeeds. Use once at the
   * top of a grammar to eat leading whitespace; lexemes handle the rest. */
  whitespace: Parser<null>;
  /** Whitespace/comment skipper as a total function: returns the input with
   * leading whitespace removed. Handy where a parser result would force
   * callers to handle a failure that cannot happen. */
  skipWhitespace: (input: string) => string;
  /** Run a parser, then eat trailing whitespace/comments. Capture-preserving. */
  lexeme: {
    // The CaptureParser overload MUST come first: a CaptureParser is
    // structurally assignable to Parser, so the other order would always
    // select the Parser overload and drop capture types (same as `trace`).
    <T, C extends PlainObject>(parser: CaptureParser<T, C>): CaptureParser<T, C>;
    <T>(parser: Parser<T>): Parser<T>;
  };
  /** `lexeme(str(s))` — match a literal, eat trailing whitespace. */
  symbol: <const S extends string>(s: S) => Parser<S>;
  /** Match an identifier (per identStart/identRest), rejecting keywords. */
  identifier: Parser<string>;
  /** Match `s` only when not followed by an identRest character, so
   * `keyword("if")` rejects "ifx". */
  keyword: (s: string) => Parser<string>;
};

/**
 * Build a set of lexeme helpers: ordinary parsers that handle whitespace,
 * comments, and keywords in one place. This is a *scannerless* lexeme layer
 * (like Parsec's `makeTokenParser`), not a lexer — there is no separate pass
 * and no token array.
 *
 * The discipline: every token-shaped parser eats its own *trailing*
 * whitespace; eat *leading* whitespace once at the top with `whitespace`
 * (or `skipWhitespace`).
 */
export function makeLexemes(config: LexemeConfig): Lexemes {
  const isWhitespaceChar = compileCharPredicate(config.whitespace);
  // Treat an empty marker as absent: `startsWith("", i)` is always true, so
  // "" would make the comment branch loop forever at a newline.
  const commentMarker = config.lineComment || undefined;
  const allowContinuation = config.lineContinuation === true;

  const skipWhitespace = (input: string): string => {
    let index = 0;
    const length = input.length;
    // Terminates: every branch either advances `index` or breaks.
    while (index < length) {
      if (isWhitespaceChar(input.charCodeAt(index))) {
        index++;
        continue;
      }
      if (
        allowContinuation &&
        input.charCodeAt(index) === BACKSLASH_CODE &&
        input[index + 1] === NEWLINE
      ) {
        index += 2;
        continue;
      }
      if (commentMarker !== undefined && input.startsWith(commentMarker, index)) {
        const newlineIndex = input.indexOf(NEWLINE, index);
        if (newlineIndex === -1) {
          index = length;
        } else {
          index = newlineIndex; // stop AT the newline, don't consume it
        }
        continue;
      }
      break;
    }
    return input.slice(index);
  };

  const whitespace: Parser<null> = trace("lexeme:whitespace", (input: string) =>
    success(null, skipWhitespace(input)),
  );

  const lexeme = ((parser: GeneralParser<any, any>) =>
    (input: string) => {
      const result = parser(input);
      if (!result.success) return result;
      return { ...result, rest: skipWhitespace(result.rest) };
    }) as Lexemes["lexeme"];

  const symbol = <const S extends string>(s: S): Parser<S> => lexeme(str(s));

  const isIdentStart = compileCharPredicate(config.identStart ?? LETTERS + "_");
  const isIdentRest = compileCharPredicate(
    config.identRest ?? LETTERS + DIGITS + "_",
  );
  const keywordSet = new Set(config.keywords ?? []);

  const identifier: Parser<string> = lexeme(
    trace("lexeme:identifier", (input: string) => {
      if (input.length === 0 || !isIdentStart(input.charCodeAt(0))) {
        recordFailure(input, "an identifier");
        return failure("expected an identifier", input);
      }
      let end = 1;
      // Terminates: `end` strictly increases toward input.length.
      while (end < input.length && isIdentRest(input.charCodeAt(end))) end++;
      const name = input.slice(0, end);
      if (keywordSet.has(name)) {
        recordFailure(input, "an identifier");
        return failure(`expected an identifier, got keyword ${name}`, input);
      }
      return success(name, input.slice(end));
    }),
  );

  function keyword(s: string): Parser<string> {
    return lexeme(
      trace(`lexeme:keyword(${s})`, (input: string) => {
        if (!input.startsWith(s)) {
          recordFailure(input, `keyword ${s}`);
          return failure(`expected keyword ${s}`, input);
        }
        const followingCode = input.charCodeAt(s.length);
        // charCodeAt returns NaN past the end of input; NaN fails the
        // predicate, so a keyword at end-of-input matches.
        if (!Number.isNaN(followingCode) && isIdentRest(followingCode)) {
          recordFailure(input, `keyword ${s}`);
          return failure(`expected keyword ${s}`, input);
        }
        return success(s, input.slice(s.length));
      }),
    );
  }

  return { whitespace, skipWhitespace, lexeme, symbol, identifier, keyword };
}
