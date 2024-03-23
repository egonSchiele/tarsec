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
- [A five minute introduction](/docs/5-minute-intro.md)

## Features
- Tarsec is entirely TypeScript. There's nothing to compile.
- Debug mode that prints what's happening step-by-step
- Derived types: tarsec will generate TypeScript types for your parser
- Partial [backtracking](/docs/backtracking.md) support
