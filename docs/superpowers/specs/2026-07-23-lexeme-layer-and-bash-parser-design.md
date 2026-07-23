# Lexeme layer + bash parser — design

**Date:** 2026-07-23
**Status:** Approved (pending final spec review)

## Motivation

The goal is a parser for common bash syntax (pipes, redirects, heredocs). Heredocs
require deferred, stateful parsing, which raised the question of adding a lexer to
tarsec. We evaluated three approaches:

- **A. Generalize `Parser<T>` to `Parser<T, Input>`** so combinators run over token
  streams. Rejected: breaks the `rest`-suffix position model, complicates the
  capture type machinery, churns every user's types, and makes the common case worse.
- **B. Separate token-stream module** (`lex(rules) → Token[]` + parallel token
  combinators). Rejected: duplicates the combinator surface and docs; bash
  tokenization is context-sensitive (keywords only reserved at command position,
  nested `$(...)`, quote-fused words, stateful heredocs), so a standalone lexer
  would need parser feedback anyway.
- **C. Scannerless lexeme layer** (Parsec's `makeTokenParser` approach): ordinary
  parsers that handle whitespace/comments/keywords in one place, single pass, zero
  core type changes. **Chosen.**

Note on naming: this is *not* a lexer (no separate pass, no token array). The
factory is named `makeLexemes` to avoid implying one.

## Deliverable 1: `lib/lexeme.ts`

A factory returning plain `Parser`s that compose with everything existing
(`capture`, `seqC`, `withSpan`, `trace`, `memo`). No changes to `types.ts` or any
core module. Target ~120–150 lines.

```ts
const lx = makeLexemes({
  whitespace: " \t",              // charset eaten after every lexeme (bash: NOT \n)
  lineComment: "#",               // optional; eaten as whitespace
  identStart: or(letter, char("_")),
  identRest: or(alphanum, char("_")),
  keywords: ["if", "then", "else", "fi", ...],  // optional
});
```

Returned parsers:

| Name | Behavior |
|---|---|
| `lx.lexeme(p)` | Run `p`, then eat trailing whitespace/comments. The primitive everything else is built on. |
| `lx.symbol(s)` | `lexeme(str(s))`, result is `s`. |
| `lx.identifier` | Identifier per `identStart`/`identRest`; fails on words in `keywords`. |
| `lx.keyword(s)` | Matches `s` only when not followed by an `identRest` char (so `keyword("if")` rejects `ifx`), then eats whitespace. |
| `lx.ws` | The whitespace/comment skipper itself, for eating leading input once at the top. |

Discipline: every token-shaped parser eats its own *trailing* whitespace; the
top-level parser eats *leading* whitespace once. Documented in a new tutorial page.

## Deliverable 2: `lib/parsers/bash/`

A showcase example (like `lib/parsers/markdown`) and pressure test for
`makeLexemes`. Importable as `tarsec/parsers/bash`.

### Scope (a) — in scope now

- **Words**: quote-aware but unstructured. `foo"bar baz"qux` is one word node.
  Single quotes, double quotes, backslash escapes. The scanner must balance nested
  `$(...)` and quotes to find word *boundaries*, but the node stores raw text only.
- **Simple commands**: leading `VAR=value` assignments, then words and redirects
  interleaved in any order (`>f cmd arg` is legal).
- **Redirects**: `>`, `>>`, `<`, `2>`, `&>`, `2>&1`, and heredocs
  `<<TAG`, `<<-TAG`, `<<'TAG'` (quoted-tag flag stored on the node; body kept as a
  raw string).
- **Operators**: `|`, `&&`, `||`, `;`, `&`; newlines as separators; `#` comments.
- **AST**: every node has `type` and a `span` (via `withSpan`) from day one.

### Out of scope now (but see Extensibility)

Expansion ASTs inside words (`$VAR`, `$(cmd)`, `${x:-y}`), control flow
(`if`/`for`/`while`/`case`/functions), arithmetic, arrays, process substitution.

### Grammar shape

Layered like the bash spec, with `command` as an explicit nonterminal:

```
script  → ws, list, eof
list    → andOr ((";" | "&" | heredocNewline) andOr)*
andOr   → pipeline (("&&" | "||") pipeline)*
pipeline→ command ("|" command)*
command → or(simpleCommand)        // via lazy; compound commands added here later
```

### Heredocs: pending queue drained at the newline

Bash's own approach, expressed at the grammar level:

1. The `<<TAG` redirect parser pushes `{ tag, stripTabs, quoted, node }` onto a
   module-level pending queue and returns a heredoc node with `body: null`.
2. The newline separator parser (`heredocNewline`) consumes `\n`, then for each
   pending entry **in registration order** (bash fills `cat <<A <<B` as A then B)
   scans the body up to a line consisting of the tag (honoring `<<-` tab
   stripping), mutates `node.body`, and consumes it. Unterminated heredoc → failure.
3. The queue lives in its own module (`lib/parsers/bash/heredocQueue.ts`),
   following the existing precedent of `setInputStr` / rightmost-failure state.
   It is reset at the start of each top-level parse.

**Backtracking safety**: if an alternative registers heredocs and then fails,
the queue must be unwound. The bash grammar's `or` points wrap alternatives with a
save/restore helper (`snapshotQueue()` / `restoreQueue(s)`), mirroring how
`label` save/restores the rightmost-failure state. This lives with the queue
module and is used only by the bash grammar — core combinators are untouched.

This replaces the earlier `withHeredocs(lineParser)` sketch, which assumed
one-line commands and would not survive control flow (`if cat <<EOF` — the body
lands mid-block, where no "line parser" exists to wrap).

## Extensibility decisions (baked in now)

1. **Word nodes are additive**: `{ type: "word", text, span }` now; scope (b)
   later adds an optional `parts: WordPart[]` and changes only the word parser's
   interior. The boundary scanner is already nesting-aware, which is the hard part.
2. **`command` is an `or` behind `lazy`**: scope (c) adds `if`/`while`/`for`/`case`
   as alternatives tried before `simpleCommand`; keyword-vs-word disambiguation
   (`echo if` vs `if true`) falls out of command-position structure.
3. **Heredocs drain at the newline token**, so compound commands need zero heredoc
   rework later.

## Testing

- `tests/lexeme.test.ts` — unit tests for each `makeLexemes` output, including
  comment skipping, keyword rejection of `ifx`, and composition with `capture`.
- `tests/examples/bash/` — mirroring the markdown example's test layout:
  simple commands, assignments, each redirect form, pipelines, `&&`/`||`/`;`/`&`,
  comments, quoting edge cases (`foo"bar baz"qux`, escaped quotes), heredocs
  (basic, `<<-`, quoted tag, multiple per line, unterminated → failure,
  heredoc followed by more commands on the next line), and span correctness.

## Error handling

- Lexeme parsers use `label`/`recordFailure` so errors read "expected an
  identifier" rather than charset dumps.
- Unterminated heredoc and unterminated quote produce specific messages via the
  existing rightmost-failure machinery.

## Documentation

- New tutorial: `tutorials/lexemes.md` — the whitespace discipline, `makeLexemes`
  config, and a worked example (replacing the hand-rolled `wsOp` in
  `tutorials/expressions.md` with `lx.symbol`).
- README: bash added to the examples list.
