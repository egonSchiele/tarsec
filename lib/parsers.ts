import { Parser } from "./types";

export function char(c: string): Parser {
  return (input: string) => {
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
  };
}

export function str(s: string): Parser {
  return (input: string) => {
    let rest = input;
    for (let c of s) {
      let result = char(c)(rest);
      if (!result.success) {
        return result;
      }
      rest = result.rest;
    }
    return { success: true, match: s, rest };
  };
}

export function many(parser: Parser): Parser {
  return (input: string) => {
    let match = "";
    let rest = input;
    while (true) {
      let result = parser(rest);
      if (!result.success) {
        return { success: true, match, rest };
      }
      match += result.match;
      rest = result.rest;
    }
  };
}

export function many1(parser: Parser): Parser {
  return (input: string) => {
    let result = many(parser)(input);
    if (result.success) {
      return result;
    }
    return {
      success: false,
      rest: input,
      message: "expected at least one match",
    };
  };
}

export function oneOf(chars: string): Parser {
  return (input: string) => {
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
  };
}

export function noneOf(chars: string): Parser {
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

export function or(...parsers: Parser[]): Parser {
  return (input: string) => {
    for (let parser of parsers) {
      let result = parser(input);
      if (result.success) {
        return result;
      }
    }
    return {
      success: false,
      rest: input,
      message: "all parsers failed",
    };
  };
}

export function optional(parser: Parser): Parser {
  return (input: string) => {
    let result = parser(input);
    if (result.success) {
      return result;
    }
    return { success: true, match: "", rest: input };
  };
}

export function not(parser: Parser): Parser {
  return (input: string) => {
    let result = parser(input);
    if (result.success) {
      return {
        success: false,
        rest: input,
        message: "unexpected match",
      };
    }
    return { success: true, match: "", rest: input };
  };
}

export const space: Parser = char(" ");
export const spaces: Parser = many1(space);
export const digit: Parser = oneOf("0123456789");
export const letter: Parser = oneOf("abcdefghijklmnopqrstuvwxyz");
export const alphanum: Parser = oneOf("abcdefghijklmnopqrstuvwxyz0123456789");
export const word: Parser = many1(letter);
export const number: Parser = many1(digit);
