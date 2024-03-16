import { char } from "./lib/parsers.js";
import { Subject } from "./lib/subject.js";

const s = new Subject("hello world");
const result = s.parse([char("h"), char("e"), char("l"), char("l"), char("o")]);
console.log({ result });
