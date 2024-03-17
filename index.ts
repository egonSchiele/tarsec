import { char } from "./lib/parsers.js";
import { Subject } from "./lib/subject.js";

const debug: any[] = [];
const r = char("a", debug)("abc");
console.log({ r, debug });
