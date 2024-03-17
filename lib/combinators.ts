import { trace } from "./trace";
import { Parser, ParserSuccess } from "./types";
import { escape, merge, mergeCaptures } from "./utils";

export function many<T>(parser: Parser<T>): Parser<T[]> {
  return trace("many", (input: string) => {
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
  });
}

export function many1<T>(parser: Parser<T>): Parser<T[]> {
  return trace(`many1`, (input: string) => {
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
  });
}

export function manyWithJoin(parser: Parser<string>): Parser<string> {
  return transform<string[], string>(many(parser), (x) => x.join(""));
}

export function many1WithJoin(parser: Parser<string>): Parser<string> {
  return transform<string[], string>(many1(parser), (x) => x.join(""));
}

export function or<T>(parsers: Parser<T>[], name: string = ""): Parser<T> {
  return trace(`or(${name})`, (input: string) => {
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
  });
}

export function optional<T>(parser: Parser<T>): Parser<T | null> {
  return trace<T | null>("optional", (input: string) => {
    let result = parser(input);
    if (result.success) {
      return result;
    }
    return { success: true, match: null, rest: input };
  });
}

export function not(parser: Parser<any>): Parser<null> {
  return trace("not", (input: string) => {
    let result = parser(input);
    if (result.success) {
      return {
        success: false,
        rest: input,
        message: "unexpected match",
      };
    }
    return { success: true, match: null, rest: input };
  });
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
  parsers: Parser<M>[],
  name: string = ""
): Parser<M[], C> {
  return trace(`seq(${name})`, (input: string) => {
    let match: M[] = [];
    let rest = input;
    // @ts-ignore
    let captures: Record<U, any> = {};
    for (let parser of parsers) {
      let result = parser(rest);
      if (!result.success) {
        return result;
      }
      match.push(result.match);
      rest = result.rest;
      if (result.captures) {
        captures = mergeCaptures(captures, result.captures);
      }
    }
    return { success: true, match, rest, captures };
  });
}

export function capture<M, C extends string>(
  parser: Parser<M>,
  name: string
): Parser<M, C> {
  return trace(`captures(${escape(name)})`, (input: string) => {
    let result = parser(input);
    if (result.success) {
      const captures: Record<string, any> = {
        [name]: result.match,
      };
      return {
        ...result,
        captures: mergeCaptures(result.captures || {}, captures),
      };
    }
    return result;
  });
}

export function transform<T, X>(
  parser: Parser<T>,
  transformerFunc: (x: T) => X
): Parser<X> {
  return trace(`transform(${transformerFunc})`, (input: string) => {
    let result = parser(input);
    if (result.success) {
      return {
        ...result,
        match: transformerFunc(result.match),
      };
    }
    return result;
  });
}
