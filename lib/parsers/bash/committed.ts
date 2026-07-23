import { ParserFailure } from "../../types.js";

/** A failure from a parser that had already committed to its construct —
 * e.g. a redirect that consumed `>` but found no target, or a word scan that
 * saw an opening quote with no close. Unlike an ordinary failure ("this
 * alternative doesn't apply here"), a committed failure means "this IS the
 * right construct, and it's malformed" — so alternation and element loops
 * must propagate it instead of trying other branches, keeping the error
 * message and position on the offending token. */
export type CommittedFailure = ParserFailure & { committed: true };

export function committedFailure(
  message: string,
  rest: string,
): CommittedFailure {
  return { success: false, message, rest, committed: true };
}

export function isCommittedFailure(result: {
  success: boolean;
}): result is CommittedFailure {
  return !result.success && (result as CommittedFailure).committed === true;
}
