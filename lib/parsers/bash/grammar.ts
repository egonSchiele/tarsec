import { lazy, map, not, or, required, seqR } from "../../combinators.js";
import { char, quietly } from "../../parsers.js";
import { recordFailure } from "../../rightmostFailure.js";
import { failure, Parser, ParserFailure, success } from "../../types.js";
import { simpleCommand } from "./command.js";
import {
  drainHeredocs,
  hasPendingHeredocs,
  nonterminal,
  pendingHeredocs,
  scanHeredocBody,
} from "./heredocQueue.js";
import { lx } from "./lexemes.js";
import { positionAt, spanOf } from "./spanned.js";
import { AndOrOp, BashNode, BashScript, Statement } from "./types.js";

const NEWLINE_CODE = 0x0a;

/*
 * The grammar, top-down. Each nonterminal below implements one rule:
 *
 *   script    → lineBreaks (statement lineBreaks)*  eof
 *   statement → andOr statementEnd
 *   andOr     → pipeline (("&&" | "||") lineBreaks pipeline)*
 *   pipeline  → command  ("|" lineBreaks command)*
 *   command   → simpleCommand            (compound commands in a future scope)
 *
 * `statementEnd` is `&` (background), `;`, a heredoc-draining newline, or
 * end of input. `lineBreaks` eats blank lines and comments, draining
 * heredocs at each newline.
 */

/** command → simpleCommand. Compound commands (if/while/for/case) join via
 * a committed-aware `alt` here in a future scope — hence the lazy. */
export const command: Parser<BashNode> = nonterminal(
  "command",
  lazy(() => simpleCommand),
);

// Operator probes are speculative; `quietly` keeps their (and their
// zero-width `not` guards') recordings out of error messages.

/** `|` that is not `||`. */
const pipeOp: Parser<"|"> = quietly(
  lx.lexeme(map(seqR(char("|"), not(char("|"))), () => "|" as const)),
);

/** `&` that is not `&&` — the background/separator operator. */
const ampersandOp: Parser<"&"> = quietly(
  lx.lexeme(map(seqR(char("&"), not(char("&"))), () => "&" as const)),
);

const semicolonOp: Parser<";"> = quietly(lx.symbol(";"));

/** `&&` / `||` — consumed here, before the statement-level single `&`. */
const andOrOp: Parser<AndOrOp> = quietly(or(lx.symbol("&&"), lx.symbol("||")));

/** Consume a newline, then drain pending heredoc bodies (in registration
 * order), mutating each node's `body` and `bodySpan` in place. Wrapped by
 * `nonterminal`'s queue unwind at every call site, so a failed drain
 * restores the queue. On an unterminated heredoc the failure's `rest` is
 * the body's start — where the delimiter was expected — so diagnostics
 * point there. */
export const heredocNewline: Parser<null> = (input: string) => {
  if (input.charCodeAt(0) !== NEWLINE_CODE) {
    recordFailure(input, "a newline");
    return failure("expected newline", input);
  }
  let rest = input.slice(1);
  for (const heredoc of drainHeredocs()) {
    const scanned = scanHeredocBody(rest, heredoc.tag, heredoc.stripTabs);
    if (scanned === null) {
      recordFailure(rest, `heredoc delimiter ${heredoc.tag}`);
      return failure(`unterminated heredoc <<${heredoc.tag}`, rest);
    }
    heredoc.body = scanned.body;
    heredoc.bodySpan = {
      start: positionAt(rest),
      end: positionAt(scanned.delimRest),
    };
    rest = scanned.rest;
  }
  return success(null, rest);
};

/** Eat whitespace, comments, newlines, and blank lines — draining heredocs
 * at each newline. Fails only when a heredoc body is unterminated; that
 * failure must be propagated, never treated as "no more line breaks". */
const lineBreaks: Parser<null> = nonterminal("lineBreaks", (input: string) => {
  let rest = input;
  // Terminates: each iteration consumes at least the newline character.
  while (true) {
    rest = lx.skipWhitespace(rest);
    if (rest.charCodeAt(0) !== NEWLINE_CODE) return success(null, rest);
    const drained = heredocNewline(rest);
    if (!drained.success) return drained;
    rest = drained.rest;
  }
});

type ChainLink<Op> = { op: Op; command: BashNode };

/** operand (operator lineBreaks operand)* — left-associative. A single
 * operand collapses to itself (no one-element wrapper nodes). The operand
 * after an operator is `required`, so `a &&` fails with "expected a command
 * after &&" at the position where the command should be; line breaks after
 * an operator are allowed (`a &&\nb`), draining heredocs like any newline. */
function chainLeft<Op extends string>(
  operand: Parser<BashNode>,
  operator: Parser<Op>,
  build: (first: BashNode, links: ChainLink<Op>[]) => BashNode,
): Parser<BashNode> {
  return (input: string) => {
    const first = operand(input);
    if (!first.success) return first;
    const links: ChainLink<Op>[] = [];
    let rest = first.rest;
    // Terminates: `operator` consumes input on success; exits on its failure.
    while (true) {
      const operatorResult = operator(rest);
      if (!operatorResult.success) break;
      const afterLineBreaks = lineBreaks(operatorResult.rest);
      if (!afterLineBreaks.success) return afterLineBreaks;
      const next = required(
        `a command after ${operatorResult.result}`,
        operand,
      )(afterLineBreaks.rest);
      if (!next.success) return next;
      links.push({ op: operatorResult.result, command: next.result });
      rest = next.rest;
    }
    if (links.length === 0) return success(first.result, rest);
    return success(build(first.result, links), rest);
  };
}

/** pipeline → command ("|" lineBreaks command)* */
export const pipeline: Parser<BashNode> = nonterminal(
  "pipeline",
  chainLeft(command, pipeOp, (first, links) => ({
    type: "pipeline" as const,
    commands: [first, ...links.map((link) => link.command)],
    span: spanOf(first, links[links.length - 1].command),
  })),
);

/** andOr → pipeline (("&&" | "||") lineBreaks pipeline)* */
export const andOr: Parser<BashNode> = nonterminal(
  "andOr",
  chainLeft(pipeline, andOrOp, (first, links) => ({
    type: "and-or" as const,
    first,
    rest: links,
    span: spanOf(first, links[links.length - 1].command),
  })),
);

/** statementEnd → "&" | ";" | heredoc-draining newline | end-of-input.
 * Reports whether the statement runs in the background. */
const statementEnd: Parser<{ background: boolean }> = (input: string) => {
  if (input.charCodeAt(0) === NEWLINE_CODE) {
    const drained = heredocNewline(input);
    if (!drained.success) return drained;
    return success({ background: false }, drained.rest);
  }
  const ampersand = ampersandOp(input);
  if (ampersand.success) return success({ background: true }, ampersand.rest);
  const semicolon = semicolonOp(input);
  if (semicolon.success) return success({ background: false }, semicolon.rest);
  if (input === "") return success({ background: false }, input);
  recordFailure(input, "';', '&', or a newline");
  return failure("expected ';', '&', or newline after command", input);
};

/** statement → andOr statementEnd */
const statement: Parser<Statement> = nonterminal(
  "statement",
  (input: string) => {
    const body = andOr(input);
    if (!body.success) return body;
    const end = statementEnd(body.rest);
    if (!end.success) return end;
    return success(
      {
        type: "statement" as const,
        body: body.result,
        background: end.result.background,
        span: body.result.span,
      },
      end.rest,
    );
  },
);

/** Heredocs still pending at end of input never get a newline to drain at —
 * `cat <<EOF` with no newline, or `cat <<EOF;` at EOF. */
function pendingHeredocAtEof(rest: string): ParserFailure | null {
  if (rest !== "" || !hasPendingHeredocs()) return null;
  const tag = pendingHeredocs()[0].tag;
  recordFailure(rest, `heredoc delimiter ${tag}`);
  return failure(`unterminated heredoc <<${tag}`, rest);
}

/** script → lineBreaks (statement lineBreaks)* eof */
export const script: Parser<BashScript> = nonterminal(
  "script",
  (input: string) => {
    const leading = lineBreaks(input);
    if (!leading.success) return leading;
    let rest = leading.rest;
    const statements: Statement[] = [];
    // Terminates: `statement` always consumes at least one character.
    while (rest !== "") {
      const parsed = statement(rest);
      if (!parsed.success) return parsed;
      statements.push(parsed.result);
      const breaks = lineBreaks(parsed.rest);
      if (!breaks.success) return breaks;
      rest = breaks.rest;
      const unterminated = pendingHeredocAtEof(rest);
      if (unterminated !== null) return unterminated;
    }

    let span = { start: positionAt(input), end: positionAt(rest) };
    if (statements.length > 0) {
      span = spanOf(statements[0], statements[statements.length - 1]);
    }
    return success({ type: "script" as const, statements, span }, rest);
  },
);
