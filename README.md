```
 __
/\ \__
\ \ ,_\    __     _ __   ____     __    ___
 \ \ \/  /'__`\  /\`'__\/',__\  /'__`\ /'___\
  \ \ \_/\ \L\.\_\ \ \//\__, `\/\  __//\ \__/
   \ \__\ \__/.\_\\ \_\\/\____/\ \____\ \____\
    \/__/\/__/\/_/ \/_/ \/___/  \/____/\/____/
```

A parser combinator library for TypeScript, inspired by Parsec.

## Install

```
npm install tarsec
```

## Hello world

```ts
import { str, seqR, space } from "tarsec";

// define a parser
const parser = seqR(
    str("hello"),
    space,
    str("world")
);

// then use it
parser("hello world"); // success
parser("hello there"); // failure
```

## Learning tarsec
- [A five minute introduction](/tutorials/5-minute-intro.md)
- [The three building blocks in tarsec](/tutorials/three-building-blocks.md)
- [API reference](https://egonschiele.github.io/tarsec/)

## Features
- tarsec is entirely TypeScript. There's nothing to compile.
- Derived types: tarsec will generate TypeScript types for your parser
- [Debug mode](/tutorials/debugging.md) that prints what's happening step-by-step
- Tools to debug your parser's [performance](/tutorials/performance.md)
- Partial [backtracking](/tutorials/backtracking.md) support
- A way to make your parser more [secure](/tutorials/security.md).
- [Pretty error messages](/tutorials/pretty-errors.md)

## Examples
- [A CommonMark-ish markdown parser](/tests/examples/markdown) — headings (ATX 1–6 with optional trailing `#` stripping, plus setext), fenced and indented code blocks, multi-backtick inline code spans, multi-line / nested block quotes, ordered / unordered / nested lists, pipe tables with alignment, horizontal rules, HTML passthrough, VitePress-style YAML frontmatter, plus inline bold/italic (`*` and `_`), combined `***bold-italic***`, strikethrough, escapes, autolinks, hard *and* soft line breaks, images and links with optional `"title"`, and reference-style links / footnotes resolved in a post-parse pass. Paragraphs round-trip soft-wrapped lines through an `inline-soft-break` node. Inline emphasis, strike, and link content all nest, so ``**[link](u)**`` and ``*a `code` b*`` round-trip into the AST. Adds GFM task list items (`- [ ] foo` / `- [x] foo`), bare-URL autolinks for `http(s)://…` (with trailing-punctuation and balanced-paren handling), HTML entity decoding (`&amp;`, `&lt;`, `&#33;`, `&#x21;`), and reference-link definitions whose `"title"` flows through onto the resolved inline link.

Read more about [use cases for tarsec](/tutorials/use-case.md).

## Contributing
PRs for documentation, tests, and bug fixes are welcome.