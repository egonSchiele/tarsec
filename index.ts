import {
  capture,
  count,
  getCaptures,
  getResults,
  many1WithJoin,
  seq,
} from "./lib/combinators.js";
import { char, noneOf, spaces, str } from "./lib/parsers.js";
import { Parser } from "./lib/types.js";

/* const foo = capture(count(char("#")), "level");
const result = foo("###");
console.log({ result });
console.log("hi");
 */
//const headingParser: Parser<{ level: number; heading: string }> = seq(
const headingParser = seq(
  [
    capture(count(char("#")), "level"),
    spaces,
    capture(many1WithJoin(noneOf("\n")), "heading"),
    str("\n"),
  ],
  getCaptures
);

const result = headingParser("## a subheading\n");
console.log({ result });

/*
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
 */
