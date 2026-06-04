# Other tricky cases

Tarsec doesn't backtrack, so any grammar where the first matching branch isn't the right branch will fail. The main tutorial covers the standard fix: reorder the `or`, or guard each branch with `peek`. This page collects a few cases that need more thought.

## Sequenced `or`s

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

    parser("the robot ate the cake- cake!");
```

Both `or`s have the shorter alternative first, so on this input both will pick the wrong branch. There is no single-`or` reordering that makes this work for every valid sentence.

The fix is `peek`: each `or` commits to the longer branch only when the full longer match is actually present.

```ts
    or(
      seqR(peek(str("the cake-")), str("the cake-")),
      str("the"),
    )
```

Apply the same pattern to `or #2`.

## `or` inside `many1`

```ts
    const sentenceParser = seq([
      many1(or(
        word,
        seq([word, space], getResults),
      )),
      eof,
    ], getResults);
```

On `"once upon a time"`, the `many1` greedily takes each `word` and then fails at `eof` because the trailing space hasn't been consumed. There's no second chance — `many1` keeps the first branch's result and moves on.

Two fixes:

1. **Reorder** so the longer alternative is first:

   ```ts
   many1(or(
     seq([word, space], getResults),
     word,
   ))
   ```

2. **Guard with `peek`** if the disambiguator is more complex than just "the longer alternative wins":

   ```ts
   many1(or(
     seqR(peek(seq([word, space], getResults)), seq([word, space], getResults)),
     word,
   ))
   ```

## Greedy `many1` swallowing input the next parser needs

```ts
    const aParser = seq([
      many1(char("a")),
      char("a"),
    ], getResults);
```

This wants "at least one `a`, followed by an `a`". `many1` is greedy — it consumes every `a` it can — so the final `char("a")` always fails. There's no peek/reorder fix here; this is a grammar problem. You probably want:

```ts
    const aParser = many1(char("a"));
```

Or, if you really do need at least two:

```ts
    const aParser = seq([char("a"), many1(char("a"))], getResults);
```

---

The pattern in all of these: when the input shape doesn't tell the `or` (or `many1`) which way to go on its first try, give it a `peek` so the choice is correct from the start. When that doesn't work, the grammar itself is wrong.
