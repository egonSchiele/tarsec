import { trace } from "./trace";
import {
  NonNullableUnionOfObjects,
  Parser,
  PlainObject,
  Prettify,
} from "./types";
import { escape, mergeCaptures } from "./utils";

export function many<T>(parser: Parser<T, never>): Parser<T[], never> {
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

export function many1<T>(parser: Parser<T, never>): Parser<T[], never> {
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

export function count<T, C extends never>(
  parser: Parser<T, C>
): Parser<number, C> {
  return trace("count", (input: string) => {
    const result = many(parser)(input);
    if (result.success) {
      return {
        success: true,
        match: result.match.length,
        rest: result.rest,
      };
    }
    return result;
  });
}

export function manyWithJoin(
  parser: Parser<string, never>
): Parser<string, never> {
  return transform<string[], string>(many(parser), (x) => x.join(""));
}

export function many1WithJoin(
  parser: Parser<string, never>
): Parser<string, never> {
  return transform<string[], string>(many1(parser), (x) => x.join(""));
}

export function or<T>(
  parsers: Parser<T, never>[],
  name: string = ""
): Parser<T, never> {
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

export function optional<T>(parser: Parser<T, never>): Parser<T | null, never> {
  return trace<T | null>("optional", (input: string) => {
    let result = parser(input);
    if (result.success) {
      return result;
    }
    return { success: true, match: null, rest: input };
  });
}

export function not(parser: Parser<any, never>): Parser<null, never> {
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
  open: Parser<O, never>,
  close: Parser<C, never>,
  parser: Parser<P, never>
): Parser<P, never> {
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
  separator: Parser<S, never>,
  parser: Parser<P, never>
): Parser<P[], never> {
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

// see <https://stackoverflow.com/a/50375286/3625>
type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (
  x: infer I
) => void
  ? I
  : never;

type Merged<T> = T extends Parser<infer M, infer C extends PlainObject>[]
  ? UnionToIntersection<C> extends PlainObject
    ? Parser<M, Prettify<UnionToIntersection<C>>>
    : never
  : never;

/* type Merged2<T extends readonly Obj<PlainObject>[]> = UnionToIntersection<
  T[number]["val"]
>; */

//export function seq<M, const T extends PlainObject>(
export function seq<M, const T extends Parser<M, PlainObject>[]>(
  parsers: T,
  name: string = ""
): Merged<T> {
  return trace(`seq(${name})`, (input: string) => {
    let match: M[] = [];
    let rest = input;
    let captures: any = {};
    //const capturesArray: T[] = [];
    for (let parser of parsers) {
      let result = parser(rest);
      if (!result.success) {
        return result;
      }
      match.push(result.match);
      rest = result.rest;
      if (result.captures) {
        for (const key in result.captures) {
          captures[key] = result.captures[key];
        }
        //capturesArray.push(result.captures || {});
      }
    }
    const result = { success: true, match, rest, captures };
    return result;
  });
}

export function capture<M, const S extends string>(
  parser: Parser<M, never>,
  name: S
): Parser<M, Record<S, M>> {
  return trace(`captures(${escape(name)})`, (input: string) => {
    let result = parser(input);
    if (result.success) {
      const captures: Record<S, M> | any = {
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

/* export function captureCaptures<M, C extends string>(
  parser: Parser<M, never>,
  name: string
): Parser<M, C> {
  return trace(`captures(${escape(name)})`, (input: string) => {
    let result = parser(input);
    if (result.success) {
      const captures: Record<string, any> = {
        [name]: result.captures,
      };
      return {
        ...result,
        captures: mergeCaptures(result.captures || {}, captures),
      };
    }
    return result;
  });
}

 */
/* export function shapeCaptures<M, C extends string>(
  parser: Parser<M>,
  func: (captures: Record<string, any>) => Record<string, any>,
  name: string
): Parser<M, C> {
  return trace(`captures(${escape(name)})`, (input: string) => {
    let result = parser(input);
    if (result.success) {
      const captures: Record<string, any> = result.captures || {};

      return {
        ...result,
        captures: func(captures),
      };
    }
    return result;
  });
} */

export function transform<T, X>(
  parser: Parser<T, never>,
  transformerFunc: (x: T) => X
): Parser<X, never> {
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
