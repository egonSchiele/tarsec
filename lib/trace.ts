import { ParserResult, Parser, PlainObject } from "./types";
import { escape } from "./utils";
const STEP = 2;

export function resultToString<T>(
  name: string,
  result: ParserResult<T>
): string {
  if (result.success) {
    return `✅ ${name} -- match: ${escape(result.result)}, rest: ${escape(
      result.rest
    )}`;
  }
  return `❌ ${name} -- message: ${escape(result.message)}, rest: ${escape(
    result.rest
  )}`;
}

let level = 0;

export function trace(name: string, parser: any): any {
  return (input: string) => {
    if (process.env.DEBUG) {
      console.log(" ".repeat(level) + `🔍 ${name} -- input: ${escape(input)}`);
    }
    level += STEP;
    const result = parser(input);
    level -= STEP;
    if (process.env.DEBUG) {
      console.log(" ".repeat(level) + resultToString(name, result));
      if (result.success && result.captures) {
        console.log(
          " ".repeat(level) +
            `⭐ ${name} -- captures: ${JSON.stringify(result.captures)}`
        );
      }
    }
    return result;
  };
}
