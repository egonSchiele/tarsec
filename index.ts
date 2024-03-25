import {
  capture,
  getCaptures,
  getResults,
  optional,
  or,
  seq,
  seqC,
} from "./lib/combinators.js";
import { char, digit, eof, space, str, word } from "./lib/parsers.js";
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

//console.log(resultCake);

const parser2 = or(capture(digit, "num"), capture(word, "name"));
//const parser3 = seqC(str("hello"), space, capture(word, "name"));

const parsed = parser2("123");
console.log(parsed);
