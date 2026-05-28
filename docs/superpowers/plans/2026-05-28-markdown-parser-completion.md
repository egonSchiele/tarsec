# Markdown Parser Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `tests/examples/markdown.ts` from a partial demo to a CommonMark‑ish reference parser that covers every Markdown feature called out in the gap analysis (block + inline + structural fixes), each driven by failing tests written first.

**Architecture:** Split the single `tests/examples/markdown.ts` file into a small `tests/examples/markdown/` package (`types.ts`, `inline.ts`, `blocks.ts`, `references.ts`, `index.ts`) so each subsystem is held in context independently. Tests mirror that structure (`tests/examples/markdown/inline.test.ts`, etc.). All parsers stay pure functions composed from the existing `lib/` combinators; reference‑style links are resolved in a post‑parse pass over the AST.

**Tech Stack:** TypeScript + Vitest, the local `@/lib/...` Tarsec API (`seqC`, `seqR`, `or`, `many`, `many1`, `manyTill`, `manyTillStr`, `lazy`, `optional`, `capture`, `set`, `map`, `char`, `str`, `oneOf`, `noneOf`, `regexParser`, `between`, `sepBy`, etc.).

---

## Conventions for every task

- **Combinator-first, regex-last.** This parser is an example of what Tarsec can do, so every parser must be expressed with Tarsec primitives (`seqC`, `seqR`, `or`, `many`, `many1`, `manyTill*`, `between`, `optional`, `not`, `lazy`, `capture`, `set`, `map`, `char`, `str`, `oneOf`, `noneOf`, `alphanum`, `spaces`, `eof`, …) before reaching for `regexParser` or hand-written `input.match`/`input.slice`. Use `regexParser` only when a feature is genuinely a character-class match that adds no clarity in combinator form (e.g. a complex Unicode range), and never for shape/structure. Use `map` to project the result of a `seqR` into the final shape rather than indexing into a `match` array. If a parser needs `input.match` or `input.slice` to function, redesign it.
- **TDD strictly:** Add the failing test first. Run it. Watch it fail for the right reason. Then write the minimum code to make it pass. Then run again. Then commit. No exceptions.
- **One concept per test.** When a feature has edge cases, add additional small `it(...)` blocks, each preceded by a red→green→commit cycle.
- **Vitest commands** use the project alias `@/lib/...`. Single‑file run:
  - `npx vitest run tests/examples/markdown/inline.test.ts -t "test name"`
  - or full file: `npx vitest run tests/examples/markdown/inline.test.ts`
  - full suite: `npx vitest run`
- **Type check** after each commit: `npm run test:tsc`. If it fails, fix types before moving on.
- **Commit message style:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`).
- **Never weaken or hard‑code an expected value to make a test green.** If a test exposes a real gap, fix the parser, not the test.
- **Use `success` / `failure` from `@/lib/types`** in assertions, and `compareSuccess` from `vitest.globals` when you only care about result + rest (ignoring `captures`).
- **Reference relevant skills:** @superpowers:test-driven-development, @superpowers:systematic-debugging, @superpowers:verification-before-completion.

---

## File Structure (target end state)

```
tests/examples/markdown/
  types.ts          – AST types only
  inline.ts         – inline parsers (text, bold, italic, link, code, image, autolink, strike, hardBreak, escape, refLink)
  blocks.ts         – block parsers (heading, setextHeading, codeBlock, indentedCodeBlock, blockQuote, hr, list, table, htmlBlock, paragraph)
  references.ts     – reference link/footnote definition parser + resolution pass
  index.ts          – markdownParser + re-exports (so `from "../markdown"` keeps working)

  types.test.ts     – (none; types only)
  inline.test.ts
  blocks.test.ts
  references.test.ts
  index.test.ts     – integration tests for full markdownParser
  markdown-longer.test.ts (existing, untouched)
```

The existing `tests/examples/markdown.test.ts` keeps working because `from "./markdown"` resolves to `markdown/index.ts` once `markdown.ts` is removed.

---

# Phase 0 — Refactor & safety net

### Task 0.1: Snapshot the current behavior

**Files:**
- No code change.

- [ ] **Step 1: Run the existing suite and record baseline**

Run: `npx vitest run tests/examples/`
Expected: all current tests pass (markdown headingParser, codeBlockParser, blockQuoteParser, imageParser, inlineBoldParser, inlineItalicParser, inlineLinkParser, inlineCodeParser, inlineTextParser, paragraphParser, inlineMarkdownParser, markdown-longer).

- [ ] **Step 2: Confirm type check is clean**

Run: `npm run test:tsc`
Expected: 0 errors.

- [ ] **Step 3: Commit baseline note (optional)**

```bash
git commit --allow-empty -m "chore: baseline before markdown parser completion"
```

---

### Task 0.2: Split `markdown.ts` into a folder package

**Files:**
- Create: `tests/examples/markdown/types.ts`
- Create: `tests/examples/markdown/inline.ts`
- Create: `tests/examples/markdown/blocks.ts`
- Create: `tests/examples/markdown/references.ts` (empty placeholder)
- Create: `tests/examples/markdown/index.ts`
- Delete: `tests/examples/markdown.ts`

- [ ] **Step 1: Create `types.ts` with the existing types verbatim**

Copy the `InlineMarkdown`, `InlineText`, …, `List` types from the current `markdown.ts` into `tests/examples/markdown/types.ts` and `export` each.

- [ ] **Step 2: Create `inline.ts` with the existing inline parsers verbatim**

Move `inlineTextParser`, `inlineBoldParser`, `inlineItalicParser`, `inlineLinkParser`, `inlineCodeParser`, `inlineMarkdownParser` into `tests/examples/markdown/inline.ts`. Import types from `./types`.

- [ ] **Step 3: Create `blocks.ts` with the existing block parsers verbatim**

Move `headingParser`, `codeBlockParser`, `blockQuoteParser`, `imageParser`, `paragraphParser` into `tests/examples/markdown/blocks.ts`. Import inline parsers from `./inline`.

- [ ] **Step 4: Create `index.ts` that re-exports and defines `markdownParser`**

```ts
export * from "./types";
export * from "./inline";
export * from "./blocks";
export * from "./references";

import { seq, sepBy, or, optional } from "@/lib/combinators";
import { spaces } from "@/lib/parsers";
import {
  headingParser, codeBlockParser, blockQuoteParser, paragraphParser, imageParser,
} from "./blocks";

export const markdownParser = seq(
  [
    optional(spaces),
    sepBy(
      spaces,
      or(headingParser, codeBlockParser, blockQuoteParser, paragraphParser, imageParser),
    ),
    optional(spaces),
  ],
  (r) => r[1],
);
```

- [ ] **Step 5: Delete the old `tests/examples/markdown.ts`**

```bash
git rm tests/examples/markdown.ts
```

- [ ] **Step 6: Run the entire suite**

Run: `npx vitest run`
Expected: zero failures. `tests/examples/markdown.test.ts` and `tests/examples/markdown/markdown-longer.test.ts` both resolve `from "./markdown"` / `from "../markdown"` to `markdown/index.ts`.

- [ ] **Step 7: Type check**

Run: `npm run test:tsc`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(markdown): split example into types/inline/blocks/index"
```

---

# Phase 1 — Fix the structural defects in what already exists

For each task in this phase: write the failing test FIRST in `tests/examples/markdown/inline.test.ts` or `blocks.test.ts`, confirm it fails for the right reason, then fix.

### Task 1.1: `codeBlockParser` must accept hyphens/digits/`+` in language tag

**Files:**
- Modify: `tests/examples/markdown/blocks.ts`
- Test: `tests/examples/markdown/blocks.test.ts`

- [ ] **Step 1: Add a failing test**

```ts
import { describe, it, expect } from "vitest";
import { success } from "@/lib/types";
import { codeBlockParser } from "./blocks";

describe("codeBlockParser language tag", () => {
  it("accepts hyphens, plus, and digits in language", () => {
    const input = "```objective-c\nint x = 1;\n```";
    expect(codeBlockParser(input)).toEqual(
      success(
        { type: "code-block", language: "objective-c", content: "int x = 1;\n" },
        "",
      ),
    );
  });

  it("accepts c++", () => {
    const input = "```c++\nint x;\n```";
    expect(codeBlockParser(input).success).toBe(true);
  });

  it("accepts ts2", () => {
    const input = "```ts2\nlet x;\n```";
    expect(codeBlockParser(input).success).toBe(true);
  });
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx vitest run tests/examples/markdown/blocks.test.ts -t "language tag"`
Expected: FAIL — `word` only matches `[a-z]+`.

- [ ] **Step 3: Replace `word` with a combinator-built language token**

In `blocks.ts`, compose the token from existing parsers instead of reaching for a regex:

```ts
import { many1WithJoin, or } from "@/lib/combinators";
import { alphanum, oneOf } from "@/lib/parsers";

const languageChar = or(alphanum, oneOf("_+#.-"));
const languageTag  = many1WithJoin(languageChar);
```

Use `capture(optional(languageTag), "language")` in `codeBlockParser` in place of `capture(optional(word), "language")`.

- [ ] **Step 4: Verify pass + no regression**

Run: `npx vitest run tests/examples/markdown/blocks.test.ts`
Expected: PASS, plus the existing `codeBlockParser` tests still green.

- [ ] **Step 5: Commit**

```bash
git commit -am "fix(markdown): allow hyphens/digits/+ in code-block language tag"
```

---

### Task 1.2: `paragraphParser` must stop at a blank line

**Files:**
- Modify: `tests/examples/markdown/blocks.ts`
- Test: `tests/examples/markdown/blocks.test.ts`

- [ ] **Step 1: Failing test**

```ts
it("stops paragraph at a blank line and leaves the rest", () => {
  const input = "hello\n\nworld";
  const res = paragraphParser(input);
  expect(res.success).toBe(true);
  if (res.success) {
    expect(res.result).toEqual({
      type: "paragraph",
      content: [{ type: "inline-text", content: "hello" }],
    });
    expect(res.rest).toBe("\n\nworld");
  }
});
```

- [ ] **Step 2: Verify fail**

`npx vitest run tests/examples/markdown/blocks.test.ts -t "blank line"`
Expected: FAIL — the parser currently keeps slurping past the blank line as inline text.

- [ ] **Step 3: Implement blank‑line termination using combinators**

Add a `blankLine` parser built from primitives in `blocks.ts`, and have `paragraphParser` stop when the next input would match it:

```ts
import { char, oneOf, eof } from "@/lib/parsers";
import { many, or, not, seqR, lookahead } from "@/lib/combinators";

// "\n", followed by zero or more spaces/tabs, followed by another "\n" or eof.
export const blankLine = seqR(char("\n"), many(oneOf(" \t")), or(char("\n"), eof));
```

Rewrite `paragraphParser` to drive `many1(inlineMarkdownParser)` while ALSO requiring `not(blankLine)` between elements — composed with `seqR`:

```ts
const paragraphInline = seqR(not(blankLine), inlineMarkdownParser);
export function paragraphParser(input: string): ParserResult<Paragraph> {
  const inline = many1(paragraphInline)(input);
  if (!inline.success) return inline;
  return success({ type: "paragraph", content: inline.result }, inline.rest);
}
```

(If `lookahead` doesn't exist yet, simulate it with `not(not(blankLine))` semantics or do a one-character peek using `not(blankLine)` — `not` already consumes nothing on success.)

- [ ] **Step 4: Verify pass + no regression**

Run: `npx vitest run tests/examples/markdown/`
Expected: green, including the existing paragraph tests.

- [ ] **Step 5: Commit**

```bash
git commit -am "fix(markdown): paragraph terminates at blank line"
```

---

### Task 1.3: Bold-vs-italic ordering (consume `**` before `*`)

**Files:**
- Modify: `tests/examples/markdown/inline.ts`
- Test: `tests/examples/markdown/inline.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { inlineMarkdownParser } from "./inline";
it("parses ** as bold even when * could match first", () => {
  const res = inlineMarkdownParser("**hi**");
  expect(res.success).toBe(true);
  if (res.success) expect(res.result).toEqual({ type: "inline-bold", content: "hi" });
});
it("does not consume the closing ** of bold as italic", () => {
  // a bug shape: italic should never swallow `**bold**`
  const res = inlineMarkdownParser("*x* **y**");
  expect(res.success).toBe(true);
});
```

- [ ] **Step 2: Verify fail**

Run the new tests; the second should already pass, the first should already pass because `inlineBoldParser` is listed before `inlineItalicParser`. If both already pass, keep the test (it's a regression guard) and proceed — no implementation change needed; commit as `test: regression guard for bold ordering` and move on.

- [ ] **Step 3 (if needed): Make `inlineItalicParser` refuse to start at `**`**

```ts
import { not } from "@/lib/combinators";
import { str } from "@/lib/parsers";

export const inlineItalicParser: Parser<InlineItalic> = seqC(
  set("type", "inline-italic"),
  not(str("**")),
  char("*"),
  capture(many1Till(char("*")), "content"),
  char("*"),
);
```

- [ ] **Step 4: Re-run, then commit**

```bash
git commit -am "fix(markdown): italic must not consume bold delimiters"
```

---

### Task 1.4: `inlineTextParser` stop‑set is incomplete

**Files:**
- Modify: `tests/examples/markdown/inline.ts`
- Test: `tests/examples/markdown/inline.test.ts`

- [ ] **Step 1: Failing test**

```ts
it("stops inline text at every inline delimiter", () => {
  // each of these characters should end the current inline-text run
  const cases: [string, string][] = [
    ["abc*x*",   "abc"],
    ["abc_x_",   "abc"],
    ["abc`x`",   "abc"],
    ["abc[x](y)","abc"],
    ["abc![a](b)","abc"],
    ["abc<x>",   "abc"],
    ["abc~~x~~", "abc"],
    ["abc\nx",   "abc"],
    ["abc\\*",   "abc"],
  ];
  for (const [input, expected] of cases) {
    const res = inlineTextParser(input);
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.content).toBe(expected);
  }
});
```

- [ ] **Step 2: Verify fail**

Run: `npx vitest run tests/examples/markdown/inline.test.ts -t "every inline delimiter"`
Expected: FAIL on `_`, `!`, `<`, `~`, `\\`.

- [ ] **Step 3: Widen the stop set**

```ts
capture(manyTillOneOf(["*", "_", "`", "[", "!", "<", "~", "\\", "\n"]), "content")
```

Also add a minimum‑length guard so empty matches don't loop forever in `many` (use `many1Till` semantics here, or fail when the captured content is empty). Concretely:

```ts
export const inlineTextParser: Parser<InlineText> = (input) => {
  const res = seqC(
    set("type", "inline-text"),
    capture(manyTillOneOf(["*","_","`","[","!","<","~","\\","\n"]), "content"),
  )(input);
  if (res.success && (res.result as any).content === "") {
    return failure("empty inline text", input);
  }
  return res;
};
```

(`failure` from `@/lib/types`.)

- [ ] **Step 4: Verify + no regression in `paragraphParser`**

Run: `npx vitest run tests/examples/markdown/`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git commit -am "fix(markdown): widen inline-text stop set and forbid empty match"
```

---

# Phase 2 — Inline features

Tests live in `tests/examples/markdown/inline.test.ts`. After each new parser, wire it into the `inlineMarkdownParser` `or(...)` and add a dispatch test.

### Task 2.1: Escaped characters (`\*`, `\[`, …)

**Files:**
- Modify: `tests/examples/markdown/types.ts` (add `InlineEscape` or fold into `InlineText`)
- Modify: `tests/examples/markdown/inline.ts`
- Test: `tests/examples/markdown/inline.test.ts`

Design: an escape sequence `\x` where `x` is one of ``\`*_{}[]()#+-.!~<>|`` becomes a single‑character `inline-text` node with `content: x`. Anything else (`\n` etc.) is left alone.

- [ ] **Step 1: Failing test**

```ts
import { inlineEscapeParser } from "./inline";
it("parses \\* as literal *", () => {
  expect(inlineEscapeParser("\\*rest")).toEqual(
    success({ type: "inline-text", content: "*" }, "rest"),
  );
});
it("fails on \\z (not an escapable char)", () => {
  expect(inlineEscapeParser("\\z").success).toBe(false);
});
```

- [ ] **Step 2: Implement**

```ts
const ESCAPABLE = "\\`*_{}[]()#+-.!~<>|";
export const inlineEscapeParser: Parser<InlineText> = seqC(
  set("type", "inline-text"),
  char("\\"),
  capture(oneOf(ESCAPABLE), "content"),
);
```

- [ ] **Step 3: Add it to `inlineMarkdownParser` first in the `or`**

Order matters — escape must be tried before any single‑char delimiter parser.

- [ ] **Step 4: Run, commit**

```bash
git commit -am "feat(markdown): escape sequences (\\*, \\[, ...)"
```

---

### Task 2.2: Underscore emphasis (`_italic_`, `__bold__`)

**Files:** `inline.ts`, `inline.test.ts`

- [ ] **Step 1: Failing tests for italic underscore and bold underscore, plus regression for `snake_case_word` NOT becoming italic in mid‑word.**

```ts
it("parses _x_ as italic", () => { ... expect type 'inline-italic' ... });
it("parses __x__ as bold",  () => { ... expect type 'inline-bold' ... });
it("does not italicize inside snake_case_word", () => {
  const res = inlineMarkdownParser("snake_case_word");
  if (res.success) expect(res.result.type).toBe("inline-text");
});
```

- [ ] **Step 2: Implement**

Add `inlineItalicUnderscoreParser` and `inlineBoldUnderscoreParser` mirroring the `*`/`**` versions. To honor the snake_case rule, require that the opening `_` is at start of input or follows whitespace/punctuation. Helper:

```ts
function notWordBefore(input: string, fullInput: string): boolean {
  const idx = fullInput.length - input.length;
  if (idx === 0) return true;
  return /[\s\W]/.test(fullInput[idx - 1]);
}
```

The simplest path: don't bother with full lookbehind for now (CommonMark spec is complex). Instead, in `inlineMarkdownParser` only try the `_` variants AFTER `inlineTextParser` has stopped — and have `inlineTextParser`'s stop set include `_`. Then when we re‑enter the dispatch we're at a `_`. To avoid breaking `snake_case`, accept `_…_` only if the next char after closing `_` is not an alphanumeric. Implement that test in the parser by requiring `!alphanum` after close.

- [ ] **Step 3: Run, fix regressions, commit**

```bash
git commit -am "feat(markdown): underscore emphasis with snake_case guard"
```

---

### Task 2.3: Bold + italic together (`***x***`, `___x___`)

**Files:** `inline.ts`, `inline.test.ts`

- [ ] **Step 1: Failing test**

```ts
it("parses ***x*** as bold>italic", () => {
  const res = inlineMarkdownParser("***hey***");
  expect(res.success).toBe(true);
  if (res.success) {
    expect(res.result).toEqual({
      type: "inline-bold",
      content: [{ type: "inline-italic", content: "hey" }],
    });
  }
});
```

This changes the `InlineBold`/`InlineItalic` content type from `string` to `InlineMarkdown[]`. That ripple is covered in Task 1.5‑bis below, schedule it as a precursor: do Task 4.1 before this if not already done. If types haven't changed yet, branch the test: assert `type: "inline-bold-italic"` with `content: "hey"` and a dedicated parser. Pick ONE of these and stay consistent.

- [ ] **Step 2: Implement** (pick the nested‑AST variant)

Add `inlineBoldItalicParser` that matches `***…***`, returns `{type:"inline-bold", content:[{type:"inline-italic", content: "..."}]}`. Place it BEFORE bold and italic in the `or`.

- [ ] **Step 3: Run, commit**

```bash
git commit -am "feat(markdown): combined bold+italic (*** and ___)"
```

---

### Task 2.4: Strikethrough (`~~x~~`)

**Files:** `types.ts`, `inline.ts`, `inline.test.ts`

- [ ] **Step 1: Add type**

```ts
type InlineStrike = { type: "inline-strike"; content: string };
```

Add to `InlineMarkdown` union.

- [ ] **Step 2: Failing test**

```ts
it("parses ~~gone~~", () => {
  const res = inlineMarkdownParser("~~gone~~");
  if (res.success) expect(res.result).toEqual({ type: "inline-strike", content: "gone" });
});
```

- [ ] **Step 3: Implement**

```ts
export const inlineStrikeParser: Parser<InlineStrike> = seqC(
  set("type", "inline-strike"),
  str("~~"),
  capture(manyTillStr("~~"), "content"),
  str("~~"),
);
```

Wire into `inlineMarkdownParser`.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(markdown): strikethrough"
```

---

### Task 2.5: Autolinks `<https://…>`

**Files:** `types.ts`, `inline.ts`, `inline.test.ts`

Type: reuse `InlineLink` with `content === url`.

- [ ] **Step 1: Failing tests**

```ts
it("parses <https://example.com>", () => {
  const res = inlineMarkdownParser("<https://example.com>");
  if (res.success) expect(res.result).toEqual({
    type: "inline-link", content: "https://example.com", url: "https://example.com",
  });
});
it("parses <user@example.com> as mailto:", () => {
  const res = inlineMarkdownParser("<a@b.com>");
  if (res.success) expect(res.result).toEqual({
    type: "inline-link", content: "a@b.com", url: "mailto:a@b.com",
  });
});
it("does not consume non-URL angle brackets", () => {
  expect(inlineMarkdownParser("<not a url>").success).toBe(true);
  // either treats `<` as text, or fails the autolink and lets inlineText take over
});
```

- [ ] **Step 2: Implement using combinators end-to-end**

Compose the URL body, the email body, and the angle-bracket wrapping out of Tarsec primitives. No `input.match`, no `input.slice`:

```ts
import {
  many1, many1WithJoin, or, seqC, seqR, map, capture, between,
} from "@/lib/combinators";
import { str, char, noneOf, set } from "@/lib/parsers";

// Body of a URL inside <...>: http(s)://<one-or-more chars that aren't space/</>>
const urlBody = map(
  seqR(
    str("http"),
    or(str("s"), str("")),    // http or https
    str("://"),
    many1WithJoin(noneOf(" \t\n<>")),
  ),
  (parts) => parts.join(""),  // map over the seqR results array → full URL string
);

// Email body: local@domain.tld  (no spaces, no <>, no @ inside parts)
const emailPart = many1WithJoin(noneOf(" \t\n<>@."));
const emailBody = map(
  seqR(emailPart, char("@"), emailPart, char("."), emailPart),
  (parts) => parts.join(""),
);

// <url>   → { content: url, url }
export const urlAutolinkParser: CaptureParser<InlineLink, { content: string; url: string }> = seqC(
  set("type", "inline-link"),
  char("<"),
  capture(urlBody, "content"),  // tee the same string into both fields
  capture(map(urlBody, (u) => u), "url"), // …actually use a single capture + transform; see note
  char(">"),
);

// <email> → { content: email, url: "mailto:" + email }
export const emailAutolinkParser: Parser<InlineLink> = map(
  between(char("<"), char(">"), emailBody) as unknown as Parser<string>, // single-content variant
  (email: string) => ({ type: "inline-link" as const, content: email, url: `mailto:${email}` }),
);

export const autolinkParser = or(urlAutolinkParser, emailAutolinkParser);
```

**Note on the URL variant:** the two `capture` calls above would run `urlBody` twice. Prefer the single-capture + `map` shape used for emails:

```ts
export const urlAutolinkParser: Parser<InlineLink> = map(
  seqR(char("<"), urlBody, char(">")),
  (parts) => {
    const url = parts[1] as string;
    return { type: "inline-link", content: url, url };
  },
);
```

That keeps the parser purely combinator-driven (`seqR` + `map`) and only matches the URL once.

Wire `autolinkParser` into `inlineMarkdownParser` BEFORE the link parser so `<...>` is tried first.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(markdown): autolinks for http(s) and email"
```

---

### Task 2.6: Hard line breaks

**Files:** `types.ts`, `inline.ts`, `inline.test.ts`

```ts
type InlineHardBreak = { type: "inline-hard-break" };
```

Rules: `"  \n"` (two+ spaces then newline) or `"\\\n"` (backslash then newline).

- [ ] **Step 1: Failing tests for both forms**

- [ ] **Step 2: Implement (combinators only)**

```ts
import { many, or, seqR, map } from "@/lib/combinators";
import { char, str } from "@/lib/parsers";

const trailingSpaces = seqR(str("  "), many(char(" ")), char("\n"));
const backslashBreak = seqR(char("\\"), char("\n"));

export const hardBreakParser: Parser<InlineHardBreak> = map(
  or(trailingSpaces, backslashBreak),
  () => ({ type: "inline-hard-break" as const }),
);
```

Place BEFORE escape parser (so `\\\n` wins over `\\\n` being treated as escape of `\n`).

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(markdown): hard line breaks (two trailing spaces, backslash)"
```

---

### Task 2.7: Inline images embedded in paragraphs

**Files:** `inline.ts`, `inline.test.ts`

`imageParser` already exists in `blocks.ts`. Re-export it (or move it) and add it to `inlineMarkdownParser`'s `or`. Also make sure `inlineTextParser` stops at `!` (already done in Task 1.4).

- [ ] **Step 1: Failing test**

```ts
it("parses an image inside paragraph text", () => {
  const res = paragraphParser("see ![alt](u.png) end");
  expect(res.success).toBe(true);
  if (res.success) expect(res.result.content).toEqual([
    { type: "inline-text", content: "see " },
    { type: "image", url: "u.png", alt: "alt" },
    { type: "inline-text", content: " end" },
  ]);
});
```

- [ ] **Step 2: Implement** — add `imageParser` to `inlineMarkdownParser`.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(markdown): allow inline images inside paragraphs"
```

---

### Task 2.8: Reference‑style links and images

**Files:** `types.ts`, `inline.ts`, `references.ts`, `inline.test.ts`, `references.test.ts`

Design: parse `[text][id]`, `[text][]`, and shortcut `[text]` (when `id === text`) into a **deferred** node:

```ts
type InlineRefLink  = { type: "inline-ref-link";  text: string; id: string };
type InlineRefImage = { type: "inline-ref-image"; alt:  string; id: string };
```

Resolution happens in Phase 3 once we can parse reference definitions; for now we only parse the deferred form.

- [ ] **Step 1: Failing tests** for `[a][b]`, `[a][]`, and `[a]` (shortcut). Also assert that a `[text](url)` inline link still wins.

- [ ] **Step 2: Implement (combinators only)**

Compose with `between`, `many1Till`, `optional`, and `not(char("("))` to disambiguate from inline links:

```ts
import {
  seqC, seqR, map, capture, between, optional, not, manyTillStr, many1Till, or,
} from "@/lib/combinators";
import { char, str, set, noneOf } from "@/lib/parsers";

// `[...]` where ... is anything but `]` or `\n`. between() succeeds when the close char appears.
const bracketed = between(char("["), char("]"), noneOf("]\n"));
const bracketedAsString = map(bracketed, (chars) => chars.join(""));

// shape: [text]  | [text][]  | [text][id]
// followed by "not a `(`" so inline links win.
export const inlineRefLinkParser: Parser<InlineRefLink> = map(
  seqR(
    bracketedAsString,                              // text
    optional(bracketedAsString),                    // id (may be empty, or absent)
    not(char("(")),                                 // disambiguate from inline link
  ),
  (parts) => {
    const text = parts[0] as string;
    const rawId = parts[1] as string | null;
    const id = rawId && rawId.length > 0 ? rawId : text;
    return { type: "inline-ref-link" as const, text, id };
  },
);

// Same shape, prefixed with `!`
export const inlineRefImageParser: Parser<InlineRefImage> = map(
  seqR(
    char("!"),
    bracketedAsString,
    optional(bracketedAsString),
    not(char("(")),
  ),
  (parts) => {
    const alt = parts[1] as string;
    const rawId = parts[2] as string | null;
    const id = rawId && rawId.length > 0 ? rawId : alt;
    return { type: "inline-ref-image" as const, alt, id };
  },
);
```

Place BOTH after the existing inline link/image parsers in `inlineMarkdownParser` so the `(url)` form is still preferred.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(markdown): deferred reference-style links and images"
```

---

# Phase 3 — Block features

Tests live in `tests/examples/markdown/blocks.test.ts`. After each block parser exists, wire it into `markdownParser`'s `or(...)` in `index.ts`.

### Task 3.1: Horizontal rules

**Files:** `types.ts`, `blocks.ts`, `blocks.test.ts`

```ts
type HorizontalRule = { type: "horizontal-rule" };
```

Rule: a line containing three or more of `-`, `*`, or `_` (all the same), with optional spaces between, nothing else.

- [ ] **Step 1: Failing tests** for `---`, `***`, `___`, `- - -`, `* * * *`. Negative: `--` (only two), `-a-` (other chars present).

- [ ] **Step 2: Implement** with combinators — one parser per HR character, then `or`:

```ts
import { many, count, or, seqR, map, optional } from "@/lib/combinators";
import { char, oneOf, eof } from "@/lib/parsers";

const ws = many(char(" "));
const hrOf = (c: string) =>
  map(
    seqR(
      ws,
      char(c),
      // at least two more "spaces? c"s → 3+ total via count
      count(seqR(ws, char(c))),
      ws,
      or(char("\n"), eof),
    ),
    (parts) => parts[2] as number, // number of additional c's matched
  );

const hrRule = (c: string): Parser<HorizontalRule> => (input) => {
  const res = hrOf(c)(input);
  if (!res.success) return res;
  if (res.result < 2) return failure("need 3+ HR chars", input);
  return success({ type: "horizontal-rule" }, res.rest);
};

export const horizontalRuleParser = or(hrRule("-"), hrRule("*"), hrRule("_"));
```

No regex; the "3 or more of the same char" rule falls out of `count(seqR(ws, char(c)))` plus a numeric check.

- [ ] **Step 3: Wire into `markdownParser`'s `or`. Commit.**

```bash
git commit -am "feat(markdown): horizontal rules"
```

---

### Task 3.2: Setext-style headings

**Files:** `types.ts` (reuse `Heading`), `blocks.ts`, `blocks.test.ts`

Rule: a non‑empty line followed by `\n` followed by one or more `=` (level 1) or `-` (level 2).

- [ ] **Step 1: Failing tests**

```ts
it("parses setext H1", () => {
  expect(setextHeadingParser("Title\n=====").result).toEqual(
    { type: "heading", level: 1, content: "Title" });
});
it("parses setext H2", () => {
  expect(setextHeadingParser("Title\n--").result).toEqual(
    { type: "heading", level: 2, content: "Title" });
});
it("rejects when the underline contains other chars", () => {
  expect(setextHeadingParser("Title\n==x").success).toBe(false);
});
```

- [ ] **Step 2: Implement (combinators only)**

```ts
import { seqC, capture, many1, many1WithJoin, or, map } from "@/lib/combinators";
import { char, noneOf, eof, set } from "@/lib/parsers";

const lineContent = many1WithJoin(noneOf("\n"));
const eqUnderline = map(many1(char("=")), () => 1 as const);
const dashUnderline = map(many1(char("-")), () => 2 as const);

export const setextHeadingParser: Parser<Heading> = seqC(
  set("type", "heading"),
  capture(lineContent, "content"),
  char("\n"),
  capture(or(eqUnderline, dashUnderline), "level"),
  // require end-of-line or end-of-input after the underline:
  or(char("\n"), eof),
);
```

The underline-level mapping (`= → 1`, `- → 2`) is encoded in the parsers themselves via `map`, so there is no post-hoc string inspection.

- [ ] **Step 3: Wire into `markdownParser`'s `or` BEFORE `paragraphParser` (otherwise paragraph eats the first line). Commit.**

```bash
git commit -am "feat(markdown): setext-style headings"
```

---

### Task 3.3: Indented code blocks

**Files:** `types.ts` (reuse `CodeBlock` with `language: null`), `blocks.ts`, `blocks.test.ts`

Rule: one or more consecutive lines that begin with exactly four spaces or a tab. Content keeps the trailing newline, indentation is stripped.

- [ ] **Step 1: Failing tests**

```ts
it("parses an indented code block", () => {
  const input = "    let x = 1;\n    let y = 2;\nrest";
  expect(indentedCodeBlockParser(input)).toEqual(success(
    { type: "code-block", language: null, content: "let x = 1;\nlet y = 2;\n" },
    "rest",
  ));
});
it("rejects when first line has fewer than 4 spaces", () => {
  expect(indentedCodeBlockParser("   x\n").success).toBe(false);
});
```

- [ ] **Step 2: Implement** (line‑oriented; split on `\n`, take while line starts with 4 spaces or tab, slice 4 chars off the front).

- [ ] **Step 3: Wire into `or`. Commit.**

```bash
git commit -am "feat(markdown): indented code blocks"
```

---

### Task 3.4: Multi‑line and nested block quotes

**Files:** `types.ts` (change `content: string` → `content: (InlineMarkdown | BlockNode)[]`), `blocks.ts`, `blocks.test.ts`

This change touches the type of `BlockQuote.content`. Update the type, update the existing single‑line blockquote test to match, then add new tests for multi‑line and nested.

- [ ] **Step 1: Failing tests**

```ts
it("parses a multi-line block quote", () => {
  const input = "> line 1\n> line 2";
  const res = blockQuoteParser(input);
  // Expect content = parsed children covering both lines as one paragraph
});
it("parses a nested block quote", () => {
  const input = "> outer\n> > inner";
  // Expect a BlockQuote whose content contains a nested BlockQuote
});
```

- [ ] **Step 2: Implement** — strip the leading `> ?` from each consecutive line, then re-run the block parser on the de‑indented content with `lazy`. Use `lazy(() => markdownParser)` to avoid the circular reference.

- [ ] **Step 3: Wire, commit.**

```bash
git commit -am "feat(markdown): multi-line and nested block quotes"
```

---

### Task 3.5: Unordered lists (flat)

**Files:** `types.ts` (rework `List`: `items: ListItem[]`, `ordered: boolean`; `ListItem.content: InlineMarkdown[]`), `blocks.ts`, `blocks.test.ts`

- [ ] **Step 1: Failing test** for `- a\n- b\n- c` returning `{type:"list", ordered:false, items:[{content:[{type:"inline-text",content:"a"}]}, ...]}`.

- [ ] **Step 2: Implement** with `many1(seqC(oneOf("-*+"), char(" "), capture(many1(inlineMarkdownParser), "content"), optional(char("\n"))))` plus an item‑wrapper.

- [ ] **Step 3: Wire, commit.**

```bash
git commit -am "feat(markdown): unordered (flat) lists"
```

---

### Task 3.6: Ordered lists (flat)

- [ ] **Step 1: Failing test** for `1. a\n2. b\n3. c` returning `ordered:true`. Also: starting number is preserved (add `start?: number` to `List`).

- [ ] **Step 2: Implement** with `regexParser("[0-9]+")` + `str(". ")`.

- [ ] **Step 3: Wire, commit.**

```bash
git commit -am "feat(markdown): ordered (flat) lists"
```

---

### Task 3.7: Nested lists

- [ ] **Step 1: Failing test**

```ts
const input = "- a\n  - a1\n  - a2\n- b";
// Expect list with two items, the first item's content includes a nested List
```

- [ ] **Step 2: Implement** — after parsing an item's first line, peek at the next line: if it begins with `>=2` more spaces of indentation followed by a list marker, recursively parse a sub‑list at that indentation. Track current indent through a parameter (`listParserAt(indent: number)`).

- [ ] **Step 3: Commit.**

```bash
git commit -am "feat(markdown): nested lists"
```

---

### Task 3.8: Tables (pipe syntax)

**Files:** `types.ts`, `blocks.ts`, `blocks.test.ts`

```ts
type Table = {
  type: "table";
  headers: string[];
  alignments: ("left" | "right" | "center" | null)[];
  rows: string[][];
};
```

- [ ] **Step 1: Failing tests**

```ts
const input =
  "| h1 | h2 | h3 |\n" +
  "|:---|---:|:---:|\n" +
  "| a  | b  | c  |\n" +
  "| d  | e  | f  |";
// Expect headers ["h1","h2","h3"], alignments ["left","right","center"], rows [["a","b","c"],["d","e","f"]]
```

- [ ] **Step 2: Implement** — split input on `\n`, parse header row, parse separator row to compute alignments, then parse data rows until a line that doesn't start with `|`.

- [ ] **Step 3: Wire, commit.**

```bash
git commit -am "feat(markdown): pipe tables with alignment"
```

---

### Task 3.9: Reference link definitions + resolution pass

**Files:** `types.ts`, `references.ts`, `index.ts`, `references.test.ts`

```ts
type LinkDef = { type: "link-definition"; id: string; url: string; title?: string };
```

- [ ] **Step 1: Failing test for parser**

```ts
it("parses [id]: url \"title\"", () => {
  expect(linkDefinitionParser('[foo]: https://x "T"')).toEqual(success(
    { type: "link-definition", id: "foo", url: "https://x", title: "T" }, "",
  ));
});
```

- [ ] **Step 2: Implement (combinators only)**

```ts
import { seqC, capture, optional, many1WithJoin, seqR, between } from "@/lib/combinators";
import { char, str, set, noneOf, spaces } from "@/lib/parsers";

const idChars  = many1WithJoin(noneOf("]\n"));
const urlChars = many1WithJoin(noneOf(" \t\n"));
const titleChars = many1WithJoin(noneOf('"\n'));

export const linkDefinitionParser: Parser<LinkDef> = seqC(
  set("type", "link-definition"),
  char("["),
  capture(idChars, "id"),
  str("]:"),
  spaces,
  capture(urlChars, "url"),
  optional(
    capture(
      seqR(spaces, char('"'), titleChars, char('"')),
      // pull out the captured title text from the seqR results
      // (it's the 3rd element, index 2)
      "title",
    ),
  ),
);
```

If the awkward indexing inside `capture(seqR(...), "title")` is a turnoff, lift the title parser out and `map` it to the string:

```ts
import { map } from "@/lib/combinators";
const titleParser = map(
  seqR(spaces, char('"'), titleChars, char('"')),
  (parts) => parts[2] as string,
);
// then: optional(capture(titleParser, "title"))
```

That is the canonical Tarsec idiom: combinators for shape, `map` for projection.

- [ ] **Step 3: Failing test for resolution pass**

```ts
const ast = [
  { type: "link-definition", id: "x", url: "https://x" },
  { type: "paragraph", content: [{ type: "inline-ref-link", text: "hi", id: "x" }] },
];
expect(resolveReferences(ast)).toEqual([
  { type: "paragraph", content: [{ type: "inline-link", content: "hi", url: "https://x" }] },
]);
```

- [ ] **Step 4: Implement** `resolveReferences(ast)` in `references.ts`. Walk the tree; when you see `inline-ref-link` / `inline-ref-image`, look up the id (case‑insensitive). If found, swap to `inline-link` / `image`. If not found, leave as text `[label]`. Strip `link-definition` nodes from the output.

- [ ] **Step 5: Plumb into `markdownParser` in `index.ts`** — after `seq(...)` returns, run `resolveReferences` on the result. Update integration tests accordingly.

- [ ] **Step 6: Commit.**

```bash
git commit -am "feat(markdown): reference link definitions and resolution"
```

---

### Task 3.10: Footnotes

**Files:** `types.ts`, `references.ts`, `inline.ts`, `inline.test.ts`, `references.test.ts`

`InlineFootnoteRef` (`[^id]`) and `FootnoteDef` (`[^id]: text`). Resolution mirrors link definitions and attaches the def text to the ref.

- [ ] **Step 1: Failing tests** for parsing both pieces and for resolution. **Step 2:** implement. **Step 3:** commit.

```bash
git commit -am "feat(markdown): footnote refs and definitions"
```

---

### Task 3.11: HTML blocks (passthrough)

**Files:** `types.ts`, `blocks.ts`, `blocks.test.ts`

```ts
type HTMLBlock = { type: "html-block"; content: string };
```

Rule (subset of CommonMark §4.6 — keep it pragmatic): a line starting with `<` followed by a tag name; consume lines until the matching closing tag OR until a blank line.

- [ ] **Step 1: Failing tests** for `<div>\nhi\n</div>` and for a self‑closing `<hr />`. **Step 2:** implement. **Step 3:** wire BEFORE `paragraphParser` in `or`. **Step 4:** commit.

```bash
git commit -am "feat(markdown): html block passthrough"
```

---

# Phase 4 — Make blocks inline‑aware and integrate

### Task 4.1: `Heading.content` and `BlockQuote.content` become `InlineMarkdown[]`

This is the cross‑cutting type change. Do it as ONE refactor so the rest of the parsers settle on a consistent shape.

- [ ] **Step 1: Failing test**

```ts
it("parses bold inside a heading", () => {
  expect(headingParser("# hello **world**")).toEqual(success({
    type: "heading", level: 1,
    content: [
      { type: "inline-text", content: "hello " },
      { type: "inline-bold", content: "world" },
    ],
  }, ""));
});
it("parses a link inside a blockquote", () => {
  expect(blockQuoteParser("> see [x](y)").success).toBe(true);
});
```

- [ ] **Step 2: Change types** in `types.ts`. **Step 3:** change `headingParser` to `capture(many1(inlineMarkdownParser), "content")` with an `inline-until-newline` wrapper that stops `inlineMarkdownParser` at `\n`. **Step 4:** update `blockQuoteParser` similarly. **Step 5:** update existing tests that assert `content: "string"`. **Step 6:** commit.

```bash
git commit -am "refactor(markdown): heading/blockquote use InlineMarkdown[]"
```

---

### Task 4.2: Final `markdownParser` block dispatch order

**Files:** `tests/examples/markdown/index.ts`, `tests/examples/markdown/index.test.ts`

Order matters (most‑specific first):

1. `horizontalRuleParser`
2. `setextHeadingParser`
3. `headingParser` (ATX)
4. `codeBlockParser` (fenced)
5. `indentedCodeBlockParser`
6. `tableParser`
7. `blockQuoteParser`
8. `listParser`
9. `htmlBlockParser`
10. `linkDefinitionParser` (stripped in `resolveReferences`)
11. `footnoteDefinitionParser` (stripped likewise)
12. `imageParser` (block‑level)
13. `paragraphParser` (fallback)

- [ ] **Step 1: Failing integration tests** in `tests/examples/markdown/index.test.ts`:

```ts
it("parses a mixed-feature document", () => {
  const input = [
    "# Title",
    "",
    "Some _italic_ and **bold** and a [ref][1].",
    "",
    "- one",
    "- two",
    "  - nested",
    "",
    "| a | b |",
    "|---|---|",
    "| 1 | 2 |",
    "",
    "> a quote with `code`",
    "",
    "---",
    "",
    "    indented code",
    "",
    "[1]: https://example.com",
  ].join("\n");
  const out = markdownParser(input);
  expect(out.success).toBe(true);
  // shape assertions: 8 top-level nodes, each of the expected type
});
```

- [ ] **Step 2: Implement** the dispatch order. **Step 3:** run, fix collisions until green. **Step 4:** commit.

```bash
git commit -am "feat(markdown): integrate all block parsers with correct precedence"
```

---

### Task 4.3: Real‑world fixture tests

**Files:** `tests/examples/markdown/index.test.ts`

- [ ] **Step 1:** Add tests parsing two real fixtures: the project `README.md` (truncated to a few hundred chars) and the `tutorials/5-minute-intro.md`. Just assert `success === true` and `rest === ""` — these are smoke tests guarding against regressions on plausible inputs.

- [ ] **Step 2:** Run, fix any blow‑ups uncovered, commit.

```bash
git commit -am "test(markdown): smoke-test real fixtures"
```

---

# Phase 5 — Cleanup

### Task 5.1: Lint / type pass

- [ ] `npm run test:tsc` — 0 errors.
- [ ] `npx vitest run` — full suite green.
- [ ] Remove any temporary console.logs.
- [ ] Commit `chore: cleanup`.

### Task 5.2: Update CHANGELOG and README example

- [ ] Note the new features in `CHANGELOG`.
- [ ] Replace any stale snippet in `README.md` if needed.
- [ ] Commit `docs: update README/CHANGELOG for markdown example`.

---

## Final checklist

- [ ] Every numbered task above is checked off.
- [ ] `npx vitest run` shows zero failures and zero skips.
- [ ] `npm run test:tsc` passes.
- [ ] `tests/examples/markdown.test.ts` and `tests/examples/markdown/markdown-longer.test.ts` still pass without modification beyond what each task explicitly required.
- [ ] Every test added in this plan is for ONE behavior, fails before its implementation, and passes after.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-28-markdown-parser-completion.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach?
