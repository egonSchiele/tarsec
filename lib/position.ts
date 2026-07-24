import { getInputStr } from "./trace.js";
import { TarsecErrorData } from "./tarsecError.js";
import { Parser, ParserFailure, success } from "./types.js";

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
  const lineTable = getLineTable(source);
  return success(offsetToPosition(lineTable, offset), input);
};

/**
 * Formats a parse failure into a `TarsecErrorData`: line/column of the
 * failure, plus a pretty message previewing the failing line with an
 * aligned caret. Long lines are windowed around the caret. Requires
 * `setInputStr` to have been called with the full input.
 *
 * Lives here (rather than trace.ts) because it's built on the memoized
 * line table this module already maintains.
 */
export function getDiagnostics(
  result: ParserFailure,
  input: string,
  _message?: string,
): TarsecErrorData {
  const inputStr = getInputStr();
  const prefix = "Near: ";
  const message = _message || result.message || "Parsing failed";
  if (inputStr.length === 0) {
    return {
      line: 0,
      column: 0,
      length: 0,
      prettyMessage: [`${prefix}${input.substring(1, 100)}`, message].join("\n"),
      message,
    };
  }
  const index = inputStr.length - input.length;
  const lineTable = getLineTable(inputStr);
  const position = offsetToPosition(lineTable, index);

  // Preview the failing line only, windowed around the caret so long lines
  // stay readable, with the caret aligned to the previewed slice.
  const lineStart = lineTable[position.line];
  let lineEnd = inputStr.indexOf("\n", lineStart);
  if (lineEnd === -1) lineEnd = inputStr.length;
  const windowRadius = 30;
  let previewStart = lineStart;
  if (position.column > windowRadius) {
    previewStart = lineStart + position.column - windowRadius;
  }
  const previewEnd = Math.min(lineEnd, previewStart + 2 * windowRadius);
  const preview = inputStr.slice(previewStart, previewEnd);
  const caretColumn = index - previewStart;
  const messages = [
    `${prefix}${preview}`,
    `${" ".repeat(prefix.length + caretColumn)}^`,
    message,
  ];
  return {
    line: position.line,
    column: position.column,
    length: 1,
    prettyMessage: messages.join("\n"),
    message,
  };
}

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
