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

export function between<O, C, P>(
  open: Parser<O>,
  close: Parser<C>,
  parser: Parser<P>
): Parser<P> {
  return (input: string) => {
    const result1 = open(input);
    if (!result1.success) {
      return result1;
    }
    const parserResult = parser(result1.rest);
    if (!parserResult.success) {
      return parserResult;
    }
    const result2 = close(parserResult.rest);
    if (!result2.success) {
      return result2;
    }
    return { success: true, match: parserResult.match, rest: result2.rest };
  };
}

export function sepBy<S, P>(
  separator: Parser<S>,
  parser: Parser<P>
): Parser<P[]> {
  return (input: string) => {
    let match: P[] = [];
    let rest = input;
    while (true) {
      const result = parser(rest);
      if (!result.success) {
        return { success: true, match, rest };
      }
      match.push(result.match);
      rest = result.rest;

      const sepResult = separator(rest);
      if (!sepResult.success) {
        return { success: true, match, rest };
      }
      rest = sepResult.rest;
    }
  };
}

export function seq<M, C extends string>(
  ...parsers: Parser<M>[]
): Parser<M[], C> {
  return (input: string) => {
    let match: M[] = [];
    let rest = input;
    // @ts-ignore
    let namedMatches: Record<U, any> = {};
    for (let parser of parsers) {
      let result = parser(rest);
      if (!result.success) {
        return result;
      }
      match.push(result.match);
      rest = result.rest;
      if (result.captures) {
        namedMatches = { ...namedMatches, ...result.captures };
      }
    }
    return { success: true, match, rest, captures: namedMatches };
  };
}

export function capture<M, C extends string>(
  parser: Parser<M>,
  name: string,
  transform: (x: M) => M = (x) => x
): Parser<M, C> {
  return (input: string) => {
    let result = parser(input);
    if (result.success) {
      const captures: Record<string, any> = {
        [name]: transform(result.match) as any,
      };
      return {
        ...result,
        captures,
      };
    }
    return result;
  };
}

export function transform<T, X>(
  parser: Parser<T>,
  transformerFunc: (x: T) => X
): Parser<X> {
  return (input: string) => {
    let result = parser(input);
    if (result.success) {
      return {
        ...result,
        match: transformerFunc(result.match),
      };
    }
    return result;
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
