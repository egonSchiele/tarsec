# Pretty error messages

TARSEC has experimental support for displaying prettier error messages to your user that look like this

```
Near: import;
            ^
expected a statement of the form `import { x, y } from 'filename'`
```

They provide helpful error messages and indicate exactly where the issue occurs.

Most of the time, when your parser fails, it will be because all parsers were tried and failed, and you will end up with a generic message such as "all parsers failed." If your user has just entered the code for a large program, an error like that doesn't give them any information as to what they should fix.

## How to implement pretty error messages

There are three steps involved.
### 1. setInputString

Before the start of your parser, pass the entire user input into the function `setInputString`:

```ts
setInputString(input);
```

This tells tarsec what the entire input looks like, so when there is an error, it can give the exact line and column position where it occurred.

### 2. wrap parts of your code with `parseError`.
There are times when you want your parser to fail immediately, and not try any other parsers. For example, suppose you have a JavaScript parser. The user gives this input:

```ts
import;
```

The import statement parser will fail on this, and there is no need to try any other parser. You know that this has to be an import statement. So you can write a parser that fails early by wrapping part of your parser in the `parseError` combinator.

Before:

```ts
const parser = seqC(
 str("import"),
 spaces,
 capture(
 quotedString,
 "moduleName",
 )
)
```

After:

```ts
const parser = seqC(
 str("import"),
 parseError(
 "expected import statement",
 spaces,
 capture(
 quotedString,
 "moduleName",
 ),
 ),
);
```

The first argument to `parseError` is the error message that should be shown if there's a failure. The rest of the arguments are parsers, and `parseError` runs them in sequence, just like you would pass into a combinator like `seqC`. One issue is if you have wrapped any captures, you actually need to wrap the call to `parseError` in `captureCaptures`. So the code actually looks more like this:

```ts
const parser = seqC(
 str("import"),
 captureCaptures(
 parseError(
 "expected import statement",
 spaces,
 capture(
 quotedString,
 "moduleName",
 ),
 ),
 ),
);
```

### 3. Catch and print the error

Now, if any of the parsers fail, `parseError` will throw an error of type `TarsecError`. This error object has a `data` key that contains lots of useful information:

```ts
type TarsecErrorData = {
 line: number;
 column: number;
 length: number;
 prettyMessage: string;
 message: string;
};
```

You can catch the exception and print out a pretty error message for the user using something like this:

```ts
try {
 const result = parser(input);
} catch (error) {
 if (error instanceof TarsecError) {
 console.log(error.data.prettyMessage);
 } else {
 throw error;
 }
}
```

The rest of the data is extremely useful. It provides exactly the diagnostic data you need if you're trying to build an extension for VS Code, the kind that shows a red squiggle where there is an error, with a helpful error message.

You can also get this diagnostic object with the `getDiagnostics()` function:

```ts
if (!result.success) {
 const diagnostics = getDiagnostics(result, input, errorMessage);
 }
```

The optional third parameter is the error message. If this isn't set, `getDiagnostics` will pull the error message from the result object.