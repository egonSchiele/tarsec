/** A generic object type. */
export type PlainObject = Record<string, unknown>;

/** Represents a parse success with no captures. */
export type ParserSuccess<T, R = string> = {
  success: true;
  result: T;
  rest: R;
  nextParser?: Parser<any>;
};

/** Represents a parse success with captures. Notice nextParser is also a CaptureParser. */
export type CaptureParserSuccess<T, C extends PlainObject> = {
  success: true;
  result: T;
  rest: string;
  captures: C;
  nextParser?: CaptureParser<any, any>;
};

/** Represents a parse failure. */
export type ParserFailure<R = string> = {
  success: false;
  rest: R;
  message: string;
};

export type ParserResult<T, R = string> =
  | ParserSuccess<T, R>
  | ParserFailure<R>;

export type CaptureParserResult<T, C extends PlainObject, R = string> =
  | CaptureParserSuccess<T, C>
  | ParserFailure<R>;

/** A parser is any function that takes an arg and returns a ParserResult. */
export type Parser<T, I = string> = (input: I) => ParserResult<T>;

/** A string parser is any function that takes a string and returns a ParserResult. */
export type StringParser<T> = (input: string) => ParserResult<T>;

/** A capture parser is any function that takes an arg and returns a CaptureParserResult.
 * A CaptureParserResult is the same as a ParserResult, except it also includes captures,
 * i.e. matches selected using `capture`. */
export type CaptureParser<T, C extends PlainObject, I = string> = (
  input: I
) => CaptureParserResult<T, C>;

/** A string capture parser is any function that takes a string and returns a CaptureParserResult. */
export type StringCaptureParser<T, C extends PlainObject> = (
  input: string
) => CaptureParserResult<T, C>;

export type GeneralParser<T, C extends PlainObject, I = string> =
  | Parser<T, I>
  | CaptureParser<T, C, I>;

export type GeneralStringParser<T, C extends PlainObject> =
  | Parser<T, string>
  | CaptureParser<T, C, string>;

export function isCaptureResult<T, C extends PlainObject>(
  result: ParserResult<T>
): result is CaptureParserSuccess<T, C> {
  return "captures" in result;
}

/**
 * This typed function is helpful in filtering out the successes
 * from an array of results while preserving type information. For example:
 *
 * ```
 * // type is ParserSuccess[]
 * results.filter(isSuccess);
 *
 * // type is ParserResult[]
 * results.filter(r => r.success);
 * ```
 * @param result - a parser result
 * @returns - true if the result is a success, otherwise false
 */
export function isSuccess<T, R = string>(
  result: ParserResult<T, R>
): result is ParserSuccess<T, R> {
  return result.success;
}

/** Convenience function to return a ParserSuccess */
export function success<T, R = string>(
  result: T,
  rest: R
): ParserSuccess<T, R> {
  return { success: true, result, rest };
}

/** Convenience function to return a CaptureParserSuccess */
export function captureSuccess<T, C extends PlainObject>(
  result: T,
  rest: string,
  captures: C
): CaptureParserSuccess<T, C> {
  return { success: true, result, rest, captures };
}

/** Convenience function to return a ParserFailure */
export function failure<R = string>(
  message: string,
  rest: R
): ParserFailure<R> {
  return { success: false, message, rest };
}

/** Prettify an intersected type, to make it easier to read. */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

/** see <https://stackoverflow.com/a/50375286/3625> */
export type UnionToIntersection<U> = (
  U extends any ? (x: U) => void : never
) extends (x: infer I) => void
  ? I
  : never;

/** Convenience type to get the result type out of a parser. */
type ExtractResults<T> = T extends Parser<infer U> ? U : never;

/** Convenience type to get the capture type out of a capture parser. */
type ExtractCaptures<T> = T extends CaptureParser<any, infer U> ? U : never;

/** Convenience type where given an array of parsers and capture parsers,
 * it returns the types of the capture parsers, like
 * CaptureParser<string, { name: string }> | CaptureParser<number, { age: number }>
 */
type ExtractCaptureParsers<T extends readonly GeneralParser<any, any>[]> =
  Extract<T[number], CaptureParser<any, any>>;

/** Convenience type where given an array of parsers and capture parsers,
 * it returns a single capture type that merges all the capture types. */
export type MergedCaptures<T extends readonly GeneralParser<any, any>[]> =
  Prettify<UnionToIntersection<UnionOfCaptures<T>>>;

/** Convenience type where given an array of parsers and capture parsers,
 * it first gets the capture parsers, then extracts the capture types,
 * and returns a union of all the capture types. Example:
 * { name: string } | { age: number }
 */
export type UnionOfCaptures<T extends readonly GeneralParser<any, any>[]> =
  Prettify<ExtractCaptures<ExtractCaptureParsers<T>>>;

/** Convenience type where given an array of parsers and capture parsers,
 * it returns true if there are any capture parsers, otherwise false. */
export type HasCaptureParsers<T extends readonly GeneralParser<any, any>[]> =
  ExtractCaptureParsers<T> extends never ? false : true;

/**
 * For a given array of GeneralParsers, if any of them is a CaptureParser,
 * PickParserType says the array is an array of CaptureParsers,
 * otherwise it's an array of Parsers. It also correctly merges
 * the result and capture types. This is useful for a combinator like `or`
 * which is not able to infer its return type correctly.
 */
export type PickParserType<
  T extends readonly GeneralParser<any, any>[],
  I = string,
> = I extends string ? PickParserTypeString<T> : PickParserTypeGeneral<T, I>;

/** split out to make types more readable */
export type PickParserTypeGeneral<
  T extends readonly GeneralParser<any, any>[],
  I = string,
> =
  HasCaptureParsers<T> extends true
    ? CaptureParser<MergedResults<T>, UnionOfCaptures<T>, I>
    : Parser<MergedResults<T>, I>;

export type PickParserTypeString<T extends readonly GeneralParser<any, any>[]> =
  HasCaptureParsers<T> extends true
    ? StringCaptureParser<MergedResults<T>, UnionOfCaptures<T>>
    : StringParser<MergedResults<T>>;

/**
 * Like `PickParserType`, but the result is an array of the result types,
 * instead of just a union.
 */
export type PickParserTypeArray<
  T extends readonly GeneralParser<any, any>[],
  I = string,
> =
  HasCaptureParsers<T> extends true
    ? CaptureParser<MergedResults<T>, UnionOfCaptures<T>, I>
    : Parser<MergedResults<T>[], I>;

/** This is used to generate a return type for the `many` and `many1` combinators.
 * Given a parser we want to apply `many` to. Suppose its type is `Parser<string>`.
 * This will return `Parser<string[]>` as the return type.
 *
 * Suppose the parser is a `CaptureParser<string, { name: string }>`.
 * This will return `CaptureParser<string[], { captures: { name: string }[] }>` as the return type.
 */
export type InferManyReturnType<T extends GeneralParser<any, any>> =
  T extends CaptureParser<infer R, infer C>
    ? CaptureParser<R[], { captures: C[] }>
    : T extends Parser<infer R>
      ? Parser<R[]>
      : never;
/* const arr = [str("hello"), space, str("world")] */

/*
  1. No UnionToIntersection because this looks like `string | number` and the intersection is `never`.
  2. Instead of a union, a tuple type would be more useful, but it looks like that's not possible.
     See this answer https://stackoverflow.com/a/55128956
     TLDR, we can't rely on the ordering of a union.
  3. Finally, this just returns a union of all the result types, but `results` is going to be an array,
     so stick a `[]` at the end when you use it. I can't do it here for some reason, messes up the type.
  */
export type MergedResults<T extends readonly GeneralParser<any, any>[]> =
  ExtractResults<T[number]>;

/** Used to create a parser tree for backtracking. */
export type Node = ParserNode | EmptyNode;
export type ParserNode = {
  parent: Node;
  parser: GeneralParser<any, any> | null;
  input?: string;
  child: Node;
  closed: boolean;
};
export type EmptyNode = null;

/** Convenience function to create a ParserNode. */
export function createNode(
  parent: Node | null,
  parser: GeneralParser<any, any>
): ParserNode {
  return {
    parent,
    parser,
    child: null,
    closed: false,
  };
}

/** Convenience function where, given an array of parsers, it creates a tree we can use for backtracking.
 * This tree is what `seq` use. It's used to keep track of the parsers we've tried so far,
 * so we can backtrack if we need to.
 */
export function createTree(parsers: readonly GeneralParser<any, any>[]): Node {
  if (parsers.length === 0) {
    return null;
  }
  const rootNode = createNode(null, parsers[0]);
  let currentNode = rootNode;
  for (let i = 1; i < parsers.length; i++) {
    currentNode.child = createNode(currentNode, parsers[i]);
    currentNode = currentNode.child;
  }
  return rootNode;
}

/** Used by `within`. */
export type Matched = { type: "matched"; value: string };
export type Unmatched = { type: "unmatched"; value: string };
export type WithinResult = Matched | Unmatched;
