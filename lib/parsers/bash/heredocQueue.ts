import { trace } from "../../trace.js";
import { Parser } from "../../types.js";
import { HeredocRedirect } from "./types.js";

/** Pending heredocs registered by `<<TAG` redirects, drained (in registration
 * order) by the line-break parser. Module-level mutable state, following the
 * precedent of `setInputStr` and the rightmost-failure tracker.
 *
 * The queue is an append-only array plus a `drainedCount` head pointer:
 * entries at index >= `drainedCount` are pending; draining just advances the
 * pointer, and drained entries stay in the array until `resetHeredocQueue`.
 * That makes snapshot/restore two integer marks — no copying — while still
 * letting a restore resurrect entries a failed drain consumed. (Restored
 * entries may carry `body` values a failed drain already wrote; that's
 * harmless: a successful re-drain overwrites them, and a failed parse
 * discards the AST they belong to.)
 *
 * Invariant: every bash-grammar nonterminal that can fail after a child
 * succeeded is wrapped in `nonterminal` (= trace + `withQueueUnwind`), so
 * abandoned partial parses never leak registrations.
 *
 * Do NOT wrap parsers in `memo` at or above `redirect` in the bash grammar:
 * memo replays cached results without re-running registration. Do NOT `peek`
 * a registering parser: peek discards consumption on success, which no
 * failure-path unwind can see. */
const queue: HeredocRedirect[] = [];
let drainedCount = 0;

/** Clear the queue. Called by `parseBash` at the start of each parse. */
export function resetHeredocQueue(): void {
  queue.length = 0;
  drainedCount = 0;
}

export function registerHeredoc(node: HeredocRedirect): void {
  queue.push(node);
}

/** The not-yet-drained heredocs, oldest first, as a fresh copy — callers
 * can't corrupt the queue through it. Called rarely (end-of-input checks,
 * tests); use `hasPendingHeredocs` for cheap emptiness checks. */
export function pendingHeredocs(): HeredocRedirect[] {
  return queue.slice(drainedCount);
}

export function hasPendingHeredocs(): boolean {
  return drainedCount < queue.length;
}

const NO_HEREDOCS: HeredocRedirect[] = [];

/** Remove and return all pending heredocs, oldest first. */
export function drainHeredocs(): HeredocRedirect[] {
  if (drainedCount === queue.length) return NO_HEREDOCS;
  const drained = queue.slice(drainedCount);
  drainedCount = queue.length;
  return drained;
}

/** The queue state as two integer marks. Restoring moves both marks back:
 * entries registered after the snapshot are dropped (they sit past the
 * restored length), and entries drained after it become pending again (they
 * sit between the restored head and length, still in the array). */
export type HeredocQueueSnapshot = { drainedCount: number; length: number };

export function snapshotHeredocs(): HeredocQueueSnapshot {
  return { drainedCount, length: queue.length };
}

export function restoreHeredocs(snapshot: HeredocQueueSnapshot): void {
  drainedCount = snapshot.drainedCount;
  queue.length = snapshot.length;
}

/** Snapshot on entry, restore on failure, keep on success. Runs on every
 * nonterminal entry, so it works with plain integer locals — no allocation. */
export function withQueueUnwind<T>(parser: Parser<T>): Parser<T> {
  return (input: string) => {
    const savedDrainedCount = drainedCount;
    const savedLength = queue.length;
    const result = parser(input);
    if (!result.success) {
      drainedCount = savedDrainedCount;
      queue.length = savedLength;
    }
    return result;
  };
}

/** A bash grammar nonterminal: named in DEBUG=1 trace output, and unwinds the
 * heredoc queue on failure. Every nonterminal that can fail after a child
 * succeeded MUST be built with this. */
export function nonterminal<T>(name: string, parser: Parser<T>): Parser<T> {
  return trace(`bash:${name}`, withQueueUnwind(parser));
}

/** Scan a heredoc body. The body is every line before the first line that
 * equals `tag`; for `<<-` (`stripTabs`), leading tabs are stripped from the
 * body lines and from the delimiter comparison, matching bash.
 *
 * Returns the body text, the input at the delimiter line (`delimRest`, for
 * computing `bodySpan`), and the input after the delimiter line (`rest`).
 * A delimiter at end of input without a trailing newline is accepted,
 * matching bash. Returns null if no delimiter line is found. */
export function scanHeredocBody(
  input: string,
  tag: string,
  stripTabs: boolean,
): { body: string; delimRest: string; rest: string } | null {
  const stripLeadingTabs = (line: string) =>
    stripTabs ? line.replace(/^\t+/, "") : line;

  // A trailing newline produces a final "" entry, which is correct: it means
  // "there's an empty last line", and it can never equal a (non-empty) tag.
  const lines = input.split("\n");
  let lineStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (stripLeadingTabs(lines[i]) === tag) {
      const bodyLines = lines.slice(0, i).map(stripLeadingTabs);
      const body = bodyLines.length === 0 ? "" : bodyLines.join("\n") + "\n";
      const afterDelimiter = lineStart + lines[i].length;
      const delimiterHasNewline = afterDelimiter < input.length;
      return {
        body,
        delimRest: input.slice(lineStart),
        rest: delimiterHasNewline ? input.slice(afterDelimiter + 1) : "",
      };
    }
    lineStart += lines[i].length + 1;
  }
  return null;
}
