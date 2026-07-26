/**
 * A deliberately small bash parser: a narrow subset of bash that is either
 * parsed correctly or rejected, never silently mis-parsed. Intended for
 * contexts where acting on a wrong parse is worse than rejecting a command
 * outright — an unsupported construct costs you a rejection, not a wrong
 * answer.
 *
 * `bashParser` is the entry point. It parses a whole script and fails
 * unless the entire input is consumed.
 *
 * ```ts
 * const result = bashParser("git commit -m 'hi'");
 * if (result.success) console.log(result.result);
 * ```
 *
 * The AST is shaped for consumers asking "what command is this, and what
 * does it operate on?" — a `SimpleCommand` carries `command`, `args`,
 * `assignments` and `redirects` as separate fields. There is no
 * `subcommands` field: no syntactic rule separates `git status` from
 * `echo status`, so `args` is one ordered list.
 *
 * SUPPORTED
 * - Simple commands: a name, arguments, and `name=value` assignments
 *   before it. A line that is only an assignment (`FOO=bar`) is a command
 *   with a null `command`.
 * - Words: bare words (letters, digits, and `_ - . = : +`), paths
 *   (any word containing `/`), single and double quotes, `$var` and
 *   `${var}`, and `-f` / `--flag` / `--flag=value` flags.
 * - Double quotes interpolate `$var` and handle `\"`, `\\`, `\$`, `` \` ``.
 * - Words built from adjacent parts: `$HOME/bin`, `"a"b`, `"$HOME"/x`.
 * - Redirects: `>`, `>>`, `<`, and `&>`, with an optional attached file
 *   descriptor on the first three (`2> err.txt`).
 * - `&&` / `||` chains (one precedence level, left-associative, as in
 *   bash) and `( ... )` grouping.
 * - Commands separated by `;` or newlines, including CRLF.
 *
 * REJECTED, and worth knowing because a reader would not predict them
 * - Pipelines (`|`), background (`&`), and `;` inside `( ... )` — so
 *   `(a && b) || c` parses but `a && (b; c)` does not.
 * - Reserved words ANYWHERE, not only at command position: `echo if` and
 *   `echo done` are valid bash and are rejected here.
 * - `--` as an end-of-flags marker, so `git checkout -- file` is rejected,
 *   as is a bare `-` for stdin (`cat -`).
 * - Compound commands: `if`, `for`, `while`, `case`, function definitions.
 * - Command substitution `$(...)`, backticks, arithmetic `$((...))`,
 *   parameter expansion beyond `${name}` (`${x:-y}`), and the special
 *   parameters `$?` / `$@` / `$$`.
 * - Globs (`*`, `?`, `[...]`), tilde (`~/x`), brace expansion, heredocs
 *   and here-strings, `2>&1`, comments (`#`), and escapes outside double
 *   quotes (`echo a\ b`).
 * - Characters outside the word set above, including `@` and `%`.
 */
export * from "./types.js";
export * from "./parsers.js";
