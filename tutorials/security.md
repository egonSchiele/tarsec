tarsec has no dependencies, so will not suffer from vulnerabilities from any dependency.

A common security issue with regexes is performance. It's possible, for certain regexes, to craft input that will make the regex extremely slow due to backtracking. tarsec provides the `limitSteps` function for this. Wrap your parser call in this function and it will be limited to that many number of steps.

```ts
// This parser and any parsers it calls
// can't take more than 20 steps total
limitSteps(20, () => {
    const result = headingParser("# Hello, world!\n");
});
```

This way, in a production environment, you can be sure your parser won't go into an infinite loop.