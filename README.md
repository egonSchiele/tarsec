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

## Examples
- [A markdown parser](/tests/examples/markdown.ts)

Read more about [use cases for tarsec](/tutorials/use-case.md).

## Contributing
PRs for documentation, tests, and bug fixes are welcome.