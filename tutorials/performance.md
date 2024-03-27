A tarsec parser will always be slower than a regex. Regex code is tightly optimized low-level code, which a tarsec parser is TypeScript code with recursion. However, you might be surprised by how close you can still get to regex performance.

Here is a table of a negation parser that parses a string like `-<some word>` in a few different ways, including using a regex. For each of these parsers, I ran it 100 times over 100 different random inputs. Here are the results.

| Parser                          | Time (100 runs) | Code                                                  |
| ------------------------------- | --------------- | ----------------------------------------------------- |
| negationParser with capture     | 1.39ms          | `seqR(char("-"), capture(manyTill(space), "phrase"))` |
| negationParser                  | 1.37ms          | `seqR(char("-"), manyTill(space))`                    |
| negationParser with manyTillStr | 0.15ms          | `seqR(char("-"), manyTillStr(" "))`                   |
| regex parser                    | 0.14ms          | `regexParser("-([^ ]*)")`                             |
| regex                           | 0.05ms          | `input.match(new RegExp("-([^ ]*)"))`                 |


Note that these times were the running times on my computer, so obviously performance will vary. But the proportion of these numbers is what's important. You can see the regex parser is the fastest, but tarsec parsers come close. And overall, they're all pretty fast. 

The code for this test is in `/bench`. You can run it yourself.

## How to improve the performance of your parser
Here is a list of tips to improve the performance of your parser.
- tarsec comes with a built-in regex parser. Use it if it makes sense for you. It will run a regex match behind the scenes, thus taking advantage of a regex's speed.
- Prefer parsers that parse whole chunks at a time over parsers that parse a character at a time. For example, `manyTill` will run the given parser on every character of the string until it succeeds, whereas `manyTillStr` will just use `.indexOf` to find the string in the input. So, `manyTillStr` will always be faster.

In my testing, running the first parser was always slow, and subsequent parsers were faster, even if they weren't the same parser, as the underlying parsers get optimized.

## Debugging performance
If you want to debug the performance of your parser, there are a few options. You can use the `parserTime()` function. This takes a callback and times how long it takes to run, and returns the result in milliseconds. The callback can be any arbitrary code, it doesn't have to be a parser.

`printTime()` is a convenience function that will run `parserTime()` for you and print the time in a nicely formatted way.

You can also use the `debug()` function. `debug()` will print out every step that your parser takes. At the end, it will print each parser that was called, how long it took to run, as well as how many times it was called.

`debug()` only works with tarsec's built-in parsers out of the box, but you can easily make it work with one of your own parsers. Simply wrap your parser in a call to `trace`, and tarsec will do the rest.