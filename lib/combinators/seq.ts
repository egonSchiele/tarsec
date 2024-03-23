import { trace } from "@/lib/trace";
import {
  GeneralParser,
  MergedResults,
  MergedCaptures,
  Parser,
  createTree,
  isCaptureResult,
  success,
} from "@/lib/types";
import { findAncestorWithNextParser, popMany } from "@/lib/utils";

/*
To add backtracking support requires a fairly big change. Here's an example that needs backtracking.

```ts
  const parser = seq([
        str("hello "),        
        or([str("world"), str("world!")]),
        optional("?")
    ], getResults);
```

If we try to parse `"hello world!"`, the first parser in the OR will succeed, but then we'll get stuck at the `optional`. Instead, we need to go back up the tree and try the second parser in the OR. A few things need to happen.

1. instead of just processing these parsers sequentially in a for loop, we need to model them as a tree
2. the OR parser needs to let us know that there are other branches to try.

For #2, there's an optional `nextParser` key on a parser success. The or parser can use this to say "a parser succeeded and here's the result, but there are other parsers that could be tried". `nextParser` is a parser that runs the remaining branches. So in this example, the OR would return a success with `nextParser = or([str("world")])`.

Next, we need to model this as a tree. Each node in the tree has a parent and child and the parser for that node.

```ts
  parent: Node;
  parser: GeneralParser<any, any> | null;
  child: Node;
```

Hopefully that is self-explanatory. We start at the root of the tree, try the parser there, then use `.child` to go to the next node and so on. We don't model multiple paths as multiple children. To keep the code simple, we do something else.

Each node also has a `closed` key. Once we've run the parser for a node, we mark it `closed`. Closed means there are no more branches here. UNLESS, the parser returns a `nextParser`. In that case, we *don't* mark it closed because there are still other options to try. In that case, we also *replace* the parser on that node with nextParser.

So, going back to the hello world example, let's say we're stuck at the `optional`:

```ts
  const parser = seq([
        str("hello "),        
        or([str("world"), str("world!")]),
        optional("?")
    ], getResults);
```

We use `.parent` to go back up the tree. We're looking for a node that isn't closed. If we find one, we start again from there. In this case, we'd find an open node at the or with parser `or([str("world")])`. We can restart from there, but there's a bunch of state to reset.

1. From the new `or` parser, we need to go to the optional parser. We're doing it all again in the same order. This is one reason why it's easier to model this without multiple children. Otherwise, all the children would have to point to the next level, the next level would have to point to all the children in the previous level, and you'd have multiple parents, which is awful to deal with.

2. We have consumed input and added to the results. We need to undo that. At this point, the input is `!`, because we've consumed `hello world`. And the results array is `["hello ", "world"]`. We need to rewind both of those.

To do that, I count how many levels up we've gone to find another branch, and just pop that many elements off the results array. So results is now `["hello "]`. The input is trickier. How would I keep track of what the input was when we were at the OR the last time?

This is where the final key on a tree node comes in. Nodes also have an optional `input` key. 

IF a parser succeeds, and
IF there's a nextParser,
We know we may come back to this node. So we save the current input as `.input` on the node.

This approach has some issues. Notably, it doesn't work if you need to backtrack at multiple points in the tree. The test `backtracking-deep.test.ts` shows this.

The code is also complex and it would be easy to have bugs in this logic. I wish there was a cleaner solution for rewinding state.
*/

export function seq<const T extends readonly GeneralParser<any, any>[], U>(
  parsers: T,
  transform: (results: MergedResults<T>[], captures: MergedCaptures<T>) => U,
  debugName: string = ""
): Parser<U> {
  return trace(`seq(${debugName})`, (input: string) => {
    const results: any[] = [];
    let rest = input;
    const captures: MergedResults<T>[] | any = {};
    const rootNode = createTree(parsers);

    let current = rootNode;
    while (current) {
      const parser = current.parser;
      if (!parser) {
        console.log({ current, parser, results, captures });
        throw new Error("parser is null");
      }
      const parsed = parser(rest);
      current.closed = true;
      /*       console.log({ parsed }); */
      if (!parsed.success) {
        const [ancestor, count] = findAncestorWithNextParser(current);
        if (ancestor) {
          current = ancestor;
          rest = ancestor.input!;

          popMany(results, count);

          continue;
        } else {
          // don't consume input if we're failing
          return { ...parsed, rest: input };
        }
      }

      results.push(parsed.result);

      if (parsed.nextParser) {
        /* console.log("setting next parser", parsed.nextParser); */
        current.parser = parsed.nextParser;
        current.input = rest;
        current.closed = false;
      }

      rest = parsed.rest;
      if (isCaptureResult(parsed)) {
        for (const key in parsed.captures) {
          captures[key] = parsed.captures[key];
        }
      }
      current = current.child;
    }

    const result = transform(results, captures);
    return success(result, rest);
  });
}
