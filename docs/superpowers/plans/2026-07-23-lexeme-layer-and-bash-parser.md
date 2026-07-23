# Lexeme Layer + Bash Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a scannerless lexeme layer (`makeLexemes`) to tarsec and a bash example parser (`tarsec/parsers/bash`) covering pipes, redirects, and heredocs.

**Architecture:** `makeLexemes` is a factory returning ordinary `Parser`s that eat trailing whitespace/comments — no token array, no core type changes. The bash parser is a layered grammar (`script → andOr → pipeline → command → simpleCommand`) with hand-written index scanners for words, and heredocs handled bash-style: `<<TAG` registers in a module-level pending queue, the newline parser drains it.

**Tech Stack:** TypeScript, vitest. Spec: `docs/superpowers/specs/2026-07-23-lexeme-layer-and-bash-parser-design.md` — read it before starting.

## Global Constraints

- Zero changes to `lib/types.ts` or existing combinator/parser semantics. The only core edit allowed: exporting `compileCharPredicate` from `lib/parsers.ts` (Task 1).
- All imports inside `lib/` use `.js` extensions (ESM). Tests import via the `@/lib` alias.
- Character scanning uses `takeWhile`-style index loops, never `many(oneOf(...))`.
- `memo` must never wrap anything at or above `redirect` in the bash grammar (heredoc queue is mutable external state).
- Spans: token-level nodes get spans via `lexeme(spanned(...))` (span excludes trailing whitespace); composite nodes derive spans from first/last child.
- Every bash-grammar nonterminal that can fail after a child succeeded is wrapped in `withQueueUnwind`.
- Run the full suite (`npx vitest run`) before every commit; all 471+ existing tests must stay green.

---

### Task 1: `makeLexemes` core — `ws`, `lexeme`, `symbol`

**Files:**
- Create: `lib/lexeme.ts`
- Modify: `lib/parsers.ts` (export `compileCharPredicate`), `lib/index.ts` (add export), `docs/superpowers/specs/2026-07-23-lexeme-layer-and-bash-parser-design.md` (config example)
- Test: `tests/lexeme.test.ts`

**Interfaces:**
- Consumes: `compileCharPredicate`, `CharPredicate`, `str` from `lib/parsers.ts`; `success`, `failure`, `Parser`, `CaptureParser`, `PlainObject`, `ParserSuccess` from `lib/types.ts`; `trace` from `lib/trace.ts`.
- Produces: `makeLexemes(config: LexemeConfig): Lexemes` with `lx.ws: Parser<null>` (always succeeds), `lx.lexeme` (overloaded, capture-preserving), `lx.symbol<const S>(s: S): Parser<S>`. Task 2 adds `identifier`/`keyword` to the same factory. All bash tasks import these.

- [ ] **Step 1: Write the failing tests**

Create `tests/lexeme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeLexemes } from "@/lib/lexeme";
import { capture, seqC } from "@/lib/combinators";
import { word } from "@/lib/parsers";

const lx = makeLexemes({ whitespace: " \t", lineComment: "#" });

describe("ws", () => {
  it("eats whitespace and always succeeds", () => {
    expect(lx.ws("  \thi")).toEqual({ success: true, result: null, rest: "hi" });
    expect(lx.ws("hi")).toEqual({ success: true, result: null, rest: "hi" });
    expect(lx.ws("")).toEqual({ success: true, result: null, rest: "" });
  });

  it("eats line comments but stops at the newline", () => {
    expect(lx.ws("# hey\nnext").rest).toEqual("\nnext");
    expect(lx.ws("  # hey").rest).toEqual("");
  });

  it("does not eat newlines when they are not in the charset", () => {
    expect(lx.ws("\nfoo").rest).toEqual("\nfoo");
  });

  it("eats line continuations when configured", () => {
    const lc = makeLexemes({ whitespace: " \t", lineContinuation: true });
    expect(lc.ws("\\\n  next").rest).toEqual("next");
    // backslash NOT followed by newline is left alone
    expect(lc.ws("\\x").rest).toEqual("\\x");
  });
});

describe("symbol and lexeme", () => {
  it("symbol matches and eats trailing whitespace", () => {
    expect(lx.symbol("+")("+  2")).toEqual({ success: true, result: "+", rest: "2" });
  });

  it("symbol does not eat leading whitespace", () => {
    expect(lx.symbol("+")("  +").success).toEqual(false);
  });

  it("lexeme preserves captures at runtime and in types", () => {
    const p = seqC(lx.lexeme(capture(word, "name")), lx.symbol("!"));
    const result = p("hello   ! ");
    expect(result).toEqual({ success: true, result: { name: "hello" }, rest: "" });
    if (result.success) {
      // type-level check: this must compile
      const name: string = result.result.name;
      expect(name).toEqual("hello");
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lexeme.test.ts`
Expected: FAIL — `Cannot find module '@/lib/lexeme'` (or similar resolution error).

- [ ] **Step 3: Implement**

In `lib/parsers.ts`, change `function compileCharPredicate` to `export function compileCharPredicate` (line ~137). No other change.

Create `lib/lexeme.ts`:

```ts
import {
  CharPredicate,
  compileCharPredicate,
  str,
} from "./parsers.js";
import { trace } from "./trace.js";
import { recordFailure } from "./rightmostFailure.js";
import {
  CaptureParser,
  failure,
  GeneralParser,
  Parser,
  ParserSuccess,
  PlainObject,
  success,
} from "./types.js";

const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";

/** Configuration for `makeLexemes`. */
export type LexemeConfig = {
  /** Characters eaten after every lexeme, e.g. " \t". */
  whitespace: string;
  /** Line-comment marker (e.g. "#" or "//"); comments are eaten as whitespace,
   * up to but NOT including the newline. */
  lineComment?: string;
  /** When true, `\` followed by a newline is also eaten as whitespace. */
  lineContinuation?: boolean;
  /** Charset or predicate for an identifier's first character.
   * Defaults to letters and "_". */
  identStart?: string | CharPredicate;
  /** Charset or predicate for subsequent identifier characters.
   * Defaults to letters, digits, and "_". */
  identRest?: string | CharPredicate;
  /** Words `identifier` refuses to match (and `keyword` accepts). */
  keywords?: string[];
};

export type Lexemes = {
  /** Whitespace/comment skipper. Always succeeds. Use once at the top of a
   * grammar to eat leading whitespace; lexemes handle the rest. */
  ws: Parser<null>;
  /** Run a parser, then eat trailing whitespace/comments. Capture-preserving. */
  lexeme: {
    <T>(parser: Parser<T>): Parser<T>;
    <T, C extends PlainObject>(parser: CaptureParser<T, C>): CaptureParser<T, C>;
  };
  /** `lexeme(str(s))` — match a literal, eat trailing whitespace. */
  symbol: <const S extends string>(s: S) => Parser<S>;
  /** Match an identifier (per identStart/identRest), rejecting keywords. */
  identifier: Parser<string>;
  /** Match `s` only when not followed by an identRest character, so
   * `keyword("if")` rejects "ifx". */
  keyword: (s: string) => Parser<string>;
};

/**
 * Build a set of lexeme helpers: ordinary parsers that handle whitespace,
 * comments, and keywords in one place. This is a *scannerless* lexeme layer
 * (like Parsec's `makeTokenParser`), not a lexer — there is no separate pass
 * and no token array.
 *
 * The discipline: every token-shaped parser eats its own *trailing*
 * whitespace; eat *leading* whitespace once at the top with `ws`.
 */
export function makeLexemes(config: LexemeConfig): Lexemes {
  const isWs = compileCharPredicate(config.whitespace);
  const comment = config.lineComment;
  const continuation = config.lineContinuation === true;

  const ws: Parser<null> = trace("lexeme:ws", (input: string) => {
    let i = 0;
    const n = input.length;
    while (i < n) {
      if (isWs(input.charCodeAt(i))) {
        i++;
        continue;
      }
      if (continuation && input[i] === "\\" && input[i + 1] === "\n") {
        i += 2;
        continue;
      }
      if (comment !== undefined && input.startsWith(comment, i)) {
        const nl = input.indexOf("\n", i);
        i = nl === -1 ? n : nl; // stop AT the newline; newlines may be significant
        continue;
      }
      break;
    }
    return success(null, input.slice(i));
  });

  const lexeme = ((parser: GeneralParser<any, any>) =>
    (input: string) => {
      const result = parser(input);
      if (!result.success) return result;
      const after = ws(result.rest) as ParserSuccess<null>;
      return { ...result, rest: after.rest };
    }) as Lexemes["lexeme"];

  const symbol = <const S extends string>(s: S): Parser<S> => lexeme(str(s));

  const startPred = compileCharPredicate(config.identStart ?? LETTERS + "_");
  const restPred = compileCharPredicate(
    config.identRest ?? LETTERS + DIGITS + "_",
  );
  const keywordSet = new Set(config.keywords ?? []);

  const identifier: Parser<string> = lexeme(
    trace("lexeme:identifier", (input: string) => {
      if (input.length === 0 || !startPred(input.charCodeAt(0))) {
        recordFailure(input, "an identifier");
        return failure("expected an identifier", input);
      }
      let i = 1;
      while (i < input.length && restPred(input.charCodeAt(i))) i++;
      const name = input.slice(0, i);
      if (keywordSet.has(name)) {
        recordFailure(input, "an identifier");
        return failure(`expected an identifier, got keyword ${name}`, input);
      }
      return success(name, input.slice(i));
    }),
  );

  function keyword(s: string): Parser<string> {
    return lexeme(
      trace(`lexeme:keyword(${s})`, (input: string) => {
        if (!input.startsWith(s)) {
          recordFailure(input, `keyword ${s}`);
          return failure(`expected keyword ${s}`, input);
        }
        const next = input.charCodeAt(s.length);
        if (!Number.isNaN(next) && restPred(next)) {
          recordFailure(input, `keyword ${s}`);
          return failure(`expected keyword ${s}`, input);
        }
        return success(s, input.slice(s.length));
      }),
    );
  }

  return { ws, lexeme, symbol, identifier, keyword };
}
```

In `lib/index.ts`, add:

```ts
export * from "./lexeme.js";
```

In the spec (`docs/superpowers/specs/2026-07-23-lexeme-layer-and-bash-parser-design.md`), update the config example to match the implementation (charsets, not parsers):

```ts
const lx = makeLexemes({
  whitespace: " \t",              // charset eaten after every lexeme (bash: NOT \n)
  lineComment: "#",               // optional; eaten as whitespace
  identStart: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_",   // charset or CharPredicate
  identRest: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_",
  keywords: ["if", "then", "else", "fi"],  // optional
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lexeme.test.ts` — expect PASS.
Run: `npx vitest run && npm run test:tsc` — expect all existing tests green, types clean.

- [ ] **Step 5: Commit**

```bash
git add lib/lexeme.ts lib/parsers.ts lib/index.ts tests/lexeme.test.ts docs/superpowers/specs/2026-07-23-lexeme-layer-and-bash-parser-design.md
git commit -m "feat: makeLexemes core (ws, lexeme, symbol)"
```

---

### Task 2: `makeLexemes` — `identifier` and `keyword` tests

The implementations landed in Task 1 (they share the factory closure); this task locks in their behavior with tests. A reviewer can reject these semantics without rejecting Task 1's.

**Files:**
- Test: `tests/lexeme.test.ts` (append)
- Modify (only if tests reveal bugs): `lib/lexeme.ts`

**Interfaces:**
- Consumes: `makeLexemes` from Task 1.
- Produces: verified `lx.identifier: Parser<string>`, `lx.keyword(s): Parser<string>` semantics relied on by the lexemes tutorial (Task 10).

- [ ] **Step 1: Write the tests**

Append to `tests/lexeme.test.ts`:

```ts
describe("identifier and keyword", () => {
  const kw = makeLexemes({
    whitespace: " \t",
    keywords: ["if", "then"],
  });

  it("parses identifiers and eats trailing whitespace", () => {
    expect(kw.identifier("foo_1  bar")).toEqual({
      success: true,
      result: "foo_1",
      rest: "bar",
    });
  });

  it("rejects keywords as identifiers", () => {
    expect(kw.identifier("if x").success).toEqual(false);
  });

  it("accepts identifiers that merely start with a keyword", () => {
    expect(kw.identifier("ifx ")).toEqual({ success: true, result: "ifx", rest: "" });
  });

  it("keyword matches exactly", () => {
    expect(kw.keyword("if")("if x").rest).toEqual("x");
  });

  it("keyword rejects longer words", () => {
    expect(kw.keyword("if")("ifx").success).toEqual(false);
  });

  it("identifier fails on empty input and non-start chars", () => {
    expect(kw.identifier("").success).toEqual(false);
    expect(kw.identifier("1abc").success).toEqual(false);
  });

  it("supports custom charsets", () => {
    const custom = makeLexemes({ whitespace: " ", identStart: "@", identRest: "0123456789" });
    expect(custom.identifier("@42 x")).toEqual({ success: true, result: "@42", rest: "x" });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/lexeme.test.ts`
Expected: PASS (implementation exists from Task 1). If any fail, fix `lib/lexeme.ts` — the tests are the spec.

- [ ] **Step 3: Commit**

```bash
git add tests/lexeme.test.ts
git commit -m "test: identifier and keyword lexeme semantics"
```

---

### Task 3: Bash module scaffold — types, `spanned`, word scanner

**Files:**
- Create: `lib/parsers/bash/types.ts`, `lib/parsers/bash/lexemes.ts`, `lib/parsers/bash/spanned.ts`, `lib/parsers/bash/words.ts`
- Test: `tests/parsers/bash/words.test.ts`

**Interfaces:**
- Consumes: `makeLexemes` (Task 1); `withSpan`, `getPosition`, `Span`, `Position` from `lib/position.ts`.
- Produces: all bash AST types; `lx` (the bash lexeme set); `spanned<T>(p): Parser<T>` and `positionAt(input): Position`; `scanWord(input): number` (end index, `-1` = unterminated quote); `rawWord: Parser<BashWord>` (no trailing ws); `bashWord: Parser<BashWord>` (lexeme'd). Tasks 5–8 import these exact names.

- [ ] **Step 1: Write the failing tests**

Create `tests/parsers/bash/words.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bashWord, scanWord } from "@/lib/parsers/bash/words";
import { setInputStr } from "@/lib/trace";

function parseWord(input: string) {
  setInputStr(input); // spans need the full source registered
  return bashWord(input);
}

describe("scanWord", () => {
  it("scans plain words and stops at metacharacters", () => {
    expect(scanWord("foo bar")).toEqual(3);
    expect(scanWord("foo|bar")).toEqual(3);
    expect(scanWord("foo>out")).toEqual(3);
    expect(scanWord("a#b ")).toEqual(3); // '#' mid-word is literal
    expect(scanWord("")).toEqual(0);
    expect(scanWord("| x")).toEqual(0);
  });

  it("treats quoted segments as part of one word", () => {
    expect(scanWord('foo"bar baz"qux etc')).toEqual(15);
    expect(scanWord("'a b' c")).toEqual(5);
    expect(scanWord("a\\ b c")).toEqual(4); // escaped space
  });

  it("balances nested command substitution", () => {
    expect(scanWord("$(echo $(date))x y")).toEqual(16);
    expect(scanWord('"$(echo ")")" z')).toEqual(13);
  });

  it("returns -1 on unterminated quotes", () => {
    expect(scanWord("'oops")).toEqual(-1);
    expect(scanWord('"oops')).toEqual(-1);
    expect(scanWord("$(oops")).toEqual(-1);
  });
});

describe("bashWord", () => {
  it("produces a word node with span excluding trailing whitespace", () => {
    const result = parseWord("hello   world");
    expect(result.success).toEqual(true);
    if (result.success) {
      expect(result.result.type).toEqual("word");
      expect(result.result.text).toEqual("hello");
      expect(result.result.span.start.offset).toEqual(0);
      expect(result.result.span.end.offset).toEqual(5);
      expect(result.rest).toEqual("world");
    }
  });

  it("fails with a message on unterminated quotes", () => {
    const result = parseWord("'oops");
    expect(result.success).toEqual(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/parsers/bash/words.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/parsers/bash/types.ts`:

```ts
import { Span } from "../../position.js";

/** One shell word. Quoting is respected for *boundaries* but the text is
 * stored raw and unstructured — expansion ASTs are a future scope. */
export type BashWord = { type: "word"; text: string; span: Span };

export type BashAssignment = {
  type: "assignment";
  name: string;
  /** null for an empty value, e.g. `FOO=` */
  value: BashWord | null;
  span: Span;
};

export type FileRedirectOp = ">" | ">>" | "<" | "2>" | "&>" | "2>&1";

export type FileRedirect = {
  type: "redirect";
  op: FileRedirectOp;
  /** null only for 2>&1 */
  target: BashWord | null;
  span: Span;
};

export type HeredocRedirect = {
  type: "heredoc";
  tag: string;
  /** true for <<- (leading tabs stripped from body and delimiter) */
  stripTabs: boolean;
  /** true when the tag was quoted (<<'TAG'), which suppresses expansion —
   * recorded now, meaningful when expansion parsing lands */
  quoted: boolean;
  /** filled in when the body is drained at the next newline */
  body: string | null;
  /** span of the << redirect itself */
  span: Span;
  /** span of the body text, filled at drain time */
  bodySpan: Span | null;
};

export type BashRedirect = FileRedirect | HeredocRedirect;

export type SimpleCommand = {
  type: "simple-command";
  assignments: BashAssignment[];
  /** first word is the command name */
  words: BashWord[];
  redirects: BashRedirect[];
  span: Span;
};

export type Pipeline = { type: "pipeline"; commands: BashNode[]; span: Span };

export type AndOrOp = "&&" | "||";

export type AndOr = {
  type: "and-or";
  first: BashNode;
  rest: { op: AndOrOp; command: BashNode }[];
  span: Span;
};

/** Compound commands (if/while/for/case) join this union in a future scope. */
export type BashNode = SimpleCommand | Pipeline | AndOr;

export type Statement = {
  type: "statement";
  body: BashNode;
  /** true when terminated with & */
  background: boolean;
  span: Span;
};

export type BashScript = { type: "script"; statements: Statement[]; span: Span };
```

Create `lib/parsers/bash/lexemes.ts`:

```ts
import { makeLexemes } from "../../lexeme.js";

/** Bash lexeme set. Newlines are NOT whitespace (they separate commands).
 * `#` comments run to end of line; `\`-newline is a line continuation. */
export const lx = makeLexemes({
  whitespace: " \t",
  lineComment: "#",
  lineContinuation: true,
});
```

Create `lib/parsers/bash/spanned.ts`:

```ts
import { getPosition, Position, Span, withSpan } from "../../position.js";
import { Parser, ParserSuccess, success } from "../../types.js";

/** Wrap a parser that returns a node-without-span into one that returns the
 * node with its span filled in. Use as `lexeme(spanned(p))` — lexeme outside —
 * so the span excludes trailing whitespace.
 *
 * NOTE: this clones the node (`{ ...value, span }`). Do not use it for nodes
 * whose object identity matters (the heredoc redirect registers itself in the
 * pending queue and is mutated later — it builds its span by hand). */
export function spanned<T extends { span: Span }>(
  parser: Parser<Omit<T, "span">>,
): Parser<T> {
  return (input: string) => {
    const result = withSpan(parser)(input);
    if (!result.success) return result;
    return success(
      { ...result.result.value, span: result.result.span } as T,
      result.rest,
    );
  };
}

/** Current position at `input` (requires `setInputStr` to have been called). */
export function positionAt(input: string): Position {
  return (getPosition(input) as ParserSuccess<Position>).result;
}
```

Create `lib/parsers/bash/words.ts`:

```ts
import { recordFailure } from "../../rightmostFailure.js";
import { failure, Parser, success } from "../../types.js";
import { lx } from "./lexemes.js";
import { spanned } from "./spanned.js";
import { BashWord } from "./types.js";

/** Unquoted characters that end a word. `#` is deliberately absent: `a#b` is
 * one literal word — comment disambiguation is owned by this scanner (which
 * runs before `ws` ever sees a mid-word `#`). */
const METACHARS = " \t\n|&;()<>";

/** Scan one word starting at index 0. Returns the end index (0 = no word
 * here), or -1 for an unterminated quote / substitution. */
export function scanWord(input: string): number {
  let i = 0;
  const n = input.length;
  while (i < n) {
    const c = input[i];
    if (c === "\\") {
      i = Math.min(i + 2, n);
      continue;
    }
    if (c === "'") {
      const close = input.indexOf("'", i + 1);
      if (close === -1) return -1;
      i = close + 1;
      continue;
    }
    if (c === '"') {
      const close = scanDoubleQuote(input, i);
      if (close === -1) return -1;
      i = close;
      continue;
    }
    if (c === "$" && input[i + 1] === "(") {
      const close = scanDollarParen(input, i + 1);
      if (close === -1) return -1;
      i = close;
      continue;
    }
    if (METACHARS.includes(c)) break;
    i++;
  }
  return i;
}

/** From an opening `"` at `start`, return the index just past the closing
 * quote, or -1. Handles backslash escapes and nested `$(...)`. */
function scanDoubleQuote(input: string, start: number): number {
  let i = start + 1;
  const n = input.length;
  while (i < n) {
    const c = input[i];
    if (c === "\\") {
      i = Math.min(i + 2, n);
      continue;
    }
    if (c === '"') return i + 1;
    if (c === "$" && input[i + 1] === "(") {
      const close = scanDollarParen(input, i + 1);
      if (close === -1) return -1;
      i = close;
      continue;
    }
    i++;
  }
  return -1;
}

/** From a `(` at `openIndex` (part of `$(`), return the index just past the
 * matching `)`, or -1. Tracks nesting and quoting. */
function scanDollarParen(input: string, openIndex: number): number {
  let i = openIndex + 1;
  let depth = 1;
  const n = input.length;
  while (i < n) {
    const c = input[i];
    if (c === "\\") {
      i = Math.min(i + 2, n);
      continue;
    }
    if (c === "'") {
      const close = input.indexOf("'", i + 1);
      if (close === -1) return -1;
      i = close + 1;
      continue;
    }
    if (c === '"') {
      const close = scanDoubleQuote(input, i);
      if (close === -1) return -1;
      i = close;
      continue;
    }
    if (c === "(") depth++;
    if (c === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return -1;
}

const wordScan: Parser<Omit<BashWord, "span">> = (input: string) => {
  const end = scanWord(input);
  if (end === -1) {
    recordFailure(input, "a closing quote");
    return failure("unterminated quote", input);
  }
  if (end === 0) {
    recordFailure(input, "a word");
    return failure("expected a word", input);
  }
  return success(
    { type: "word" as const, text: input.slice(0, end) },
    input.slice(end),
  );
};

/** A word with span, NOT eating trailing whitespace (used inside assignments). */
export const rawWord: Parser<BashWord> = spanned<BashWord>(wordScan);

/** A word with span, eating trailing whitespace. */
export const bashWord: Parser<BashWord> = lx.lexeme(rawWord);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/parsers/bash/words.test.ts` — expect PASS.
Run: `npx vitest run && npm run test:tsc` — expect green.

- [ ] **Step 5: Commit**

```bash
git add lib/parsers/bash tests/parsers/bash
git commit -m "feat: bash AST types, spanned helper, quote-aware word scanner"
```

---

### Task 4: Heredoc queue + body scanner

**Files:**
- Create: `lib/parsers/bash/heredocQueue.ts`
- Test: `tests/parsers/bash/heredocQueue.test.ts`

**Interfaces:**
- Consumes: `HeredocRedirect` from Task 3's `types.ts`.
- Produces: `resetHeredocQueue()`, `registerHeredoc(node)`, `pendingHeredocs(): readonly HeredocRedirect[]`, `drainHeredocs(): HeredocRedirect[]`, `snapshotHeredocs(): HeredocRedirect[]`, `restoreHeredocs(snapshot)`, `withQueueUnwind<T>(p: Parser<T>): Parser<T>`, `scanHeredocBody(input, tag, stripTabs): { body: string; delimRest: string; rest: string } | null`. Tasks 5 and 8 import these exact names.

- [ ] **Step 1: Write the failing tests**

Create `tests/parsers/bash/heredocQueue.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  drainHeredocs,
  pendingHeredocs,
  registerHeredoc,
  resetHeredocQueue,
  restoreHeredocs,
  scanHeredocBody,
  snapshotHeredocs,
  withQueueUnwind,
} from "@/lib/parsers/bash/heredocQueue";
import { HeredocRedirect } from "@/lib/parsers/bash/types";
import { failure, Parser, success } from "@/lib/types";

function mkHeredoc(tag: string): HeredocRedirect {
  const pos = { offset: 0, line: 0, column: 0 };
  return {
    type: "heredoc", tag, stripTabs: false, quoted: false,
    body: null, span: { start: pos, end: pos }, bodySpan: null,
  };
}

beforeEach(resetHeredocQueue);

describe("queue basics", () => {
  it("registers, drains in order, and resets", () => {
    registerHeredoc(mkHeredoc("A"));
    registerHeredoc(mkHeredoc("B"));
    expect(pendingHeredocs().map((h) => h.tag)).toEqual(["A", "B"]);
    expect(drainHeredocs().map((h) => h.tag)).toEqual(["A", "B"]);
    expect(pendingHeredocs()).toEqual([]);
  });

  it("snapshot/restore resurrects drained entries", () => {
    registerHeredoc(mkHeredoc("A"));
    const snap = snapshotHeredocs();
    drainHeredocs();
    restoreHeredocs(snap);
    expect(pendingHeredocs().map((h) => h.tag)).toEqual(["A"]);
  });
});

describe("withQueueUnwind", () => {
  it("restores registrations when the parser fails", () => {
    const p: Parser<null> = withQueueUnwind((input: string) => {
      registerHeredoc(mkHeredoc("LEAK"));
      return failure("nope", input);
    });
    expect(p("x").success).toEqual(false);
    expect(pendingHeredocs()).toEqual([]);
  });

  it("keeps registrations when the parser succeeds", () => {
    const p: Parser<null> = withQueueUnwind((input: string) => {
      registerHeredoc(mkHeredoc("KEEP"));
      return success(null, input);
    });
    expect(p("x").success).toEqual(true);
    expect(pendingHeredocs().map((h) => h.tag)).toEqual(["KEEP"]);
  });
});

describe("scanHeredocBody", () => {
  it("scans up to the delimiter line", () => {
    expect(scanHeredocBody("hello\nworld\nEOF\nnext", "EOF", false)).toEqual({
      body: "hello\nworld\n",
      delimRest: "EOF\nnext",
      rest: "next",
    });
  });

  it("accepts a delimiter at EOF without a trailing newline", () => {
    expect(scanHeredocBody("hi\nEOF", "EOF", false)).toEqual({
      body: "hi\n",
      delimRest: "EOF",
      rest: "",
    });
  });

  it("strips leading tabs from body and delimiter when stripTabs is set", () => {
    expect(scanHeredocBody("\thi\n\tEOF\n", "EOF", true)).toEqual({
      body: "hi\n",
      delimRest: "\tEOF\n",
      rest: "",
    });
  });

  it("requires the delimiter on its own line", () => {
    expect(scanHeredocBody("not EOF here\n", "EOF", false)).toEqual(null);
    expect(scanHeredocBody("EOFx\n", "EOF", false)).toEqual(null);
  });

  it("returns null when unterminated", () => {
    expect(scanHeredocBody("hello\nworld", "EOF", false)).toEqual(null);
    expect(scanHeredocBody("", "EOF", false)).toEqual(null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/parsers/bash/heredocQueue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/parsers/bash/heredocQueue.ts`:

```ts
import { Parser } from "../../types.js";
import { HeredocRedirect } from "./types.js";

/** Pending heredocs registered by `<<TAG` redirects, drained (in registration
 * order) by the newline parser. Module-level mutable state, following the
 * precedent of `setInputStr` and the rightmost-failure tracker.
 *
 * Invariant: every bash-grammar nonterminal that can fail after a child
 * succeeded is wrapped in `withQueueUnwind`, so abandoned partial parses
 * never leak registrations.
 *
 * Do NOT wrap parsers in `memo` at or above `redirect` in the bash grammar:
 * memo replays cached results without re-running registration. Do NOT `peek`
 * a registering parser: peek discards consumption on success, which no
 * failure-path unwind can see. */
let queue: HeredocRedirect[] = [];

/** Clear the queue. Called by `parseBash` at the start of each parse. */
export function resetHeredocQueue(): void {
  queue = [];
}

export function registerHeredoc(node: HeredocRedirect): void {
  queue.push(node);
}

export function pendingHeredocs(): readonly HeredocRedirect[] {
  return queue;
}

/** Remove and return all pending heredocs, oldest first. */
export function drainHeredocs(): HeredocRedirect[] {
  const drained = queue;
  queue = [];
  return drained;
}

/** Copy the queue. Restoring a snapshot resurrects entries drained since
 * (a drained-then-abandoned parse path must put its entries back). */
export function snapshotHeredocs(): HeredocRedirect[] {
  return queue.slice();
}

export function restoreHeredocs(snapshot: HeredocRedirect[]): void {
  queue = snapshot.slice();
}

/** Snapshot on entry, restore on failure, keep on success. */
export function withQueueUnwind<T>(parser: Parser<T>): Parser<T> {
  return (input: string) => {
    const snapshot = snapshotHeredocs();
    const result = parser(input);
    if (!result.success) restoreHeredocs(snapshot);
    return result;
  };
}

/** Scan a heredoc body: lines up to one consisting of `tag` (after optional
 * leading-tab stripping when `stripTabs`). Returns the body text, the input
 * at the delimiter line (`delimRest`, for computing bodySpan), and the input
 * after the delimiter line (`rest`). A delimiter at EOF without a trailing
 * newline is accepted, matching bash. Returns null if never terminated. */
export function scanHeredocBody(
  input: string,
  tag: string,
  stripTabs: boolean,
): { body: string; delimRest: string; rest: string } | null {
  let i = 0;
  const n = input.length;
  const lines: string[] = [];
  while (true) {
    let end = input.indexOf("\n", i);
    const hasNewline = end !== -1;
    if (!hasNewline) end = n;
    const rawLine = input.slice(i, end);
    const line = stripTabs ? rawLine.replace(/^\t+/, "") : rawLine;
    if (line === tag) {
      return {
        body: lines.join(""),
        delimRest: input.slice(i),
        rest: input.slice(hasNewline ? end + 1 : end),
      };
    }
    if (!hasNewline) return null;
    lines.push(line + "\n");
    i = end + 1;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/parsers/bash/heredocQueue.test.ts` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parsers/bash/heredocQueue.ts tests/parsers/bash/heredocQueue.test.ts
git commit -m "feat: heredoc pending queue with unwind and body scanner"
```

---

### Task 5: Redirect parsers

**Files:**
- Create: `lib/parsers/bash/redirects.ts`
- Test: `tests/parsers/bash/redirects.test.ts`

**Interfaces:**
- Consumes: `bashWord` (Task 3), `registerHeredoc` / `withQueueUnwind` (Task 4), `positionAt` (Task 3), `lx`, `or` / `str` from core.
- Produces: `redirect: Parser<BashRedirect>` (heredoc alternatives first, queue-unwind wrapped); also exports `heredocRedirect` and `fileRedirect` for tests. Task 6 imports `redirect`.

- [ ] **Step 1: Write the failing tests**

Create `tests/parsers/bash/redirects.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { redirect } from "@/lib/parsers/bash/redirects";
import { pendingHeredocs, resetHeredocQueue } from "@/lib/parsers/bash/heredocQueue";
import { setInputStr } from "@/lib/trace";

function parse(input: string) {
  setInputStr(input);
  return redirect(input);
}

beforeEach(resetHeredocQueue);

describe("file redirects", () => {
  it.each([
    [">out.txt x", ">", "out.txt"],
    [">> log x", ">>", "log"],
    ["<in x", "<", "in"],
    ["2>err x", "2>", "err"],
    ["&>all x", "&>", "all"],
  ])("parses %s", (input, op, target) => {
    const result = parse(input);
    expect(result.success).toEqual(true);
    if (result.success && result.result.type === "redirect") {
      expect(result.result.op).toEqual(op);
      expect(result.result.target?.text).toEqual(target);
      expect(result.rest).toEqual("x");
    }
  });

  it("parses 2>&1 with no target", () => {
    const result = parse("2>&1 x");
    expect(result.success).toEqual(true);
    if (result.success && result.result.type === "redirect") {
      expect(result.result.op).toEqual("2>&1");
      expect(result.result.target).toEqual(null);
    }
  });

  it("fails without a target", () => {
    expect(parse("> |").success).toEqual(false);
    expect(pendingHeredocs()).toEqual([]);
  });
});

describe("heredoc redirects", () => {
  it("parses <<TAG and registers it", () => {
    const result = parse("<<EOF x");
    expect(result.success).toEqual(true);
    if (result.success && result.result.type === "heredoc") {
      expect(result.result.tag).toEqual("EOF");
      expect(result.result.stripTabs).toEqual(false);
      expect(result.result.quoted).toEqual(false);
      expect(result.result.body).toEqual(null);
      // the registered node IS the AST node (identity matters for drain)
      expect(pendingHeredocs()[0]).toBe(result.result);
      expect(result.rest).toEqual("x");
    }
  });

  it("parses <<-TAG with stripTabs", () => {
    const result = parse("<<-END x");
    if (result.success && result.result.type === "heredoc") {
      expect(result.result.stripTabs).toEqual(true);
      expect(result.result.tag).toEqual("END");
    }
  });

  it("parses quoted tags", () => {
    const result = parse("<<'EOF' x");
    if (result.success && result.result.type === "heredoc") {
      expect(result.result.quoted).toEqual(true);
      expect(result.result.tag).toEqual("EOF");
    }
  });

  it("fails on << without a tag, leaving the queue clean", () => {
    expect(parse("<< |").success).toEqual(false);
    expect(pendingHeredocs()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/parsers/bash/redirects.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/parsers/bash/redirects.ts`:

```ts
import { or } from "../../combinators.js";
import { str } from "../../parsers.js";
import { recordFailure } from "../../rightmostFailure.js";
import { failure, Parser, ParserSuccess, success } from "../../types.js";
import { registerHeredoc, withQueueUnwind } from "./heredocQueue.js";
import { lx } from "./lexemes.js";
import { positionAt } from "./spanned.js";
import { bashWord } from "./words.js";
import { BashRedirect, FileRedirect, HeredocRedirect } from "./types.js";

// Longest-first: `or` is first-match, so 2>&1 before 2>, >> before >.
const fileOp = or(str("2>&1"), str("2>"), str("&>"), str(">>"), str(">"), str("<"));

export const fileRedirect: Parser<FileRedirect> = (input: string) => {
  const start = positionAt(input);
  const op = fileOp(input);
  if (!op.success) return op;
  if (op.result === "2>&1") {
    const end = positionAt(op.rest);
    const after = lx.ws(op.rest) as ParserSuccess<null>;
    return success(
      { type: "redirect" as const, op: "2>&1" as const, target: null, span: { start, end } },
      after.rest,
    );
  }
  const afterOp = (lx.ws(op.rest) as ParserSuccess<null>).rest;
  const target = bashWord(afterOp);
  if (!target.success) {
    recordFailure(afterOp, `a target after ${op.result}`);
    return failure(`expected target after ${op.result}`, input);
  }
  return success(
    {
      type: "redirect" as const,
      op: op.result,
      target: target.result,
      span: { start, end: target.result.span.end },
    },
    target.rest,
  );
};

/** Scan a heredoc tag after << or <<-: bare [A-Za-z0-9_]+ or quoted 'TAG' / "TAG". */
function scanTag(
  input: string,
): { tag: string; quoted: boolean; rest: string } | null {
  const q = input[0];
  if (q === "'" || q === '"') {
    const close = input.indexOf(q, 1);
    if (close === -1) return null;
    return { tag: input.slice(1, close), quoted: true, rest: input.slice(close + 1) };
  }
  let i = 0;
  while (i < input.length && /[A-Za-z0-9_]/.test(input[i])) i++;
  if (i === 0) return null;
  return { tag: input.slice(0, i), quoted: false, rest: input.slice(i) };
}

/** Parses <<TAG / <<-TAG / <<'TAG' and registers the node in the pending
 * queue. Built by hand rather than with `spanned` because the *same object*
 * must be registered, returned, and later mutated at drain time — `spanned`
 * clones. */
export const heredocRedirect: Parser<HeredocRedirect> = (input: string) => {
  const start = positionAt(input);
  const op = or(str("<<-"), str("<<"))(input);
  if (!op.success) return op;
  const tag = scanTag(op.rest);
  if (tag === null) {
    recordFailure(op.rest, "a heredoc tag");
    return failure("expected heredoc tag after <<", input);
  }
  const node: HeredocRedirect = {
    type: "heredoc",
    tag: tag.tag,
    stripTabs: op.result === "<<-",
    quoted: tag.quoted,
    body: null,
    span: { start, end: positionAt(tag.rest) },
    bodySpan: null,
  };
  registerHeredoc(node);
  const after = lx.ws(tag.rest) as ParserSuccess<null>;
  return success(node, after.rest);
};

/** All redirect forms. Heredocs first so << beats <. */
export const redirect: Parser<BashRedirect> = withQueueUnwind(
  or(heredocRedirect, fileRedirect),
);
```

**Note for the implementer:** the top-level `import { bashWord } from "./words.js"` is cycle-free — `words.ts` imports only `lexemes.ts`/`spanned.ts`/`types.ts`, never `redirects.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/parsers/bash/redirects.test.ts` — expect PASS.
Run: `npx vitest run && npm run test:tsc` — expect green.

- [ ] **Step 5: Commit**

```bash
git add lib/parsers/bash/redirects.ts tests/parsers/bash/redirects.test.ts
git commit -m "feat: bash redirect parsers with heredoc registration"
```

---

### Task 6: Assignments and simple commands

**Files:**
- Create: `lib/parsers/bash/command.ts`
- Test: `tests/parsers/bash/command.test.ts`

**Interfaces:**
- Consumes: `scanWord`, `rawWord`, `bashWord` (Task 3), `redirect` (Task 5), `withQueueUnwind` (Task 4), `lx`, `positionAt`.
- Produces: `assignment: Parser<BashAssignment>`, `simpleCommand: Parser<SimpleCommand>`. Task 7 imports `simpleCommand`.

- [ ] **Step 1: Write the failing tests**

Create `tests/parsers/bash/command.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { assignment, simpleCommand } from "@/lib/parsers/bash/command";
import { resetHeredocQueue } from "@/lib/parsers/bash/heredocQueue";
import { setInputStr } from "@/lib/trace";

beforeEach(resetHeredocQueue);

function parseCmd(input: string) {
  setInputStr(input);
  return simpleCommand(input);
}

describe("assignment", () => {
  it("parses NAME=value", () => {
    setInputStr("FOO=bar x");
    const result = assignment("FOO=bar x");
    expect(result.success).toEqual(true);
    if (result.success) {
      expect(result.result.name).toEqual("FOO");
      expect(result.result.value?.text).toEqual("bar");
      expect(result.rest).toEqual("x");
    }
  });

  it("parses an empty value", () => {
    setInputStr("FOO= x");
    const result = assignment("FOO= x");
    if (result.success) expect(result.result.value).toEqual(null);
  });

  it("allows keyword names: if=1", () => {
    setInputStr("if=1 x");
    expect(assignment("if=1 x").success).toEqual(true);
  });

  it("fails when there is no =", () => {
    setInputStr("echo hi");
    expect(assignment("echo hi").success).toEqual(false);
  });
});

describe("simpleCommand", () => {
  it("parses assignments, words, and redirects", () => {
    const result = parseCmd("FOO=1 BAR=2 cmd -x file >out.txt");
    expect(result.success).toEqual(true);
    if (result.success) {
      expect(result.result.assignments.map((a) => a.name)).toEqual(["FOO", "BAR"]);
      expect(result.result.words.map((w) => w.text)).toEqual(["cmd", "-x", "file"]);
      expect(result.result.redirects).toHaveLength(1);
    }
  });

  it("allows a redirect before the command name", () => {
    const result = parseCmd(">f cmd arg");
    if (result.success) {
      expect(result.result.words.map((w) => w.text)).toEqual(["cmd", "arg"]);
      expect(result.result.redirects).toHaveLength(1);
    }
  });

  it("treats foo=bar after the command name as a word", () => {
    const result = parseCmd("echo foo=bar");
    if (result.success) {
      expect(result.result.assignments).toEqual([]);
      expect(result.result.words.map((w) => w.text)).toEqual(["echo", "foo=bar"]);
    }
  });

  it("stops at operators and derives span from children", () => {
    const result = parseCmd("echo hi | wc");
    expect(result.success).toEqual(true);
    if (result.success) {
      expect(result.rest).toEqual("| wc");
      expect(result.result.span.start.offset).toEqual(0);
      expect(result.result.span.end.offset).toEqual(7); // "echo hi"
    }
  });

  it("fails on empty input", () => {
    expect(parseCmd("").success).toEqual(false);
    expect(parseCmd("| x").success).toEqual(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/parsers/bash/command.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/parsers/bash/command.ts`:

```ts
import { recordFailure } from "../../rightmostFailure.js";
import { failure, Parser, ParserSuccess, success } from "../../types.js";
import { withQueueUnwind } from "./heredocQueue.js";
import { lx } from "./lexemes.js";
import { redirect } from "./redirects.js";
import { spanned } from "./spanned.js";
import { bashWord, rawWord, scanWord } from "./words.js";
import { BashAssignment, BashRedirect, BashWord, SimpleCommand } from "./types.js";

const NAME_START = /[A-Za-z_]/;
const NAME_REST = /[A-Za-z0-9_]/;

/** `NAME=value`. The name uses its own charset (NOT lx.identifier): bash
 * keywords are not reserved in assignment position, so `if=1` is legal. */
export const assignment: Parser<BashAssignment> = lx.lexeme(
  spanned<BashAssignment>((input: string) => {
    if (input.length === 0 || !NAME_START.test(input[0])) {
      recordFailure(input, "an assignment");
      return failure("expected an assignment", input);
    }
    let i = 1;
    while (i < input.length && NAME_REST.test(input[i])) i++;
    if (input[i] !== "=") {
      recordFailure(input, "an assignment");
      return failure("expected = in assignment", input);
    }
    const name = input.slice(0, i);
    const afterEq = input.slice(i + 1);
    const end = scanWord(afterEq);
    if (end === -1) {
      recordFailure(afterEq, "a closing quote");
      return failure("unterminated quote", input);
    }
    let value: BashWord | null = null;
    let rest = afterEq;
    if (end > 0) {
      const parsed = rawWord(afterEq) as ParserSuccess<BashWord>;
      value = parsed.result;
      rest = parsed.rest;
    }
    return success({ type: "assignment" as const, name, value }, rest);
  }),
);

/** Assignments, then words and redirects interleaved in any order.
 * Fails unless at least one element is present. */
export const simpleCommand: Parser<SimpleCommand> = withQueueUnwind(
  (input: string) => {
    const assignments: BashAssignment[] = [];
    const words: BashWord[] = [];
    const redirects: BashRedirect[] = [];
    const parts: { span: SimpleCommand["span"] }[] = [];
    let rest = input;

    while (true) {
      const a = assignment(rest);
      if (!a.success) break;
      assignments.push(a.result);
      parts.push(a.result);
      rest = a.rest;
    }
    while (true) {
      const r = redirect(rest);
      if (r.success) {
        redirects.push(r.result);
        parts.push(r.result);
        rest = r.rest;
        continue;
      }
      const w = bashWord(rest);
      if (w.success) {
        words.push(w.result);
        parts.push(w.result);
        rest = w.rest;
        continue;
      }
      break;
    }

    if (parts.length === 0) {
      recordFailure(input, "a command");
      return failure("expected a command", input);
    }
    const span = {
      start: parts[0].span.start,
      end: parts[parts.length - 1].span.end,
    };
    return success(
      { type: "simple-command" as const, assignments, words, redirects, span },
      rest,
    );
  },
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/parsers/bash/command.test.ts` — expect PASS.
Run: `npx vitest run && npm run test:tsc` — expect green.

- [ ] **Step 5: Commit**

```bash
git add lib/parsers/bash/command.ts tests/parsers/bash/command.test.ts
git commit -m "feat: bash assignments and simple commands"
```

---

### Task 7: Pipelines and and-or lists

**Files:**
- Create: `lib/parsers/bash/grammar.ts` (this task: `command`, `pipeline`, `andOr`; Task 8 appends to it)
- Test: `tests/parsers/bash/grammar.test.ts`

**Interfaces:**
- Consumes: `simpleCommand` (Task 6), `withQueueUnwind` (Task 4), `lx`, core `or` / `map` / `seqR` / `not` / `char` / `lazy`.
- Produces: `command: Parser<BashNode>`, `pipeline: Parser<BashNode>`, `andOr: Parser<BashNode>` (singletons collapse: `a` parses to a `SimpleCommand`, not a one-element `Pipeline`). Task 8 imports `andOr`.

- [ ] **Step 1: Write the failing tests**

Create `tests/parsers/bash/grammar.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { andOr, pipeline } from "@/lib/parsers/bash/grammar";
import { pendingHeredocs, resetHeredocQueue } from "@/lib/parsers/bash/heredocQueue";
import { setInputStr } from "@/lib/trace";

beforeEach(resetHeredocQueue);

function parseAndOr(input: string) {
  setInputStr(input);
  return andOr(input);
}

describe("pipeline", () => {
  it("collapses a single command to the command node", () => {
    setInputStr("echo hi");
    const result = pipeline("echo hi");
    expect(result.success).toEqual(true);
    if (result.success) expect(result.result.type).toEqual("simple-command");
  });

  it("parses a | b | c", () => {
    setInputStr("a | b | c");
    const result = pipeline("a | b | c");
    if (result.success && result.result.type === "pipeline") {
      expect(result.result.commands).toHaveLength(3);
    } else {
      throw new Error("expected pipeline node");
    }
  });

  it("does not treat || as a pipe", () => {
    setInputStr("a || b");
    const result = pipeline("a || b");
    expect(result.success).toEqual(true);
    if (result.success) {
      expect(result.result.type).toEqual("simple-command");
      expect(result.rest).toEqual("|| b");
    }
  });

  it("fails when a command is missing after |", () => {
    setInputStr("a | ");
    expect(pipeline("a | ").success).toEqual(false);
  });
});

describe("andOr", () => {
  it("parses a && b || c left-to-right", () => {
    const result = parseAndOr("a && b || c");
    expect(result.success).toEqual(true);
    if (result.success && result.result.type === "and-or") {
      expect(result.result.rest.map((r) => r.op)).toEqual(["&&", "||"]);
    } else {
      throw new Error("expected and-or node");
    }
  });

  it("mixes pipelines and boolean operators", () => {
    const result = parseAndOr("a | b && c");
    if (result.success && result.result.type === "and-or") {
      expect(result.result.first.type).toEqual("pipeline");
      expect(result.result.rest[0].command.type).toEqual("simple-command");
    } else {
      throw new Error("expected and-or node");
    }
  });

  it("does not consume a single &", () => {
    const result = parseAndOr("a & b");
    expect(result.success).toEqual(true);
    if (result.success) expect(result.rest).toEqual("& b");
  });

  it("unwinds heredoc registrations when it fails after &&", () => {
    const result = parseAndOr("cat <<EOF && ");
    expect(result.success).toEqual(false);
    expect(pendingHeredocs()).toEqual([]); // the sibling-failure leak case
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/parsers/bash/grammar.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/parsers/bash/grammar.ts`:

```ts
import { lazy, map, not, or, seqR } from "../../combinators.js";
import { char } from "../../parsers.js";
import { recordFailure } from "../../rightmostFailure.js";
import { failure, Parser, success } from "../../types.js";
import { simpleCommand } from "./command.js";
import { withQueueUnwind } from "./heredocQueue.js";
import { lx } from "./lexemes.js";
import { AndOr, AndOrOp, BashNode } from "./types.js";

/** A single command. Compound commands (if/while/for/case) get added as
 * alternatives here in a future scope — hence the or + lazy. */
export const command: Parser<BashNode> = withQueueUnwind(
  lazy(() => or(simpleCommand)),
);

// `|` that is not `||`. Explicit lookahead, not an accident of backtracking.
const pipeOp = lx.lexeme(map(seqR(char("|"), not(char("|"))), () => "|"));

// `&&` / `||` — tried before the statement-level single `&`.
const andOrOp: Parser<AndOrOp> = or(lx.symbol("&&"), lx.symbol("||"));

export const pipeline: Parser<BashNode> = withQueueUnwind((input: string) => {
  const first = command(input);
  if (!first.success) return first;
  const commands: BashNode[] = [first.result];
  let rest = first.rest;
  while (true) {
    const op = pipeOp(rest);
    if (!op.success) break;
    const next = command(op.rest);
    if (!next.success) {
      recordFailure(op.rest, "a command after |");
      return failure("expected a command after |", input);
    }
    commands.push(next.result);
    rest = next.rest;
  }
  if (commands.length === 1) return success(first.result, rest);
  const span = {
    start: commands[0].span.start,
    end: commands[commands.length - 1].span.end,
  };
  return success({ type: "pipeline" as const, commands, span }, rest);
});

export const andOr: Parser<BashNode> = withQueueUnwind((input: string) => {
  const first = pipeline(input);
  if (!first.success) return first;
  const chain: AndOr["rest"] = [];
  let rest = first.rest;
  while (true) {
    const op = andOrOp(rest);
    if (!op.success) break;
    const next = pipeline(op.rest);
    if (!next.success) {
      recordFailure(op.rest, `a command after ${op.result}`);
      return failure(`expected a command after ${op.result}`, input);
    }
    chain.push({ op: op.result, command: next.result });
    rest = next.rest;
  }
  if (chain.length === 0) return success(first.result, rest);
  const span = {
    start: first.result.span.start,
    end: chain[chain.length - 1].command.span.end,
  };
  return success(
    { type: "and-or" as const, first: first.result, rest: chain, span },
    rest,
  );
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/parsers/bash/grammar.test.ts` — expect PASS.
Run: `npx vitest run && npm run test:tsc` — expect green.

- [ ] **Step 5: Commit**

```bash
git add lib/parsers/bash/grammar.ts tests/parsers/bash/grammar.test.ts
git commit -m "feat: bash pipelines and and-or chains"
```

---

### Task 8: `heredocNewline`, `script`, `parseBash`

**Files:**
- Modify: `lib/parsers/bash/grammar.ts` (append `heredocNewline`, `blankLines`, `script`)
- Create: `lib/parsers/bash/parseBash.ts`, `lib/parsers/bash/index.ts`
- Test: `tests/parsers/bash/script.test.ts`

**Interfaces:**
- Consumes: `andOr` (Task 7), `drainHeredocs` / `pendingHeredocs` / `scanHeredocBody` / `withQueueUnwind` / `resetHeredocQueue` (Task 4), `positionAt` (Task 3), `setInputStr` / `getDiagnostics` from `lib/trace.ts`, `TarsecErrorData` from `lib/tarsecError.ts`.
- Produces: `heredocNewline: Parser<null>`, `script: Parser<BashScript>`, `parseBash(input): ParserSuccess<BashScript> | BashParseFailure` where `BashParseFailure = ParserFailure & { diagnostics: TarsecErrorData }`; `lib/parsers/bash/index.ts` re-exports everything. Tasks 9–10 rely on `parseBash`.

- [ ] **Step 1: Write the failing tests**

Create `tests/parsers/bash/script.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseBash } from "@/lib/parsers/bash";
import { BashScript, HeredocRedirect, SimpleCommand } from "@/lib/parsers/bash/types";

function ok(input: string): BashScript {
  const result = parseBash(input);
  if (!result.success) throw new Error(result.diagnostics.prettyMessage);
  return result.result;
}

function firstCommand(script: BashScript): SimpleCommand {
  const body = script.statements[0].body;
  if (body.type !== "simple-command") throw new Error(`got ${body.type}`);
  return body;
}

describe("script basics", () => {
  it("parses a one-liner", () => {
    const script = ok("echo hi");
    expect(script.statements).toHaveLength(1);
    expect(firstCommand(script).words.map((w) => w.text)).toEqual(["echo", "hi"]);
  });

  it("parses multiple lines, semicolons, and background &", () => {
    const script = ok("a; b &\nc\n");
    expect(script.statements).toHaveLength(3);
    expect(script.statements[1].background).toEqual(true);
    expect(script.statements[0].background).toEqual(false);
  });

  it("skips blank lines and full-line comments", () => {
    const script = ok("# header\n\na\n\n# mid\nb\n");
    expect(script.statements).toHaveLength(2);
  });

  it("parses an empty script", () => {
    expect(ok("").statements).toEqual([]);
    expect(ok("  \n# just a comment\n").statements).toEqual([]);
  });

  it("consumes trailing comments after a command", () => {
    const script = ok("echo a #b\n");
    expect(firstCommand(script).words.map((w) => w.text)).toEqual(["echo", "a"]);
  });

  it("keeps a#b as a literal word", () => {
    const script = ok("echo a#b");
    expect(firstCommand(script).words.map((w) => w.text)).toEqual(["echo", "a#b"]);
  });

  it("returns diagnostics on failure", () => {
    const result = parseBash("echo )");
    expect(result.success).toEqual(false);
    if (!result.success) {
      expect(result.diagnostics.prettyMessage).toContain("^");
    }
  });
});

describe("heredocs", () => {
  function heredocOf(script: BashScript): HeredocRedirect {
    const r = firstCommand(script).redirects[0];
    if (r.type !== "heredoc") throw new Error("expected heredoc");
    return r;
  }

  it("fills the body from after the newline", () => {
    const script = ok("cat <<EOF\nhello\nworld\nEOF\n");
    const h = heredocOf(script);
    expect(h.body).toEqual("hello\nworld\n");
    expect(h.bodySpan?.start.line).toEqual(1);
  });

  it("lets the rest of the line parse before the body", () => {
    const script = ok("cat <<EOF && echo done\nbody\nEOF\n");
    expect(script.statements[0].body.type).toEqual("and-or");
  });

  it("fills multiple heredocs on one line in order", () => {
    const script = ok("cat <<A <<B\nfirst\nA\nsecond\nB\n");
    const cmd = firstCommand(script);
    const [a, b] = cmd.redirects as HeredocRedirect[];
    expect(a.body).toEqual("first\n");
    expect(b.body).toEqual("second\n");
  });

  it("strips tabs with <<-", () => {
    const h = heredocOf(ok("cat <<-EOF\n\tindented\n\tEOF\n"));
    expect(h.body).toEqual("indented\n");
  });

  it("accepts the delimiter at EOF without a trailing newline", () => {
    const h = heredocOf(ok("cat <<EOF\nbody\nEOF"));
    expect(h.body).toEqual("body\n");
  });

  it("parses commands after a heredoc body", () => {
    const script = ok("cat <<EOF\nbody\nEOF\necho after\n");
    expect(script.statements).toHaveLength(2);
  });

  it("fails on an unterminated heredoc", () => {
    const result = parseBash("cat <<EOF\nno end");
    expect(result.success).toEqual(false);
    if (!result.success) expect(result.message).toContain("unterminated heredoc");
  });

  it("fails when a heredoc never reaches a newline", () => {
    const result = parseBash("cat <<EOF");
    expect(result.success).toEqual(false);
    if (!result.success) expect(result.message).toContain("unterminated heredoc");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/parsers/bash/script.test.ts`
Expected: FAIL — module not found (`@/lib/parsers/bash`).

- [ ] **Step 3: Implement**

Append to `lib/parsers/bash/grammar.ts` (add the new imports to the existing import lines):

```ts
import {
  drainHeredocs,
  pendingHeredocs,
  scanHeredocBody,
} from "./heredocQueue.js";           // merge into the existing heredocQueue import
import { positionAt } from "./spanned.js";
import { BashScript, Statement } from "./types.js";   // merge into existing types import
import { ParserSuccess } from "../../types.js";        // merge into existing types import

/** Consume a newline, then drain pending heredoc bodies (in registration
 * order), mutating each node's `body` and `bodySpan` in place. */
export const heredocNewline: Parser<null> = (input: string) => {
  if (input[0] !== "\n") {
    recordFailure(input, "a newline");
    return failure("expected newline", input);
  }
  let rest = input.slice(1);
  for (const h of drainHeredocs()) {
    const scanned = scanHeredocBody(rest, h.tag, h.stripTabs);
    if (scanned === null) {
      recordFailure(rest, `heredoc delimiter ${h.tag}`);
      return failure(`unterminated heredoc <<${h.tag}`, input);
    }
    h.body = scanned.body;
    h.bodySpan = { start: positionAt(rest), end: positionAt(scanned.delimRest) };
    rest = scanned.rest;
  }
  return success(null, rest);
};

// `&` that is not `&&` — the background/separator operator.
const ampOp = lx.lexeme(map(seqR(char("&"), not(char("&"))), () => "&"));
const semiOp = lx.lexeme(char(";"));

/** Eat whitespace, comments, and blank lines. Only safe where the heredoc
 * queue is known empty (start of script / after a drained separator):
 * heredocNewline can only fail here when there is no newline at all. */
const blankLines: Parser<null> = (input: string) => {
  let rest = input;
  while (true) {
    rest = (lx.ws(rest) as ParserSuccess<null>).rest;
    const nl = heredocNewline(rest);
    if (!nl.success) break;
    rest = nl.rest;
  }
  return success(null, rest);
};

export const script: Parser<BashScript> = withQueueUnwind((input: string) => {
  let rest = (blankLines(input) as ParserSuccess<null>).rest;
  const statements: Statement[] = [];

  while (rest !== "") {
    const parsed = andOr(rest);
    if (!parsed.success) return parsed;
    let background = false;
    rest = parsed.rest;

    if (rest.startsWith("\n")) {
      const nl = heredocNewline(rest); // may fail: unterminated heredoc
      if (!nl.success) return nl;
      rest = nl.rest;
    } else {
      const amp = ampOp(rest);
      if (amp.success) {
        background = true;
        rest = amp.rest;
      } else {
        const semi = semiOp(rest);
        if (semi.success) {
          rest = semi.rest;
        } else if (rest !== "") {
          recordFailure(rest, "';', '&', or a newline");
          return failure("expected ';', '&', or newline after command", rest);
        }
      }
      // separator consumed without a newline: heredocs registered on this
      // line still need one. At EOF that newline never comes.
      if (rest === "" && pendingHeredocs().length > 0) {
        const tag = pendingHeredocs()[0].tag;
        return failure(`unterminated heredoc <<${tag}`, rest);
      }
    }

    statements.push({
      type: "statement",
      body: parsed.result,
      background,
      span: parsed.result.span,
    });
    rest = (blankLines(rest) as ParserSuccess<null>).rest;
  }

  const span =
    statements.length > 0
      ? {
          start: statements[0].span.start,
          end: statements[statements.length - 1].span.end,
        }
      : { start: positionAt(input), end: positionAt(input) };
  return success({ type: "script" as const, statements, span }, rest);
});
```

**Required guard:** `blankLines` swallows `heredocNewline` failures as loop exit, which would hide an unterminated-heredoc error (heredocs registered before a `;`/`&` drain at the *next* newline, which `blankLines` handles). Immediately after the loop-bottom line `rest = (blankLines(rest) as ParserSuccess<null>).rest;`, add:

```ts
    if (rest.startsWith("\n")) {
      // blankLines stopped at a newline it could not consume: heredocNewline
      // failed with an unterminated heredoc. Re-run it to surface the error.
      return heredocNewline(rest);
    }
```

Create `lib/parsers/bash/parseBash.ts`:

```ts
import { TarsecErrorData } from "../../tarsecError.js";
import { getDiagnostics, setInputStr } from "../../trace.js";
import { ParserFailure, ParserSuccess } from "../../types.js";
import { script } from "./grammar.js";
import { resetHeredocQueue } from "./heredocQueue.js";
import { BashScript } from "./types.js";

export type BashParseFailure = ParserFailure & { diagnostics: TarsecErrorData };

/** Parse a bash script. This is the entry point that owns global-state setup:
 * it registers the input for span/error tracking and resets the heredoc
 * queue. Use the raw `script` parser only if you do both yourself. */
export function parseBash(
  input: string,
): ParserSuccess<BashScript> | BashParseFailure {
  setInputStr(input);
  resetHeredocQueue();
  const result = script(input);
  if (result.success) return result;
  return { ...result, diagnostics: getDiagnostics(result, result.rest) };
}
```

Create `lib/parsers/bash/index.ts`:

```ts
export * from "./types.js";
export * from "./lexemes.js";
export * from "./spanned.js";
export * from "./words.js";
export * from "./heredocQueue.js";
export * from "./redirects.js";
export * from "./command.js";
export * from "./grammar.js";
export * from "./parseBash.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/parsers/bash/script.test.ts` — expect PASS.
Run: `npx vitest run && npm run test:tsc` — expect green.

- [ ] **Step 5: Commit**

```bash
git add lib/parsers/bash tests/parsers/bash/script.test.ts
git commit -m "feat: bash script grammar with heredoc draining and parseBash entry point"
```

---

### Task 9: Queue-unwind regression tests and span coverage

Test-only task: locks in the invariants the spec calls out so future changes can't silently break them.

**Files:**
- Test: `tests/parsers/bash/regressions.test.ts`

**Interfaces:**
- Consumes: `parseBash`, `script`, `pendingHeredocs`, `resetHeredocQueue` from `@/lib/parsers/bash`; `setInputStr` from `@/lib/trace`.

- [ ] **Step 1: Write the tests**

Create `tests/parsers/bash/regressions.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { parseBash, pendingHeredocs, resetHeredocQueue, script } from "@/lib/parsers/bash";
import { setInputStr } from "@/lib/trace";

beforeEach(resetHeredocQueue);

describe("heredoc queue unwinding", () => {
  it("a failed parse leaves the queue empty (sibling-failure case)", () => {
    setInputStr("cat <<EOF && ");
    const result = script("cat <<EOF && ");
    expect(result.success).toEqual(false);
    expect(pendingHeredocs()).toEqual([]);
  });

  it("a failed parse leaves the queue empty (mid-script case)", () => {
    setInputStr("cat <<A\nbody\nA\necho | ");
    const result = script("cat <<A\nbody\nA\necho | ");
    expect(result.success).toEqual(false);
    expect(pendingHeredocs()).toEqual([]);
  });

  it("consecutive parseBash calls do not interfere", () => {
    expect(parseBash("cat <<EOF").success).toEqual(false);
    const second = parseBash("echo clean");
    expect(second.success).toEqual(true);
  });
});

describe("spans", () => {
  it("word spans exclude trailing whitespace and heredoc bodies get bodySpan", () => {
    const result = parseBash("cat <<EOF\nhello\nEOF\n");
    if (!result.success) throw new Error(result.message);
    const cmd = result.result.statements[0].body;
    if (cmd.type !== "simple-command") throw new Error("expected simple-command");
    expect(cmd.words[0].span).toEqual({
      start: { offset: 0, line: 0, column: 0 },
      end: { offset: 3, line: 0, column: 3 },
    });
    const h = cmd.redirects[0];
    if (h.type !== "heredoc") throw new Error("expected heredoc");
    // body starts on line 1, delimiter on line 2
    expect(h.bodySpan?.start).toEqual({ offset: 10, line: 1, column: 0 });
    expect(h.bodySpan?.end).toEqual({ offset: 16, line: 2, column: 0 });
  });

  it("statement spans cover the full command", () => {
    const result = parseBash("a | b && c\n");
    if (!result.success) throw new Error(result.message);
    const stmt = result.result.statements[0];
    expect(stmt.span.start.offset).toEqual(0);
    expect(stmt.span.end.offset).toEqual(10);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/parsers/bash/regressions.test.ts`
Expected: PASS. If a span assertion fails by an off-by-one, verify by hand against the input string before touching implementation — the test values above are computed from the inputs shown (e.g. `"cat <<EOF\nhello\nEOF\n"`: `h` of `hello` is offset 10).

- [ ] **Step 3: Commit**

```bash
git add tests/parsers/bash/regressions.test.ts
git commit -m "test: heredoc unwind and span regression coverage"
```

---

### Task 10: Packaging, docs, changelog

**Files:**
- Modify: `package.json`, `README.md`, `tutorials/expressions.md`, `CHANGELOG.md` (check the file's real name/format first — recent commits are titled "changelog")
- Create: `tutorials/lexemes.md`

**Interfaces:**
- Consumes: everything shipped in Tasks 1–8.

- [ ] **Step 1: Add the exports entry**

In `package.json`, after the `./parsers/markdown` entry, add:

```json
"./parsers/bash": {
  "import": "./dist/parsers/bash/index.js",
  "require": "./dist/parsers/bash/index.js",
  "types": "./dist/parsers/bash/index.d.ts"
}
```

Verify: `npm run build` succeeds and `dist/parsers/bash/index.js` exists.

- [ ] **Step 2: Write the lexemes tutorial**

Create `tutorials/lexemes.md`:

```markdown
# Lexemes: handling whitespace in one place

Most grammars don't care about whitespace, but naive combinator parsers end up
sprinkling `spaces` / `optional(spaces)` between every two tokens. `makeLexemes`
fixes that with one discipline borrowed from Parsec's token parsers:

> Every token-shaped parser eats its own **trailing** whitespace.
> Eat **leading** whitespace once, at the top.

Note this is *not* a lexer: there's no separate tokenizing pass and no token
array. The helpers are ordinary tarsec parsers you use directly in your grammar.

## Setup

​```ts
import { makeLexemes } from "tarsec";

const lx = makeLexemes({
  whitespace: " \t\n",   // what counts as whitespace
  lineComment: "//",     // optional: skip line comments too
});
​```

## The helpers

​```ts
lx.symbol("+")          // matches "+", eats trailing whitespace
lx.lexeme(p)            // your parser p, then trailing whitespace
lx.identifier           // an identifier (customizable charset)
lx.keyword("if")        // "if" but NOT "ifx"
lx.ws                   // the whitespace skipper itself
​```

`lexeme` preserves captures: `lx.lexeme(capture(word, "name"))` still captures.

## Example: arithmetic with whitespace

​```ts
import { buildExpressionParser, makeLexemes, map, regexParser } from "tarsec";

const lx = makeLexemes({ whitespace: " \t\n" });
const integer = lx.lexeme(map(regexParser("^[0-9]+"), Number));

const expr = buildExpressionParser(integer, [
  [
    { op: lx.symbol("*"), assoc: "left", apply: (a, b) => a * b },
    { op: lx.symbol("/"), assoc: "left", apply: (a, b) => a / b },
  ],
  [
    { op: lx.symbol("+"), assoc: "left", apply: (a, b) => a + b },
    { op: lx.symbol("-"), assoc: "left", apply: (a, b) => a - b },
  ],
]);

expr("1 + 2 * 3");   // => { success: true, result: 7 }
​```

## Keywords vs identifiers

If your language has keywords, list them and `identifier` will refuse them
while `keyword` requires exact matches:

​```ts
const lx = makeLexemes({ whitespace: " \t", keywords: ["if", "then"] });

lx.identifier("ifx");    // ok: "ifx" is an identifier
lx.identifier("if");     // fails: reserved
lx.keyword("if")("ifx"); // fails: not the exact keyword
​```

For a full worked example, see the bash parser in `lib/parsers/bash`
(importable as `tarsec/parsers/bash`), which uses lexemes for a real grammar
with pipes, redirects, and heredocs.
```

(The ​``` fences above are escaped for this plan; write real fences.)

- [ ] **Step 3: Update the expressions tutorial**

In `tutorials/expressions.md`, replace the entire "## Handling whitespace" section (the hand-rolled `wsOp` version) with:

```markdown
## Handling whitespace

The example above doesn't handle spaces. Use `makeLexemes`: wrap each operator
in `lx.symbol`, which matches and then eats trailing whitespace (see the
[lexemes tutorial](./lexemes.md)):

​```ts
import { makeLexemes } from "tarsec";

const lx = makeLexemes({ whitespace: " \t\n" });
const wsInteger = lx.lexeme(integer);

const expr = buildExpressionParser(wsInteger, [
  [
    { op: lx.symbol("*"), assoc: "left", apply: (a, b) => a * b },
    { op: lx.symbol("/"), assoc: "left", apply: (a, b) => a / b },
  ],
  [
    { op: lx.symbol("+"), assoc: "left", apply: (a, b) => a + b },
    { op: lx.symbol("-"), assoc: "left", apply: (a, b) => a - b },
  ],
]);

expr("1 + 2 * 3");           // => { success: true, result: 7 }
expr("1 * (2 - (3 / 4))");   // => { success: true, result: 1.25 }
​```
```

- [ ] **Step 4: Update README and changelog**

In `README.md`:
- Under `## Learning tarsec`, add: `- [Lexemes: handling whitespace](/tutorials/lexemes.md)`
- Under `## Examples`, add a bullet: `- A bash parser — importable as `tarsec/parsers/bash`. Parses the command-line skeleton: simple commands, assignments, pipes, `&&`/`||`/`;`/`&`, redirects, and heredocs (`<<`, `<<-`, quoted tags), with spans on every node.`

In the changelog (find it: `ls CHANGELOG*`; follow its existing format), add an entry for the next minor version:

```markdown
- `makeLexemes`: scannerless lexeme helpers (`lexeme`, `symbol`, `identifier`, `keyword`, `ws`) for whitespace/comment/keyword handling. See tutorials/lexemes.md.
- New example parser: `tarsec/parsers/bash` — pipes, redirects, heredocs, spans.
- `compileCharPredicate` is now exported from parsers.
```

- [ ] **Step 5: Verify everything**

Run: `npx vitest run && npm run test:tsc && npm run build`
Expected: all tests green, types clean, build succeeds with `dist/parsers/bash/`.

- [ ] **Step 6: Commit**

```bash
git add package.json README.md tutorials/lexemes.md tutorials/expressions.md CHANGELOG*
git commit -m "docs: lexemes tutorial, bash example packaging, changelog"
```
