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
const helloParser = seq(
  str("hello"),
  space,
  capture(many1(noneOf("!")), "name", join),
  char("!")
);

const questionParser = seq(
  capture(many1(noneOf("?")), "question", join),
  char("?")
);

const parser = seq(helloParser, space, questionParser);

const result = parser("hello adit! how are you?");
console.log(result);
