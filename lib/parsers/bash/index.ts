/**
 * A fail-closed bash parser: a deliberately smaller bash syntax that is
 * either parsed correctly or rejected with a parse error — never silently
 * mis-parsed. Intended for contexts where acting on a wrong parse is
 * worse than rejecting a valid script.
 *
 * Soundness comes from two structural rules plus explicit cuts:
 *
 * 1. Separators between commands are MANDATORY (`;`, `&`, or newline),
 *    so text left over by a construct becomes a parse error instead of a
 *    phantom second command.
 * 2. No permissive fallbacks: a `$`, backtick, or `{`/`}` that isn't part
 *    of a supported construct fails the parse instead of degrading to a
 *    literal.
 *
 * Supported: words with single/double quoting, escapes, `$var`, `${...}`,
 * recursive `$(...)`, `$((...))`; assignments; redirects (fd prefixes,
 * `2>&1`, `>&2`, `<<<`); pipelines with `!`; `&&`/`||`; `&` background;
 * `;`/newline separators; comments and line continuations; `if`/`elif`/
 * `else`, `while`/`until`, `for`, `case`, subshells, `{ }` groups,
 * `(( ))`, and both function-definition styles.
 *
 * Deliberately UNSUPPORTED (valid bash, rejected here — fail closed):
 * arrays `x=(...)`, append `x+=`, ANSI-C `$'...'` / locale `$"..."`,
 * backtick substitution (use `$()`), `[[ ]]` (its `]]` delimiter can
 * appear inside quoted operands, so scanning for it is unsound; `[` is an
 * ordinary command and still works), brace expansion `{a,b}` and literal
 * `{`/`}` in words (quote them), bare `$` (write `\$` or '$'), heredocs,
 * process substitution `<()`, `select`/`coproc`/`time`.
 *
 * Kept as RAW TEXT (delimiters are sound, contents are not interpreted):
 * `${...}` (balanced braces), `$((...))` and `((...))` (balanced parens —
 * quotes are not delimiters in bash arithmetic).
 *
 * Out of scope by design, as in bash's own parser: glob (`*`, `?`) and
 * tilde expansion happen after parsing; consumers see the literal word
 * text and decide for themselves.
 *
 * For error positions, use the standard tarsec flow:
 *
 * ```ts
 * setInputStr(input);
 * resetRightmostFailure();
 * const result = bashParser(input);
 * if (!result.success) console.log(getErrorMessage());
 * ```
 */
export * from "./types.js";
export * from "./lexemes.js";
export * from "./words.js";
export * from "./commands.js";
export * from "./lists.js";

import { seq } from "../../combinators.js";
import { eof } from "../../parsers.js";
import { Parser } from "../../types.js";
import { list0 } from "./lists.js";
import { List } from "./types.js";

/** Parse a whole script (or any command list) to a `List`. Fails unless
 * the entire input is consumed. */
export const bashParser: Parser<List> = seq(
  [list0, eof],
  (results) => results[0] as List,
);
