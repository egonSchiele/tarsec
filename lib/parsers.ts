import { many1, transform } from "./combinators";
import { trace } from "./trace";
import { Parser, ParserResult } from "./types";

export function char(c: string, debug: any[] = []): Parser<string> {
  return trace("char", debug, (input: string) => {
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

export function str(s: string, debug: any[] = []): Parser<string> {
  return trace("str", debug, (input: string) => {
    let rest = input;
    for (let c of s) {
      let result = char(c)(rest);
      if (!result.success) {
        return result;
      }
      rest = result.rest;
    }
    return { success: true, match: s, rest };
  });
}

export function oneOf(chars: string, debug: any[] = []): Parser<string> {
  return trace("oneOf", debug, (input: string) => {
    for (let c of chars) {
      let result = char(c)(input);
      if (result.success) {
        return result;
      }
    }
    return {
      success: false,
      rest: input,
      message: `expected one of ${chars}`,
    };
  });
}

export function noneOf(chars: string): Parser<string> {
  return (input: string) => {
    for (let c of chars) {
      let result = char(c)(input);
      if (result.success) {
        return {
          success: false,
          rest: input,
          message: `expected none of ${chars}`,
        };
      }
    }
    return char(input[0])(input);
  };
}

export function many1WithJoin(parser: Parser<string>): Parser<string> {
  return transform<string[], string>(many1(parser), (x) => x.join(""));
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
export const anyChar: Parser<string> = (input: string) => {
  if (input.length === 0) {
    return {
      success: false,
      rest: input,
      message: "unexpected end of input",
    };
  }
  return { success: true, match: input[0], rest: input.slice(1) };
};
