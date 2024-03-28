import { many1WithJoin, manyWithJoin, seq } from "./combinators";
import { trace } from "./trace";
import { failure, Parser, success } from "./types";
import { escape } from "./utils";
export { within as betweenWithin } from "./parsers/within";
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
export const anyChar = trace("anyChar", (input: string) => {
  if (input.length === 0) {
    return failure("unexpected end of input", input);
  }
  return success(input[0], input.slice(1));
});

/** A parser that matches one of " \t\n\r". */
export const space: Parser<string> = oneOf(" \t\n\r");

/** A parser that matches one or more spaces. */
export const spaces: Parser<string> = many1WithJoin(space);

/** A parser that matches one digit. */
export const digit: Parser<string> = oneOf("0123456789");

/** A parser that matches one letter, currently lowercase only. */
export const letter: Parser<string> = oneOf("abcdefghijklmnopqrstuvwxyz");

/** A parser that matches one digit or letter, currently lowercase only. */
export const alphanum: Parser<string> = oneOf(
  "abcdefghijklmnopqrstuvwxyz0123456789"
);

/** A parser that matches one lowercase word. */
export const word: Parser<string> = many1WithJoin(letter);

/** A parser that matches one or more digits. */
export const num: Parser<string> = many1WithJoin(digit);

/** A parser that matches one single or double quote. */
export const quote: Parser<string> = oneOf(`'"`);

/** A parser that matches one tab character. */
export const tab: Parser<string> = char("\t");

/** A parser that matches one newline ("\n" only) character. */
export const newline: Parser<string> = char("\n");

/** A parser that succeeds on an empty string. Returns `null` as the result. */
export const eof: Parser<null> = (input: string) => {
  if (input === "") {
    return success(null, input);
  }
  return failure("expected end of input", input);
};

/** A parser that matches a quoted string, in single or double quotes.
 * Returns the string as the result, including the quotes.
 */
export const quotedString = seq(
  [quote, manyWithJoin(noneOf(`"'`)), quote],
  (results: string[]) => results.join("")
);

/**
 * Returns a parser that matches a regex. If you pass in a string,
 * it will get converted to a regex. The regex should always match from the start of the input.
 * If you pass in a string, a `^` will get prepended to it.
 *
 * @param str - regex string or RegExp instance to match
 * @param options - regex options (i = ignore case, g = global, m = multiline, u = unicode)
 * @returns - parser that matches the given regex
 */
export function regexParser(
  str: string | RegExp,
  options = ""
): Parser<string> {
  let re: RegExp;
  if (typeof str === "string") {
    re = new RegExp(str.startsWith("^") ? str : `^${str}`, options);
  } else {
    re = str;
  }
  return trace(`regex(${str})`, (input: string) => {
    const match = input.match(re);
    if (match) {
      return success(match[0], input.slice(match[0].length));
    }
    return failure(`expected ${str}, got ${input.slice(0, 10)}`, input);
  });
}
