export type PlainObject = Record<string, unknown>;
export type ParserSuccess<T> = {
  success: true;
  match: T;
  rest: string;
};

export type CaptureParserSuccess<T, C> = ParserSuccess<T> & {
  captures: C;
};

export type ParserFailure = {
  success: false;
  rest: string;
  message: string;
};

export type ParserResult<T> = ParserSuccess<T> | ParserFailure;
export type CaptureParserResult<T, C> =
  | CaptureParserSuccess<T, C>
  | ParserFailure;

export type Parser<T> = (input: string) => ParserResult<T>;
export type CaptureParser<T, C> = (input: string) => CaptureParserResult<T, C>;

export function success<T>(match: T, rest: string): ParserSuccess<T> {
  return { success: true, match, rest };
}

export function captureSuccess<T, C>(
  match: T,
  rest: string,
  captures: C
): CaptureParserSuccess<T, C> {
  return { success: true, match, rest, captures };
}

export function failure(message: string, rest: string): ParserFailure {
  return { success: false, message, rest };
}

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

// see <https://stackoverflow.com/a/50375286/3625>
type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (
  x: infer I
) => void
  ? I
  : never;

export type Merged<T> = T extends Parser<infer M extends PlainObject>[]
  ? UnionToIntersection<M> extends PlainObject
    ? Parser<Prettify<UnionToIntersection<M>>>
    : never
  : never;

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
