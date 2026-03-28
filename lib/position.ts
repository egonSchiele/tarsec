import { getInputStr } from "./trace.js";
import { Parser, success } from "./types.js";

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
 * A zero-width parser that returns the current offset into the input string.
 * Requires `setInputStr` to have been called with the full input.
 */
export const getOffset: Parser<number> = (input: string) => {
  const source = getInputStr();
  return success(source.length - input.length, input);
};

/**
 * A zero-width parser that returns the current position (offset, line, column).
 * Requires `setInputStr` to have been called with the full input.
 */
export const getPosition: Parser<Position> = (input: string) => {
  const source = getInputStr();
  const offset = source.length - input.length;
  const lineTable = buildLineTable(source);
  return success(offsetToPosition(lineTable, offset), input);
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
    const lineTable = buildLineTable(source);
    const startOffset = source.length - input.length;
    const result = parser(input);
    if (!result.success) return result;
    const endOffset = source.length - result.rest.length;
    return success(
      {
        value: result.result,
        span: {
          start: offsetToPosition(lineTable, startOffset),
          end: offsetToPosition(lineTable, endOffset),
        },
      },
      result.rest,
    );
  };
}
