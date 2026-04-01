# Rightmost Failure Tracking for Better Error Reporting

## Problem

When a parse fails, tarsec's error messages are unhelpful. `or` returns `"all parsers failed"` with no context. Leaf parser failures like `char`, `str`, `oneOf` produce specific messages (`expected "}", got "i"`) but these get discarded as failures propagate up through combinators.

Ohm.js solves this by tracking the **rightmost failure position** globally. Every time a rule fails, it checks whether this failure is further right than any previous failure. When the overall parse fails, it reports the expected alternatives at that rightmost position. This works because the rightmost failure almost always corresponds to the user's actual mistake.

## Approach

Module-level state in `trace.ts` (Approach A), consistent with the existing `inputStr` pattern. No changes to `Parser<T>`, `ParserFailure`, or any type signatures. Purely additive.

## Design

### 1. State and core functions (`trace.ts`)

New module-level variables alongside `inputStr`:

```ts
let rightmostFailurePos = -1;
let rightmostFailureExpected: string[] = [];
```

New functions:

- **`recordFailure(input: string, expected: string)`** — computes `pos = getInputStr().length - input.length`. If `pos > rightmostFailurePos`, resets the expected list to `[expected]`. If `pos === rightmostFailurePos`, appends `expected` (with dedup). No-op if `getInputStr()` is empty (i.e., `setInputStr` was not called).
- **`getRightmostFailure(): { pos: number, expected: string[] } | null`** — returns the current rightmost failure, or `null` if none recorded.
- **`getErrorMessage(): string | null`** — formats the rightmost failure using `buildLineTable` + `offsetToPosition` into a human-readable message. Uses Oxford-comma formatting with "or" as the conjunction:
  - 1 item: `Line 4, col 5: expected "a"`
  - 2 items: `Line 4, col 5: expected "a" or "b"`
  - 3+ items: `Line 4, col 5: expected "a", "b", or "c"`
  - Note: `offsetToPosition` returns 0-based line/column, so the implementation adds 1 to both for the display message.
  - Returns `null` if no failures recorded.
- **`resetRightmostFailure()`** — internal (not exported), resets `rightmostFailurePos` to `-1` and clears the expected array.

`setInputStr()` calls `resetRightmostFailure()` automatically, so consumers don't need to manage reset.

### 2. Recording failures in leaf parsers

Leaf parsers in `parsers.ts` call `recordFailure` directly with a literal-style label on failure:

| Parser | Expected label |
|--------|---------------|
| `char(c)` | `"\"${c}\""` |
| `str(s)` | `"\"${s}\""` |
| `istr(s)` | `"\"${s}\""` |
| `oneOf(chars)` | `"one of \"${chars}\""` |
| `noneOf(chars)` | `"none of \"${chars}\""` |
| `regexParser(str)` | `"${str}"` |
| `captureRegex(str)` | `"${str}"` |
| `anyChar` | `"any character"` |
| `eof` | `"end of input"` |

Note: `eof` is not wrapped in `trace` (unlike other leaf parsers), so it must record failures directly in its body.

`trace` does **not** record failures. It remains purely a debug-logging mechanism. Only leaf parsers and `label()` record failures.

### 3. `label()` — exported combinator (`parsers.ts`)

A public combinator for adding friendly expectation names at any level. On failure, it **suppresses inner recordings** and records only its own name. It does this by saving the rightmost failure state before running the inner parser and restoring it afterward, then recording only the label.

```ts
export function label<T>(name: string, parser: Parser<T>): Parser<T> {
  return (input: string) => {
    const saved = saveRightmostFailure();
    const result = parser(input);
    restoreRightmostFailure(saved);
    if (!result.success) recordFailure(input, name);
    return result;
  };
}
```

This requires two additional internal helpers in `trace.ts`: `saveRightmostFailure()` and `restoreRightmostFailure(saved)`.

Used internally for built-in convenience parsers:

```ts
export const digit = label("a digit", oneOf("0123456789"));
export const space = label("whitespace", oneOf(" \t\n\r"));
export const letter = label("a letter", oneOf("abcdef..."));
export const alphanum = label("a letter or digit", oneOf("abcdef...0123456789"));
export const word = label("a word", regexParser("^[a-z]+", "ui"));
export const num = label("a number", regexParser("^[0-9]+"));
export const quote = label("a quote", oneOf(`'"`));
```

Also available to consumers for their own parsers:

```ts
const identifier = label("an identifier", seq([letter, many(alphanum)], parts => parts.join("")));
```

### 4. How expectations accumulate in `or`

No changes to `or` are needed. Expectations accumulate naturally because all alternatives in an `or` that fail at the same position each record their labels. For example, `or(digit, letter)` failing at position 5 produces `rightmostFailureExpected = ["a digit", "a letter"]`, and `getErrorMessage()` formats this as:

```
Line 2, col 3: expected a digit or a letter
```

### 5. Consumer API

Typical usage:

```ts
setInputStr(input);           // also resets rightmost failure state
const result = myParser(input);
if (!result.success) {
  const msg = getErrorMessage(); // "Line 4, col 5: expected ..."
}
```

No new types. No breaking changes. Existing code that doesn't call `setInputStr` is completely unaffected.

### 6. Exports

New exports from `trace.ts` (automatically re-exported by `index.ts` via `export * from "./trace.js"`):
- `recordFailure`
- `getRightmostFailure`
- `getErrorMessage`

New export from `parsers.ts` (automatically re-exported by `index.ts` via `export * from "./parsers.js"`):
- `label`

Internal only (not exported from module): `resetRightmostFailure`, `saveRightmostFailure`, `restoreRightmostFailure`.

## File change summary

| File | Change |
|------|--------|
| `trace.ts` | Add rightmost failure state, `recordFailure()`, `getRightmostFailure()`, `getErrorMessage()`, `saveRightmostFailure()`, `restoreRightmostFailure()`. Call reset inside `setInputStr()`. |
| `parsers.ts` | Add exported `label()` combinator. Add `recordFailure` calls in `char`, `str`, `istr`, `oneOf`, `noneOf`, `regexParser`, `captureRegex`, `anyChar`, `eof`. Wrap `digit`, `space`, `letter`, `alphanum`, `word`, `num`, `quote` with `label()`. |
| `tests/` | New test file for rightmost failure tracking. |

No changes to `types.ts`, `position.ts`, `combinators.ts`, `tarsecError.ts`, or `index.ts`.

## What this doesn't solve

- **Recovery** — only improves the error message, doesn't help the parser recover and continue.
- **Multiple errors** — reports the single best error location.
- **Contextual messages** — the rightmost failure tells you *what* was expected but not *why*. `parseError` is still better for contextual messages like "expected function body after `def foo()`". The two approaches are complementary.

## Performance

`recordFailure` is called on every leaf parser failure, which happens many times during normal backtracking. The operation is cheap: one integer comparison, possibly an `includes` check and array push. No allocation on the hot path (when `pos < rightmostFailurePos`).

`label()` adds save/restore overhead (copying the expected array), but this only happens at labeled boundaries, not on every parser call.
