import { trace } from "./trace";
import {
  CaptureParser,
  createTree,
  failure,
  GeneralParser,
  isCaptureResult,
  MergedCaptures,
  MergedResults,
  Parser,
  PlainObject,
  Prettify,
  success,
} from "./types";
import { escape, findAncestorWithNextParser } from "./utils";

export function many<T>(parser: Parser<T>): Parser<T[]> {
  return trace("many", (input: string) => {
    let results: T[] = [];
    let rest = input;
    while (true) {
      let parsed = parser(rest);
      if (!parsed.success) {
        return success(results, rest);
      }
      results.push(parsed.result);
      rest = parsed.rest;
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

export function count<T>(parser: Parser<T>): Parser<number> {
  return trace("count", (input: string) => {
    const result = many(parser)(input);
    if (result.success) {
      return success(result.result.length, result.rest);
    }
    return result;
  });
}

export function manyWithJoin(parser: Parser<string>): Parser<string> {
  return transform<string[], string>(many(parser), (x) => x.join(""));
}

export function many1WithJoin(parser: Parser<string>): Parser<string> {
  return transform<string[], string>(many1(parser), (x) => x.join(""));
}

/* seq<, U>(
  parsers: T,
  transform: (results: MergedResults<T>[], captures: MergedCaptures<T>) => U,
 */
export function or<const T extends readonly Parser<any>[]>(
  parsers: T,
  name: string = ""
): Parser<MergedResults<T>> {
  return trace(`or(${name})`, (input: string) => {
    for (let i = 0; i < parsers.length; i++) {
      let result = parsers[i](input);
      if (result.success) {
        if (i === parsers.length - 1) return result;
        const nextParser = or(parsers.slice(i + 1), name);
        console.log({ nextParser }, parsers.slice(i + 1));
        return {
          ...result,
          nextParser,
        };
      }
    }

    return failure(`all parsers failed`, input);
  });
}

export function optional<T>(parser: Parser<T>): Parser<T | null> {
  return trace("optional", (input: string) => {
    let result = parser(input);
    if (result.success) {
      return result;
    }
    return success(null, input);
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
    return success(null, input);
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
    return success(parserResult.result, result2.rest);
  };
}

export function sepBy<S, P>(
  separator: Parser<S>,
  parser: Parser<P>
): Parser<P[]> {
  return (input: string) => {
    let results: P[] = [];
    let rest = input;
    while (true) {
      const result = parser(rest);
      if (!result.success) {
        return success(results, rest);
      }
      results.push(result.result);
      rest = result.rest;

      const sepResult = separator(rest);
      if (!sepResult.success) {
        return success(results, rest);
      }
      rest = sepResult.rest;
    }
  };
}

export function getResults<R, C>(results: R, captures: C): R {
  return results;
}

export function getCaptures<R, C>(results: R, captures: C): C {
  return captures;
}

export function seq<const T extends readonly GeneralParser<any, any>[], U>(
  parsers: T,
  transform: (results: MergedResults<T>[], captures: MergedCaptures<T>) => U,
  debugName: string = ""
): Parser<U> {
  return trace(`seq(${debugName})`, (input: string) => {
    const results: any[] = [];
    let rest = input;
    const captures: MergedResults<T>[] | any = {};
    const rootNode = createTree(parsers);

    let current = rootNode;
    while (current) {
      const parser = current.parser;
      if (!parser) {
        console.log({ current, parser, results, captures });
        throw new Error("parser is null");
      }
      const parsed = parser(rest);
      current.closed = true;
      console.log({ parsed });
      if (!parsed.success) {
        const ancestor = findAncestorWithNextParser(current);
        if (ancestor) {
          current = ancestor;
          rest = ancestor.input!;
          continue;
        } else {
          return parsed;
        }
      }
      results.push(parsed.result);

      if (parsed.nextParser) {
        console.log("setting next parser", parsed.nextParser);
        current.parser = parsed.nextParser;
        current.input = rest;
        current.closed = false;
      }

      rest = parsed.rest;
      if (isCaptureResult(parsed)) {
        for (const key in parsed.captures) {
          captures[key] = parsed.captures[key];
        }
      }
      current = current.child;
    }

    const result = transform(results, captures);
    return success(result, rest);
  });
}

export function capture<T, const S extends string>(
  parser: Parser<T>,
  name: S
): CaptureParser<T, Record<S, T>> {
  return trace(`capture(${escape(name)})`, (input: string) => {
    let result = parser(input);
    if (result.success) {
      const captures: Record<S, T> | any = {
        [name]: result.result,
      };
      return {
        ...result,
        captures,
      };
    }
    return result;
  });
}

export function wrap<T, const S extends string>(
  parser: Parser<T>,
  name: S
): Parser<Prettify<Record<S, T>>> {
  return trace(`capture(${escape(name)})`, (input: string) => {
    let result = parser(input);
    if (result.success) {
      return {
        ...result,
        result: {
          [name]: result.result,
        },
      };
    }
    return result;
  });
}

/*
export function setCapturesAsMatch<M, C extends PlainObject>(
  parser: Parser<M, C>
): Parser<C> {
  return trace(`setCapturesAsMatch`, (input: string) => {
    let result = parser(input);
    if (result.success) {
      return {
        ...result,
        match: result.captures as any,
        captures: {},
      };
    }
    return result;
  });
}

export function captureCaptures<
  M,
  C extends PlainObject,
  const S extends string
>(parser: Parser<M, C>, name: S): Parser<C, Record<S, C>> {
  return trace(`captureCaptures(${escape(name)})`, (input: string) => {
    return capture(setCapturesAsMatch(parser), name)(input);
  });
} */

/* export function captureCaptures<M, C extends string>(
  parser: Parser<M>,
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
  parser: Parser<T>,
  transformerFunc: (x: T) => X
): Parser<X> {
  return trace(`transform(${transformerFunc})`, (input: string) => {
    let parsed = parser(input);
    if (parsed.success) {
      return {
        ...parsed,
        result: transformerFunc(parsed.result),
      };
    }
    return parsed;
  });
}
