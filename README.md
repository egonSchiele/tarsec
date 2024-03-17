```
 __
/\ \__
\ \ ,_\    __     _ __   ____     __    ___
 \ \ \/  /'__`\  /\`'__\/',__\  /'__`\ /'___\
  \ \ \_/\ \L\.\_\ \ \//\__, `\/\  __//\ \__/
   \ \__\ \__/.\_\\ \_\\/\____/\ \____\ \____\
    \/__/\/__/\/_/ \/_/ \/___/  \/____/\/____/
```

A parser combinator library for TypeScript.

## Hello world

```ts
// define a parser
const parser = seq([
    str("hello"),
    space,
    str("world")
]);

// then use it
parser("hello world"); // success
parser("hello there"); // failure
```

## A longer example

```ts
// define a parser to parse "hello, <name>!"
const parser = seq([
    str("hello"),
    space,
    // capture group to capture the name.
    //
    // `many1(noneOf("!")` parses one or more characters
    // that are not an exclamation mark.
    // `many1` returns an array of characters,
    // `many1WithJoin` joins them into a string.
    //
    // This capture group is then given the name "person"
    capture(many1WithJoin(noneOf("!")), "person"),
    char("!"),
]);

// parse
const result = parser("hello adit!");

console.log(result.captures); // { person: "adit" }
```