import {
  capture,
  char,
  many1,
  noneOf,
  seq,
  space,
  str,
} from "./lib/parsers.js";

/* const debug: any[] = [];
const r = char("a", debug)("abc");
console.log({ r, debug });
 */

const join = (x: string[]) => x.join("");
const helloParser = seq<any, "name">(
  str("hello"),
  space,
  capture<string>(many1(noneOf("!")), "name", join),
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
if (result.success === true) {
  console.log(result.namedMatches?.name);
  console.log(result.namedMatches?.question);
}
