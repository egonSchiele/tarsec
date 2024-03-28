import { ParserResult, Parser, PlainObject } from "./types";
import { escape, round } from "./utils";
const STEP = 2;

/**
 * This function is used internally by the `trace` function to create the string for each step.
 * @param name - debug name for parser
 * @param result - parser result
 * @returns - A formatted string that describes the parser's result
 */
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
let counts: Record<string, number> = {};
let times: Record<string, number> = {};
let debugFlag = !!process.env.DEBUG;

let stepCount = 0;
let stepLimit = -1;

/**
 * This function is used internally with debug mode. Given a parser and a debug name for it,
 * when the parser is called, `trace` will:
 * 1. Print a line when the parser starts
 * 2. print a line when the parser ends, indicating success or failure.
 * 3. If the parser returns any captures, print the captures.
 * 4. Count the number of times this parser has been run.
 * 5. Track the total time this parser has taken.
 * 6. Track the total number of steps your parser has taken (a step equals one parser invocation).
 * So, for example, you may find out that your parser to parse Markdown has taken 50 steps to parse that file.
 *
 * All this happens only if debug mode is on, which you can turn on by using `parserDebug`, or setting the env var `DEBUG` to `1`.
 *
 * Caveat: If you have debug mode on through an environment variable, `trace` will capture counts and times
 * for all parsers across your entire application. If you want to profile just a particular section of code, use `parserDebug` instead.
 * If you *do* want to track constant times for all parsers, don't use `parserDebug` as it will reset those.
 *
 *
 * `trace` works with tarsec's built-in parsers out of the box. You can easily set it up to work with your custom parser too.
 *
 * For example, if your parser looks like this:
 *
 * ```ts
 * const myParser = (input:string) => {
 *   if (input === "hello") {
 *    return { success: true, result: "hello", rest: "" };
 *  }
 * return { success: false, message: "expected hello", rest: input };
 * }
 * ```
 *
 * You can wrap it in `trace` like this:
 *
 * ```ts
 * const myParser = trace("myParser", (input:string) => {
 *  if (input === "hello") {
 *   return { success: true, result: "hello", rest: "" };
 * }
 * return { success: false, message: "expected hello", rest: input };
 * });
 * ```
 *
 * Now, when you run `myParser("hello")` with debug mode on,
 * you will see the debug output.
 *
 * Some parsers, like `seq`, are very general. You might have a few parser that use `seq`.
 * So when you see `seq` debug output, you might not know which `seq` parser that means.
 * ou can pass `seq` a debug name as an optional third argument to be used in the debug output.
 * This name is used to track count and time, so using this name will also mean this `seq` parser's
 * count and time are tracked separately from the other `seq` parsers, which might be useful.
 *
 * @param name - debug name for parser
 * @param parser - parser to run
 * @returns
 */
export function trace(name: string, parser: any): any {
  if (stepLimit > 0 && stepCount > stepLimit) {
    throw new Error(
      `parser step limit of ${stepLimit} exceeded, parser may be in an infinite loop`
    );
  }
  return (input: string) => {
    if (debugFlag) {
      console.log(" ".repeat(level) + `🔍 ${name} -- input: ${escape(input)}`);

      let result: any;
      const time = parserTime(() => {
        level += STEP;
        result = parser(input);
        level -= STEP;
      });

      counts[name] = counts[name] ? counts[name] + 1 : 1;
      stepCount += 1;
      if (time) {
        times[name] = times[name] ? times[name] + time : time;
      }

      console.log(" ".repeat(level) + resultToString(name, result));
      if (result.success && result.captures) {
        console.log(
          " ".repeat(level) +
            `⭐ ${name} -- captures: ${JSON.stringify(result.captures)}`
        );
      }
      return result;
    } else {
      return parser(input);
    }
  };
}

/**
 * Utility timing function. Given a callback, it times the callback
 * and returns its runtime in milliseconds. It uses `performance.now()` to do this.
 * If `performance.now()` is not available, it returns null.
 *
 * @param callback - callback to time
 * @returns - time in milliseconds
 */
export function parserTime(callback: Function): number | null {
  if (performance && performance.now) {
    const start = performance.now();
    callback();
    const end = performance.now();
    return end - start;
  } else {
    console.error("performance.now not available");
    callback();
    return null;
  }
}

/**
 * Wrapper for parser time. Instead of returning the time in milliseconds,
 * it console.logs it, in a nicely formatted string.
 * @param name - debug name for timing
 * @param callback - callback to time
 */
export function printTime(name: string, callback: Function) {
  const time = parserTime(callback);
  if (time) {
    console.log(`⏱ ${name} -- time: ${round(time)}ms`);
  }
}

/**
 * This is the recommended way to run a parser in debug mode.
 * Takes a callback and turns debug mode on just for the callback.
 * This enables `trace` to capture all sorts of information
 * about any executed parsers and print them to console.log.
 * `trace` tracks counts and times but they don't actually get reset to zero
 * unless you use this function to wrap your code.
 *
 * @param name - debug name
 * @param callback - callback to run in debug mode
 */
export function parserDebug(name: string, callback: Function) {
  debugFlag = true;
  stepCount = 0;
  counts = {};
  times = {};
  printTime(name, callback);
  debugFlag = false;
  console.log("\n");
  console.log(`📊 ${name} -- counts:`);
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of sorted) {
    console.log(`  ${name}: ${count}`);
  }
  console.log("\n");
  console.log(`📊 ${name} -- times:`);
  const sortedTimes = Object.entries(times).sort((a, b) => b[1] - a[1]);
  for (const [name, time] of sortedTimes) {
    console.log(`  ${name}: ${round(time)}ms`);
  }
  console.log("\n");
  console.log(`📊 ${name} -- step count: ${stepCount}`);
  console.log("\n\n");
  stepCount = 0;
  counts = {};
  times = {};
}

/**
 * Utility function to limit the number of steps a parser can take.
 * This is useful for avoiding infinite loops in your parser.
 * @param limit - number of steps to limit the parser to
 * @param callback - callback to run
 */
export function limitSteps(limit: number, callback: Function) {
  stepLimit = limit;
  callback();
  stepLimit = -1;
}
