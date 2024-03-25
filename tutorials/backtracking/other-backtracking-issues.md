There are plenty of backtracking issues, and tarsec doesn't solve them all. For example, if you need to backtrack on multiple levels, tarsec will fail.

```ts
    const parser = seq(
      [
        str("the robot"),
        space,
        str("ate"),
        space,
        or(str("the"), str("the cake-")), // or #1
        space,
        or(str("cake"), str("cake cake")), // or #2
        str("!"),
        eof,
      ],
      getResults
    );

      const resultCake = parser("the robot ate the cake- cake!");
```

In this code, TARSEC would first backtrack to OR number 2. That won't fix the issue, so it will backtrack to OR number 1, parse the cake, then go back to OR number 2. Here, it needs to start over on OR number 2 to succeed, but it won't do that.

---

A couple examples using many1. Suppose you want to parse a sentence. This parser looks like it will do it.

```ts
const sentenceParser = seq([
    many1(or(
        word,
        seq([word, space], getResults)
    )),
    eof], getResults)
```

Unfortunately it won't. The `or` inside the `many1` will make it choke. On a string like `"once upon a time"`, The many1 will parse `["once"]`, and then fail on the `eof`. Now it needs to know to go back and try the other branch in the OR. But then on its next iteration (since it's a `many1`), what would it do?

 You could avoid the issue by just flipping the order of the parsers in the OR.

Here is another problematic one.

```ts
const aParser = seq([
    many1(char("a")),
    char("a")
    ], getResults);
```

This parses a string of character a's. The last `"a"` gets parsed into the `char("a")`. The rest get parsed into the `many1`. Except this doesn't work. The `many1` parser is greedy, so it will parse all the a's and not know to leave one for the last parser to parse.

---

I hope this shows that even if it *looks* like your parser will parse something, it's not always clear that it will without testing.
