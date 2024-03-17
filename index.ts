import {
  capture,
  char,
  many,
  many1,
  many1WithJoin,
  noneOf,
  oneOf,
  optional,
  or,
  quote,
  seq,
  space,
  spaces,
  str,
  word,
} from "./lib/parsers.js";

/* const debug: any[] = [];
const r = char("a", debug)("abc");
console.log({ r, debug });
 */

const helloParser = seq<any, "name">(
  str("hello"),
  space,
  capture<string, "name">(many1WithJoin(noneOf("!")), "name"),
  char("!")
);

const questionParser = seq<any, "question">(
  capture<string>(many1(noneOf("?")), "question", join),
  char("?")
);

const parser = seq<any, "name" | "question">(
  helloParser,
  space,
  questionParser
);

const result = parser("hello adit! how are you?");
console.log(result);

/*
const input = `terraform {
    required_providers {
      aws = {
        source = "hashicorp"
      }
    }
  }`;

const line = seq(
  many(space),
  word,
  many(space),
  char("="),
  many(space),
  quote,
  word,
  quote
);
let block: any = char("{");
block = seq(
  many(space),
  or(str("terraform"), str("required_providers"), str("aws")),
  space,
  optional(str("= ")),
  char("{"),
  many(space),
  or(line, block),
  many(space),
  char("}")
);

const result2 = block(input);
console.log(result2);
 */
