import { many1, many1WithJoin, seq, transform } from "./combinators";
import { trace } from "./trace";
import { Parser, ParserResult } from "./types";
import { escape } from "./utils";
export function char(c: string): Parser<string, never> {
  return trace(`char(${escape(c)})`, (input: string) => {
    if (input.length === 0) {
      return {
        success: false,
        rest: input,
        message: "unexpected end of input",
      };
    }
    if (input[0] === c) {
      return { success: true, match: c, rest: input.slice(1) };
    }
    return {
      success: false,
      rest: input,
      message: `expected ${c}, got ${input[0]}`,
    };
  });
}

export function str(s: string): Parser<string, never> {
  return trace(`str(${escape(s)})`, (input: string) => {
    if (input.substring(0, s.length) === s) {
      return { success: true, match: s, rest: input.slice(s.length) };
    }
    return {
      success: false,
      rest: input,
      message: `expected ${s}, got ${input.substring(0, s.length)}`,
    };
  });
}

export function oneOf(chars: string): Parser<string, never> {
  return trace(`oneOf(${escape(chars)})`, (input: string) => {
    if (input.length === 0) {
      return {
        success: false,
        rest: input,
        message: "unexpected end of input",
      };
    }
    const c = input[0];
    if (chars.includes(c)) {
      return char(c)(input);
    }
    return {
      success: false,
      rest: input,
      message: `expected one of ${escape(chars)}, got ${c}`,
    };
  });
}

export function noneOf(chars: string): Parser<string, never> {
  return trace(`noneOf(${escape(chars)})`, (input: string) => {
    if (input.length === 0) {
      return {
        success: false,
        rest: input,
        message: "unexpected end of input",
      };
    }
    if (chars.includes(input[0])) {
      return {
        success: false,
        rest: input,
        message: `expected none of ${chars}`,
      };
    }
    return char(input[0])(input);
  });
}

export function anyChar(input: string): Parser<string, never> {
  return trace("anyChar", (input: string) => {
    if (input.length === 0) {
      return {
        success: false,
        rest: input,
        message: "unexpected end of input",
      };
    }
    return { success: true, match: input[0], rest: input.slice(1) };
  });
}

export const space: Parser<string, never> = oneOf(" \t\n\r");
export const spaces: Parser<string, never> = many1WithJoin(space);
export const digit: Parser<string, never> = oneOf("0123456789");
export const letter: Parser<string, never> = oneOf(
  "abcdefghijklmnopqrstuvwxyz"
);
export const alphanum: Parser<string, never> = oneOf(
  "abcdefghijklmnopqrstuvwxyz0123456789"
);
export const word: Parser<string, never> = many1WithJoin(letter);
export const num: Parser<string, never> = many1WithJoin(digit);
export const quote: Parser<string, never> = oneOf(`'"`);
export const tab: Parser<string, never> = char("\t");
export const newline: Parser<string, never> = char("\n");

export const quotedString = transform(
  seq([quote, word, quote], "quotedString"),
  (x: string[]) => x.join("")
);
