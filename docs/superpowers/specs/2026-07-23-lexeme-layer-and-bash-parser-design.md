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
(`capture`, `seqC`, `withSpan`, `trace`; `memo` too for lexemes themselves, but
see the memo prohibition in the heredoc section — it does not extend to the bash
grammar). No changes to `types.ts` or any core module. Target ~120–150 lines.

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

Implementation notes:

- **`lexeme` must preserve captures.** `lexeme(capture(word, "x"))` would silently
  drop the capture type if `lexeme` is typed `Parser<T> => Parser<T>`. It gets the
  same overload pair `peek` / `memo` / `trace` use (`Parser` and `CaptureParser`
  variants). `label` stays `Parser`-only; it is used internally by `identifier` /
  `keyword` (which are plain parsers), and users capture *around* lexemes
  (`capture(lx.identifier, "x")`), which already works.
- **`lx.ws` is built on `takeWhile`**, not `many(oneOf(...))` — `many` has
  zero-width edge behavior (`lib/combinators.ts:63`) and `takeWhile` is the
  established fast path. Comment skipping loops: `takeWhile(ws)`, then if at a
  `lineComment` marker, scan to `\n` with an index scan, repeat.
- **Line continuations**: optional config flag `lineContinuation: true` makes
  `lx.ws` also eat `\` + newline (bash sets this). Mid-*word* continuations
  (`ec\<newline>ho`) are explicitly out of scope.
- **`lineComment` is position-insensitive by design**: it only runs between
  tokens. Bash's `#` is position-sensitive (`echo a#b` is a literal word), and
  that disambiguation is owned by the bash *word scanner*, which runs before `ws`
  ever sees the `#`. Stated here so nobody "fixes" it later; tested via `echo a#b`.

## Deliverable 2: `lib/parsers/bash/`

A showcase example (like `lib/parsers/markdown`) and pressure test for
`makeLexemes`. Importable as `tarsec/parsers/bash`.

### Scope (a) — in scope now

- **Words**: quote-aware but unstructured. `foo"bar baz"qux` is one word node.
  Single quotes, double quotes, backslash escapes. The scanner must balance nested
  `$(...)` and quotes to find word *boundaries*, but the node stores raw text only.
  Implemented as a hand-written index scan (like `quotedString` /
  `manyTillStr`), not combinator-per-char.
- **Simple commands**: leading `VAR=value` assignments, then words and redirects
  interleaved in any order (`>f cmd arg` is legal). The assignment *name* parser
  uses its own charset, not `lx.identifier` — bash allows `if=1` (keywords are
  not reserved in assignment position).
- **Redirects**: `>`, `>>`, `<`, `2>`, `&>`, `2>&1`, and heredocs
  `<<TAG`, `<<-TAG`, `<<'TAG'` (quoted-tag flag stored on the node; body kept as a
  raw string).
- **Operators**: `|`, `&&`, `||`, `;`, `&`; newlines as separators; `#` comments.
- **AST**: every node has `type` and a `span` from day one. `withSpan` returns
  `{ value, span }` (`lib/position.ts:100`), so the bash grammar uses a small
  `spanned(p)` helper that maps that shape into a flattened `{ ...node, span }`.
  The heredoc node's `span` covers the `<<TAG` redirect site; the body gets its
  own `bodySpan`, filled in at drain time alongside `body`.

**Operator ordering**: `or` is first-match (`lib/combinators.ts:198`), so
alternatives are ordered longest-first: `<<-` → `<<` → `<`; `>>` → `>`; `&&` /
`||` before `&` / `|`; `2>&1` before `2>`. The pipeline's `|` is explicitly
`seqR(char("|"), not(char("|")))`-shaped rather than relying on backtracking to
avoid eating the first half of `||`.

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
   It is reset by the entry point (below) at the start of each parse.

**Backtracking safety**: any abandoned partial parse must unwind its
registrations, and `or` alternatives are *not* the only abandonment sites — `seq`
resets `rest` on any inner failure (`lib/combinators.ts:798`), and `many` /
`sepBy` / `optional` discard failed final iterations. Nor is it enough to wrap
only the parsers that register: in `seq(command, symbol("&&"), command)`, the
first `command` succeeds (and registers), then `&&` fails and `seq` discards the
whole parse — no failure ever passes through `command`'s wrapper.

The invariant is therefore: **every bash-grammar nonterminal that can return
failure after a child succeeded restores the queue to its entry state on that
failure.** Concretely, a `withQueueUnwind(p)` helper (snapshot on entry, restore
on failure, keep on success) wraps each of `list`, `andOr`, `pipeline`,
`command`, and `redirect` — a closed, checkable list. It lives with the queue
module and is used only by the bash grammar; core combinators are untouched.
`peek` over registering parsers is forbidden in the grammar (it discards
consumption on *success*, which no failure-path unwind can see).

**`memo` prohibition**: `memo` requires pure parsers (`lib/combinators.ts:1187`)
and caches by input string — a cached `command` replays without re-registering
its heredocs (or double-registers). `memo` must not wrap anything at or above
`redirect` in the bash grammar. Lexemes and word scanners are safe. This is
stated in the bash module's doc comment, not just here.

**Heredoc at EOF**: draining is triggered by newline, but `cat <<EOF\nbody\nEOF`
may end without a trailing newline, and `cat <<EOF` may hit EOF with no body at
all. The `script` rule's final step drains any still-pending entries treating EOF
as the newline (delimiter line without trailing `\n` accepted, matching bash);
if a body's delimiter is never found, fail with `unterminated heredoc <<TAG`.

**Entry point**: the module exports `parseBash(input)` (alongside the raw
`script` parser for composition). `parseBash` owns the global-state lifecycle
that currently has no owner: `setInputStr(input)` (spans + rightmost-failure),
queue reset, `resetMemos()` if `memo` is used anywhere below the prohibition
line, then runs `script` and formats failures via `getDiagnostics`. (Note:
markdown sets no precedent here — `markdownParser` is a bare parser — and the
error helper is `getDiagnostics`; there is no `getErrorMessage`.)

This design replaces the earlier `withHeredocs(lineParser)` sketch, which assumed
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
  simple commands, assignments (including `if=1`), each redirect form, pipelines,
  `&&`/`||`/`;`/`&`, comments (including `echo a#b` staying a literal word),
  quoting edge cases (`foo"bar baz"qux`, escaped quotes), heredocs
  (basic, `<<-`, quoted tag, multiple per line, unterminated → failure,
  heredoc followed by more commands on the next line, delimiter at EOF without
  trailing newline), and span correctness.
- **Queue-unwind tests**: a backtracking alternative that registers a heredoc and
  then fails must leave the queue empty (e.g. an input that first tries a parse
  path containing `<<TAG` and falls through to another alternative), and the
  `seq`-sibling case: `cmd <<EOF &&` with a failing continuation must not leak
  the registration into a subsequent successful parse.

## Error handling

- Lexeme parsers use `label`/`recordFailure` so errors read "expected an
  identifier" rather than charset dumps.
- Unterminated heredoc and unterminated quote produce specific messages via the
  existing rightmost-failure machinery.

## Packaging

`package.json` `exports` gains a `./parsers/bash` entry mirroring the existing
`./parsers/markdown` one (`package.json:23-27`) — without it,
`import "tarsec/parsers/bash"` does not resolve.

Note on `keywords` / `lx.identifier`: no bash scope-(a) rule consumes them (and
bash's assignment parser deliberately can't, per `if=1` above). They're part of
`makeLexemes` because it is a general library feature — exercised by its unit
tests and the expressions-tutorial rewrite now, and by bash scope (c) later.

## Documentation

- New tutorial: `tutorials/lexemes.md` — the whitespace discipline, `makeLexemes`
  config, and a worked example (replacing the hand-rolled `wsOp` in
  `tutorials/expressions.md` with `lx.symbol`).
- README: bash added to the examples list.
