import { trace } from "../trace";
import { BetweenWithinResult, Parser, failure, success } from "../types";

export function within(parser: Parser<string>): Parser<BetweenWithinResult[]> {
  return trace("within", (input: string) => {
    let start = 0;
    let current = 0;
    const results: BetweenWithinResult[] = [];

    while (current < input.length) {
      const parsed = parser(input.slice(current));

      if (parsed.success) {
        const unmatchedValue = input.slice(start, current);
        if (unmatchedValue.length > 0) {
          results.push({
            type: "unmatched",
            value: unmatchedValue,
          });
        }

        results.push({
          type: "matched",
          value: parsed.result,
        });

        current += parsed.result.length;
        start = current;
      } else {
        current += 1;
      }
    }

    if (start < current) {
      results.push({
        type: "unmatched",
        value: input.slice(start, current),
      });
    }
    return success(results, "");
  });
}