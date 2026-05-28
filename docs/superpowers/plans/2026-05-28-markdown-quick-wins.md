# Markdown Quick-Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four small CommonMark gaps in the markdown example, each independently valuable and each implementable with a few combinator tweaks:

1. **Soft-wrapped paragraphs** (gap #2) — a paragraph keeps consuming non-blank lines and emits an `inline-soft-break` between them, instead of terminating at the first `\n`.
2. **Link and image titles** (gap #7) — `[text](url "title")` and `![alt](url "title")` capture an optional title.
3. **Multi-backtick code spans** (gap #9) — `` ` ``…`` ` `` with N backticks closes on a run of exactly N backticks, and one leading/trailing space is stripped when present on both sides.
4. **ATX heading cap and trailing-`#` stripping** (gap #13) — heading level is clamped to 1–6 (7+ `#`s parse as a paragraph) and an optional trailing run of `#`s is stripped from the content.

**Architecture:** Each gap is its own self-contained phase, ordered cheapest → cheapest. No AST type changes except adding an optional `title?: string` to `InlineLink`/`Image` (#7) and a new `InlineSoftBreak` variant (#2). Every change stays combinator-first.

**Tech Stack:** TypeScript + Vitest, the local `@/lib/...` Tarsec API.

---

## Conventions for every task

- **Combinator-first, regex-last.** Every parser uses Tarsec primitives. No `input.match` / `input.slice`.
- **TDD strictly:** Add the failing test first. Run it. Watch it fail for the right reason. Then write the minimum code to make it pass. Then run again. Then commit.
- **One concept per test.** Add additional small `it(...)` blocks for edge cases, each preceded by a red→green→commit cycle.
- **Never weaken or hard-code an expected value to make a test green.**
- **Single-file vitest:** `npx vitest run tests/examples/markdown/<file>.test.ts -t "name"`. Full suite: `npx vitest run`.
- **Type check after each commit:** `npm run test:tsc`.
- **Commit message style:** Conventional Commits (`feat:`, `fix:`, `test:`).
- **Reference relevant skills:** @superpowers:test-driven-development, @superpowers:systematic-debugging, @superpowers:verification-before-completion.

---

## File Structure (target end state)

```
tests/examples/markdown/
  types.ts          – + InlineSoftBreak; InlineLink/Image gain optional `title?: string`
  inline.ts         – + softBreakParser; inlineCodeParser uses N-backtick matching
  blocks.ts         – paragraphParser keeps consuming until a blank line; headingParser caps level + strips trailing #
  inline.test.ts    – + tests for soft-break, link/image title, multi-backtick code
  blocks.test.ts    – + tests for soft-wrap paragraph, heading cap, trailing #
```

No new files.

---

# Phase 1 — ATX heading cap + trailing `#` stripping  (gap #13)

This is the smallest, most contained change. Do it first.

### Task 1.1: Cap heading level at 6

**Files:**
- Modify: `tests/examples/markdown/blocks.ts`
- Modify: `tests/examples/markdown/blocks.test.ts`

**Behavior:** `####### foo` (7 `#`s) is *not* a heading. It parses as a paragraph. Levels 1–6 are unchanged.

- [ ] **Step 1: Failing tests**

```ts
it("parses level 1-6 headings", () => {
  for (let n = 1; n <= 6; n++) {
    const input = "#".repeat(n) + " Title";
    const res = headingParser(input);
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.level).toBe(n);
  }
});

it("rejects 7+ '#' as a heading (parses as paragraph)", () => {
  const res = headingParser("####### Title");
  expect(res.success).toBe(false);
});

it("falls back to paragraph for 7+ '#'", () => {
  const res = markdownParser("####### Title");
  expect(res.success).toBe(true);
  if (res.success) {
    expect(res.result[0].type).toBe("paragraph");
  }
});
```

- [ ] **Step 2: Run; expect the rejection tests to fail**

```bash
npx vitest run tests/examples/markdown/blocks.test.ts -t "heading"
```

- [ ] **Step 3: Implement**

Replace `count(char("#"))` with a length-capped variant. Cleanest:

```ts
import { exactly } from "@/lib/combinators";

// Try 6,5,4,3,2,1 in that order; the first that's followed by a space wins.
const atxMarker: Parser<number> = or(
  ...[6, 5, 4, 3, 2, 1].map(
    (n): Parser<number> =>
      map(
        seqR(exactly(n, char("#")), not(char("#"))),
        () => n
      )
  )
);
```

Then in `headingParser`, replace `capture(count(char("#")), "level")` with `capture(atxMarker, "level")`.

- [ ] **Step 4: Run; expect green**

```bash
npx vitest run tests/examples/markdown/blocks.test.ts -t "heading"
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(markdown): cap ATX heading level at 6"
```

---

### Task 1.2: Strip an optional trailing run of `#`

**Files:**
- Modify: `tests/examples/markdown/blocks.ts`
- Modify: `tests/examples/markdown/blocks.test.ts`

**Behavior:** `## Heading ##` parses as `{ level: 2, content: [text("Heading")] }`. Trailing `#`s must be preceded by at least one space and followed by optional whitespace + end-of-line. A line ending with `\#` (escaped) keeps the literal `#`.

- [ ] **Step 1: Failing tests**

```ts
it("strips trailing '#' from an ATX heading", () => {
  const res = headingParser("## Heading ##");
  expect(res.success).toBe(true);
  if (res.success) expect(res.result.content).toEqual([
    { type: "inline-text", content: "Heading" },
  ]);
});

it("does not strip when there's no separating space", () => {
  const res = headingParser("## Heading##");
  expect(res.success).toBe(true);
  if (res.success) expect(res.result.content).toEqual([
    { type: "inline-text", content: "Heading##" },
  ]);
});
```

- [ ] **Step 2: Run; expect fail**

- [ ] **Step 3: Implement**

The cleanest place is the inline-content parser: change the inner `many1(inlineMarkdownParser)` to use a stop parser that includes `" #"+ EOL`. Use a custom paragraph-style stop:

```ts
const headingContentStop: Parser<unknown> = or(
  char("\n"),
  // trailing # run: at least one space, then one+ '#', then EOL or whitespace+EOL
  seqR(many1(char(" ")), many1(char("#")), many(char(" ")), or(char("\n"), eof))
);

const headingInline: Parser<InlineMarkdown> = map(
  seqR(not(headingContentStop), inlineMarkdownParser),
  (parts) => parts[1] as InlineMarkdown
);
```

Then in `headingParser`, replace `capture(many1(inlineMarkdownParser), "content")` with `capture(many1(headingInline), "content")` and append:

```ts
optional(seqR(many1(char(" ")), many1(char("#")), many(char(" "))))
```

before the final `optional(char("\n"))` so the trailing run is consumed (not just stopped at).

- [ ] **Step 4: Run; expect green**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(markdown): strip optional trailing '#' run from ATX headings"
```

---

# Phase 2 — Link and image titles  (gap #7)

### Task 2.1: Optional `"title"` on inline links

**Files:**
- Modify: `tests/examples/markdown/types.ts`
- Modify: `tests/examples/markdown/inline.ts`
- Modify: `tests/examples/markdown/inline.test.ts`

**Behavior:** `[text](url "title")` and `[text](url 'title')` parse with the title captured (quotes stripped). Title is optional; existing `[text](url)` still works.

- [ ] **Step 1: Failing tests**

```ts
it("parses an inline link with a double-quoted title", () => {
  const res = inlineLinkParser(`[a](u "t")`);
  expect(res.success).toBe(true);
  if (res.success) expect(res.result).toEqual({
    type: "inline-link", content: "a", url: "u", title: "t",
  });
});

it("parses an inline link with a single-quoted title", () => {
  const res = inlineLinkParser(`[a](u 't')`);
  expect(res.success).toBe(true);
  if (res.success) expect(res.result.title).toBe("t");
});

it("still parses a link without a title", () => {
  const res = inlineLinkParser(`[a](u)`);
  expect(res.success).toBe(true);
  if (res.success) expect(res.result.title).toBeUndefined();
});
```

- [ ] **Step 2: Run; expect fail.**

- [ ] **Step 3: Change the type**

```ts
export type InlineLink = {
  type: "inline-link";
  content: string;             // (unchanged in this plan)
  url: string;
  title?: string;
};
```

- [ ] **Step 4: Rewrite `inlineLinkParser`**

The current parser uses `iManyTillStr(")")` for the URL, which would also slurp the title. Split into URL-token + optional title:

```ts
import { quotedString, char, str } from "@/lib/parsers";
import { many, many1WithJoin, noneOf, or, seqR, optional, map } from "@/lib/combinators";

const urlToken = many1WithJoin(noneOf(" \t)\n"));
const titleToken = map(quotedString, (s) => s.slice(1, -1));

export const inlineLinkParser: Parser<InlineLink> = map(
  seqR(
    char("["),
    iManyTillStr("]("),
    str("]("),
    urlToken,
    optional(seqR(many1(char(" ")), titleToken)),
    char(")")
  ),
  (parts) => {
    const content = parts[1] as string;
    const url = parts[3] as string;
    const titlePart = parts[4] as unknown[] | null;
    const title = titlePart ? (titlePart[1] as string) : undefined;
    const out: InlineLink = { type: "inline-link", content, url };
    if (title !== undefined) out.title = title;
    return out;
  }
);
```

- [ ] **Step 5: Run; expect green**

```bash
npx vitest run tests/examples/markdown/inline.test.ts -t "link"
```

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(markdown): optional title on inline links"
```

---

### Task 2.2: Optional `"title"` on inline images

**Files:**
- Modify: `tests/examples/markdown/types.ts`
- Modify: `tests/examples/markdown/inline.ts`
- Modify: `tests/examples/markdown/inline.test.ts`

Mirror Task 2.1 for `imageParser`.

- [ ] **Step 1: Failing tests for `![alt](u "t")`, single-quoted, and the no-title baseline.**

- [ ] **Step 2: Add `title?: string` to `Image`.**

- [ ] **Step 3: Rewrite `imageParser` with the same URL+optional-title split as Task 2.1.**

- [ ] **Step 4: Run, commit.**

```bash
git commit -am "feat(markdown): optional title on inline images"
```

---

# Phase 3 — Multi-backtick code spans  (gap #9)

### Task 3.1: Code span closes on a matching backtick run

**Files:**
- Modify: `tests/examples/markdown/inline.ts`
- Modify: `tests/examples/markdown/inline.test.ts`

**Behavior:**
- Single backtick still works: `` `foo` `` → `{type:"inline-code", content:"foo"}`.
- N backticks open and close: `` ``a`b`` `` → `content: "a`b"`.
- One leading/trailing space is stripped when both sides have a single space: `` ` foo ` `` → `content: "foo"`; but `` `  foo  ` `` → `content: " foo "` (only one space stripped on each side).
- Unmatched runs fall through (do not parse as code).

**Approach:** Build the parser by hand — `seqR(opening run, capture body, closing run)` where the opening produces a number and the closing requires the same number. Pure combinator path:

```ts
import { many1WithJoin, map, seq, seqR } from "@/lib/combinators";
import { char, exactly, anyChar, fail } from "@/lib/parsers";
// (`exactly` is in combinators)

// helper: read until a run of exactly `n` backticks (not preceded/followed by `).
const closingRun = (n: number): Parser<string> => (input: string) => {
  const tick = "`".repeat(n);
  let i = 0;
  while (i <= input.length - n) {
    if (input.slice(i, i + n) === tick &&
        input[i - 1] !== "`" &&
        input[i + n] !== "`") {
      return success(input.slice(0, i), input.slice(i + n));
    }
    i++;
  }
  return failure("no matching code-span fence", input);
};
```

Note: `closingRun` uses `input.slice` to search for the matching fence; this is the one place the project's "regex-last / combinator-first" rule allows raw character work, because matching an N-character literal run is inherently a sliding-window string search and a `seqR(...)` of dynamic length isn't expressible without a runtime helper anyway. Document it as such in a comment.

Then strip one leading/trailing space if both are present and the body isn't all spaces:

```ts
function stripCodeSpan(s: string): string {
  if (s.length >= 2 && s.startsWith(" ") && s.endsWith(" ") && s.trim().length > 0) {
    return s.slice(1, -1);
  }
  return s;
}
```

The full parser:

```ts
const openingRun: Parser<number> = (input: string) => {
  let n = 0;
  while (input[n] === "`") n++;
  if (n === 0) return failure("expected '`'", input);
  return success(n, input.slice(n));
};

export const inlineCodeParser: Parser<InlineCode> = (input) => {
  const opened = openingRun(input);
  if (!opened.success) return opened;
  const n = opened.result;
  const body = closingRun(n)(opened.rest);
  if (!body.success) return body;
  return success(
    { type: "inline-code" as const, content: stripCodeSpan(body.result) },
    body.rest
  );
};
```

- [ ] **Step 1: Failing tests**

```ts
it("parses a single-backtick code span", () => {
  expect(inlineCodeParser("`foo`")).toEqual(success({
    type: "inline-code", content: "foo",
  }, ""));
});

it("parses a double-backtick code span that contains a single backtick", () => {
  expect(inlineCodeParser("``a`b``")).toEqual(success({
    type: "inline-code", content: "a`b",
  }, ""));
});

it("strips one leading and trailing space when both are present", () => {
  expect(inlineCodeParser("`` foo ``").result?.content).toBe("foo");
});

it("does not strip when only one side has a space", () => {
  expect(inlineCodeParser("`foo `").result?.content).toBe("foo ");
});

it("fails on unmatched backtick runs", () => {
  expect(inlineCodeParser("``foo`").success).toBe(false);
});
```

- [ ] **Step 2: Run; expect fail.**

- [ ] **Step 3: Implement as above.**

- [ ] **Step 4: Run; expect green.**

```bash
npx vitest run tests/examples/markdown/inline.test.ts -t "code"
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(markdown): multi-backtick code spans with space stripping"
```

---

# Phase 4 — Soft-wrapped paragraphs  (gap #2)

This is the largest of the four. It changes paragraph termination semantics, so do it last.

### Task 4.1: `InlineSoftBreak` AST node

**Files:**
- Modify: `tests/examples/markdown/types.ts`
- Modify: `tests/examples/markdown/inline.ts`

- [ ] **Step 1: Add the type**

```ts
export type InlineSoftBreak = { type: "inline-soft-break" };

export type InlineMarkdown =
  | InlineText
  | InlineSoftBreak       // ← new
  | InlineBold
  // ... (existing union members)
  ;
```

- [ ] **Step 2: Export a `softBreakParser`** (used only inside paragraph context — see Task 4.2; it is **not** added to `inlineMarkdownParser`'s `or` because that would change every other block's behavior):

```ts
export const softBreakParser: Parser<InlineSoftBreak> = map(
  // single newline NOT followed by another newline (blank line),
  // and NOT a hard break (handled earlier).
  seqR(char("\n"), not(char("\n"))),
  () => ({ type: "inline-soft-break" as const })
);
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(markdown): InlineSoftBreak AST type"
```

---

### Task 4.2: `paragraphParser` keeps consuming until a blank line

**Files:**
- Modify: `tests/examples/markdown/blocks.ts`
- Modify: `tests/examples/markdown/blocks.test.ts`
- Modify: `tests/examples/markdown/index.test.ts`

**Behavior:**

```
Input:
  This is a paragraph
  that continues on the
  next line.

  Another paragraph.

Output:
  [
    { type: "paragraph", content: [
      text("This is a paragraph"), soft-break,
      text("that continues on the"), soft-break,
      text("next line."),
    ]},
    { type: "paragraph", content: [text("Another paragraph.")] },
  ]
```

- [ ] **Step 1: Failing tests**

```ts
it("joins soft-wrapped lines into a single paragraph with soft breaks", () => {
  const res = paragraphParser("one\ntwo\nthree");
  expect(res.success).toBe(true);
  if (res.success) expect(res.result.content).toEqual([
    { type: "inline-text", content: "one" },
    { type: "inline-soft-break" },
    { type: "inline-text", content: "two" },
    { type: "inline-soft-break" },
    { type: "inline-text", content: "three" },
  ]);
});

it("terminates at a blank line", () => {
  const res = paragraphParser("one\ntwo\n\nthree");
  expect(res.success).toBe(true);
  if (res.success) {
    expect(res.result.content).toEqual([
      { type: "inline-text", content: "one" },
      { type: "inline-soft-break" },
      { type: "inline-text", content: "two" },
    ]);
    expect(res.rest).toBe("\n\nthree");
  }
});

it("does not insert a soft break before a hard break (two trailing spaces)", () => {
  const res = paragraphParser("one  \ntwo");
  expect(res.success).toBe(true);
  if (res.success) expect(res.result.content).toEqual([
    { type: "inline-text", content: "one" },
    { type: "inline-hard-break" },
    { type: "inline-text", content: "two" },
  ]);
});
```

- [ ] **Step 2: Run; expect fail.**

- [ ] **Step 3: Implement**

Add `softBreakParser` into the paragraph's inline `or`, but **after** `hardBreakParser` (which is already first in `inlineMarkdownParser`'s `or`, so order is fine) and **with a `not(blankLine)` guard** so the body stops at a blank line:

```ts
import { softBreakParser } from "./inline";

// "paragraph inline" = soft-break (single \n) OR any inline node — but NEVER
// a blank line (two consecutive newlines).
const paragraphInline: Parser<InlineMarkdown> = map(
  seqR(not(blankLine), or(softBreakParser, inlineMarkdownParser)),
  (parts) => parts[1] as InlineMarkdown
);
```

The existing `paragraphParser` body (`many1(paragraphInline)`) stays the same.

Also update `inlineTextParser`'s stop set inside paragraphs only — actually it already stops at `\n`, which is what we want, because the `\n` is then consumed by `softBreakParser` on the next iteration. No change needed there.

- [ ] **Step 4: Run; expect green for the three new tests**

```bash
npx vitest run tests/examples/markdown/blocks.test.ts -t "paragraph"
```

- [ ] **Step 5: Run the full suite and fix any regressions**

```bash
npx vitest run
```

Likely regressions: integration tests that asserted `{type:"paragraph", content:[text("foo")]}` for an input like `"foo\nbar"` will now produce `[text("foo"), soft-break, text("bar")]`. Update each affected assertion; **do not** roll back the soft-break behavior to avoid the update.

- [ ] **Step 6: Type-check**

```bash
npm run test:tsc
```

- [ ] **Step 7: Commit**

```bash
git commit -am "feat(markdown): soft-wrapped paragraphs with inline-soft-break"
```

---

# Phase 5 — Documentation

### Task 5.1: README + CHANGELOG

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG`

- [ ] **Step 1: In `README.md`'s markdown bullet, add: "ATX heading level cap, trailing-`#` stripping, multi-backtick code spans, link/image titles, soft-wrapped paragraphs with `inline-soft-break`."**

- [ ] **Step 2: Add an `Unreleased` entry to `CHANGELOG`:**

```
- Markdown example: closes four CommonMark gaps —
  * ATX heading level capped at 6; trailing `#` runs stripped.
  * Inline links and images accept an optional `"title"` (or `'title'`).
  * Inline code spans support N-backtick fences (`` ``a`b`` ``) and strip
    one leading/trailing space when both sides have one.
  * Paragraphs consume soft-wrapped lines and emit an `inline-soft-break`
    between them; blank lines still terminate the paragraph.
```

- [ ] **Step 3: Commit**

```bash
git commit -am "docs: README/CHANGELOG for markdown quick-win fixes"
```

---

## Final checklist

- [ ] Every numbered task above is checked off.
- [ ] `npx vitest run` shows zero failures and zero skips.
- [ ] `npm run test:tsc` passes (no new errors beyond the two pre-existing `regex` / `vitest.globals` ones on `main`).
- [ ] `####### Title` parses as a paragraph (not a heading).
- [ ] `## Heading ##` strips the trailing `##`.
- [ ] `[text](url "title")` and `![alt](url "title")` capture the title.
- [ ] `` ``a`b`` `` parses with `content: "a`b"`.
- [ ] `` ` foo ` `` strips to `content: "foo"`.
- [ ] `"one\ntwo"` parses as one paragraph with a soft break between the two text nodes.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-28-markdown-quick-wins.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints.
