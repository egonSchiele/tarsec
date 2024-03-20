import {
  capture,
  captureCaptures,
  count,
  many1WithJoin,
  seq,
} from "./lib/combinators.js";
import { char, noneOf, space, spaces, str } from "./lib/parsers.js";
import { Parser, PlainObject } from "./lib/types.js";

const headingParser = seq([
  capture(count(char("#")), "level"),
  spaces,
  capture(many1WithJoin(noneOf("\n")), "heading"),
  str("\n"),
]);

const helloParser = seq([
  str("hello"),
  space,
  capture(many1WithJoin(noneOf("!")), "name"),
  char("!"),
]);

const bothParser = seq([
  captureCaptures(headingParser, "heading"),
  captureCaptures(helloParser, "hello"),
]);

const result2 = bothParser("## a subheading\nhello world!");
console.log({ result2 });
if (result2.success) {
  console.log(result2.match);
  console.log(result2.captures);
}
