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

## What you configure vs. what you call

`makeLexemes` takes one config object and returns one bundle of helpers. The config describes facts about your language. The helpers are what you call while building your grammar.

You configure, once:

| Config field | What it describes |
|---|---|
| `whitespace` | The characters every token eats after itself. |
| `lineComment` | A comment marker. Comments count as whitespace. |
| `lineContinuation` | Whether backslash-newline counts as whitespace. |
| `keywords` | The reserved words. `identifier` refuses them. |
| `identStart`, `identRest` | The identifier charsets. |
| `operatorChars` | The characters operators are made of. |

You call, at each grammar site:

| Helper | What it returns |
|---|---|
| `lx.lexeme(p)` | `p` as a token: its result, then trailing whitespace eaten. |
| `lx.symbol("=")` | A parser for the literal `=`, as a token. |
| `lx.identifier` | A parser for one identifier. Rejects keywords. |
| `lx.keyword("if")` | A parser for exactly the word `if`. Rejects `ifx`. |
| `lx.operator("<")` | A parser for exactly the operator `<`. Rejects `<=`. |
| `lx.parens(p)` | A parser for `p` between `(` and `)`. |
| `lx.brackets(p)` | A parser for `p` between `[` and `]`. |
| `lx.braces(p)` | A parser for `p` between `{` and `}`. |
| `lx.commaSep(p)` | A parser for zero or more `p`, comma-separated. |
| `lx.commaSep1(p)` | A parser for one or more `p`, comma-separated. |
| `lx.whitespace` | The whitespace skipper as a parser. Always succeeds. |
| `lx.skipWhitespace(s)` | The skipper as a plain function. Returns the rest. |

Note what is not in the config: your language's operators and bracket shapes. You do not declare `<=` anywhere up front. You call `lx.operator("<=")` at the grammar site that needs it, the same way you call `lx.keyword("if")`. The config only supplies the charsets those helpers use to find token boundaries.

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

Here is a parser for a tiny language of `let` statements and function calls:

```
# starting values
let x = 5
let y = add(x, 2)
```

The grammar is three rules. Each one is built almost entirely from `lx` helpers:

```ts
import { lazy, makeLexemes, many, map, or, regexParser, seqR } from "tarsec";

const lx = makeLexemes({
  whitespace: " \t\n",
  lineComment: "#",
  keywords: ["let"],
});

const number = lx.lexeme(map(regexParser("^[0-9]+"), Number));

// expression → call | number | identifier
const expression = or(
  lazy(() => call),
  number,
  lx.identifier,
);

// call → identifier "(" expression, ... ")"
const call = map(
  seqR(lx.identifier, lx.parens(lx.commaSep(expression))),
  ([name, args]) => ({ call: name, args }),
);

// statement → "let" identifier "=" expression
const statement = map(
  seqR(lx.keyword("let"), lx.identifier, lx.operator("="), expression),
  ([, name, , value]) => ({ name, value }),
);

const program = (input) => many(statement)(lx.skipWhitespace(input));
```

Running it on the input above:

```ts
program("# starting values\nlet x = 5\nlet y = add(x, 2)\n");
// => { success: true, result: [
//      { name: "x", value: 5 },
//      { name: "y", value: { call: "add", args: ["x", 2] } },
//    ], rest: "" }
```

Notice what the grammar does not contain. No whitespace or comment handling: the tokens ate it. No check that `let` is a whole word: `keyword` did it. No argument-list plumbing: `parens(commaSep(...))` reads exactly like the rule it implements. The token layer absorbed every concern that was not structure.
