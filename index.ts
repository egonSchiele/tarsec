import {
  capture,
  many1,
  many1WithJoin,
  map,
  or,
  seqC,
  parseError,
} from "./lib/combinators.js";
import { digit, letter, str } from "./lib/parsers.js";
import { TarsecError } from "./lib/tarsecError.js";
import { setInputStr, trace } from "./lib/trace.js";

const input = "hello adam";
setInputStr(input);

const parser = seqC(
  str("hello"),
  parseError("expected name", capture(many1WithJoin(letter), "name")),
);
const parser2 = trace(
  "foo",
  seqC(
    str("age"),
    parseError(
      "expected age",
      capture(
        map(many1WithJoin(digit), (x) => parseInt(x)),
        "age",
      ),
    ),
  ),
);
const parser3 = or(parser, parser2);
try {
  const result = parser3(input);
  console.log(result);
} catch (error) {
  if (error instanceof TarsecError) {
    console.log(error.message);
  } else {
    throw error;
  }
}
