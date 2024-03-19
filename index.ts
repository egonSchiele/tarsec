import {
  seq,
  capture,
  many1WithJoin,
  many,
  optional,
  or,
  manyWithJoin,
  transform,
  many1,
  captureCaptures,
  shapeCaptures,
  count,
} from "./lib/combinators.js";
import {
  noneOf,
  space,
  str,
  char,
  quote,
  word,
  quotedString,
} from "./lib/parsers.js";
import {
  DeepNonNullable,
  Merge,
  NonNullObject,
  NonNullableUnionOfObjects,
  Parser,
  PlainObject,
  Prettify,
  UnionToIntersection,
} from "./lib/types.js";

const fooParser = seq([
  capture(many1(noneOf("!")), "name22"),
  capture(count(char("#")), "name22"),
]);

const helloParser = seq([
  str("hello"),
  space,
  capture(many1WithJoin(noneOf("!")), "name22"),
  capture(many1WithJoin(noneOf("!")), "name221"),
  char("!"),
]);
/* const helloParser = seq<string, { name22: string; namasde: string }>([
  str("hello"),
  space,
  capture(many1WithJoin(noneOf("!")), "name22"),
  capture(many1WithJoin(noneOf("!")), "namasde"),
  char("!"),
]);
 */
const result = helloParser("hello world!");
if (result.success) {
  console.log(result.captures?.name22);
  console.log(result.match);
}

type Obj<T extends PlainObject> = {
  val: T;
};

function foo<const T extends PlainObject>(
  x: Array<Obj<T>>
): Prettify<
  UnionToIntersection<NonNullableUnionOfObjects<(typeof x)[number]["val"]>>
> {
  const obj: any = { val: {} };
  for (const item of x) {
    for (const key in item.val) {
      obj.val[key] = item.val[key];
    }
  }
  return obj;
}

const v1 = { val: { key1: 1 } };
const v2 = { val: { key2: 2 } };

const objectLiteralArray = [{ val: { key1: 1 } }, { val: { key2: 2 } }];
const varsArray = [v1, v2];
/* const v1: Obj<{ key1: 1 }> = { val: { key1: 1 } };
const v2: Obj<{ key2: 2 }> = { val: { key2: 2 } };
 */ const x = foo([v1, v2]);
const x2 = foo([{ val: { key1: 1 } }, { val: { key2: 2 } }]);

const states = [
  {
    name: "California",
    abbreviation: "CA",
  },
  { name: "New York", abbreviation: "NY" },
] as const;

type State = (typeof states)[number];

type Bar = Merge<[{ key1: 1 }, { key2: 2 }]>;

type A = Prettify<
  NonNullableUnionOfObjects<
    | {
        readonly key1: number;
        readonly key2: undefined;
      }
    | {
        readonly key1: undefined;
        readonly key2: number;
      }
  >
>;

type B = UnionToIntersection<A>;

type C = Prettify<B>;
