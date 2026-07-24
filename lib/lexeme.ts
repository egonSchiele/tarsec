import { sepBy, sepBy1, seq } from "./combinators.js";
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
const OPERATOR_CHARS = "+-*/<>=!&|^%~?:.";
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
  /** Charset or predicate for characters that can appear in operators.
   * `operator` uses it for longest-match rejection: `operator("<")` refuses
   * to match the front of `<=`. Defaults to common symbol characters. */
  operatorChars?: string | CharPredicate;
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
  /** Match `s` only when not followed by an operator character, so
   * `operator("<")` rejects the front of "<=". The symbolic counterpart
   * of `keyword`. */
  operator: (s: string) => Parser<string>;
  /** Run a parser between "(" and ")", whitespace handled. Returns the
   * inner result. */
  parens: <T>(parser: Parser<T>) => Parser<T>;
  /** Like `parens`, with "[" and "]". */
  brackets: <T>(parser: Parser<T>) => Parser<T>;
  /** Like `parens`, with "{" and "}". */
  braces: <T>(parser: Parser<T>) => Parser<T>;
  /** Zero or more of `parser`, separated by commas. */
  commaSep: <T>(parser: Parser<T>) => Parser<T[]>;
  /** One or more of `parser`, separated by commas. */
  commaSep1: <T>(parser: Parser<T>) => Parser<T[]>;
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

  /** Match `s` as a whole token: it must not be followed by a character
   * from `continuationChars`, so a shorter token never steals the front of
   * a longer one. Shared by `keyword` (identifier characters) and
   * `operator` (operator characters). */
  function wholeToken(
    kind: string,
    s: string,
    isContinuation: CharPredicate,
  ): Parser<string> {
    return lexeme(
      trace(`lexeme:${kind}(${s})`, (input: string) => {
        if (!input.startsWith(s)) {
          recordFailure(input, `${kind} ${s}`);
          return failure(`expected ${kind} ${s}`, input);
        }
        const followingCode = input.charCodeAt(s.length);
        // charCodeAt returns NaN past the end of input; NaN fails the
        // predicate, so a token at end-of-input matches.
        if (!Number.isNaN(followingCode) && isContinuation(followingCode)) {
          recordFailure(input, `${kind} ${s}`);
          return failure(`expected ${kind} ${s}`, input);
        }
        return success(s, input.slice(s.length));
      }),
    );
  }

  const keyword = (s: string) => wholeToken("keyword", s, isIdentRest);

  const isOperatorChar = compileCharPredicate(
    config.operatorChars ?? OPERATOR_CHARS,
  );
  const operator = (s: string) => wholeToken("operator", s, isOperatorChar);

  function delimited<T>(
    open: string,
    close: string,
    parser: Parser<T>,
  ): Parser<T> {
    return seq(
      [symbol(open), parser, symbol(close)],
      (results) => results[1] as T,
    );
  }

  const parens = <T>(parser: Parser<T>) => delimited("(", ")", parser);
  const brackets = <T>(parser: Parser<T>) => delimited("[", "]", parser);
  const braces = <T>(parser: Parser<T>) => delimited("{", "}", parser);

  const comma = symbol(",");
  const commaSep = <T>(parser: Parser<T>) => sepBy(comma, parser);
  const commaSep1 = <T>(parser: Parser<T>) => sepBy1(comma, parser);

  return {
    whitespace,
    skipWhitespace,
    lexeme,
    symbol,
    identifier,
    keyword,
    operator,
    parens,
    brackets,
    braces,
    commaSep,
    commaSep1,
  };
}
