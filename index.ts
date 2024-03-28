import {
  capture,
  getCaptures,
  getResults,
  many,
  many1Till,
  manyTill,
  manyTillStr,
  optional,
  or,
  seq,
  seqC,
  seqR,
} from "./lib/combinators.js";
import { char, quote, regexParser, space, str } from "./lib/parsers.js";
import { Parser } from "./lib/types.js";
import { parserDebug, parserTime } from "./lib/trace.js";

const result = regexParser("([a-zA-Z0-9_]+)")("!!abc123!!");
console.log({ result });

const input = "hello world";
const pattern = "^[a-z]+";
const parser: Parser<string> = regexParser(pattern);

const result2 = parser(input);
console.log({ result2 });
