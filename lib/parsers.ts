import { Parser } from "./types";

export function char(c: string, debug: any[] = []): Parser<string> {
  return (input: string) => {
    if (input.length === 0) {
      return {
        success: false,
        rest: input,
        message: "unexpected end of input",
      };
    }
    if (input[0] === c) {
      debug.push(`char(${c})(${input}) => ${input[0]}`);
      return { success: true, match: c, rest: input.slice(1) };
    }
    return {
      success: false,
      rest: input,
      message: `expected ${c}, got ${input[0]}`,
    };
  };
}

export function str(s: string): Parser<string> {
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

export function many<T>(parser: Parser<T>): Parser<T[]> {
  return (input: string) => {
    let match: T[] = [];
    let rest = input;
    while (true) {
      let result = parser(rest);
      if (!result.success) {
        return { success: true, match, rest };
      }
      match.push(result.match);
      rest = result.rest;
    }
  };
}

export function many1<T>(parser: Parser<T>): Parser<T[]> {
  return (input: string) => {
    let result = many(parser)(input);
    // this logic doesn't work with optional and not
    if (result.rest !== input) {
      return result;
    }
    return {
      success: false,
      rest: input,
      message: "expected at least one match",
    };
  };
}

export function oneOf(chars: string): Parser<string> {
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

export function or<T>(...parsers: Parser<T>[]): Parser<T> {
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

export function optional<T>(parser: Parser<T>): Parser<T | null> {
  return (input: string) => {
    let result = parser(input);
    if (result.success) {
      return result;
    }
    return { success: true, match: null, rest: input };
  };
}

export function not(parser: Parser<any>): Parser<null> {
  return (input: string) => {
    let result = parser(input);
    if (result.success) {
      return {
        success: false,
        rest: input,
        message: "unexpected match",
      };
    }
    return { success: true, match: null, rest: input };
  };
}

export function between<T>(
  open: Parser,
  close: Parser,
  parser: Parser
): Parser<T> {
  return (input: string) => {
    let result = open(input);
    if (!result.success) {
      return result;
    }
    const parserResult = parser(result.rest);
    if (!parserResult.success) {
      return parserResult;
    }
    result = close(parserResult.rest);
    if (!result.success) {
      return result;
    }
    return { success: true, match: parserResult.match, rest: result.rest };
  };
}

export function sepBy<T>(separator: Parser, parser: Parser): Parser<T[]> {
  return (input: string) => {
    let match: T[] = [];
    let rest = input;
    while (true) {
      let result = parser(rest);
      if (!result.success) {
        return { success: true, match, rest };
      }
      match.push(result.match);
      rest = result.rest;
      result = separator(rest);
      if (!result.success) {
        return { success: true, match, rest };
      }
      rest = result.rest;
    }
  };
}

export function seq<T, U extends string>(
  ...parsers: Parser[]
): Parser<T[], Record<U, any>> {
  return (input: string) => {
    let match: T[] = [];
    let rest = input;
    // @ts-ignore
    let namedMatches: Record<U, any> = {};
    for (let parser of parsers) {
      let result = parser(rest);
      if (!result.success) {
        return result;
      }
      console.log(result.match);
      match.push(result.match);
      rest = result.rest;
      if (result.namedMatches) {
        namedMatches = { ...namedMatches, ...result.namedMatches };
      }
    }
    return { success: true, match, rest, namedMatches };
  };
}

export function capture<U>(
  parser: Parser,
  name: string,
  transform: (x: any) => any = (x) => x
): Parser<any, Record<string, U>> {
  return (input: string) => {
    let result = parser(input);
    if (result.success) {
      return {
        ...result,
        namedMatches: { [name]: transform(result.match) },
      };
    }
    return result;
  };
}

export const space: Parser = oneOf(" \t\n\r");
export const spaces: Parser = many1(space);
export const digit: Parser = oneOf("0123456789");
export const letter: Parser = oneOf("abcdefghijklmnopqrstuvwxyz");
export const alphanum: Parser = oneOf("abcdefghijklmnopqrstuvwxyz0123456789");
export const word: Parser = many1(letter);
export const num: Parser = many1(digit);
export const quote: Parser = oneOf(`'"`);
export const anyChar: Parser = (input: string) => {
  if (input.length === 0) {
    return {
      success: false,
      rest: input,
      message: "unexpected end of input",
    };
  }
  return { success: true, match: input[0], rest: input.slice(1) };
};
