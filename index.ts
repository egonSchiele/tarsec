import {
  seq,
  capture,
  many1WithJoin,
  many,
  optional,
  or,
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
    many(space),
    or([str("terraform"), str("required_providers"), str("aws")], "block-name"),
    space,
    optional(str("= ")),
    char("{"),
    many(space),
    or([line, block], "line or block"),
    many(space),
    char("}"),
  ],
  "block"
);

const result2 = block(input);
console.log(result2);
