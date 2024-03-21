import {
  capture,
  getCaptures,
  getResults,
  optional,
  or,
  seq,
} from "./lib/combinators.js";
import { eof, space, str } from "./lib/parsers.js";
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
