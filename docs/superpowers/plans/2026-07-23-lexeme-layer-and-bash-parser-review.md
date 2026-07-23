# Review: Lexeme layer + bash parser implementation plan

**Reviewing:** `docs/superpowers/plans/2026-07-23-lexeme-layer-and-bash-parser.md`
**Date:** 2026-07-23

## Summary

The plan closes every item from the spec review — `withQueueUnwind` at each
nonterminal, the `memo` prohibition, `parseBash` as the state-owning entry
point, the `package.json` exports entry, heredoc-at-EOF, longest-match operator
ordering, line continuations, `#` position-sensitivity, `bodySpan`. Task
ordering and interface declarations are clean; each task is independently
reviewable.

I traced the scanners by hand against their test inputs. `scanWord`,
`scanDoubleQuote`, `scanDollarParen`, `scanHeredocBody`, and the `script`
statement loop all produce the asserted values. Two defects below will fail as
written.

## Blocking

### 1. `lexeme` overload order drops captures (Task 1)

```ts
lexeme: {
  <T>(parser: Parser<T>): Parser<T>;
  <T, C extends PlainObject>(parser: CaptureParser<T, C>): CaptureParser<T, C>;
};
```

A `CaptureParser<T, C>` **is** assignable to `Parser<T>` — `CaptureParserSuccess`
structurally satisfies `ParserSuccess`. So the first overload matches
`capture(word, "name")` and resolution never reaches the second. `lx.lexeme(capture(...))`
types as `Parser<string>`, `MergedCaptures` collapses to `never`, and the
type-level assertion in Task 1 Step 1:

```ts
const name: string = result.result.name;
```

fails `npm run test:tsc`.

**Fix:** put the `CaptureParser` overload first, matching `trace`
(`lib/trace.ts:120-124`). The reverse direction is safe — a plain `Parser<T>`
is *not* assignable to `CaptureParser<T, C>` (no `captures`), so it correctly
falls through to the second overload.

### 2. `heredocNewline` drains destructively, so the Task 8 "Required guard" doesn't work (Task 8)

```ts
let rest = input.slice(1);
for (const h of drainHeredocs()) {
  const scanned = scanHeredocBody(rest, h.tag, h.stripTabs);
  if (scanned === null) return failure(`unterminated heredoc <<${h.tag}`, input);
  ...
}
```

`drainHeredocs()` empties the queue **before** the loop can fail. `blankLines`
swallows that failure as its loop-exit condition. The guard then does:

```ts
if (rest.startsWith("\n")) return heredocNewline(rest);
```

— but by now the queue is empty, so the re-run **succeeds**, consuming just the
newline. The unterminated heredoc is silently swallowed and `script` returns a
`ParserSuccess<null>` as its `BashScript`.

That is also a compile error on its own: `heredocNewline` is `Parser<null>`,
being returned from a `Parser<BashScript>`.

**Reachable input:** `cat <<EOF;\nno end` (or with `&`). Heredocs registered
before a `;`/`&` separator drain at the *next* newline, which only `blankLines`
reaches. No test covers this path — the two existing unterminated-heredoc tests
both go through the direct `rest.startsWith("\n")` branch in `script`, which is
correct.

**Fix (two parts):**

1. Wrap `heredocNewline` in `withQueueUnwind` so a failed drain restores the
   queue. Then a re-run fails again, deterministically.
2. Write the guard as bind-and-check, not `return`:
   ```ts
   if (rest.startsWith("\n")) {
     const nl = heredocNewline(rest);
     if (!nl.success) return nl;
     rest = nl.rest;
   }
   ```
3. Add tests: `cat <<EOF;\nno end` and `cat <<EOF &\nno end` must both fail with
   "unterminated heredoc".

## Should fix

### 3. Assignments after a leading redirect are treated as words (Task 6)

`simpleCommand` runs the assignment loop to exhaustion *before* the
word/redirect loop, so in `>f FOO=1 cmd` the assignment loop fails immediately
on `>f` and `FOO=1` becomes a word. Bash treats it as an assignment.

The spec explicitly blesses `>f cmd arg` as legal, so this interaction will come
up. Either interleave assignments into the second loop (only while no word has
been seen yet), or add a test pinning the divergence as a known limitation.

### 4. `a &&\nb` fails (Task 7/8)

Operator-at-end-of-line is extremely common in real scripts. `lineContinuation`
only covers `\`-newline. `andOrOp` uses `lx.symbol`, whose whitespace charset is
`" \t"`, so the newline after `&&` terminates the statement and then `pipeline`
gets nothing.

Either allow an optional newline after `&&` / `||` / `|`, or state it in the
README bullet as a known limitation alongside the "out of scope" list.

### 5. Regex-per-character contradicts the plan's own constraint

Global Constraints say "character scanning uses `takeWhile`-style index loops,
never `many(oneOf(...))`". But:

- `scanTag` (Task 5): `while (i < input.length && /[A-Za-z0-9_]/.test(input[i])) i++;`
- `assignment` (Task 6): `NAME_START.test(...)` / `NAME_REST.test(...)`

Task 1 is already exporting `compileCharPredicate` for exactly this. Use it —
these are the hot paths the recent perf work targeted.

## Verify early

### 6. Directory import through the `@/lib` alias

Tasks 8 and 9 import `from "@/lib/parsers/bash"`. `vitest.config.ts:20` is a
plain path replacement, so this depends on Vite resolving the directory to
`index.ts`. Existing tests import concrete files
(`@/lib/parsers/markdown/blocks`). Confirm at Task 8 Step 2 rather than
debugging it as a mystery failure.

## Minor

7. **`parseBash` doesn't call `resetMemos()`.** No `memo` is used today so it's
   not a bug — but `parseBash` is documented as the entry point that owns
   global-state setup, and the memo constraint makes it likely someone reaches
   for one. One line of insurance.

8. **Trace wrapping is inconsistent.** `ws`, `identifier`, and `keyword` are
   wrapped; `lexeme`, `symbol`, `spanned`, `fileRedirect`, `heredocRedirect`,
   `simpleCommand`, `pipeline`, `andOr`, `script` are not. CLAUDE.md lists
   `trace(name, fn)` as a convention, and these are exactly the parsers you'd
   want named in `DEBUG=1` output.

9. **`restoreHeredocs` can resurrect mutated nodes.** If a drain sets `body` on
   some nodes and then fails, `withQueueUnwind` puts those already-mutated nodes
   back. Harmless today (any re-parse overwrites), but worth a comment next to
   the invariant block.

10. **`makeLexemes` config deviates from the approved spec** — charsets/predicates
    instead of parsers (`identStart: or(letter, char("_"))`). This is the right
    call (it's what makes the index scan possible) and Task 1 updates the spec.
    Flagging only so the deviation reads as intentional.

11. **Spec/plan test-location mismatch, plan is correct.** The spec says
    `tests/examples/bash/`; the plan uses `tests/parsers/bash/`. Markdown's tests
    actually live at `tests/parsers/markdown/`, so the plan matches the repo.
    Worth correcting in the spec when Task 1 edits it.

## Verified correct

Hand-traced against the asserted values, all consistent:

- `scanWord` on all nine test inputs, including `'foo"bar baz"qux etc'` → 15 and
  `'"$(echo ")")" z'` → 13.
- `scanHeredocBody` for the delimiter-at-EOF, `stripTabs`, and both
  null-returning cases.
- `pipeOp`'s `not(char("|"))` correctly leaves `|| b` unconsumed; `ampOp`
  likewise for `&&`.
- The `script` loop on `"a; b &\nc\n"` → 3 statements with
  `background` on the second, and on `"# header\n\na\n\n# mid\nb\n"` → 2.
- Span offsets in Task 9 (`bodySpan` 10→16 for `"cat <<EOF\nhello\nEOF\n"`,
  statement span 0→10 for `"a | b && c\n"`).
- `cat <<EOF; echo hi\nbody\nEOF` — the body correctly lands after the *next*
  newline, not the `;`.
- No import cycle: `words.ts` → `lexemes/spanned/types` only.

---

# Anti-pattern audit

Checked against `anti-patterns.md` (repo root — note the catalog is not under
`docs/dev/`).

## Imperative code everywhere — the headline finding

**The lexeme layer gets this right.** `makeLexemes` puts the whitespace /
comment / continuation "how" in one 20-line loop and every consumer writes
declaratively: `lx.symbol("&&")`, `lx.lexeme(rawWord)`. The character scanners
(`scanWord`, `scanDoubleQuote`, `scanDollarParen`, `scanHeredocBody`) are tight
index loops, but they are encapsulated behind names that state the *what*, and
the library implements `takeWhile` the same way for the same reason. That is
the good version of this pattern.

**The grammar layer does not.** The grammar is the "what" layer, and in a
parser-combinator library it should read as combinators. Instead:

- `simpleCommand` — 45 lines, four mutable arrays, `while(true)` with `continue`s.
- `pipeline` / `andOr` — hand-rolled chain loops. `sepBy1(pipeOp, command)` is
  literally the declarative spelling of `pipeline`.
- `script` — ~50 lines, `rest` reassigned eight times, nested branching.
- `blankLines` — a hand-rolled `many`.

Task 7 imports `or`, `map`, `not`, `seqR`, `lazy` and then uses them only for
the two three-line operator parsers. For the flagship example of a combinator
library, this teaches users to bypass the combinators.

There are real reasons behind each (targeted error messages, spans from
first/last child, controlled queue unwinding) — but those are exactly the things
that should become abstractions rather than be re-derived at every site:

- **`spanOf` is written inline four times** — `simpleCommand`, `pipeline`,
  `andOr`, `script` all do `{ start: parts[0].span.start, end: parts.at(-1).span.end }`.
- **`pipeline` and `andOr` are the same loop twice**, differing only in operator
  and node shape. One `chain(operand, op, build)` helper covers both.
- **"Every nonterminal is wrapped in `withQueueUnwind`"** is a Global Constraint
  enforced by a human remembering it at each site. A `nonterminal(name, parser)`
  helper doing `trace(name, withQueueUnwind(parser))` would encapsulate the rule
  *and* fix the trace-wrapping inconsistency, in one move.

## Duplicating existing code

- `blankLines` ≈ `many`; the chain loops ≈ `sepBy1`. (`buildExpressionParser`
  is worth a look for `&&`/`||`, though the `{first, rest[]}` AST shape doesn't
  map onto `apply(left, right)` cleanly — probably a fair reason to decline.)
- Per-character regexes in `scanTag` and `assignment` duplicate
  `compileCharPredicate`, which Task 1 exports *for this purpose*.
- **Four separate quote scanners** now exist: the library's `quotedString`
  (`lib/parsers.ts:352`, unused by the plan), `scanDoubleQuote`, the `'` branch
  inside `scanWord`, and the quote branch in `scanTag`.

## Leaky abstraction

`lx.ws(...) as ParserSuccess<null>` appears six-plus times. `ws` can never fail,
but its type doesn't say so, so every caller must know that and paper over it
with a cast. Either type it as total or expose `skipWs(input): string`.

## Inconsistent patterns

Three span strategies in three adjacent files: `assignment` uses `spanned`,
`heredocRedirect` hand-builds (correctly — object identity must survive to the
drain, and the comment says so), `fileRedirect` hand-builds with no such reason.
`fileRedirect` can match `assignment`'s pattern by using `rawWord` inside
`spanned` with an outer `lexeme`.

## Order-dependent mutable state

The catalog exempts parsers, and most of `script`'s sequencing is genuine parse
order. But the "Required guard" specified as *prose appended after the code
block* ("immediately after the loop-bottom line, add:") is the smell version: a
correctness-critical fragment placed positionally rather than shown in situ.
High odds an implementer drops it in the wrong spot — and it is broken as
written (see Blocking #2).

## Not present

Nested ternaries; try/catch without logging; useless special cases (the
singleton-collapse branches in `pipeline`/`andOr` are a deliberate AST decision,
not noise).

---

# Test-plan review

## Will a broken implementation actually fail these tests?

Mostly yes — Tasks 1, 2, 4, 8, and 9 are solid. Task 8's `ok()` helper (throw on
failure) and Task 9's `if (!result.success) throw` are the right shape, and Task
4 tests pure functions with unconditional `expect`s.

**But Tasks 5 and 6 contain tests that pass vacuously when the parse fails.**
The pattern is:

```ts
const result = parse("<<-END x");
if (result.success && result.result.type === "heredoc") {
  expect(result.result.stripTabs).toEqual(true);
}
```

If `<<-` parsing breaks completely, the `if` body never runs and the test passes
with **zero assertions**. Five tests have no `expect(result.success)` guard at
all:

| Task | Test |
|---|---|
| 5 | `parses <<-TAG with stripTabs` |
| 5 | `parses quoted tags` |
| 6 | `parses an empty value` |
| 6 | `allows a redirect before the command name` |
| 6 | `treats foo=bar after the command name as a word` |

Task 7 already solves this correctly with `else { throw new Error("expected
pipeline node") }`. Apply that shape everywhere — or better, give Tasks 5 and 6
an `ok()`-style helper like Task 8's, so the narrowing is unconditional.

Partially-guarded cases (`expect(result.success).toEqual(true)` present, but the
`type` narrowing still gates the real assertions) are lower risk but should get
the same treatment for consistency.

**One more:** the type-level assertion in Task 1 (`const name: string =
result.result.name`) is not enforced by `vitest run` — vitest strips types
without checking them. It is only caught by `npm run test:tsc`, which Task 1
Step 4 does run. Add a comment saying so, or someone will "fix" a red build with
`as any` and silently delete the coverage.

## Missing test cases

### Critical — covers the known defect

1. **`cat <<EOF;\nno end`** and **`cat <<EOF &\nno end`** must fail with
   "unterminated heredoc". This is the input class that reaches the broken
   `blankLines` guard (Blocking #2). Nothing in the plan exercises it — both
   existing unterminated-heredoc tests go through the correct direct branch in
   `script`.
2. **`cat <<EOF; echo hi\nbody\nEOF`** — the *working* version of the same path
   (heredoc registered before `;`, drained at the next newline). Most likely
   thing to regress while fixing #1.

### Error-message quality — an entire spec section is unverified

3. The spec's Error Handling section promises "expected an identifier" rather
   than charset dumps, and specific messages for unterminated quotes and
   heredocs. **No test asserts `getErrorMessage()` output for any bash failure.**
   The whole `label` / `recordFailure` investment ships unverified. Add at least:
   unterminated quote, missing redirect target, missing command after `|`.
4. `parseBash` diagnostics assert only that `prettyMessage` contains `"^"`.
   `getDiagnostics`' column computation (`lib/trace.ts:344-356`) is gnarly —
   assert `line` and `column` for a failure on a non-first line.

### Common bash forms the scanners silently handle (or mishandle)

5. **`$VAR` and `${x:-y}`** — `$` is only special before `(`, so these ride
   along as raw word text. Untested, and scope (b) builds directly on it. Pin it.
6. **Backticks** — `` ` `` is not in `METACHARS` and has no scanner, so
   `` echo `date` `` works by accident but `` `a b` `` **splits at the space**.
   Untested. Pin the behavior or add it to the known-limitations list.
7. **`FOO="a b"`** — an assignment with a quoted value, exercising `rawWord`
   inside `assignment`. Untested.
8. **`FOO="a`** — the `end === -1` unterminated-quote branch in `assignment` is
   currently dead code as far as the tests know.
9. **`2>&2`** — parses as `2>` then bashWord on `&2`, which fails on the
   metachar, so the whole redirect fails. Common form; pin the behavior.
10. **`> out` alone** and **`FOO=1` alone** — both legal bash simple commands
    with no words. `parts.length` is 1 so they succeed, but nothing tests it.
11. **`a\` (trailing backslash)** — the `Math.min(i + 2, n)` clamp in `scanWord`
    exists for exactly this and is untested.
12. **Escaped quote inside double quotes** (`"a\"b"`) and **single-quote-fused
    words** (`a'b'c`) — the `foo"bar baz"qux` test covers only the double-quote
    variant.

### Heredoc edges

13. **Delimiter line with trailing whitespace** (`"EOF "`) must *not* terminate.
    `EOFx` is unit-tested; the trailing-space variant is the classic bug and is
    not.
14. **Heredocs on consecutive lines** (`cat <<A\na\nA\ncat <<B\nb\nB`). Two on
    one line is covered; sequential is not.
15. **A heredoc on the second command of a pipeline** (`cat <<A | wc\nbody\nA`)
    — exercises drain-across-pipeline.

### Lexeme layer

16. **`lx.lexeme` on a failing parser** — must leave `rest` untouched and not
    eat whitespace.
17. **`lineContinuation` defaulting to false** — only the `true` case is tested.
18. **`keyword` at exact end of input** (`kw.keyword("if")("if")`) — the
    `Number.isNaN(next)` guard exists precisely for this and is untested.
19. **Multi-character `lineComment`** (`"//"`), which the tutorial advertises.

### Cross-cutting

20. **Span correctness on a *second* `parseBash` call.** Task 9's
    "consecutive parseBash calls" test asserts only `success`. `position.ts:33`
    holds a one-entry line-table cache keyed on source — exactly the thing that
    goes stale across parses. Assert spans on the second parse, with a
    different-length input.
21. **Trailing separator at EOF** — `"a;"` and `"a &"`.
22. **Malformed separators** — `";;"`, `"| a"`, `"&& a"`. Error-path coverage is
    currently a single test (`echo )`).
23. **CRLF input** — `\r` is neither whitespace nor a metachar, so `echo hi\r\n`
    yields the word `hi\r`. Pin it or add it to known limitations.
24. `tests/parsers/bash/script.test.ts` has no `beforeEach(resetHeredocQueue)`,
    unlike Tasks 4–7. Correct today because `parseBash` resets — but it makes the
    file order-dependent the moment someone calls raw `script(...)` in it. Add
    the hook for consistency.

## Process note

Task 2 is tests-only with "Expected: PASS" — no red phase, because the
implementation landed in Task 1. The plan is honest about this, but it means
`identifier` and `keyword` ship without a failing test first, unlike every other
task. Either move their implementation into Task 2, or drop the TDD framing for
that one task.
