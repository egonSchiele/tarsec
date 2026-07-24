import { lazy, map, not, or, seqR } from "../../combinators.js";
import { char, quietly } from "../../parsers.js";
import { recordFailure } from "../../rightmostFailure.js";
import { failure, Parser, success } from "../../types.js";
import { attempt, isCommittedFailure } from "./committed.js";
import { simpleCommand } from "./command.js";
import {
  drainHeredocs,
  nonterminal,
  pendingHeredocs,
  scanHeredocBody,
  withQueueUnwind,
} from "./heredocQueue.js";
import { lx } from "./lexemes.js";
import { positionAt, spanOf } from "./spanned.js";
import { AndOrOp, BashNode, BashScript, Statement } from "./types.js";

const NEWLINE_CODE = 0x0a;

/** A single command. Compound commands (if/while/for/case) get added here in
 * a future scope as a committed-aware alternation (plain `or` would swallow
 * committed failures) — hence the lazy. */
export const command: Parser<BashNode> = nonterminal(
  "command",
  lazy(() => simpleCommand),
);

// Operator probes are speculative — a failed (or even successful) attempt
// must not leave "expected |"-style noise in error messages, so all of
// these are `quietly` wrapped (the zero-width `not(...)` guards record even
// on success).

// `|` that is not `||`. Explicit lookahead, not an accident of backtracking.
const pipeOp: Parser<"|"> = quietly(
  lx.lexeme(map(seqR(char("|"), not(char("|"))), () => "|" as const)),
);

// `&` that is not `&&` — the background/separator operator.
const ampersandOp: Parser<"&"> = quietly(
  lx.lexeme(map(seqR(char("&"), not(char("&"))), () => "&" as const)),
);

const semicolonOp: Parser<";"> = quietly(lx.symbol(";"));

// `&&` / `||` — consumed here, before the statement-level single `&`.
const andOrOp: Parser<AndOrOp> = quietly(or(lx.symbol("&&"), lx.symbol("||")));

/** Consume a newline, then drain pending heredoc bodies (in registration
 * order), mutating each node's `body` and `bodySpan` in place. Wrapped in
 * `withQueueUnwind` so a failed drain restores the queue — a re-run then
 * fails identically instead of silently succeeding on an emptied queue. */
export const heredocNewline: Parser<null> = withQueueUnwind((input: string) => {
  if (input.charCodeAt(0) !== NEWLINE_CODE) {
    recordFailure(input, "a newline");
    return failure("expected newline", input);
  }
  let rest = input.slice(1);
  for (const heredoc of drainHeredocs()) {
    const scanned = scanHeredocBody(rest, heredoc.tag, heredoc.stripTabs);
    if (scanned === null) {
      recordFailure(rest, `heredoc delimiter ${heredoc.tag}`);
      return failure(`unterminated heredoc <<${heredoc.tag}`, input);
    }
    heredoc.body = scanned.body;
    heredoc.bodySpan = {
      start: positionAt(rest),
      end: positionAt(scanned.delimRest),
    };
    rest = scanned.rest;
  }
  return success(null, rest);
});

/** Eat whitespace, comments, newlines, and blank lines — draining heredocs at
 * each newline. Fails only when a heredoc body is unterminated; that failure
 * must be propagated, never treated as "no more line breaks". */
const lineBreaks: Parser<null> = (input: string) => {
  let rest = input;
  // Terminates: each iteration consumes at least the newline character.
  while (true) {
    rest = lx.skipWhitespace(rest);
    if (rest.charCodeAt(0) !== NEWLINE_CODE) return success(null, rest);
    const drained = heredocNewline(rest);
    if (!drained.success) return drained;
    rest = drained.rest;
  }
};

/** Left-associative operator chain: `operand (operator operand)*`, where a
 * newline is allowed after each operator (so `a &&\nb` and `a |\nb` parse,
 * and heredocs registered before the operator drain at that newline — the
 * same behavior as bash). `combine` is only called when at least one link
 * was parsed; a single operand is returned unchanged (singleton collapse). */
function chain<Op extends string>(
  operand: Parser<BashNode>,
  operator: Parser<Op>,
  combine: (
    first: BashNode,
    links: { op: Op; command: BashNode }[],
  ) => BashNode,
): Parser<BashNode> {
  const attemptOperand = attempt(operand);
  return (input: string) => {
    const first = operand(input);
    if (!first.success) return first;
    const links: { op: Op; command: BashNode }[] = [];
    let rest = first.rest;
    // Terminates: `operator` consumes at least one character on success, and
    // the loop exits on the first operator failure.
    while (true) {
      const operatorResult = operator(rest);
      if (!operatorResult.success) break;
      const afterBreaks = lineBreaks(operatorResult.rest);
      if (!afterBreaks.success) return afterBreaks;
      // `attempt` wipes the operand's noisy alternative recordings on an
      // uncommitted failure; the useful phrasing is "a command after <op>".
      const next = attemptOperand(afterBreaks.rest);
      if (!next.success) {
        if (isCommittedFailure(next)) return next;
        recordFailure(afterBreaks.rest, `a command after ${operatorResult.result}`);
        return failure(
          `expected a command after ${operatorResult.result}`,
          input,
        );
      }
      links.push({ op: operatorResult.result, command: next.result });
      rest = next.rest;
    }
    if (links.length === 0) return success(first.result, rest);
    return success(combine(first.result, links), rest);
  };
}

export const pipeline: Parser<BashNode> = nonterminal(
  "pipeline",
  chain(command, pipeOp, (first, links) => ({
    type: "pipeline" as const,
    commands: [first, ...links.map((link) => link.command)],
    span: spanOf(first, links[links.length - 1].command),
  })),
);

export const andOr: Parser<BashNode> = nonterminal(
  "andOr",
  chain(pipeline, andOrOp, (first, links) => ({
    type: "and-or" as const,
    first,
    rest: links,
    span: spanOf(first, links[links.length - 1].command),
  })),
);

/** A whole script: statements separated by `;`, `&` (background), or
 * newlines. Use `parseBash` unless you own the global-state setup yourself. */
export const script: Parser<BashScript> = nonterminal(
  "script",
  (input: string) => {
    const leading = lineBreaks(input);
    if (!leading.success) return leading;
    let rest = leading.rest;
    const statements: Statement[] = [];

    // Terminates: each iteration parses one statement, which always consumes
    // at least one character (simpleCommand requires an element).
    while (rest !== "") {
      const commandResult = andOr(rest);
      if (!commandResult.success) return commandResult;
      rest = commandResult.rest;
      let background = false;

      if (rest.charCodeAt(0) === NEWLINE_CODE) {
        const drained = heredocNewline(rest);
        if (!drained.success) return drained;
        rest = drained.rest;
      } else {
        // The separator ops are `quietly` wrapped, so failed probes leave
        // no recordings; only the one readable phrase gets recorded.
        const ampersand = ampersandOp(rest);
        if (ampersand.success) {
          background = true;
          rest = ampersand.rest;
        } else {
          const semicolon = semicolonOp(rest);
          if (semicolon.success) {
            rest = semicolon.rest;
          } else if (rest !== "") {
            recordFailure(rest, "';', '&', or a newline");
            return failure("expected ';', '&', or newline after command", rest);
          }
        }
      }

      statements.push({
        type: "statement",
        body: commandResult.result,
        background,
        span: commandResult.result.span,
      });

      const trailing = lineBreaks(rest);
      if (!trailing.success) return trailing; // unterminated heredoc
      rest = trailing.rest;

      // Heredocs still pending at EOF never get a newline to drain at.
      if (rest === "" && pendingHeredocs().length > 0) {
        const tag = pendingHeredocs()[0].tag;
        recordFailure(rest, `heredoc delimiter ${tag}`);
        return failure(`unterminated heredoc <<${tag}`, rest);
      }
    }

    let span = { start: positionAt(input), end: positionAt(rest) };
    if (statements.length > 0) {
      span = spanOf(statements[0], statements[statements.length - 1]);
    }
    return success({ type: "script" as const, statements, span }, rest);
  },
);
