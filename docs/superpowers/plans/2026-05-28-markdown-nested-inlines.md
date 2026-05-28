# Markdown Nested Inlines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow inline markdown nodes (`**bold**`, `*italic*`, `~~strike~~`, `[link](u)`, `***bold-italic***`) to contain other inline markdown nodes as content, so real-world snippets like `**[link](url)**`, `*foo `code` bar*`, or `[**bold** anchor](u)` round-trip correctly into the AST.

**Architecture:** Change the affected inline AST types' `content` field from `string` to `InlineMarkdown[]`. Replace `manyTillStr(delim)` (character-level, returns string) inside each delimited parser with a small node-level helper `inlineSeqUntil(stop)` that runs `inlineMarkdownParser` (via `lazy`) repeatedly until `stop` would match. Migrate one parser at a time, updating its tests in lockstep — each migration is its own red→green→commit cycle. Code spans, autolinks, and image alt-text stay `string` (they're not nestable per CommonMark).

**Tech Stack:** TypeScript + Vitest, the local `@/lib/...` Tarsec API (`seqC`, `seqR`, `or`, `many`, `many1`, `not`, `lazy`, `optional`, `capture`, `set`, `map`, `char`, `str`, `oneOf`, `noneOf`).

---

## Conventions for every task

- **Combinator-first, regex-last.** Every parser must be expressed with Tarsec primitives. No `input.match`, no `input.slice`. Use `lazy(() => inlineMarkdownParser)` to break the cycle when a parser needs to recurse into itself.
- **TDD strictly:** Add the failing test first. Run it. Watch it fail for the right reason. Then write the minimum code to make it pass. Then run again. Then commit. No exceptions.
- **One concept per test.** When a feature has edge cases, add additional small `it(...)` blocks, each preceded by a red→green→commit cycle.
- **Migrate one parser at a time.** Do not change the bold and italic parsers in the same commit. Each AST shape change is its own commit so a bisect lands on a single behavior.
- **Update tests as you go.** When you migrate a parser, every existing test that asserted `content: "foo"` on that parser's node type must change to `content: [{ type: "inline-text", content: "foo" }]` in the same commit. Do not leave the test file red.
- **Never weaken or hard-code an expected value to make a test green.** If a test exposes a real gap, fix the parser, not the test.
- **Single-file vitest:** `npx vitest run tests/examples/markdown/inline.test.ts -t "test name"`. Full suite: `npx vitest run`.
- **Type check after each commit:** `npm run test:tsc`. If it fails, fix types before moving on.
- **Commit message style:** Conventional Commits (`feat:`, `refactor:`, `test:`).
- **Reference relevant skills:** @superpowers:test-driven-development, @superpowers:systematic-debugging, @superpowers:verification-before-completion.

---

## File Structure (target end state)

```
tests/examples/markdown/
  types.ts          – Inline{Bold,Italic,BoldItalic,Strike,Link}.content : InlineMarkdown[]
  inline.ts         – + helper `inlineSeqUntil`; bold/italic/strike/link/bold-italic all recurse via lazy()
  inline.test.ts    – every bold/italic/strike/link/bold-italic test now asserts array content
  blocks.ts         – paragraphParser/headingParser unchanged (they already use InlineMarkdown[])
  references.ts     – unchanged; `text` on RefLink stays a label (not parsed inline)
  index.test.ts     – integration tests updated for the new shape
  markdown-longer.test.ts – unchanged (smoke test, not deep asserting)
```

No new files. The change is concentrated in `types.ts`, `inline.ts`, `inline.test.ts`, and any test that deep-asserts a bold/italic/strike/link node.

---

## Scope (what's in / out)

**In scope:**
- `InlineBold.content`, `InlineItalic.content`, `InlineBoldItalic.content`, `InlineStrike.content`, `InlineLink.content` become `InlineMarkdown[]`.
- Nested inlines of any depth (subject to existing precedence rules — same-delimiter nesting is *not* in scope; CommonMark's left/right-flanking algorithm is a separate plan).

**Out of scope (do not attempt):**
- `InlineCode.content` stays `string` (code spans are literal per CommonMark).
- `Image.alt` stays `string` (alt text is plain per CommonMark).
- Autolink `content` stays `string` (it's the URL itself).
- `InlineRefLink.text` / `InlineRefImage.alt` stay `string` (they're labels, resolved later).
- Same-delimiter nesting (e.g., `**foo **bar** baz**`) — leave as-is.
- CommonMark's full left/right-flanking emphasis algorithm.

---

# Phase 0 — The recursion helper

### Task 0.1: `inlineSeqUntil(stop)` helper

**Files:**
- Modify: `tests/examples/markdown/inline.ts`
- Test: `tests/examples/markdown/inline.test.ts`

The helper runs `inlineMarkdownParser` repeatedly via `lazy` until the `stop` parser would match at the current position. It returns `InlineMarkdown[]`. Lookahead via `not(stop)`; the actual closing token is consumed by the caller.

- [ ] **Step 1: Write the failing test**

```ts
import { inlineSeqUntil } from "./inline";
import { str } from "@/lib/parsers";

describe("inlineSeqUntil", () => {
  it("collects inline nodes up to (but not including) the stop", () => {
    const p = inlineSeqUntil(str("**"));
    const res = p("foo *bar* baz**");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.rest).toBe("**");
      expect(res.result).toEqual([
        { type: "inline-text", content: "foo " },
        { type: "inline-italic", content: [{ type: "inline-text", content: "bar" }] },
        { type: "inline-text", content: " baz" },
      ]);
    }
  });

  it("returns an empty array when the stop matches immediately", () => {
    const p = inlineSeqUntil(str("**"));
    const res = p("**rest");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result).toEqual([]);
      expect(res.rest).toBe("**rest");
    }
  });
});
```

Note: the first test depends on italic already being nested. It must be added in Phase 3 (rewrite the assertion to use the old string content shape until italic is migrated). Or, write the first test asserting only the outer `foo`/` baz` text, and add the nested-italic assertion when Phase 3 lands. Pick one approach and stick to it.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/examples/markdown/inline.test.ts -t "inlineSeqUntil"
```

Expected: FAIL with `inlineSeqUntil is not a function` (or similar export error).

- [ ] **Step 3: Implement the helper**

In `inline.ts`, add:

```ts
import { lazy } from "@/lib/combinators";

/**
 * Run `inlineMarkdownParser` repeatedly until `stop` would match at the
 * current position. The `stop` parser is a lookahead — it is *not* consumed.
 * Returns the list of inline nodes collected before `stop`.
 */
export const inlineSeqUntil = (stop: Parser<unknown>): Parser<InlineMarkdown[]> =>
  many(
    map(
      seqR(not(stop), lazy(() => inlineMarkdownParser)),
      (parts) => parts[1] as InlineMarkdown
    )
  );
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/examples/markdown/inline.test.ts -t "inlineSeqUntil"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(markdown): add inlineSeqUntil helper for node-level recursion"
```

---

# Phase 1 — Bold (asterisk form)

### Task 1.1: `InlineBold.content` becomes `InlineMarkdown[]`

**Files:**
- Modify: `tests/examples/markdown/types.ts`
- Modify: `tests/examples/markdown/inline.ts`
- Modify: `tests/examples/markdown/inline.test.ts`
- Modify: `tests/examples/markdown.test.ts` (any deep bold assertions in the legacy compatibility test)

- [ ] **Step 1: Update the existing bold tests to the new shape (red)**

Find every test that asserts an `InlineBold` node and change `content: "x"` to `content: [{ type: "inline-text", content: "x" }]`. Run them; they should fail.

- [ ] **Step 2: Add the new nested-content test**

```ts
it("parses bold containing a link", () => {
  const res = inlineBoldParser("**[a](u)**");
  expect(res.success).toBe(true);
  if (res.success) {
    expect(res.result).toEqual({
      type: "inline-bold",
      content: [{ type: "inline-link", content: "a", url: "u" }],
    });
  }
});
```

(Once `InlineLink.content` is migrated in Phase 5, come back and update this assertion to nested form.)

- [ ] **Step 3: Run tests; expect failures**

```bash
npx vitest run tests/examples/markdown/inline.test.ts -t "Bold"
```

Expected: FAIL — assertions diff on shape.

- [ ] **Step 4: Change the type**

In `types.ts`:

```ts
export type InlineBold = {
  type: "inline-bold";
  content: InlineMarkdown[];
};
```

- [ ] **Step 5: Rewrite `inlineBoldParser` to use `inlineSeqUntil`**

In `inline.ts`:

```ts
export const inlineBoldParser: Parser<InlineBold> = map(
  seqR(str("**"), inlineSeqUntil(str("**")), str("**")),
  (parts) => ({ type: "inline-bold" as const, content: parts[1] as InlineMarkdown[] })
);
```

- [ ] **Step 6: Run tests, fix any cascade**

```bash
npx vitest run tests/examples/markdown/inline.test.ts
npm run test:tsc
```

Type errors will appear wherever code assumed `InlineBold.content: string`. Fix each in turn.

- [ ] **Step 7: Commit**

```bash
git commit -am "feat(markdown): bold (**) content is InlineMarkdown[]"
```

---

### Task 1.2: `inlineBoldUnderscoreParser` mirrors Task 1.1

**Files:**
- Modify: `tests/examples/markdown/inline.ts`
- Modify: `tests/examples/markdown/inline.test.ts`

The underscore form (`__bold__`) shares the `InlineBold` AST type, so the type change is already done. Only the parser body needs to switch to `inlineSeqUntil`.

- [ ] **Step 1: Failing test for nested underscore-bold**

```ts
it("parses __bold__ containing inline code", () => {
  const res = inlineBoldUnderscoreParser("__a `x` b__");
  expect(res.success).toBe(true);
  if (res.success) expect(res.result.content).toEqual([
    { type: "inline-text", content: "a " },
    { type: "inline-code", content: "x" },
    { type: "inline-text", content: " b" },
  ]);
});
```

- [ ] **Step 2: Rewrite the parser**

```ts
export const inlineBoldUnderscoreParser: Parser<InlineBold> = map(
  seqR(str("__"), inlineSeqUntil(str("__")), str("__"), not(alphanum)),
  (parts) => ({ type: "inline-bold" as const, content: parts[1] as InlineMarkdown[] })
);
```

- [ ] **Step 3: Run, verify, commit**

```bash
npx vitest run tests/examples/markdown/inline.test.ts -t "Bold"
git commit -am "refactor(markdown): __bold__ also produces nested content"
```

---

# Phase 2 — Italic

### Task 2.1: `InlineItalic.content` becomes `InlineMarkdown[]`

**Files:**
- Modify: `tests/examples/markdown/types.ts`
- Modify: `tests/examples/markdown/inline.ts`
- Modify: `tests/examples/markdown/inline.test.ts`

- [ ] **Step 1: Update existing italic tests to nested shape (red)**

- [ ] **Step 2: Add a nested-content test**

```ts
it("parses italic containing a link", () => {
  const res = inlineItalicParser("*see [a](u)*");
  expect(res.success).toBe(true);
  if (res.success) expect(res.result.content).toEqual([
    { type: "inline-text", content: "see " },
    { type: "inline-link", content: "a", url: "u" },
  ]);
});
```

- [ ] **Step 3: Run, expect fail**

- [ ] **Step 4: Change the type**

```ts
export type InlineItalic = {
  type: "inline-italic";
  content: InlineMarkdown[];
};
```

- [ ] **Step 5: Rewrite both italic parsers**

```ts
export const inlineItalicParser: Parser<InlineItalic> = map(
  seqR(not(str("**")), char("*"), inlineSeqUntil(char("*")), char("*")),
  (parts) => ({ type: "inline-italic" as const, content: parts[2] as InlineMarkdown[] })
);

export const inlineItalicUnderscoreParser: Parser<InlineItalic> = map(
  seqR(not(str("__")), char("_"), inlineSeqUntil(char("_")), char("_"), not(alphanum)),
  (parts) => ({ type: "inline-italic" as const, content: parts[2] as InlineMarkdown[] })
);
```

- [ ] **Step 6: Run all inline tests, fix type cascade, commit**

```bash
npx vitest run tests/examples/markdown/inline.test.ts
npm run test:tsc
git commit -am "feat(markdown): italic (* and _) content is InlineMarkdown[]"
```

---

# Phase 3 — Bold-italic

### Task 3.1: `InlineBoldItalic.content` becomes `InlineMarkdown[]`

**Files:**
- Modify: `tests/examples/markdown/types.ts`
- Modify: `tests/examples/markdown/inline.ts`
- Modify: `tests/examples/markdown/inline.test.ts`

- [ ] **Step 1: Update existing bold-italic tests to nested shape (red).**

- [ ] **Step 2: Add a nested-content test (e.g., `***foo `code` bar***`).**

- [ ] **Step 3: Run, expect fail.**

- [ ] **Step 4: Change the type to `content: InlineMarkdown[]`.**

- [ ] **Step 5: Rewrite both `***...***` and `___...___` branches with `inlineSeqUntil`.**

```ts
export const inlineBoldItalicParser: Parser<InlineBoldItalic> = or(
  map(
    seqR(str("***"), inlineSeqUntil(str("***")), str("***")),
    (parts) => ({ type: "inline-bold-italic" as const, content: parts[1] as InlineMarkdown[] })
  ),
  map(
    seqR(str("___"), inlineSeqUntil(str("___")), str("___")),
    (parts) => ({ type: "inline-bold-italic" as const, content: parts[1] as InlineMarkdown[] })
  )
);
```

- [ ] **Step 6: Run, fix type cascade, commit.**

```bash
git commit -am "feat(markdown): bold-italic (*** and ___) content is InlineMarkdown[]"
```

---

# Phase 4 — Strikethrough

### Task 4.1: `InlineStrike.content` becomes `InlineMarkdown[]`

**Files:**
- Modify: `tests/examples/markdown/types.ts`
- Modify: `tests/examples/markdown/inline.ts`
- Modify: `tests/examples/markdown/inline.test.ts`

Mirror Phase 1. Add at least one nested-content test (`~~bold **inside** strike~~`).

```ts
export const inlineStrikeParser: Parser<InlineStrike> = map(
  seqR(str("~~"), inlineSeqUntil(str("~~")), str("~~")),
  (parts) => ({ type: "inline-strike" as const, content: parts[1] as InlineMarkdown[] })
);
```

- [ ] **Step 1: Update existing strike tests (red).**
- [ ] **Step 2: Add nested-content test.**
- [ ] **Step 3: Change type.**
- [ ] **Step 4: Rewrite parser.**
- [ ] **Step 5: Run, fix cascade, commit.**

```bash
git commit -am "feat(markdown): strikethrough content is InlineMarkdown[]"
```

---

# Phase 5 — Inline link

### Task 5.1: `InlineLink.content` becomes `InlineMarkdown[]`

**Files:**
- Modify: `tests/examples/markdown/types.ts`
- Modify: `tests/examples/markdown/inline.ts`
- Modify: `tests/examples/markdown/inline.test.ts`
- Modify: `tests/examples/markdown/blocks.test.ts` (any link assertions)
- Modify: `tests/examples/markdown/references.ts` (resolved RefLink → InlineLink uses nested content)
- Modify: `tests/examples/markdown/references.test.ts`

**Important:** The inline-link text is delimited by `]`, not by a string the link itself can contain in nested form. Use `inlineSeqUntil(char("]"))` for the link text, and keep the URL as a literal string (no nested parsing).

- [ ] **Step 1: Update existing link tests to nested shape (red).**

```ts
it("parses [foo](u) with nested text", () => {
  const res = inlineLinkParser("[a **b** c](u)");
  expect(res.success).toBe(true);
  if (res.success) expect(res.result).toEqual({
    type: "inline-link",
    url: "u",
    content: [
      { type: "inline-text", content: "a " },
      { type: "inline-bold", content: [{ type: "inline-text", content: "b" }] },
      { type: "inline-text", content: " c" },
    ],
  });
});
```

- [ ] **Step 2: Change the type**

```ts
export type InlineLink = {
  type: "inline-link";
  content: InlineMarkdown[];   // ← was string
  url: string;
};
```

- [ ] **Step 3: Rewrite `inlineLinkParser`**

```ts
import { iManyTillStr } from "@/lib/combinators";

export const inlineLinkParser: Parser<InlineLink> = map(
  seqR(
    char("["),
    inlineSeqUntil(char("]")),
    str("]("),
    iManyTillStr(")"),
    char(")")
  ),
  (parts) => ({
    type: "inline-link" as const,
    content: parts[1] as InlineMarkdown[],
    url: parts[3] as string,
  })
);
```

- [ ] **Step 4: Fix the autolink parsers**

Autolink content is a single text node now:

```ts
const wrapAsText = (s: string): InlineMarkdown[] => [{ type: "inline-text", content: s }];

export const urlAutolinkParser: Parser<InlineLink> = map(
  seqR(char("<"), urlBody, char(">")),
  (parts) => {
    const url = parts[1] as string;
    return { type: "inline-link", content: wrapAsText(url), url };
  }
);

export const emailAutolinkParser: Parser<InlineLink> = map(
  seqR(char("<"), emailBody, char(">")),
  (parts) => {
    const email = parts[1] as string;
    return { type: "inline-link", content: wrapAsText(email), url: `mailto:${email}` };
  }
);
```

- [ ] **Step 5: Fix `resolveReferences`**

In `references.ts`, when an `InlineRefLink` resolves into an `InlineLink`, wrap `text` in a single `inline-text` node so the result conforms to the new shape. Update the `resolveReferences` tests to match.

- [ ] **Step 6: Run full suite, fix cascade, commit**

```bash
npx vitest run
npm run test:tsc
git commit -am "feat(markdown): inline-link content is InlineMarkdown[]"
```

---

# Phase 6 — Integration sweep

### Task 6.1: Update everything that still assumes string content

**Files:**
- Modify: `tests/examples/markdown/index.test.ts`
- Modify: `tests/examples/markdown/blocks.test.ts`
- Modify: `tests/examples/markdown.test.ts` (the legacy compatibility test)
- Modify: `tests/examples/markdown/markdown-longer.test.ts` (only if it deep-asserts; it currently does not)

- [ ] **Step 1: Run the full suite**

```bash
npx vitest run
```

Expected: failures wherever a test still has `content: "x"` on a bold/italic/strike/link/bold-italic node. Walk through each one and update the assertion shape.

- [ ] **Step 2: Run `npm run test:tsc`**

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git commit -am "test(markdown): update integration assertions for nested inlines"
```

---

### Task 6.2: Add a real-world smoke assertion

**Files:**
- Modify: `tests/examples/markdown/index.test.ts`

Add one test that asserts a paragraph containing `**[link](url)** and *`code`* go through`:

```ts
it("parses bold links and italic code inside a paragraph", () => {
  const res = markdownParser("Try **[the docs](https://x.dev)** or *`run --help`* now.");
  expect(res.success).toBe(true);
  if (res.success) {
    expect(res.result).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "inline-text", content: "Try " },
          {
            type: "inline-bold",
            content: [
              { type: "inline-link", url: "https://x.dev", content: [{ type: "inline-text", content: "the docs" }] },
            ],
          },
          { type: "inline-text", content: " or " },
          {
            type: "inline-italic",
            content: [{ type: "inline-code", content: "run --help" }],
          },
          { type: "inline-text", content: " now." },
        ],
      },
    ]);
  }
});
```

- [ ] **Step 1: Write the test (red).**
- [ ] **Step 2: Run; expect it to pass on the first try if Phases 1–5 are correct. If it fails, debug.**
- [ ] **Step 3: Commit.**

```bash
git commit -am "test(markdown): smoke test for nested bold/italic/link/code"
```

---

# Phase 7 — Documentation

### Task 7.1: README / CHANGELOG

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG`

- [ ] **Step 1: In `README.md`, replace the markdown example bullet so it mentions that inline nodes nest (e.g. `**[link](u)**`, `*foo `code` bar*`).**
- [ ] **Step 2: Add an `Unreleased` entry to `CHANGELOG`:**

```
- Markdown example: bold, italic, bold-italic, strikethrough, and inline-link
  nodes now carry `InlineMarkdown[]` content, so nested inlines like
  `**[link](u)**` or `*foo `code` bar*` round-trip through the AST.
```

- [ ] **Step 3: Commit.**

```bash
git commit -am "docs: nested inlines in markdown example"
```

---

## Final checklist

- [ ] Every numbered task above is checked off.
- [ ] `npx vitest run` shows zero failures and zero skips.
- [ ] `npm run test:tsc` passes (no new errors beyond the two pre-existing `regex` / `vitest.globals` ones on `main`).
- [ ] No file in `tests/examples/markdown/` still declares `content: string` on `InlineBold`, `InlineItalic`, `InlineBoldItalic`, `InlineStrike`, or `InlineLink`.
- [ ] At least one smoke test exercises bold-containing-link and italic-containing-code end-to-end through `markdownParser`.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-28-markdown-nested-inlines.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints.
