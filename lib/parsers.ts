import { getResults, many1WithJoin, seq, transform } from "./combinators";
import { trace } from "./trace";
import { failure, Parser, success } from "./types";
import { escape } from "./utils";

/**
 * Takes a character. Returns a parser that parses that character.
 *
 * @param c - character to parse
 * @returns - parser that parses the given character
 */
export function char<const S extends string>(c: S): Parser<S> {
  return trace(`char(${escape(c)})`, (input: string) => {
    if (input.length === 0) {
      return {
        success: false,
        rest: input,
        message: "unexpected end of input",
      };
    }
    if (input[0] === c) {
      return success(c, input.slice(1));
    }
    return failure(`expected ${escape(c)}, got ${escape(input[0])}`, input);
  });
}

/**
 * Takes a string. Returns a parser that parses that string.
 *
 * @param s - string to parse
 * @returns - parser that parses the given string
 */
export function str<const S extends string>(s: S): Parser<S> {
  return trace(`str(${escape(s)})`, (input: string) => {
    if (input.substring(0, s.length) === s) {
      return success(s, input.slice(s.length));
    }
    return failure(`expected ${s}, got ${input.substring(0, s.length)}`, input);
  });
}

/**
 * Takes a string. Returns a parser that parses
 * one of the characters in that string.
 *
 * @param chars - string of possible characters
 * @returns - parser that parses one of the given characters
 */
export function oneOf(chars: string): Parser<string> {
  return trace(`oneOf(${escape(chars)})`, (input: string) => {
    if (input.length === 0) {
      return failure("unexpected end of input", input);
    }
    const c = input[0];
    if (chars.includes(c)) {
      return char(c)(input);
    }
    return failure(`expected one of ${escape(chars)}, got ${c}`, input);
  });
}

/**
 * Takes a string. Returns a parser that parses one character
 * that's not any of the characters in the given string
 *
 * @param chars - string of characters to avoid
 * @returns - parser that parses a character that is not in the given string
 */
export function noneOf(chars: string): Parser<string> {
  return trace(`noneOf(${escape(chars)})`, (input: string) => {
    if (input.length === 0) {
      return failure("unexpected end of input", input);
    }
    if (chars.includes(input[0])) {
      return failure(
        `expected none of ${escape(chars)}, got ${input[0]}`,
        input
      );
    }
    return char(input[0])(input);
  });
}

/**
 * A parser that parses any one character.
 * Fails on empty strings, succeeds otherwise.
 *
 * @param input - input string
 * @returns - ParserResult
 */
export function anyChar(input: string): Parser<string> {
  return trace("anyChar", (input: string) => {
    if (input.length === 0) {
      return failure("unexpected end of input", input);
    }
    return { success: true, match: input[0], rest: input.slice(1) };
  });
}

export const space: Parser<string> = oneOf(" \t\n\r");
export const spaces: Parser<string> = many1WithJoin(space);
export const digit: Parser<string> = oneOf("0123456789");
export const letter: Parser<string> = oneOf("abcdefghijklmnopqrstuvwxyz");
export const alphanum: Parser<string> = oneOf(
  "abcdefghijklmnopqrstuvwxyz0123456789"
);
export const word: Parser<string> = many1WithJoin(letter);
export const num: Parser<string> = many1WithJoin(digit);
export const quote: Parser<string> = oneOf(`'"`);
export const tab: Parser<string> = char("\t");
export const newline: Parser<string> = char("\n");

export const eof: Parser<null> = (input: string) => {
  if (input === "") {
    return success(null, input);
  }
  return failure("expected end of input", input);
};
export const quotedString = seq([quote, word, quote], (results: string[]) =>
  results.join("")
);
