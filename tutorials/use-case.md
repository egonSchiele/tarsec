## What's the use case for tarsec?
tarsec sits in the place between regular expressions and a full-blown parser generator like [nearley](https://nearley.js.org/) or [yacc](https://silcnitc.github.io/yacc.html). If you want to parse something where a regular expression would be a bit too complicated, tarsec offers a syntax that's easy to read and maintain.

Since tarsec is all standard TypeScript code and has no dependencies, so there is no build step or heavy file to add. And with its debug mode, tarsec makes it easy to see why your parser is failing, something regular expressions can't do out of the box. 

Finally, tarsec returns typed output, so you don't have to try to figure out how to work with an array of matches like with regular expressions.

Overall, tarsec aims to provide a great user experience for small-sized parsers. It's perfect for things like parsing markdown, parsing a search string, or parsing a tiny language. If you want to parse a complex programming language like TypeScript or Ruby, however, tarsec will be too slow for you. You'll need something like [nearley](https://nearley.js.org/) for that.