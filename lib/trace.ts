import { ParserResult, Parser, PlainObject } from "./types";
import { escape, round } from "./utils";
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
let counts: Record<string, number> = {};
let times: Record<string, number> = {};
let debugFlag = !!process.env.DEBUG;

let stepCount = 0;
let stepLimit = -1;

export function trace(name: string, parser: any): any {
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

export function printTime(name: string, callback: Function) {
  const time = parserTime(callback);
  if (time) {
    console.log(`⏱ ${name} -- time: ${round(time)}ms`);
  }
}

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
