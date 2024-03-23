# Three building blocks

There are three building blocks in tarsec:
1. parsers
2. functions that return parsers
3. parser combinators.

In tarsec, a parser is any function that takes a string and then returns a `ParserResult`. I'll go over that soon. But first, here is a very simple parser.

### Your first parser

```ts
function charA(str: string) {
  if (str === "a") {
    // success
  } else {
    // failure
  }
}
```

This parser only parses the character `"a"`. If you pass in an `"a"`, it returns a success result. Otherwise it returns a failure result. Now lets add the results:

```ts
function charA(str: string) {
  if (str === "a") {
    return { success: true, result: str, rest: "" };
  } else {
    return { success: false, message: "Expected 'a'", rest: str };
  }
}
```

If the parser succeeds it returns an object with what it parsed as `result`. If it fails it returns an object with an error message as `message`. I'll get to the `rest` parameter later.

If you understand this code, congratulations, you've just written your first tarsec parser. 

Now that we've written a parser, let's talk about a second building block: functions that return parsers.

### Functions that return parsers

This `charA` parser can't do much. It can only parse the character `"a"`. Here's something more general.

```ts
function char(someChar: string) {
  return (str: string) => {
    if (str === someChar) {
      return { success: true, result: str, rest: "" };
    } else {
      return { success: false, message: `Expected '${someChar}'`, rest: str };
    }
  };
}
```

`char` isn't a parser. It's a function that *makes* parsers. You give it any character, and it will return a parser for that character.

For example, here is a person for the character `"b"`.

```ts
const charB = char("b");
const result = charB("b");
console.log(result);
```

By the way, if this feels academic, don't worry, it is very relevant.

Now, here is the last building block.

### Parser combinators
Parser combinators are best understood with some examples, so here are some built-in tarsec parsers.

**seq**

`seq` takes an array of parsers and runs them all one after another. So far we've just been parsing single characters. If you wanted to parse a word like `"hello"`, we could do it with `seq`.

```ts
const helloParser = seq(
  [char("h"), char("e"), char("l"), char("l"), char("o")],
  getResults
);

const result = helloParser("hello");
console.log(result);
```

Both `char` and `seq` are part of the tarsec standard library, so you should be able to copy this code into a file and run it.

Tarsec actually has a parser to parse strings. You could write the same parser like this:

```ts
const helloParser = str("hello")
```

**or**

`or` runs a series of parsers until one of them succeeds.

```ts
const greetingParser = or([str("hello"), str("hi")]);
```

**many1**

`many1` runs a parser one or more times.

```ts
const excitementParser = many1("!")
const result = excitementParser("!!!!!")
```

Those are the three building blocks in tarsec. Now you're ready to write your own parsers. Check out the parsers and parser combinators in the tarsec standard library to see what's available.