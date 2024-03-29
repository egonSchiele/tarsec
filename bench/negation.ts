import {
  capture,
  getCaptures,
  getResults,
  many,
  many1Till,
  manyTill,
  manyTillStr,
  optional,
  or,
  seq,
  seqC,
  seqR,
} from "@/lib/combinators";
import { char, quote, regexParser, space, str } from "@/lib/parsers";
import { Parser } from "@/lib/types";
import { parserDebug, printTime } from "@/lib/trace";

function gen() {
  const inputs: string[] = [];
  for (let i = 0; i < 100; i++) {
    inputs.push(`-world${Math.random()}`);
  }
  return inputs;
}

printTime("negationParser with capture x100", () => {
  const negationParser = seqR(char("-"), capture(manyTill(space), "phrase"));

  gen().forEach((input) => {
    const parsed = negationParser(input);
  });
});

printTime("negationParser x100", () => {
  const parser = seqR(char("-"), manyTill(space));

  gen().forEach((input) => {
    const parsed = parser(input);
  });
});

printTime("negationParser with manyTillStr x100", () => {
  const parser = seqR(char("-"), manyTillStr(" "));

  gen().forEach((input) => {
    const parsed = parser(input);
  });
});

printTime("regex Parser x100", () => {
  const parser = regexParser("-([^ ]*)");

  gen().forEach((input) => {
    const parsed = parser(input);
  });
});

printTime("regex x100", () => {
  const regex = new RegExp("-([^ ]*)");

  gen().forEach((input) => {
    const parsed = input.match(regex);
  });
});
