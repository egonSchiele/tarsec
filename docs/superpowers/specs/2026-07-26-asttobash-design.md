# astToBash: turn a parsed AST back into a bash command

## The problem

`bashParser` turns a command string into an AST. Nothing turns it back. A
consumer that wants to inspect a command, adjust it, and run the result has to
reassemble the string by hand — and reassembling shell text by hand is how
quoting bugs become injection bugs.

## The contract

`astToBash(node: BashNode | BashAST): string`

One entry point, dispatching on `tag`. An array is a whole script and its
commands are joined with `"; "`. Anything narrower — a single `Command`, a
`Redirect`, a lone `Word` — is emitted on its own, which makes the function
usable in tests and while debugging.

**Output is always safe to hand to bash.** Text that needs quoting gets
quoted, whatever the node's tag claims. A `LiteralWord` holding `; rm -rf /`
emits `'; rm -rf /'`, not bare text. The parser cannot produce such a node —
its word charset forbids `;` — but a consumer can construct or mutate one, and
that is exactly the case where a naive emitter hands an attacker a shell.

## Quoting rules

| node | emitted as |
|---|---|
| `literal`, `path` | bare when the text matches the parser's word charset, otherwise single-quoted |
| `singleQuoted` | `'...'`, with any `'` written as `'\''` |
| `doubleQuoted` | `"..."`, escaping `"`, `\`, `` ` `` and `$` inside literal parts |
| `variable` | `$name`, or `${name}` — see below |
| `flag` | `-f`, or `--flag=value` when a value is present |
| `interpolatedVariable` | parts concatenated with no separator |
| `assignment` | `name=` followed by the value, or nothing when the value is null |
| `redirect` | the fd, the operator, a space, then the target |
| `and`, `or` | `left && right` / `left \|\| right` |
| `parens` | `(inner)` |
| `simpleCommand` | assignments, command, args, redirects — space separated |

## Two cases the rules do not cover on their own

**A variable followed by literal text needs braces.** The parts
`[variable "A", literal "bc"]` emitted naively give `$Abc`, which re-parses as
a variable named `Abc` — a different command. So a variable part is written
`${A}` whenever the following part begins with a character that could continue
a variable name. This is the only place the emitter looks ahead.

**A right-nested chain needs parentheses.** `And(a, Or(b, c))` emitted flat
gives `a && b || c`, which re-parses left-associatively as `Or(And(a, b), c)` —
a different tree. Wrapping gives `a && (b || c)`.

Two things to know about that. Bash parentheses are a subshell, so the emitted
command is not quite semantically identical, and the re-parse gains a `Parens`
node. Neither matters in practice: `buildExpressionParser` is left-associative,
so the parser never produces a bare `and`/`or` as a right child. The case
arises only for hand-built ASTs.

## The round-trip property

For any AST the parser produced:

```ts
bashParser(astToBash(ast)) deep-equals ast
```

Not string equality. `cmd > out.txt arg` re-emits as `cmd arg > out.txt`,
because the AST does not record where a redirect sat among the arguments, and
runs of whitespace normalize.

For hand-built ASTs the guarantee is weaker, and deliberately so: the output is
always safe and always produces the words asked for, but a tag may change on
re-parse. `literal "a b"` emits `'a b'` and returns as a `singleQuoted`.
`literal "-la"` emits `'-la'`, because bare `-la` would return as a `flag`.
Meaning is preserved over tag; there is no emission that preserves both.

## Testing

- A property test over the parser's own corpus: parse, emit, re-parse, assert
  the two ASTs are equal.
- Unit tests per quoting rule, including the brace and paren cases above.
- A differential check that the argv bash builds from the emitted string
  matches the words in the AST.
