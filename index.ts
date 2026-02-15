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
import { getDiagnostics, setInputStr, trace } from "./lib/trace.js";

const input = "hello adam";
setInputStr(input);

const parser = seqC(str("hello"), capture(many1WithJoin(letter), "name"));

/* const parser2 = trace(
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
const parser3 = or(parser, parser2); */
try {
  const result = parser(input);
  console.log(result);
  if (!result.success) {
    const diagnostics = getDiagnostics(result, input, "Parsing failed");
    console.log(diagnostics);
    console.log(diagnostics.prettyMessage);
  }
} catch (error) {
  if (error instanceof TarsecError) {
    console.log(error.data.prettyMessage);
    console.log(error);
  } else {
    throw error;
  }
}
