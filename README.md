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
import { getResults, str, seq, space } from "tarsec";

// define a parser
const parser = seq([
    str("hello"),
    space,
    str("world")
], getResults);

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
- [Debug mode](/tutorials/debugging.md) that prints what's happening step-by-step
- Derived types: tarsec will generate TypeScript types for your parser
- Partial [backtracking](/tutorials/backtracking.md) support

Read more about [use cases for tarsec](/tutorials/use-case.md).