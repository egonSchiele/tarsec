import { getInputStr } from "./trace.js";
import { buildLineTable, offsetToPosition, composePosition } from "./position.js";
import { getParseState } from "./parseState.js";

export function resetRightmostFailure() {
  const state = getParseState();
  state.rightmostFailurePos = -1;
  state.rightmostFailureExpected = [];
  state.committedFailure = null;
}

/**
 * Record an expected alternative at the current failure position.
 * If this position is further right than any previous failure, it replaces the previous.
 * If it's at the same position, it adds to the list of expectations (with dedup).
 * No-op if `setInputStr` has not been called.
 *
 * @param input - the remaining input at the point of failure
 * @param expected - a human-readable description of what was expected
 */
export function recordFailure(input: string, expected: string) {
  const state = getParseState();
  const source = getInputStr();
  if (source.length === 0) return;
  const pos = source.length - input.length;
  if (pos > state.rightmostFailurePos) {
    state.rightmostFailurePos = pos;
    state.rightmostFailureExpected = [expected];
  } else if (pos === state.rightmostFailurePos) {
    if (!state.rightmostFailureExpected.includes(expected)) {
      state.rightmostFailureExpected.push(expected);
    }
  }
}

/**
 * Returns the current rightmost failure position and expected alternatives,
 * or `null` if no failures have been recorded.
 */
export function getRightmostFailure(): {
  pos: number;
  expected: string[];
} | null {
  const state = getParseState();
  if (state.rightmostFailurePos < 0) return null;
  return {
    pos: state.rightmostFailurePos,
    expected: [...state.rightmostFailureExpected],
  };
}

type SavedRightmostFailure = {
  pos: number;
  expected: string[];
};

export function saveRightmostFailure(): SavedRightmostFailure {
  const state = getParseState();
  return {
    pos: state.rightmostFailurePos,
    expected: [...state.rightmostFailureExpected],
  };
}

export function restoreRightmostFailure(saved: SavedRightmostFailure) {
  const state = getParseState();
  state.rightmostFailurePos = saved.pos;
  state.rightmostFailureExpected = [...saved.expected];
}

function formatExpected(expected: string[]): string {
  if (expected.length === 1) return expected[0];
  if (expected.length === 2) return `${expected[0]} or ${expected[1]}`;
  return expected.slice(0, -1).join(", ") + ", or " + expected[expected.length - 1];
}

/**
 * Formats the rightmost failure into a human-readable error message with line and column info.
 * Returns `null` if no failures have been recorded.
 * Requires `setInputStr` to have been called.
 */
export function getErrorMessage(): string | null {
  const state = getParseState();
  if (state.rightmostFailurePos < 0) return null;
  const source = getInputStr();
  const lineTable = buildLineTable(source);
  const pos = composePosition(
    state.basePosition,
    offsetToPosition(lineTable, state.rightmostFailurePos),
  );
  const line = pos.line + 1;
  const column = pos.column + 1;
  return `Line ${line}, col ${column}: expected ${formatExpected(state.rightmostFailureExpected)}`;
}
