# Position tracking

tarsec can track where in the source string a parser matched, giving you offset, line, and column information. This is useful for building language servers, compilers, linters, or anything that needs to point back to a specific location in the source.

## Setup

Position tracking relies on `setInputStr`, which stores the original input string. You need to call this before running your parser:

```ts
import { setInputStr } from "tarsec";

const input = "hello world";
setInputStr(input);
```

## Getting the current offset

`getOffset` is a zero-width parser — it doesn't consume any input, it just returns the current position as a byte offset:

```ts
import { setInputStr } from "tarsec";
import { getOffset } from "tarsec";
import { str } from "tarsec";
import { seqR } from "tarsec";

const input = "hello world";
setInputStr(input);

const parser = seqR(str("hello"), getOffset);
const result = parser(input);
// result.result => ["hello", 5]
```

The offset is relative to the start of the original input string.

## Getting the current line and column

`getPosition` works like `getOffset`, but returns an object with `offset`, `line`, and `column`. Lines and columns are 0-based:

```ts
import { setInputStr } from "tarsec";
import { getPosition } from "tarsec";
import { str } from "tarsec";
import { seqR } from "tarsec";

const input = "hello\nworld";
setInputStr(input);

// Consume "hello\n", then check position
const parser = seqR(str("hello\n"), getPosition);
const result = parser(input);
// result.result => ["hello\n", { offset: 6, line: 1, column: 0 }]
```

## Wrapping parsers with span information

The most useful tool is `withSpan`. It wraps any parser and records where the match starts and ends:

```ts
import { setInputStr } from "tarsec";
import { withSpan } from "tarsec";
import { word } from "tarsec";

const input = "hello world";
setInputStr(input);

const parser = withSpan(word);
const result = parser(input);
// result.result => {
//   value: "hello",
//   span: {
//     start: { offset: 0, line: 0, column: 0 },
//     end:   { offset: 5, line: 0, column: 5 }
//   }
// }
```

`withSpan` doesn't change what the parser matches or consumes — it just wraps the result with location data.

## A practical example: parsing definitions with locations

Suppose you're parsing a simple language with variable definitions like:

```
let x = 10
let name = "hello"
```

You want to know where each variable name is defined, so you can report it to an editor. Here's how:

```ts
import { setInputStr } from "tarsec";
import { withSpan } from "tarsec";
import { str, word, space } from "tarsec";
import { seqR, many, map, capture, seqC } from "tarsec";

const manyTillNewline = many1WithJoin(noneOf("\n"));

const definition = map(
  seqR(
    str("let "),
    withSpan(word),       // variable name with location
    str(" = "),
    manyTillNewline,      // the value (we don't need its location here)
  ),
  ([_let, name, _eq, value]) => ({
    name: name.value,
    nameSpan: name.span,
    value,
  })
);

const input = "let x = 10\nlet name = hello";
setInputStr(input);

const parser = sepBy(char("\n"), definition);
const result = parser(input);
// result.result => [
//   {
//     name: "x",
//     nameSpan: {
//       start: { offset: 4, line: 0, column: 4 },
//       end:   { offset: 5, line: 0, column: 5 }
//     },
//     value: "10"
//   },
//   {
//     name: "name",
//     nameSpan: {
//       start: { offset: 16, line: 1, column: 4 },
//       end:   { offset: 20, line: 1, column: 8 }
//     },
//     value: "hello"
//   }
// ]
```

Now you have exactly the information a language server needs to provide "go to definition" or highlight a symbol in an editor.

## Combining with `buildExpressionParser`

You can use `withSpan` together with `buildExpressionParser` to build an AST with location data:

```ts
type Expr =
  | { type: "number"; value: number; span: Span }
  | { type: "binop"; op: string; left: Expr; right: Expr; span: Span };

const numAtom = withSpan(map(integer, (n) => ({ type: "number", value: n })));

// After parsing, each node has a span showing where it came from in the source
```

See the [expressions tutorial](expressions.md) for more on `buildExpressionParser`.

## Utility functions

If you need to convert offsets to positions yourself (e.g., for custom error messages), tarsec exports the lower-level utilities:

```ts
import { buildLineTable, offsetToPosition } from "tarsec";

const source = "hello\nworld\nfoo";
const table = buildLineTable(source);
// table => [0, 6, 12]  (byte offset where each line starts)

offsetToPosition(table, 8);
// => { offset: 8, line: 1, column: 2 }  (the "r" in "world")
```

`buildLineTable` scans the source once and returns an array of line-start offsets. `offsetToPosition` then does a binary search into that table, making it efficient even for large files. If you're calling `offsetToPosition` many times for the same source, build the table once and reuse it.
