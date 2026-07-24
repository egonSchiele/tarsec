import { trace } from "../../trace.js";
import { Parser } from "../../types.js";
import { HeredocRedirect } from "./types.js";

/** Pending heredocs registered by `<<TAG` redirects, drained (in registration
 * order) by the line-break parser. Module-level mutable state, following the
 * precedent of `setInputStr` and the rightmost-failure tracker.
 *
 * Invariant: every bash-grammar nonterminal that can fail after a child
 * succeeded is wrapped in `nonterminal` (= trace + `withQueueUnwind`), so
 * abandoned partial parses never leak registrations.
 *
 * Do NOT wrap parsers in `memo` at or above `redirect` in the bash grammar:
 * memo replays cached results without re-running registration. Do NOT `peek`
 * a registering parser: peek discards consumption on success, which no
 * failure-path unwind can see. */
let queue: HeredocRedirect[] = [];

/** Clear the queue. Called by `parseBash` at the start of each parse. */
export function resetHeredocQueue(): void {
  queue = [];
}

export function registerHeredoc(node: HeredocRedirect): void {
  queue.push(node);
}

export function pendingHeredocs(): readonly HeredocRedirect[] {
  return queue;
}

/** Remove and return all pending heredocs, oldest first. */
export function drainHeredocs(): HeredocRedirect[] {
  const drained = queue;
  queue = [];
  return drained;
}

/** Shared sentinel for the overwhelmingly common empty-queue snapshot, so the
 * per-nonterminal `withQueueUnwind` doesn't allocate a throwaway array on
 * every single grammar rule entry. Never mutated. */
const EMPTY_SNAPSHOT: readonly HeredocRedirect[] = [];

/** Copy the queue. Restoring a snapshot resurrects entries drained since —
 * a drain-then-fail path must put its entries back so a re-run behaves
 * identically. Note the restored entries may carry `body` values a failed
 * drain already wrote; that's harmless, because any successful re-drain
 * overwrites them and a failed parse discards the AST they belong to.
 *
 * A length mark would NOT work here: `drainHeredocs` swaps in a fresh array,
 * so truncating a later array to an earlier length would leave holes rather
 * than the original entries. The copy is the point — it just isn't needed
 * when there is nothing to copy. */
export function snapshotHeredocs(): readonly HeredocRedirect[] {
  return queue.length === 0 ? EMPTY_SNAPSHOT : queue.slice();
}

export function restoreHeredocs(snapshot: readonly HeredocRedirect[]): void {
  if (snapshot.length === 0) {
    // Clear in place rather than allocating a new array. Safe because a
    // non-empty snapshot is always a private copy, never aliased to `queue`.
    if (queue.length !== 0) queue.length = 0;
    return;
  }
  queue = snapshot.slice();
}

/** Snapshot on entry, restore on failure, keep on success. */
export function withQueueUnwind<T>(parser: Parser<T>): Parser<T> {
  return (input: string) => {
    const snapshot = snapshotHeredocs();
    const result = parser(input);
    if (!result.success) restoreHeredocs(snapshot);
    return result;
  };
}

/** A bash grammar nonterminal: named in DEBUG=1 trace output, and unwinds the
 * heredoc queue on failure. Every nonterminal that can fail after a child
 * succeeded MUST be built with this. */
export function nonterminal<T>(name: string, parser: Parser<T>): Parser<T> {
  return trace(`bash:${name}`, withQueueUnwind(parser));
}

/** Scan a heredoc body: lines up to one consisting exactly of `tag` (after
 * leading-tab stripping when `stripTabs` — bash strips tabs from body lines
 * and the delimiter line for `<<-`). Returns the body text, the input at the
 * delimiter line (`delimRest`, for computing bodySpan), and the input after
 * the delimiter line (`rest`). A delimiter at EOF without a trailing newline
 * is accepted, matching bash. Returns null if never terminated. */
export function scanHeredocBody(
  input: string,
  tag: string,
  stripTabs: boolean,
): { body: string; delimRest: string; rest: string } | null {
  let lineStart = 0;
  const length = input.length;
  const bodyLines: string[] = [];
  // Terminates: each iteration either returns or advances `lineStart` past a
  // newline; the no-newline case always returns.
  while (true) {
    let lineEnd = input.indexOf("\n", lineStart);
    const hasNewline = lineEnd !== -1;
    if (!hasNewline) lineEnd = length;
    const rawLine = input.slice(lineStart, lineEnd);
    let line = rawLine;
    if (stripTabs) line = rawLine.replace(/^\t+/, "");
    if (line === tag) {
      let rest = input.slice(lineEnd);
      if (hasNewline) rest = input.slice(lineEnd + 1);
      return {
        body: bodyLines.join(""),
        delimRest: input.slice(lineStart),
        rest,
      };
    }
    if (!hasNewline) return null;
    bodyLines.push(line + "\n");
    lineStart = lineEnd + 1;
  }
}
