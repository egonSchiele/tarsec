/**
 * A deliberately small bash parser: a narrow, commonly-written subset of
 * bash that is either parsed correctly or rejected, never silently
 * mis-parsed. Intended for contexts where acting on a wrong parse is
 * worse than rejecting a command outright.
 *
 * The AST is shaped for consumers asking "what command is this, and what
 * arguments does it have?" — a `SimpleCommand` carries its `command`
 * name, `subcommands`, `args`, `assignments` and `redirects` as separate
 * fields, so a consumer never walks a generic word list to find them.
 *
 * ```ts
 * const result = commandParser("git commit -m 'hi'");
 * if (result.success) console.log(result.result);
 * ```
 */
export * from "./types.js";
export * from "./parsers.js";
