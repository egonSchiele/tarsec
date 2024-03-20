export type PlainObject = Record<string, unknown>;
export type ParserSuccess<M, C extends PlainObject> = {
  success: true;
  match: M;
  captures?: C;
  rest: string;
};

export type ParserFailure = {
  success: false;
  rest: string;
  message: string;
};

export type ParserOptions = {
  capture: string;
};

export type ParserResult<M, C extends PlainObject> =
  | ParserSuccess<M, C>
  | ParserFailure;

export type Parser<M, C extends PlainObject> = (
  input: string
) => ParserResult<M, C>;

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

// see <https://stackoverflow.com/a/50375286/3625>
type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (
  x: infer I
) => void
  ? I
  : never;

export type Merged<T> = T extends Parser<infer M, infer C extends PlainObject>[]
  ? UnionToIntersection<C> extends PlainObject
    ? Parser<M[], Prettify<UnionToIntersection<C>>>
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
