# Lexemes: handling whitespace in one place

Most grammars don't care about whitespace, but naive combinator parsers end up
sprinkling `spaces` / `optional(spaces)` between every two tokens. `makeLexemes`
fixes that with one discipline borrowed from Parsec's token parsers:

> Every token-shaped parser eats its own **trailing** whitespace.
> Eat **leading** whitespace once, at the top.

Note this is *not* a lexer: there's no separate tokenizing pass and no token
array. The helpers are ordinary tarsec parsers you use directly in your grammar.

## Setup

```ts
import { makeLexemes } from "tarsec";

const lx = makeLexemes({
  whitespace: " \t\n",   // what counts as whitespace
  lineComment: "//",     // optional: skip line comments too
});
```

## The helpers

```ts
lx.symbol("+")          // matches "+", eats trailing whitespace
lx.lexeme(p)            // your parser p, then trailing whitespace
lx.identifier           // an identifier (customizable charset)
lx.keyword("if")        // "if" but NOT "ifx"
lx.whitespace           // the whitespace skipper as a parser (always succeeds)
lx.skipWhitespace(s)    // the same skipper as a plain function: returns the rest
```

`lexeme` preserves captures: `lx.lexeme(capture(word, "name"))` still captures.

Comments are eaten up to — but not including — the newline, so grammars where
newlines are significant (like bash) still see them. Pass
`lineContinuation: true` to also treat backslash-newline as whitespace.

## Example: arithmetic with whitespace

```ts
import { buildExpressionParser, makeLexemes, map, regexParser } from "tarsec";

const lx = makeLexemes({ whitespace: " \t\n" });
const integer = lx.lexeme(map(regexParser("^[0-9]+"), Number));

const expr = buildExpressionParser(integer, [
  [
    { op: lx.symbol("*"), assoc: "left", apply: (a, b) => a * b },
    { op: lx.symbol("/"), assoc: "left", apply: (a, b) => a / b },
  ],
  [
    { op: lx.symbol("+"), assoc: "left", apply: (a, b) => a + b },
    { op: lx.symbol("-"), assoc: "left", apply: (a, b) => a - b },
  ],
]);

expr("1 + 2 * 3");   // => { success: true, result: 7 }
```

## Keywords vs identifiers

If your language has keywords, list them and `identifier` will refuse them
while `keyword` requires exact matches:

```ts
const lx = makeLexemes({ whitespace: " \t", keywords: ["if", "then"] });

lx.identifier("ifx");    // ok: "ifx" is an identifier
lx.identifier("if");     // fails: reserved
lx.keyword("if")("ifx"); // fails: not the exact keyword
lx.keyword("if")("if");  // ok
```

The identifier charset is configurable via `identStart` / `identRest` — either
a string of characters or a `CharPredicate` (the same fast predicate type
`takeWhile` uses).
