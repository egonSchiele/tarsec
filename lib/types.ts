export type PlainObject = Record<string, unknown>;
export type ParserSuccess<T> = {
  success: true;
  result: T;
  rest: string;
};

export type CaptureParserSuccess<
  T,
  C extends PlainObject
> = ParserSuccess<T> & {
  captures: C;
};

export type ParserFailure = {
  success: false;
  rest: string;
  message: string;
};

export type ParserResult<T> = ParserSuccess<T> | ParserFailure;
export type CaptureParserResult<T, C extends PlainObject> =
  | CaptureParserSuccess<T, C>
  | ParserFailure;

export type Parser<T> = (input: string) => ParserResult<T>;
export type CaptureParser<T, C extends PlainObject> = (
  input: string
) => CaptureParserResult<T, C>;

export type GeneralParser<T, C extends PlainObject> =
  | Parser<T>
  | CaptureParser<T, C>;

export function isCaptureResult<T, C extends PlainObject>(
  result: ParserResult<T>
): result is CaptureParserSuccess<T, C> {
  return "captures" in result;
}

export function success<T>(result: T, rest: string): ParserSuccess<T> {
  return { success: true, result, rest };
}

export function captureSuccess<T, C extends PlainObject>(
  result: T,
  rest: string,
  captures: C
): CaptureParserSuccess<T, C> {
  return { success: true, result, rest, captures };
}

export function failure(message: string, rest: string): ParserFailure {
  return { success: false, message, rest };
}

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

// see <https://stackoverflow.com/a/50375286/3625>
export type UnionToIntersection<U> = (
  U extends any ? (x: U) => void : never
) extends (x: infer I) => void
  ? I
  : never;

type ExtractResults<T> = T extends Parser<infer U> ? U : never;
type ExtractCaptures<T> = T extends CaptureParser<any, infer U> ? U : never;

type ExtractCaptureParsers<T extends readonly GeneralParser<any, any>[]> =
  Extract<T[number], CaptureParser<any, any>>;

export type MergedCaptures<T extends readonly GeneralParser<any, any>[]> =
  Prettify<UnionToIntersection<ExtractCaptures<ExtractCaptureParsers<T>>>>;

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

/* export type Merge2<O extends Array<T>, T = any> = Prettify<
  UnionToIntersection<O[number]>
>;

export type NonNullObject<T> = {
  [K in keyof T]: T[K] extends null | undefined ? never : T[K];
}; */

/* export type NonNullableUnionOfObjects<T> = T extends object
  ? RemoveNeverKeys<DeepNonNullable<T>>
  : T;

export type DeepNonNullable<T> = {
  [P in keyof T]-?: NonNullable<T[P]>;
}; */

/* export type FilterNeverKeys<T> = {
  [K in keyof T]: T[K] extends never ? never : K;
};
 */
/* type ValueOf<T> = T[keyof T]; */
/* type RemoveNeverKeys<T> = Pick<T, ValueOf<FilterNeverKeys<T>>>; */

export type Node = ParserNode | EmptyNode;
export type ParserNode = {
  parent: Node;
  parser: GeneralParser<any, any>;
  child: Node;
};
export type EmptyNode = null;

export function createNode(
  parent: Node | null,
  parser: GeneralParser<any, any>
): ParserNode {
  return {
    parent,
    parser,
    child: null,
  };
}

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
