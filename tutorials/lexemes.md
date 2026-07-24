# Lexemes: your grammar's token vocabulary

Every grammar works at two levels. The bottom level is tokens: an identifier, the number `42`, the keyword `if`, the operator `<=`. The top level is structure built from those tokens: an expression, a statement, a function call. Parsers read best when each level stays at its own altitude. A rule like "a call is a name followed by parenthesized arguments" should not also worry about spaces, comments, or whether `<` accidentally matched half of `<=`.

`makeLexemes` builds that bottom level for you. You describe your language's tokens once. It returns ordinary tarsec parsers that handle the token-level concerns, so your grammar rules only ever talk about structure.

This is not a lexer. There is no separate tokenizing pass and no token array. Each helper scans and parses in a single step, and you compose them like any other tarsec parser.

## Setup

```ts
import { makeLexemes } from "tarsec";

const lx = makeLexemes({
  whitespace: " \t\n",
  lineComment: "//",
  keywords: ["if", "then", "else"],
});
```

## The discipline

All the helpers follow one rule:

> Every token eats its own **trailing** whitespace.
> Eat **leading** whitespace once, at the top.

Follow that rule and whitespace disappears from your grammar entirely. You never write `spaces` between two tokens again.

```ts
const parse = (input) => myGrammar(lx.skipWhitespace(input));
```

## Tokens from parsers: `lexeme` and `symbol`

`lexeme(p)` runs any parser and then eats trailing whitespace. It turns a raw parser into a token.

```ts
const integer = lx.lexeme(map(regexParser("^[0-9]+"), Number));

integer("42   + 1");  // => { success: true, result: 42, rest: "+ 1" }
```

`symbol(s)` is `lexeme(str(s))`: match a literal, then eat whitespace.

```ts
lx.symbol("=")("=  5");  // => { success: true, result: "=", rest: "5" }
```

`lexeme` preserves captures, so `lx.lexeme(capture(word, "name"))` still captures `name`.

## Keywords and identifiers

Keywords are a correctness problem, not a whitespace problem. A naive `str("if")` happily matches the front of `ifx`, and a naive identifier parser happily matches `if`. Both bugs vanish when the token layer knows which words are reserved:

```ts
lx.keyword("if")("if x");   // matches
lx.keyword("if")("ifx");    // fails: "ifx" is not the keyword
lx.identifier("ifx");       // matches: "ifx" is an ordinary name
lx.identifier("if");        // fails: reserved
```

The identifier charset is configurable through `identStart` and `identRest`. Each accepts a string of characters or a `CharPredicate`, the same fast predicate type `takeWhile` uses.

## Operators

Operators have the same partial-match problem as keywords. `str("<")` matches the front of `<=`, which silently turns `a <= b` into `a < (= b)`. `operator` is the symbolic counterpart of `keyword`:

```ts
lx.operator("<")("< 2");    // matches
lx.operator("<")("<= 2");   // fails: "<=" is a different operator
lx.operator("<=")("<= 2");  // matches
```

The rejection uses an operator charset, which you can override with `operatorChars` in the config.

## Brackets and lists

Two shapes appear in almost every language: something wrapped in delimiters, and things separated by commas. The helpers name them directly:

```ts
lx.parens(p)      // p between "(" and ")"
lx.brackets(p)    // p between "[" and "]"
lx.braces(p)      // p between "{" and "}"
lx.commaSep(p)    // zero or more p, comma-separated
lx.commaSep1(p)   // one or more p, comma-separated
```

They compose. An argument list is one line that reads exactly like its grammar rule:

```ts
const argumentList = lx.parens(lx.commaSep(lx.identifier));

argumentList("(a, b, c)");  // => { success: true, result: ["a", "b", "c"], rest: "" }
```

## Comments and line continuations

`lineComment` makes the whitespace skipper eat comments too. It stops at the newline without consuming it, because some grammars treat newlines as significant. Set `lineContinuation: true` to also treat backslash-newline as whitespace.

## A complete example

Here is an expression parser for arithmetic with comparison, built entirely from the token layer plus `buildExpressionParser`:

```ts
import { buildExpressionParser, makeLexemes, map, regexParser } from "tarsec";

const lx = makeLexemes({ whitespace: " \t\n" });
const integer = lx.lexeme(map(regexParser("^[0-9]+"), Number));

const expr = buildExpressionParser(integer, [
  [
    { op: lx.operator("*"), assoc: "left", apply: (a, b) => a * b },
    { op: lx.operator("/"), assoc: "left", apply: (a, b) => a / b },
  ],
  [
    { op: lx.operator("+"), assoc: "left", apply: (a, b) => a + b },
    { op: lx.operator("-"), assoc: "left", apply: (a, b) => a - b },
  ],
  [
    { op: lx.operator("<="), assoc: "left", apply: (a, b) => (a <= b ? 1 : 0) },
    { op: lx.operator("<"), assoc: "left", apply: (a, b) => (a < b ? 1 : 0) },
  ],
]);

expr("1 + 2 * 3");     // => { success: true, result: 7 }
expr("2 < 1 + 5");     // => { success: true, result: 1 }
```

Notice what the grammar does not contain: no whitespace handling, no comment handling, and no risk that `<` steals the front of `<=`. Those concerns live in the token layer, where you wrote them once.
