import type { Position } from "./position.js";
import type { ParserFailure, ParserResult } from "./types.js";

/** One cached call: the input a memoized parser saw, and what it returned. */
export type MemoEntry = { input: string; result: ParserResult<any> };

/**
 * One `memo`'s cache. Entries are grouped by input length, not keyed by
 * the input string: V8 copies a string in full when it becomes a Map
 * key, so keying by the input stored a copy of the rest of the file per
 * entry (4.5 GB on a 190 KB file). Stored as a value, the input stays a
 * slice of the source.
 *
 * During a parse every input is the tail of the same source, so each
 * length holds one entry. A parser called directly on unrelated strings,
 * as tests do, can put several entries under one length.
 */
export type MemoCache = {
  byLength: Map<number, MemoEntry[]>;
  /** Every entry by an increasing id, so the first one is the oldest.
   *  Its size is the count the size limit checks. */
  byAge: Map<number, MemoEntry>;
  nextId: number;
};

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
  memoCaches: Map<number, MemoCache>;
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
