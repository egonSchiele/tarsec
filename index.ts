import {
  seq,
  capture,
  many1WithJoin,
  many,
  optional,
  or,
  manyWithJoin,
} from "./lib/combinators.js";
import { noneOf, space, str, char, quote, word } from "./lib/parsers.js";
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
  [many(space), word, many(space), char("="), many(space), quote, word, quote],
  "line"
);

let block: any = char("{");
block = seq<any, string>(
  [
    manyWithJoin(space),
    capture(
      or(
        [str("terraform"), str("required_providers"), str("aws")],
        "block-name"
      ),
      "block-name"
    ),
    space,
    optional(str("= ")),
    char("{"),
    manyWithJoin(space),
    or([line, (x) => block(x)], "line or block"),
    manyWithJoin(space),
    char("}"),
  ],
  "block"
);

const result2 = block(input);
console.log(result2);
/* if (result2.success) {
  console.log(JSON.stringify(result2.match, null, 2));
}
 */
