import { trace } from "../trace";
import { BetweenWithinResult, Parser, failure, success } from "../types";

export function betweenWithin(
  parser: Parser<string>
): Parser<BetweenWithinResult[]> {
  return trace("betweenWithin", (input: string) => {
    let start = 0;
    let current = 0;
    let currentlyMatching = false;
    const results: BetweenWithinResult[] = [];

    while (current < input.length) {
      const parsed = parser(input.slice(current));

      if (parsed.success) {
        if (currentlyMatching) {
          const value = input.slice(start, current + parsed.result.length);
          if (value.length > 0) {
            results.push({
              type: "matched",
              value,
            });
          }
          current += parsed.result.length;
          start = current;
          currentlyMatching = false;
        } else {
          const value = input.slice(start, current);
          if (value.length > 0) {
            results.push({
              type: "unmatched",
              value,
            });
          }

          currentlyMatching = true;
          start = current;
          current += parsed.result.length;
        }
      } else {
        current += 1;
      }
    }

    if (start < current) {
      if (currentlyMatching) {
        return failure("unexpected end of input", "");
      } else {
        results.push({
          type: "unmatched",
          value: input.slice(start, current),
        });
      }
    }
    return success(results, "");
  });
}
