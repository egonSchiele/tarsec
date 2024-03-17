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

const debug: any[] = [];
const r = char("a", debug)("abc");
console.log({ r, debug });

process.exit();

const helloParser = seq<any, "name">(
  str("hello"),
  space,
  capture<string, "name">(many1WithJoin(noneOf("!")), "name"),
  char("!")
);

const questionParser = seq<any, "question">(
  capture<string, "question">(many1WithJoin(noneOf("?")), "question"),
  char("?")
);

const parser = seq<any, "name" | "question">(
  helloParser,
  space,
  questionParser
);

const result = parser("hello adit! how are you?");
console.log(result);

if (result.success) {
  console.log(result.captures?.name);
}

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
