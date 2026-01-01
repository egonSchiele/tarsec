import { capture, many1, many1WithJoin, map, or, seqC } from "./lib/combinators";
import { digit, letter, str } from "./lib/parsers";
import { trace } from "./lib/trace";

const parser = seqC(str("hello"), capture(many1WithJoin(letter), "name"));
const parser2 = trace("foo", seqC(str("hello"), capture(map(many1WithJoin(digit), (x) => parseInt(x)), "age")))
const parser3 = or(parser, parser2);
const parser4 = trace("asdasd", or(parser, parser2));