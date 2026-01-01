import { within } from "./parsers/within.js";
import { trace } from "./trace.js";
import {
  CaptureParser,
  CaptureParserResult,
  CaptureParserSuccess,
  captureSuccess,
  createTree,
  failure,
  GeneralParser,
  InferManyReturnType,
  isCaptureResult,
  isSuccess,
  MergedCaptures,
  MergedResults,
  Parser,
  ParserResult,
  ParserSuccess,
  PickParserType,
  PlainObject,
  Prettify,
  success,
  UnionOfCaptures,
} from "./types.js";
import { escape, findAncestorWithNextParser, popMany } from "./utils.js";

/**
 * Takes a parser and runs it zero or more times, returning the results as an array.
 * If the parser is a capture parser, it returns the captures as an array in this form:
 *
 * ```ts
 * { captures: <array of captures> }
 * ```
 *
 * @param parser - parser to run
 * @returns - parser that runs the given parser zero to many times,
 * and returns the result as an array
 */
export function many<const T extends GeneralParser<any, any>>(
  parser: T
): InferManyReturnType<T> {
  const _parser = (input: string) => {
    let results: T[] = [];
    let captures: any[] = [];
    let rest = input;

    while (true) {
      let parsed = parser(rest);
      if (!parsed.success) {
        if (Object.keys(captures).length) {
          return captureSuccess(results, rest, { captures });
        } else {
          return success(results, rest);
        }
      }
      results.push(parsed.result);
      if (isCaptureResult(parsed)) {
        captures.push(parsed.captures);
      }
      rest = parsed.rest;

      // don't loop infinitely on empty strings
      if (rest === "") {
        if (Object.keys(captures).length) {
          return captureSuccess(results, rest, { captures });
        } else {
          return success(results, rest);
        }
      }
    }
  }
  return trace("many", _parser) as InferManyReturnType<T>;
}

/**
 * Same as `many`, but fails if the parser doesn't match at least once.
 *
 * @param parser - parser to run
 * @returns a parser that runs the given parser one to many times,
 */
export function many1<const T extends GeneralParser<any, any>>(
  parser: T
): InferManyReturnType<T> {
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
  }) as InferManyReturnType<T>;
}

/**
 * Takes a parser, runs it, and returns the number of times it succeeded.
 * @param parser - parser to run
 * @returns - the number of times the parser succeeded.
 */
export function count<T>(parser: Parser<T>): Parser<number> {
  return trace("count", (input: string) => {
    const result = many(parser)(input);
    if (result.success) {
      if (result.result.length === 0) {
        return failure("expected at least one match", input);
      }
      return success(result.result.length, result.rest);
    }
    return result;
  });
}

/**
 * Takes a parser, runs it n times, and returns the results as an array.
 * If it cannot run the parser n times, it fails without consuming input.
 * @param num - number of times to run the parser
 * @param parser - parser to run
 * @returns - parser that runs the given parser `num` times and returns an array of the results
 */
export function exactly<T>(num: number, parser: Parser<T>): Parser<T[]> {
  return trace("exactly", (input: string) => {
    let results: T[] = [];
    let rest = input;
    for (let i = 0; i < num; i++) {
      let parsed = parser(rest);
      if (!parsed.success) {
        return failure(`expected ${num} matches, got ${i}`, input);
      }
      results.push(parsed.result);
      rest = parsed.rest;
    }
    return success(results, rest);
  });
}

/**
 * Same as `many`, but joins the results into a single string.
 *
 * @param parser - parser to run. The parser must return a string as its result.
 * @returns - parser that runs the given parser zero to many times,
 * and returns the result as a single string
 */
export function manyWithJoin<const T extends GeneralParser<string, any>>(
  parser: T
): GeneralParser<string, any> {
  return trace("manyWithJoin", (input: string) => {
    const result = many(parser)(input);
    if (result.success) {
      return {
        ...result,
        result: result.result.join(""),
      };
    }
    return result;
  });
}

/**
 * Same as `many1`, but joins the results into a single string.
 *
 * @param parser - parser to run. The parser must return a string as its result.
 * @returns - parser that runs the given parser one to many times,
 * and returns the result as a single string
 */
export function many1WithJoin(parser: Parser<string>): Parser<string> {
  return trace("many1WithJoin", (input: string) => {
    const result = many1(parser)(input);
    if (result.success) {
      return {
        ...result,
        result: result.result.join(""),
      };
    }
    return result;
  });
}

/**
 * `or` takes an array of parsers and runs them sequentially.
 * It returns the results of the first parser that succeeds.
 * You can use `capture` in an `or`:
 *
 * ```ts
 * const parser = or(capture(digit, "num"), capture(word, "name"));
 * ```
 *
 * `or` supports backtracking by returning a `nextParser`:
 *
 * ```ts
 * const parser = or(str("hello"), str("hello!"));
 *
 * // this will match the first parser
 * const result = parser("hello");
 *
 * // but or returns the untried parsers as a new parser
 * result.nextParser("hello!"); // works
 *
 * // result.nextParser is the same as or(str("hello!"))
 * ```
 *
 * @param parsers - parsers to try
 * @returns - a parser that tries each parser in order. Returns the result of the first parser that succeeds.
 */
export function or<const T extends readonly GeneralParser<any, any>[]>(
  ...parsers: T
): PickParserType<T> {
  return trace(`or()`, (input: string) => {
    for (let i = 0; i < parsers.length; i++) {
      let result = parsers[i](input);
      if (result.success) {
        if (i === parsers.length - 1) return result;
        const nextParser = or(...parsers.slice(i + 1));
        /* console.log({ nextParser }, parsers.slice(i + 1)); */
        return {
          ...result,
          nextParser,
        };
      }
    }

    return failure(`all parsers failed`, input);
  }) as PickParserType<T>;
}

/**
 * Takes a parser and runs it. If the parser fails,
 * optional returns a success with a null result.
 *
 * @param parser - parser to run
 * @returns - a parser that runs the given parser.
 * If it fails, returns a success with a null result.
 */
export function optional<T>(parser: Parser<T>): Parser<T | null> {
  return trace("optional", (input: string) => {
    let result = parser(input);
    if (result.success) {
      return result;
    }
    return success(null, input);
  });
}

/**
 * Takes a parser and runs it. If the parser fails,
 * `not` returns a success with a `null` result.
 * If the parser succeeds, `not` returns a failure.
 *
 * @param parser - parser to run
 * @returns - a parser that runs the given parser.
 * If it fails, returns a success with a `null` result.
 * If it succeeds, returns a failure.
 */
export function not(parser: Parser<any>): Parser<null> {
  return trace("not", (input: string) => {
    let result = parser(input);
    if (result.success) {
      return {
        success: false,
        rest: input,
        message: "expected parser not to succeed",
      };
    }
    return success(null, input);
  });
}

/**
 * Takes three parsers, `open`, `close`, and `parser`.
 * `between` matches something that matches `parser`,
 * surrounded by `open` and `close`. It returns the result of `parser`.
 * If any of the parsers fail, `between` fails.
 *
 * @param open - parser for the opening delimiter
 * @param close - parser for the closing delimiter
 * @param parser - parser for the content
 * @returns a parser that returns the result of `parser`.
 */
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

/**
 * Parses many instances of the parser separated by separator.
 * @param separator
 * @param parser
 * @returns a parser that runs the given parser zero to many times, separated by the separator parser.
 */
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

/**
 * Convenience function to use as the second argument to `seq` to get all the results from `seq`
 * @param results
 * @param captures
 * @returns `results`
 */
export function getResults<R, C>(results: R, captures: C): R {
  return results;
}

/**
 * Convenience function to use as the second argument to seq to get all the captures.
 * @param results
 * @param captures
 * @returns `captures`
 */
export function getCaptures<R, C>(results: R, captures: C): C {
  return captures;
}

/**
 * `capture` is the only way to create a capture. Given a parser and a name,
 * `capture` runs the parser and saves its result in a captures object
 * with the given name as the key. It returns the result from the parser,
 * and attaches the captures object along with it.
 *
 * @param parser - parser to run
 * @param name - name of the capture
 * @returns - the results of the parser, with the captures object attached.
 */
export function capture<T, const S extends string>(
  parser: Parser<T>,
  name: S
): CaptureParser<T, Record<S, T>> {
  return trace(`capture(${escape(name)})`, (input: string): CaptureParserResult<T, Record<S, T>> => {
    let result = parser(input);
    if (result.success) {
      const captures: Record<S, T> | any = {
        [name]: result.result,
      };
      return {
        ...result,
        captures,
      } as CaptureParserSuccess<T, Record<S, T>>;
    }
    return result;
  });
}

/**
 * `captureCaptures` lifts your captures up a level. Suppose you have a parser like this:
 *
 * ```ts
 * const greeting = seqC(
 *   str("hello"),
 *   spaces,
 *   capture(word, "name"),
 *   str("!"),
 *   spaces,
 *   capture(manynTillStr("?"), "secondPart")
 * )
 *
 * This parses a greeting like "hello Adit! How was your day?" into:
 *
 * ```ts
 * {
 *   name: "Adit",
 *   secondPart: "How was your day?"
 * }
 * ```
 *
 * Now, suppose you decide to refactor this parser into two parsers:
 *
 * ```ts
 * const firstPart = seqC(
 *   str("hello"),
 *   spaces,
 *   capture(word, "name"),
 *   str("!")
 * )
 *
 * const secondPart = seqC(
 *   spaces,
 *   capture(manyTillStr("?"), "secondPart")
 * )
 * ```
 *
 * And put them together:
 *
 * ```ts
 * const greeting = seqC(
 *   firstPart,
 *   secondPart
 * )
 * ```
 *
 * Unfortunately, this will no longer return an object in that shape,
 * because it's not actually capturing anything. Captures in `firstPart`
 * and `secondPart` won't get propagated up. Suppose you try to use `capture` like this:
 * ```ts
 * const greeting = seqC(
 *   capture(firstPart, "firstPart"),
 *   capture(secondPart, "secondPart")
 * )
 * ```
 * Now you'll get an object that looks like this instead:
 *
 * ```ts
 * {
 *   firstPart: {
 *     name: "Adit"
 *   },
 *   secondPart: {
 *     secondPart: "How was your day?"
 *   }
 * }
 * ```
 *
 * What you want is for the captures in the child parsers to get merged up to the parent parser. For that, use `captureCaptures`:
 *
 * ```ts
 * const greeting = seqC(
 *   captureCaptures(firstPart),
 *   captureCaptures(secondPart)
 * )
 * ```
 * @param parser - parser to capture captures from
 * @returns - the parser's result set as the captures object
 */
export function captureCaptures<T extends PlainObject>(
  parser: Parser<T>
): CaptureParser<T, T> {
  const _parser: CaptureParser<T, T> = (input: string): CaptureParserResult<T, T> => {
    let result = parser(input);
    if (result.success) {
      return {
        ...result,
        captures: result.result,
      } as CaptureParserSuccess<T, T>;
    }
    return result;
  }
  return trace(`captureCaptures()`, _parser);
}

/**
 * Returns a parser that consumes input till the given parser succeeds.
 * @param parser - the stop parser
 * @returns a parser that consumes the input string until the stop parser succeeds.
 * Then it returns the consumed input as a string.
 * The stop parser's match is not included in the result.
 */
export function manyTill<T>(parser: Parser<T>): Parser<string> {
  return (input: string) => {
    let current = 0;
    while (current < input.length) {
      const parsed = parser(input.slice(current));
      if (parsed.success) {
        return success(input.slice(0, current), input.slice(current));
      }
      current++;
    }
    return success(input, "");
  };
}

/**
 * Just like `manyTill`, but fails unless at least one character of input is consumed.
 * @param parser - the stop parser
 * @returns a parser that consumes the input string until the stop parser succeeds.
 */
export function many1Till<T>(parser: Parser<T>): Parser<string> {
  return (input: string) => {
    let current = 0;
    while (current < input.length) {
      const parsed = parser(input.slice(current));
      if (parsed.success) {
        if (current === 0) {
          return failure(
            "expected to consume at least one character of input",
            input
          );
        }

        return success(input.slice(0, current), input.slice(current));
      }
      current++;
    }
    if (current === 0) {
      return failure(
        "expected to consume at least one character of input",
        input
      );
    }
    return success(input, "");
  };
}

/**
 * `manyTillOneOf` is an optimized version of `manyTill`.
 * The `manyTill` combinator is slow because it runs the given parser
 * on every character of the string until it succeeds. However, if you
 * just want to consume input until you get to a substring,
 * use `manyTillOneOf`. It uses `indexOf`, which is significantly faster
 * than running a parser over every character.
 *
 * Given an array of strings, this parser consumes input until it hits one of those strings.
 * If none of the strings is found, the parser will consume all input and return success.
 *
 * @param str - the string to stop at
 * @param options - object of optional parameters. { insensitive: boolean }
 * @returns a parser that consumes the input string until one of the given strings is found.
 */
export function manyTillOneOf(
  stops: string[],
  { insensitive = false }: { insensitive?: boolean } = {}
): Parser<string> {
  return trace(`manyTillOneOf(${escape(stops.join(","))})`, (input: string) => {
    const indexes: number[] = [];
    stops.forEach((stop) => {
      const index = insensitive
        ? input.toLocaleLowerCase().indexOf(stop.toLocaleLowerCase())
        : input.indexOf(stop);
      if (index !== -1) {
        indexes.push(index);
      }
    });
    if (indexes.length === 0) {
      return success(input, "");
    }
    const min = Math.min(...indexes);
    return success(input.slice(0, min), input.slice(min));
  });
}

/**
 * `manyTillStr` is an optimized version of `manyTill`.
 * The `manyTill` combinator is slow because it runs the given parser
 * on every character of the string until it succeeds. However, if you
 * just want to consume input until you get to a substring,
 * use `manyTillStr`. It uses `indexOf`, which is significantly faster
 * than running a parser over every character.
 *
 * @param str - the string to stop at
 * @param options - object of optional parameters. { insensitive: boolean }
 * @returns a parser that consumes the input string until the given string is found.
 */
export function manyTillStr(
  str: string,
  { insensitive = false }: { insensitive?: boolean } = {}
): Parser<string> {
  return trace(`manyTillStr(${escape(str)})`, (input: string) => {
    return manyTillOneOf([str], { insensitive })(input);
  });
}

/**
 * Like `manyTillStr`, but case insensitive.
 * @param str - the string to stop at
 * @returns a parser that consumes the input string until the given string is found.
 */
export function iManyTillStr(str: string): Parser<string> {
  return manyTillStr(str, { insensitive: true });
}

/**
 * `map` is a parser combinator that takes a parser and a mapper function.
 * If the parser succeeds, it maps its result using the mapper function.
 * You can think of map as a general `map`, like for functors, applied to a parser.
 * Since `map` itself is a parser, you can use it in `seq` or other combinators.
 *
 * @param parser - parser to run
 * @param mapperFunc - function to map the result of the parser
 * @returns
 */
export function map<R, C extends PlainObject, X>(
  parser: GeneralParser<R, C>,
  mapperFunc: (x: R) => X
): GeneralParser<X, C> {
  return trace(`map(${mapperFunc})`, (input: string) => {
    let parsed = parser(input);
    if (parsed.success) {
      return {
        ...parsed,
        result: mapperFunc(parsed.result),
      };
    }
    return parsed;
  });
}

/**
 * Given a parser that returns a string, `search` looks for all substrings in a string that match that parser.
 * For example, given a parser that matches quoted strings, `search` will return an array of all the quoted strings
 * it finds in the input, as an array.
 *
 * The rest of the input that isn't part of the result is simply joined together and returned as a string.
 * If you need a more structured result + rest, you can use `within` instead.
 *
 * @param parser - a parser that returns a string
 * @returns - a parser that returns an array of strings
 */
export function search(parser: Parser<string>): Parser<string[]> {
  return trace("search", (input: string) => {
    let parsed = within(parser)(input);
    if (parsed.success) {
      const result = parsed.result
        .filter((x) => x.type === "matched")
        .map((x) => x.value);
      const rest = parsed.result
        .filter((x) => x.type === "unmatched")
        .map((x) => x.value)
        .join(" ");
      return success(result, rest);
    }
    return success([], input);
  });
}

/*
To add backtracking support requires a fairly big change. Here's an example that needs backtracking.

```ts
  const parser = seq([
        str("hello "),        
        or(str("world"), str("world!")),
        optional("?")
    ], getResults);
```

If we try to parse `"hello world!"`, the first parser in the OR will succeed, but then we'll get stuck at the `optional`. Instead, we need to go back up the tree and try the second parser in the OR. A few things need to happen.

1. instead of just processing these parsers sequentially in a for loop, we need to model them as a tree
2. the OR parser needs to let us know that there are other branches to try.

For #2, there's an optional `nextParser` key on a parser success. The or parser can use this to say "a parser succeeded and here's the result, but there are other parsers that could be tried". `nextParser` is a parser that runs the remaining branches. So in this example, the OR would return a success with `nextParser = or(str("world"))`.

Next, we need to model this as a tree. Each node in the tree has a parent and child and the parser for that node.

```ts
  parent: Node;
  parser: GeneralParser<any, any> | null;
  child: Node;
```

Hopefully that is self-explanatory. We start at the root of the tree, try the parser there, then use `.child` to go to the next node and so on. We don't model multiple paths as multiple children. To keep the code simple, we do something else.

Each node also has a `closed` key. Once we've run the parser for a node, we mark it `closed`. Closed means there are no more branches here. UNLESS, the parser returns a `nextParser`. In that case, we *don't* mark it closed because there are still other options to try. In that case, we also *replace* the parser on that node with nextParser.

So, going back to the hello world example, let's say we're stuck at the `optional`:

```ts
  const parser = seq([
        str("hello "),        
        or(str("world"), str("world!")),
        optional("?")
    ], getResults);
```

We use `.parent` to go back up the tree. We're looking for a node that isn't closed. If we find one, we start again from there. In this case, we'd find an open node at the or with parser `or(str("world"))`. We can restart from there, but there's a bunch of state to reset.

1. From the new `or` parser, we need to go to the optional parser. We're doing it all again in the same order. This is one reason why it's easier to model this without multiple children. Otherwise, all the children would have to point to the next level, the next level would have to point to all the children in the previous level, and you'd have multiple parents, which is awful to deal with.

2. We have consumed input and added to the results. We need to undo that. At this point, the input is `!`, because we've consumed `hello world`. And the results array is `["hello ", "world"]`. We need to rewind both of those.

To do that, I count how many levels up we've gone to find another branch, and just pop that many elements off the results array. So results is now `["hello "]`. The input is trickier. How would I keep track of what the input was when we were at the OR the last time?

This is where the final key on a tree node comes in. Nodes also have an optional `input` key. 

IF a parser succeeds, and
IF there's a nextParser,
We know we may come back to this node. So we save the current input as `.input` on the node.

This approach has some issues. Notably, it doesn't work if you need to backtrack at multiple points in the tree. The test `backtracking-deep.test.ts` shows this.

The code is also complex and it would be easy to have bugs in this logic. I wish there was a cleaner solution for rewinding state.
*/

/**
 * seq takes an array of parsers and runs them sequentially.
 * If any of the parsers fail, seq fails without consuming any input.
 *
 * The second argument to seq is a function.
 * The first argument of that function is an array of results:
 * one result from each of the parsers you gave to seq.
 * The second is an object containing any captures.
 * You can use this second argument, the transformer function,
 * to transform these however you want and return a result
 *
 * Tarsec includes the utility functions `getResults` and `getCaptures`
 * to just return the results array or captures object respectively for you.
 *
 * Finally, you don't need to use seq at all. You can just hand write the logic.
 * But you'll need to do the error handling
 * and pass the remaining input to the next parser yourself.
 * seq also does some backtracking for you that you will need to do yourself.
 *
 * Also see `seqR` and `seqC` for convenience functions that return the results or captures respectively.
 *
 * @param parsers - parsers to run sequentially
 * @param transform - function to transform the results and captures. The params are the results and captures
 * @param debugName - optional name for trace debugging
 * @returns
 */
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
      /*       console.log({ parsed }); */
      if (!parsed.success) {
        const [ancestor, count] = findAncestorWithNextParser(current);
        if (ancestor) {
          current = ancestor;
          rest = ancestor.input!;

          popMany(results, count);

          continue;
        } else {
          // don't consume input if we're failing
          return { ...parsed, rest: input };
        }
      }

      results.push(parsed.result);

      if (parsed.nextParser) {
        /* console.log("setting next parser", parsed.nextParser); */
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

/** Just like seq except it returns the results.
 * It's like using `seq([parsers], getResults)`.
 */
export function seqR<const T extends readonly GeneralParser<any, any>[]>(
  ...parsers: T
): Parser<MergedResults<T>[]> {
  return seq<T, MergedResults<T>[]>(parsers, getResults);
}

/** Just like seq except it returns the captures.
 * It's like using `seq([parsers], getCaptures)`.
 */
export function seqC<const T extends readonly GeneralParser<any, any>[]>(
  ...parsers: T
): Parser<MergedCaptures<T>> {
  return seq(parsers, getCaptures);
}

/**
 * Match takes an input string and a parser. If the parser matches the input string
 * and consumes the entire input string, `match` returns `true`. Otherwise it returns `false`.
 *
 * @param input - input string
 * @param parser - parser to match input against
 * @returns - true if the parser matches the input and consumes all input, false otherwise
 */
export function match(input: string, parser: GeneralParser<any, any>): boolean {
  const result = parser(input);
  return result.success && result.rest === "";
}

export function ifElse<
  const IF extends GeneralParser<any, any>,
  const ELSE extends GeneralParser<any, any>,
  I = string,
>(condition: boolean, ifParser: IF, elseParser: ELSE): IF | ELSE {
  return trace(`ifElse(${escape(condition)})`, (input: string) => {
    if (condition) {
      return ifParser(input);
    }
    return elseParser(input);
  }) as IF | ELSE;
}

/**
 * Apply multiple parsers to the same input and collect all the results.
 * Consumes no input.
 *
 * @param parsers - parsers to try
 * @returns
 */
export function manyParsers<const T extends readonly GeneralParser<any, any>[]>(
  ...parsers: T
): Parser<ParserResult<MergedResults<T>>[]> {
  return trace(`manyParsers()`, (input: string) => {
    const results: ParserResult<any>[] = [];
    for (let i = 0; i < parsers.length; i++) {
      let result = parsers[i](input);
      results.push(result);
    }
    if (results.some(isSuccess)) {
      return success(results, input);
    }
    return failure("no parsers succeeded", input);
  });
}

/**
 * Runs all the given parsers. If they all succeed, returns their results as an array.
 * Otherwise fails. Consumes no input.
 * @param parsers - parsers to try
 * @returns - An array of results, or a failure.
 */
export function and<const T extends readonly GeneralParser<any, any>[]>(
  ...parsers: T
): PickParserType<T> {
  return trace(`and()`, (input: any) => {
    const results = manyParsers(...parsers)(input);
    if (results.success) {
      const successes = results.result.filter(isSuccess);
      if (successes.length === results.result.length) {
        return success(
          (results.result as ParserSuccess<T>[]).map((r) => r.result),
          input
        );
      }
      return failure("not all parsers succeeded", input);
    }
    return results;
  }) as PickParserType<T>;
}
