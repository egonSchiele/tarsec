# Parsing expressions

This tutorial covers how to parse recursive, nested expressions like `1 * (2 - (3 / 4))` using tarsec's `lazy` combinator and `buildExpressionParser`.

## The problem

Suppose you want to parse arithmetic expressions. The tricky parts are:

1. **Recursion**: parenthesized sub-expressions like `(2 - (3 / 4))` contain expressions inside expressions.
2. **Operator precedence**: `1 + 2 * 3` should be `7`, not `9`.
3. **Associativity**: `10 - 3 - 2` should be `5` (left-to-right), but `2 ^ 3 ^ 2` should be `512` (right-to-left).

Let's tackle these one at a time.

## Recursion with `lazy`

In tarsec, a parser is just a function. If you want a parser that references itself, you run into a problem:

```ts
// This doesn't work: `expr` isn't defined yet when we try to use it
const expr = or(number, seqR(char("("), expr, char(")")));
//                                       ^^^^ ReferenceError
```

`lazy` solves this by deferring the reference:

```ts
const expr = or(
  number,
  map(
    seqR(char("("), lazy(() => expr), char(")")),
    ([_open, inner, _close]) => inner
  )
);
```

`lazy(() => expr)` doesn't evaluate `expr` right away. It waits until the parser is actually called, at which point `expr` has been defined. This is all you need to handle recursive grammars.

Here's a complete example that parses nested parentheses around a single letter:

```ts
import { or, lazy, map, seqR } from "tarsec";
import { char, regexParser } from "tarsec";

const atom = regexParser("^[a-z]");

const expr = or(
  atom,
  map(
    seqR(char("("), lazy(() => expr), char(")")),
    ([_open, inner, _close]) => inner
  )
);

expr("a");       // => { success: true, result: "a" }
expr("(a)");     // => { success: true, result: "a" }
expr("((a))");   // => { success: true, result: "a" }
```

## Operator precedence with `buildExpressionParser`

Once you have recursion, you could build an expression parser by hand. But getting operator precedence and associativity right is fiddly. `buildExpressionParser` does the heavy lifting for you.

It takes two arguments:

1. **An atom parser** — parses the smallest unit (a number, a variable, etc.)
2. **An operator table** — an array of precedence levels, from **highest to lowest**

Each precedence level is an array of operators. Each operator has:
- `op`: a parser that matches the operator symbol
- `assoc`: `"left"` or `"right"`
- `apply`: a function that combines the left and right operands

Here's a full arithmetic expression parser:

```ts
import { buildExpressionParser } from "tarsec";
import { char } from "tarsec";

// A simple integer parser
const integer = (input) => {
  const match = input.match(/^\d+/);
  if (!match) return { success: false, rest: input, message: "expected number" };
  return { success: true, result: Number(match[0]), rest: input.slice(match[0].length) };
};

const expr = buildExpressionParser(integer, [
  // Highest precedence: * and /
  [
    { op: char("*"), assoc: "left", apply: (a, b) => a * b },
    { op: char("/"), assoc: "left", apply: (a, b) => a / b },
  ],
  // Lowest precedence: + and -
  [
    { op: char("+"), assoc: "left", apply: (a, b) => a + b },
    { op: char("-"), assoc: "left", apply: (a, b) => a - b },
  ],
]);

expr("1+2*3");       // => { success: true, result: 7 }
expr("1*2+3");       // => { success: true, result: 5 }
expr("10-3-2");      // => { success: true, result: 5 }  (left-associative)
expr("(1+2)*3");     // => { success: true, result: 9 }
expr("1*(2-(3/4))"); // => { success: true, result: 1.25 }
```

That's it. `buildExpressionParser` handles:
- Parsing operators at each precedence level
- Left- and right-associativity
- Parenthesized sub-expressions (using `(` and `)` by default)
- Recursion (parenthesized expressions can contain the full expression grammar)

## Handling whitespace

The example above doesn't handle spaces. The simplest approach is to make your operator parsers consume surrounding whitespace:

```ts
// An operator parser that allows optional surrounding whitespace
function wsOp(c) {
  return (input) => {
    const r1 = ws(input);     // consume leading whitespace
    if (!r1.success) return r1;
    const r2 = char(c)(r1.rest);  // match the operator
    if (!r2.success) return r2;
    const r3 = ws(r2.rest);       // consume trailing whitespace
    if (!r3.success) return r3;
    return { success: true, result: c, rest: r3.rest };
  };
}

const expr = buildExpressionParser(wsInteger, [
  [
    { op: wsOp("*"), assoc: "left", apply: (a, b) => a * b },
    { op: wsOp("/"), assoc: "left", apply: (a, b) => a / b },
  ],
  [
    { op: wsOp("+"), assoc: "left", apply: (a, b) => a + b },
    { op: wsOp("-"), assoc: "left", apply: (a, b) => a - b },
  ],
]);

expr("1 + 2 * 3");           // => { success: true, result: 7 }
expr("1 * (2 - (3 / 4))");   // => { success: true, result: 1.25 }
```

## Right-associative operators

Some operators are right-associative. For example, exponentiation: `2 ^ 3 ^ 2` should be `2 ^ (3 ^ 2) = 512`, not `(2 ^ 3) ^ 2 = 64`. Just set `assoc: "right"`:

```ts
const expr = buildExpressionParser(integer, [
  [{ op: char("^"), assoc: "right", apply: (a, b) => a ** b }],
  [{ op: char("*"), assoc: "left",  apply: (a, b) => a * b }],
  [{ op: char("+"), assoc: "left",  apply: (a, b) => a + b }],
]);

expr("2^3^2");  // => { success: true, result: 512 }
expr("2^3+1");  // => { success: true, result: 9 }
```

## Custom parentheses

By default, `buildExpressionParser` uses `(` and `)` for grouping. If you want different delimiters (e.g. square brackets), pass a custom paren parser as the third argument:

```ts
const squareParen = (input) => {
  if (input[0] !== "[") return { success: false, rest: input, message: "expected [" };
  const inner = expr(input.slice(1));
  if (!inner.success) return inner;
  if (inner.rest[0] !== "]") return { success: false, rest: input, message: "expected ]" };
  return { success: true, result: inner.result, rest: inner.rest.slice(1) };
};

const expr = buildExpressionParser(integer, operatorTable, squareParen);

expr("[1 + 2] * 3");  // => { success: true, result: 9 }
```

## Building ASTs instead of evaluating

The examples above evaluate expressions directly, but you can just as easily build an AST. Instead of `apply: (a, b) => a + b`, return a tree node:

```ts
type Expr =
  | { type: "number"; value: number }
  | { type: "binop"; op: string; left: Expr; right: Expr };

const numAtom = map(integer, (n) => ({ type: "number", value: n } as Expr));

const expr = buildExpressionParser<Expr>(numAtom, [
  [
    { op: char("*"), assoc: "left", apply: (a, b) => ({ type: "binop", op: "*", left: a, right: b }) },
    { op: char("/"), assoc: "left", apply: (a, b) => ({ type: "binop", op: "/", left: a, right: b }) },
  ],
  [
    { op: char("+"), assoc: "left", apply: (a, b) => ({ type: "binop", op: "+", left: a, right: b }) },
    { op: char("-"), assoc: "left", apply: (a, b) => ({ type: "binop", op: "-", left: a, right: b }) },
  ],
]);

expr("1+2*3");
// => {
//   type: "binop", op: "+",
//   left: { type: "number", value: 1 },
//   right: {
//     type: "binop", op: "*",
//     left: { type: "number", value: 2 },
//     right: { type: "number", value: 3 }
//   }
// }
```

You can combine this with `withSpan` from the [position tracking module](../lib/position.ts) to attach source locations to each AST node — useful if you're building a language server or compiler.
