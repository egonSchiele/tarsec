import { getDiagnostics } from "../../position.js";
import { TarsecErrorData } from "../../tarsecError.js";
import { setInputStr } from "../../trace.js";
import { ParserFailure, ParserSuccess } from "../../types.js";
import { script } from "./grammar.js";
import { resetHeredocQueue } from "./heredocQueue.js";
import { BashScript } from "./types.js";

export type BashParseFailure = ParserFailure & { diagnostics: TarsecErrorData };

/** Parse a bash script. This is the entry point that owns global-state setup:
 * it registers the input for span/error tracking and resets the heredoc
 * queue. Use the raw `script` parser only if you do both yourself.
 *
 * (No memo caches to clear: the bash grammar deliberately uses no `memo` —
 * see the prohibition in heredocQueue.ts — and `resetMemos` is global, so
 * calling it here would wipe caches belonging to unrelated parsers.) */
export function parseBash(
  input: string,
): ParserSuccess<BashScript> | BashParseFailure {
  setInputStr(input);
  resetHeredocQueue();
  const result = script(input);
  if (result.success) return result;
  return { ...result, diagnostics: getDiagnostics(result, result.rest) };
}
