# Tarsec

A parser combinator library for TypeScript, inspired by Parsec.

## Commands

- `npm test` — run tests with vitest (watch mode)
- `npx vitest run` — run tests once
- `npx vitest run tests/path/to/file.test.ts` — run a single test file
- `npm run build` — build to `dist/`
- `npm run test:tsc` — type-check tests
- `npm run doc` — generate typedoc documentation

## Project structure

- `lib/` — library source
  - `types.ts` — core types: `Parser`, `ParserSuccess`, `ParserFailure`, `CaptureParser`, etc.
  - `parsers.ts` — primitive parsers: `char`, `str`, `word`, `digit`, `regex`, etc.
  - `combinators.ts` — combinators: `many`, `or`, `seq`, `seqR`, `seqC`, `map`, `capture`, `between`, `sepBy`, `optional`, `not`, `lazy`, `buildExpressionParser`, etc.
  - `position.ts` — position tracking: `getOffset`, `getPosition`, `withSpan`, `buildLineTable`, `offsetToPosition`
  - `trace.ts` — debug tracing, `setInputStr`/`getInputStr`, `getDiagnostics`
  - `tarsecError.ts` — `TarsecError` class with line/column info
  - `utils.ts` — internal helpers (tree traversal, string escaping)
  - `parsers/within.ts` — `within` combinator for searching within input
  - `index.ts` — re-exports everything from the above modules
- `tests/` — vitest tests mirroring lib structure
  - `parsers/` — tests for individual parsers
  - `combinators/` — tests for combinators
  - `integration/` — integration tests (backtracking, captures)
  - `examples/` — example parsers (markdown, google search query)

## Architecture

- A `Parser<T>` is a function `(input: string) => ParserResult<T>`
- `ParserResult<T>` is either `ParserSuccess<T>` (with `result` and `rest`) or `ParserFailure` (with `message` and `rest`)
- `CaptureParser<T, C>` extends this with a `captures` object for named captures
- `rest` is the remaining unparsed string — position is derived from `originalInput.length - rest.length`
- `setInputStr` stores the original input in a module-level variable; `getInputStr` retrieves it. This is used by `getDiagnostics` and the position module for computing offsets
- `seq` uses a tree-based backtracking system (`createTree`, `ParserNode`) to try alternatives
- `or` returns a `nextParser` field on success to enable lazy backtracking in `seq`
- `lazy(() => parser)` enables recursive parser definitions by deferring evaluation
- `buildExpressionParser(atom, operatorTable)` handles operator precedence and associativity for expression parsing. Operator table is ordered highest-to-lowest precedence. Supports left/right associativity and auto-generates `()`-based paren parsing (overridable via third arg).

## Conventions

- Parsers are wrapped in `trace(name, fn)` for debug output (enabled via `DEBUG=1` env var)
- Tests use `@/lib/...` path alias (configured in vitest)
- `seqR(...parsers)` returns results array, `seqC(...parsers)` returns merged captures — both use rest params, not an array argument
- `success(result, rest)` and `failure(message, rest)` are the standard constructors
