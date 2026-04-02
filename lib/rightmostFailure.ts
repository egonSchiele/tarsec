import { getInputStr } from "./trace.js";
import { buildLineTable, offsetToPosition } from "./position.js";

let rightmostFailurePos = -1;
let rightmostFailureExpected: string[] = [];

export function resetRightmostFailure() {
  rightmostFailurePos = -1;
  rightmostFailureExpected = [];
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
  const source = getInputStr();
  if (source.length === 0) return;
  const pos = source.length - input.length;
  if (pos > rightmostFailurePos) {
    rightmostFailurePos = pos;
    rightmostFailureExpected = [expected];
  } else if (pos === rightmostFailurePos) {
    if (!rightmostFailureExpected.includes(expected)) {
      rightmostFailureExpected.push(expected);
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
  if (rightmostFailurePos < 0) return null;
  return { pos: rightmostFailurePos, expected: [...rightmostFailureExpected] };
}

type SavedRightmostFailure = {
  pos: number;
  expected: string[];
};

export function saveRightmostFailure(): SavedRightmostFailure {
  return { pos: rightmostFailurePos, expected: [...rightmostFailureExpected] };
}

export function restoreRightmostFailure(saved: SavedRightmostFailure) {
  rightmostFailurePos = saved.pos;
  rightmostFailureExpected = saved.expected;
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
  if (rightmostFailurePos < 0) return null;
  const source = getInputStr();
  const lineTable = buildLineTable(source);
  const pos = offsetToPosition(lineTable, rightmostFailurePos);
  const line = pos.line + 1;
  const column = pos.column + 1;
  return `Line ${line}, col ${column}: expected ${formatExpected(rightmostFailureExpected)}`;
}
