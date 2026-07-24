import {
  restoreRightmostFailure,
  saveRightmostFailure,
} from "../../rightmostFailure.js";
import { Parser, ParserFailure } from "../../types.js";

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

/** Run one alternative of a committed-aware alternation. Failure recordings
 * are discarded (like core `quietly`) UNLESS the parser committed — a
 * committed failure owns the error message, so its recording must survive.
 * Success recordings are also discarded: anything a successful alternative
 * recorded was a rejected sub-branch, not an expectation of the grammar. */
export function attempt<T>(parser: Parser<T>): Parser<T> {
  return (input: string) => {
    const saved = saveRightmostFailure();
    const result = parser(input);
    if (!isCommittedFailure(result)) restoreRightmostFailure(saved);
    return result;
  };
}
