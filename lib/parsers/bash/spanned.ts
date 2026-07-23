import { getPosition, Position, Span, withSpan } from "../../position.js";
import { Parser, ParserSuccess, success } from "../../types.js";

/** Wrap a parser that returns a node-without-span into one that returns the
 * node with its span filled in. Use as `lexeme(spanned(p))` — lexeme outside —
 * so the span excludes trailing whitespace.
 *
 * NOTE: this clones the node (`{ ...value, span }`). Do not use it for nodes
 * whose object identity matters (the heredoc redirect registers itself in the
 * pending queue and is mutated later — it builds its span by hand). */
export function spanned<T extends { span: Span }>(
  parser: Parser<Omit<T, "span">>,
): Parser<T> {
  return (input: string) => {
    const result = withSpan(parser)(input);
    if (!result.success) return result;
    return success(
      { ...result.result.value, span: result.result.span } as T,
      result.rest,
    );
  };
}

/** Current position at `input`. `getPosition` is zero-width and cannot fail;
 * it requires `setInputStr` to have been called with the full source. */
export function positionAt(input: string): Position {
  return (getPosition(input) as ParserSuccess<Position>).result;
}

/** The span from the start of `first` to the end of `last`. */
export function spanOf(first: { span: Span }, last: { span: Span }): Span {
  return { start: first.span.start, end: last.span.end };
}
