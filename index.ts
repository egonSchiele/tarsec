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

const parser = seq(
  [
    str("the robot"),
    space,
    str("ate"),
    space,
    or(str("the"), str("the cake-")),
    space,
    or(str("cake"), str("cake cake")),
    str("!"),
    eof,
  ],
  getResults
);

const resultCake = parser("the robot ate the cake- cake!");

console.log(resultCake);
