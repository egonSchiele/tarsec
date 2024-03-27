import {
  capture,
  getCaptures,
  getResults,
  many,
  many1Till,
  manyTill,
  optional,
  or,
  seq,
  seqC,
  seqR,
} from "@/lib/combinators";
import { char, quote, space, str } from "@/lib/parsers";
import { Parser } from "@/lib/types";

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
