import { resetMemos } from "../../combinators.js";
import { TarsecErrorData } from "../../tarsecError.js";
import { getDiagnostics, setInputStr } from "../../trace.js";
import { ParserFailure, ParserSuccess } from "../../types.js";
import { script } from "./grammar.js";
import { resetHeredocQueue } from "./heredocQueue.js";
import { BashScript } from "./types.js";

export type BashParseFailure = ParserFailure & { diagnostics: TarsecErrorData };

/** Parse a bash script. This is the entry point that owns global-state setup:
 * it registers the input for span/error tracking, resets the heredoc queue,
 * and clears memo caches. Use the raw `script` parser only if you do all of
 * that yourself. */
export function parseBash(
  input: string,
): ParserSuccess<BashScript> | BashParseFailure {
  setInputStr(input);
  resetHeredocQueue();
  resetMemos();
  const result = script(input);
  if (result.success) return result;
  return { ...result, diagnostics: getDiagnostics(result, result.rest) };
}
