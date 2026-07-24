import { getInputStr } from "./trace.js";
import { Parser, success } from "./types.js";
import { getParseState } from "./parseState.js";

export type Position = {
  offset: number;
  line: number;
  column: number;
};

export type Span = {
  start: Position;
  end: Position;
};

/**
 * Build a lookup table of line-start offsets for a given source string.
 * This allows O(log n) offset-to-position conversion via binary search.
 */
export function buildLineTable(source: string): number[] {
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }
  return lineStarts;
}

// One-entry cache so `withSpan` / `getPosition` don't rebuild the line
// table on every invocation. Parses run sequentially with a single
// `setInputStr` source, so a most-recently-seen cache is sufficient and
// avoids O(num_calls * source.length) work during a parse.
// Deliberately NOT part of ParseState: keyed by source-string identity,
// so a nested parse's source misses and rebuilds — it can never serve a
// stale table across parse states.
let cachedSource: string | null = null;
let cachedLineTable: number[] = [0];

function getLineTable(source: string): number[] {
  if (source === cachedSource) return cachedLineTable;
  cachedSource = source;
  cachedLineTable = buildLineTable(source);
  return cachedLineTable;
}

/**
 * Convert an absolute offset into a line and column using a precomputed line table.
 * Both line and column are 0-based.
 */
export function offsetToPosition(
  lineTable: number[],
  offset: number,
): Position {
  // binary search for the line
  let lo = 0;
  let hi = lineTable.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineTable[mid] <= offset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return {
    offset,
    line: lo,
    column: offset - lineTable[lo],
  };
}

/**
 * Compose an inner-parse position with a base position (the point in the
 * enclosing input where the inner input begins). Offsets and lines add;
 * the base column applies only while still on the base line (inner line 0).
 */
export function composePosition(base: Position, pos: Position): Position {
  if (base.offset === 0 && base.line === 0 && base.column === 0) {
    return pos;
  }
  const column = pos.line === 0 ? base.column + pos.column : pos.column;
  return {
    offset: base.offset + pos.offset,
    line: base.line + pos.line,
    column,
  };
}

/**
 * A zero-width parser that returns the current offset into the input string.
 * Requires `setInputStr` to have been called with the full input.
 * Inside `runNested`, the offset is reported in the enclosing parse's
 * coordinates (the state's `basePosition` is added).
 */
export const getOffset: Parser<number> = (input: string) => {
  const source = getInputStr();
  const base = getParseState().basePosition;
  return success(base.offset + (source.length - input.length), input);
};

/**
 * A zero-width parser that returns the current position (offset, line, column).
 * Requires `setInputStr` to have been called with the full input.
 * Inside `runNested`, the position is reported in the enclosing parse's
 * coordinates (composed with the state's `basePosition`).
 */
export const getPosition: Parser<Position> = (input: string) => {
  const source = getInputStr();
  const offset = source.length - input.length;
  const lineTable = getLineTable(source);
  const base = getParseState().basePosition;
  return success(
    composePosition(base, offsetToPosition(lineTable, offset)),
    input,
  );
};

/**
 * Wraps a parser so that its result includes span information (start and end positions).
 * Useful for building ASTs with location data for language servers / editors.
 * Requires `setInputStr` to have been called with the full input.
 *
 * @example
 * ```ts
 * const locatedWord = withSpan(word);
 * // Result: { value: "hello", span: { start: { offset: 0, line: 0, column: 0 }, end: { offset: 5, line: 0, column: 5 } } }
 * ```
 */
export function withSpan<T>(
  parser: Parser<T>,
): Parser<{ value: T; span: Span }> {
  return (input: string) => {
    const source = getInputStr();
    const lineTable = getLineTable(source);
    const startOffset = source.length - input.length;
    const result = parser(input);
    if (!result.success) return result;
    const endOffset = source.length - result.rest.length;
    const base = getParseState().basePosition;
    return success(
      {
        value: result.result,
        span: {
          start: composePosition(base, offsetToPosition(lineTable, startOffset)),
          end: composePosition(base, offsetToPosition(lineTable, endOffset)),
        },
      },
      result.rest,
    );
  };
}
