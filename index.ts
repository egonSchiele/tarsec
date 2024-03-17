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
/* 
const helloParser = seq<any, "name">([
  str("hello"),
  space,
  capture<string, "name">(many1WithJoin(noneOf("!")), "name"),
  char("!"),
]);

const questionParser = seq<any, "question">([
  capture<string, "question">(many1WithJoin(noneOf("?")), "question"),
  char("?"),
]);

const parser = seq<any, "name" | "question">([
  helloParser,
  space,
  questionParser,
]);

const result = parser("hello adit! how are you?");
console.log(result); */

/* 
if (result.success) {
  console.log(result.captures?.name);
}  */

const input = `terraform {
    required_providers {
      aws = {
        source = "hashicorp"
      }
    }
  }`;

const line = seq<any, string>(
  [
    many(space),
    capture(word, "key"),
    many(space),
    char("="),
    many(space),
    capture(quotedString, "value"),
  ],
  "line"
);

let block: any = char("{");
block = shapeCaptures(
  seq<any, string>(
    [
      manyWithJoin(space),
      capture(
        or(
          [str("terraform"), str("required_providers"), str("aws")],
          "blockName"
        ),
        "blockName"
      ),
      space,
      optional(str("= ")),
      char("{"),
      manyWithJoin(space),
      // this works
      or([line, (x) => block(x)], "line or block"),
      // but this doesnt
      // many(or([line, (x) => block(x)], "line or block")),
      // nor this
      // many1(or([line, (x) => block(x)], "line or block")),
      manyWithJoin(space),
      char("}"),
    ],
    "block"
  ),
  ({ blockName }) => ({ blockName }),
  "block"
);

const result2 = block(input);
console.log(result2);
if (result2.success) {
  console.log(JSON.stringify(result2.captures, null, 2));
}
