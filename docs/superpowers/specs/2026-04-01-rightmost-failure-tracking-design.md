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
- **`getErrorMessage(): string | null`** — formats the rightmost failure using `buildLineTable` + `offsetToPosition` into a human-readable message like `Line 4, col 5: expected "(", a digit, an identifier`. Returns `null` if no failures recorded.
- **`resetRightmostFailure()`** — internal (not exported), resets `rightmostFailurePos` to `-1` and clears the expected array.

`setInputStr()` calls `resetRightmostFailure()` automatically, so consumers don't need to manage reset.

### 2. Recording failures

Failures are recorded in two places:

**In `trace()`:** After the wrapped parser runs, if it failed, call `recordFailure(input, name)`. This happens on the non-debug path too — not gated behind `DEBUG=1`. Every traced parser contributes its name as an expected alternative at its failure position.

**In leaf parsers (`parsers.ts`):** Each leaf parser calls `recordFailure` directly with a literal-style label:

| Parser | Expected label |
|--------|---------------|
| `char(c)` | `"\"${c}\""` |
| `str(s)` | `"\"${s}\""` |
| `istr(s)` | `"\"${s}\""` |
| `oneOf(chars)` | `"one of \"${chars}\""` |
| `noneOf(chars)` | `"none of \"${chars}\""` |
| `regexParser(str)` | `"${str}"` |
| `anyChar` | `"any character"` |
| `eof` | `"end of input"` |

Both `trace` and leaf parsers record without filtering. The consumer receives the full set of expectations and can filter if desired.

### 3. `label()` internal helper (`parsers.ts`)

An internal (not exported) helper for wrapping built-in convenience parsers with friendly names:

```ts
function label<T>(name: string, parser: Parser<T>): Parser<T> {
  return (input: string) => {
    const result = parser(input);
    if (!result.success) recordFailure(input, name);
    return result;
  };
}
```

Used for:

```ts
export const digit = label("a digit", oneOf("0123456789"));
export const space = label("whitespace", oneOf(" \t\n\r"));
export const letter = label("a letter", oneOf("abcdef..."));
export const alphanum = label("a letter or digit", oneOf("abcdef...0123456789"));
export const word = label("a word", regexParser("^[a-z]+", "ui"));
export const num = label("a number", regexParser("^[0-9]+"));
export const quote = label("a quote", oneOf(`'"`));
```

### 4. Consumer API

Typical usage:

```ts
setInputStr(input);           // also resets rightmost failure state
const result = myParser(input);
if (!result.success) {
  const msg = getErrorMessage(); // "Line 4, col 5: expected ..."
}
```

No new types. No breaking changes. Existing code that doesn't call `setInputStr` is completely unaffected.

### 5. Exports (`index.ts`)

New exports: `recordFailure`, `getRightmostFailure`, `getErrorMessage`.

`resetRightmostFailure` is internal only.

## File change summary

| File | Change |
|------|--------|
| `trace.ts` | Add rightmost failure state, `recordFailure()`, `getRightmostFailure()`, `getErrorMessage()`. Call reset inside `setInputStr()`. Record failure in `trace()` on non-debug path. |
| `parsers.ts` | Add internal `label()` helper. Add `recordFailure` calls in `char`, `str`, `istr`, `oneOf`, `noneOf`, `regexParser`, `anyChar`, `eof`. Wrap `digit`, `space`, `letter`, `alphanum`, `word`, `num`, `quote` with `label()`. |
| `index.ts` | Re-export `recordFailure`, `getRightmostFailure`, `getErrorMessage`. |
| `tests/` | New test file for rightmost failure tracking. |

No changes to `types.ts`, `position.ts`, `combinators.ts`, or `tarsecError.ts`.

## What this doesn't solve

- **Recovery** — only improves the error message, doesn't help the parser recover and continue.
- **Multiple errors** — reports the single best error location.
- **Contextual messages** — the rightmost failure tells you *what* was expected but not *why*. `parseError` is still better for contextual messages like "expected function body after `def foo()`". The two approaches are complementary.

## Performance

`recordFailure` is called on every leaf parser failure and every `trace` failure, which happens many times during normal backtracking. The operation is cheap: one integer comparison, possibly an `includes` check and array push. No allocation on the hot path (when `pos < rightmostFailurePos`).
