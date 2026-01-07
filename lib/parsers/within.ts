import { trace } from "../trace.js";
import { WithinResult, Parser, failure, success } from "../types.js";

/**
 * `within` is a funny combinator. It finds zero or more instances of `parser` within the input.
 * It always succeeds and returns an array of results, each one being a matched or unmatched string.
 * You could think of "within" as a glorified search. For example, you can use it to
 * look for quoted text or multiline comments within an input.
 *
 * Example:
 *
 * ```ts
 *   const multilineComments = seq(
 *   [str("/*"), manyWithJoin(noneOf(`*\/`)), str("*\/")],
 *   (results: string[]) => results.join("")
 * );
 *   const parser = within(multilineComments);
 *   const input = `code before /* this is a comment *\/ code after /* another comment *\/ end`;
 *
 *   const result = parser(input);
 *   console.log(JSON.stringify(result, null, 2));
 * ```
 *
 * Result:
 *
 * ```json
 * {
 * "success": true,
 * "result": [
 *   {
 *     "type": "unmatched",
 *     "value": "code before "
 *   },
 *   {
 *     "type": "matched",
 *     "value": "/* this is a comment *\/"
 *   },
 *   {
 *     "type": "unmatched",
 *     "value": " code after "
 *   },
 *   {
 *     "type": "matched",
 *     "value": "/* another comment *\/"
 *   },
 *   {
 *     "type": "unmatched",
 *     "value": " end"
 *   }
 * ],
 * "rest": ""
 * }
 * ```
 *
 * This parser is somewhat expensive, as it will go down the input string one character
 * at a time, applying the given parser each time.
 *
 * @param parser - parser to find within the input
 * @returns - an array of matched and unmatched strings
 */
export function within<T>(parser: Parser<T>): Parser<WithinResult<T>[]> {
  return trace("within", (input: string) => {
    let start = 0;
    let current = 0;
    const results: WithinResult<T>[] = [];
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

        current = input.length - parsed.rest.length;
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
