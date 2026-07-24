import type { Position } from "./position.js";
import type { ParserFailure, ParserResult } from "./types.js";

/**
 * All mutable state belonging to one running parse. Everything tarsec
 * used to keep in scattered module-level variables lives here, so a
 * nested parse (see `runNested`) can swap in a fresh state and restore
 * the old one by reassigning a single reference.
 */
export type ParseState = {
  inputStr: string;
  rightmostFailurePos: number;
  rightmostFailureExpected: string[];
  /** Per-`memo`-instance caches, keyed by each memo's numeric id. */
  memoCaches: Map<number, Map<string, ParserResult<any>>>;
  /** Offset added to every derived position, so a nested parse reports
   *  positions in the enclosing parse's coordinates. Zero at top level. */
  basePosition: Position;
  /** The most recent committed failure of this parse, if any. Preferred
   *  over the rightmost record by `getErrorMessage`. See `committed`. */
  committedFailure: ParserFailure | null;
};

const ZERO_POSITION: Position = { offset: 0, line: 0, column: 0 };

export function createParseState(
  inputStr: string,
  basePosition: Position = ZERO_POSITION,
): ParseState {
  return {
    inputStr,
    rightmostFailurePos: -1,
    rightmostFailureExpected: [],
    memoCaches: new Map(),
    basePosition: { ...basePosition },
    committedFailure: null,
  };
}

let currentState: ParseState = createParseState("");

export function getParseState(): ParseState {
  return currentState;
}

/** Replace the current parse state, returning the previous one. */
export function swapParseState(next: ParseState): ParseState {
  const previous = currentState;
  currentState = next;
  return previous;
}
