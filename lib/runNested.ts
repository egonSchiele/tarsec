import { Parser, ParserResult } from "./types.js";
import type { Position } from "./position.js";
import { createParseState, swapParseState } from "./parseState.js";

export type NestedOptions = {
  /** Positions in the sub-parse's results are offset by this, so spans
   *  and error messages come out in the ENCLOSING parse's coordinates.
   *  Defaults to zero (positions relative to `input`). */
  basePosition?: Position;
};

/**
 * Run a complete parse of `input` with its own input string, rightmost-
 * failure record, and memo caches, restoring the enclosing parse's state
 * on exit — success, failure, or throw. The one supported way to run a
 * parse inside another parse.
 *
 * @example
 * ```ts
 * // While parsing a file, parse an embedded snippet as its own program,
 * // reporting positions relative to the enclosing file:
 * const embedded = runNested(exprParser, snippetText, {
 *   basePosition: openingPosition, // where the snippet starts in the file
 * });
 * ```
 */
export function runNested<T>(
  parser: Parser<T>,
  input: string,
  opts?: NestedOptions,
): ParserResult<T> {
  // Deliberately does NOT call setInputStr: createParseState pre-sets
  // inputStr and a fresh rightmost record (replicating setInputStr's
  // reset), and calling it here would clobber the fresh state's fields.
  const savedState = swapParseState(
    createParseState(input, opts?.basePosition),
  );
  try {
    return parser(input);
  } finally {
    swapParseState(savedState);
  }
}
