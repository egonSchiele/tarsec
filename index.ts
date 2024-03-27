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
} from "./lib/combinators.js";
import { char, quote, regexParser, space, str } from "./lib/parsers.js";
import { Parser } from "./lib/types.js";
import { parserDebug, parserTime } from "./lib/trace.js";

type Negation = {
  tag: "negation";
  phrase: string;
};

type Site = {
  tag: "site";
  url: string;
};

type ExactMatch = {
  tag: "exactMatch";
  phrase: string;
};

type Word = {
  tag: "word";
  word: string;
};

type GoogleSearchTerm = Negation | Site | ExactMatch | Word;

const negationParser: Parser<Negation> = seq(
  [char("-"), capture(manyTill(space), "phrase")],
  (r, c) => ({ tag: "negation", phrase: c.phrase })
);

const siteParser: Parser<Site> = seq(
  [str("site:"), optional(space), capture(manyTill(space), "url")],
  (r, c) => ({ tag: "site", url: c.url })
);

const exactMatchParser: Parser<ExactMatch> = seq(
  [quote, capture(manyTill(quote), "phrase"), quote],
  (r, c) => ({ tag: "exactMatch", phrase: c.phrase })
);

const wordsParser: Parser<Word> = seq(
  [capture(many1Till(space), "word")],
  (r, c) => ({ tag: "word", word: c.word })
);

const all = or(exactMatchParser, negationParser, siteParser, wordsParser);

const searchParser: Parser<GoogleSearchTerm[]> = seq([all], getResults);

export const googleSearchQueryParser = many(
  seqC(capture(searchParser, "term"), optional(space))
);

/* parserTime("googleSearchQuery", () => {
  const input = 'hello -world site:example.com "exact match"';
  const parsed = googleSearchQueryParser(input);
  console.log(parsed);
});

parserTime("regex", () => {
  const paragraph = "The quick brown fox jumps over the lazy dog. It barked.";
  const regex = /[A-Z]/g;
  const found = paragraph.match(regex);
  console.log(found);
});
 */

const input = "-world";
/* parserDebug("negationParser", () => {
  const parser = seqR(char("-"), manyTill(space));

  const parsed = parser(input);
  console.log(parsed);
});

parserDebug("negationParser with capture", () => {
  const parsed = negationParser("-hello");
  console.log(parsed);
});
 */
/* parserTime("negationParser with capture", () => {
  const parsed = negationParser(input);
  console.log(parsed);
});

parserTime("negationParser with capture2", () => {
  const parsed = negationParser(input);
  console.log(parsed);
});

parserTime("negationParser", () => {
  const parser = seqR(char("-"), manyTill(space));

  const parsed = parser(input);
  console.log(parsed);
});

parserTime("negationParser with manyTillStr", () => {
  const parser = seqR(char("-"), manyTillStr(" "));

  const parsed = parser(input);
  console.log(parsed);
});

parserTime("regex Parser", () => {
  const parser = regexParser("-([^ ]*)");
  const parsed = parser(input);
  console.log(parsed);
});

parserTime("regex", () => {
  const regex = new RegExp("-([^ ]*)");
  const parsed = input.match(regex);
  console.log(parsed);
});

parserTime("regex2", () => {
  const regex = new RegExp("-([^ ]*)");
  const parsed = input.match(regex);
  console.log(parsed);
}); */

function gen() {
  const inputs: string[] = [];
  for (let i = 0; i < 100; i++) {
    inputs.push(`-world${Math.random()}`);
  }
  return inputs;
}

parserTime("negationParser with capture x100", () => {
  gen().forEach((input) => {
    const parsed = negationParser(input);
  });
});

parserTime("negationParser x100", () => {
  const parser = seqR(char("-"), manyTill(space));

  gen().forEach((input) => {
    const parsed = parser(input);
  });
});

parserTime("negationParser with manyTillStr x100", () => {
  const parser = seqR(char("-"), manyTillStr(" "));

  gen().forEach((input) => {
    const parsed = parser(input);
  });
});

parserTime("regex Parser x100", () => {
  const parser = regexParser("-([^ ]*)");

  gen().forEach((input) => {
    const parsed = parser(input);
  });
});

parserTime("regex x100", () => {
  const regex = new RegExp("-([^ ]*)");

  gen().forEach((input) => {
    const parsed = input.match(regex);
  });
});
