import {
  capture,
  count,
  getCaptures,
  getResults,
  many1WithJoin,
  seq,
} from "./lib/combinators.js";
import { char, noneOf, space, spaces, str } from "./lib/parsers.js";
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

type Hello = { name: string };

const helloParser: Parser<Hello> = seq(
  [str("hello"), space, capture(many1WithJoin(noneOf("!")), "name"), char("!")],
  getCaptures
);

const bothParser = seq(
  [capture(headingParser, "heading"), capture(helloParser, "hello")],
  getCaptures
);

const result2 = bothParser("## a subheading\nhello world!");
console.log({ result2 });
if (result2.success) {
  console.log(result2.result);
}
