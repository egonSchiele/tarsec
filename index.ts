import {
  capture,
  getCaptures,
  getResults,
  optional,
  or,
  seq,
} from "./lib/combinators.js";
import { char, eof, space, str } from "./lib/parsers.js";
import { createTree } from "./lib/types.js";
/* const parser = seq(
  [
    str("the robot"),
    space,
    str("ate"),
    space,
    or([str("the"), str("the cake")]),
    capture(optional(str(" pie")), "food"),
  ],
  getResults
);
// without needing to backtrack
const resultPie = parser("the robot ate the pie");
console.log(resultPie);
 */

const parser = seq(
  [
    str("the robot"),
    space,
    str("ate"),
    space,
    or([str("the"), str("the cake")]),
    optional(str(" pie")),
    eof,
  ],
  getResults
);
// without needing to backtrack
const resultCake = parser("the robot ate the cake");
console.log(resultCake);
/* 
const tree = createTree([
  str("the robot"),
  space,
  str("ate"),
  space,
  or([str("the"), str("the cake")]),
  optional(str(" pie")),
]);

console.log(tree);
 */

/* const a = char("a");
const b = char("b");
const c = char("c");
const one = or([seq([a, c], getResults), seq([b, c], getResults)]);
const two = seq([or([a, b]), c], getResults);

const result1 = one("ac");
const result2 = one("bc");
const result3 = two("ac");
const result4 = two("bc");
console.log({ result1, result2, result3, result4 });
 */
