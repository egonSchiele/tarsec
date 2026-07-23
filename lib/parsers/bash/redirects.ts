import { or } from "../../combinators.js";
import { compileCharPredicate, str } from "../../parsers.js";
import { recordFailure } from "../../rightmostFailure.js";
import { failure, Parser, success } from "../../types.js";
import { nonterminal, registerHeredoc } from "./heredocQueue.js";
import { lx } from "./lexemes.js";
import { positionAt, spanned } from "./spanned.js";
import { rawWord } from "./words.js";
import { BashRedirect, FileRedirect, HeredocRedirect } from "./types.js";

// Longest-first: `or` is first-match, so 2>&1 before 2>, >> before >.
const fileOp = or(str("2>&1"), str("2>"), str("&>"), str(">>"), str(">"), str("<"));

const fileRedirectScan: Parser<Omit<FileRedirect, "span">> = (input: string) => {
  const operator = fileOp(input);
  if (!operator.success) return operator;
  if (operator.result === "2>&1") {
    return success(
      { type: "redirect" as const, op: "2>&1" as const, target: null },
      operator.rest,
    );
  }
  const afterOperator = lx.skipWhitespace(operator.rest);
  const target = rawWord(afterOperator);
  if (!target.success) {
    recordFailure(afterOperator, `a target after ${operator.result}`);
    return failure(`expected target after ${operator.result}`, input);
  }
  return success(
    { type: "redirect" as const, op: operator.result, target: target.result },
    target.rest,
  );
};

/** `>`, `>>`, `<`, `2>`, `&>`, `2>&1` followed by a target word. */
export const fileRedirect: Parser<FileRedirect> = lx.lexeme(
  spanned<FileRedirect>(fileRedirectScan),
);

const isTagChar = compileCharPredicate(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_",
);

/** Scan a heredoc tag after << or <<-: bare [A-Za-z0-9_]+ or quoted 'TAG' / "TAG". */
function scanTag(
  input: string,
): { tag: string; quoted: boolean; rest: string } | null {
  const first = input[0];
  if (first === "'" || first === '"') {
    const closeIndex = input.indexOf(first, 1);
    if (closeIndex === -1) return null;
    return {
      tag: input.slice(1, closeIndex),
      quoted: true,
      rest: input.slice(closeIndex + 1),
    };
  }
  let end = 0;
  // Terminates: `end` strictly increases toward input.length.
  while (end < input.length && isTagChar(input.charCodeAt(end))) end++;
  if (end === 0) return null;
  return { tag: input.slice(0, end), quoted: false, rest: input.slice(end) };
}

/** Parses <<TAG / <<-TAG / <<'TAG' and registers the node in the pending
 * queue. Built by hand rather than with `spanned` because the *same object*
 * must be registered, returned, and later mutated at drain time — `spanned`
 * clones. */
export const heredocRedirect: Parser<HeredocRedirect> = (input: string) => {
  const start = positionAt(input);
  const operator = or(str("<<-"), str("<<"))(input);
  if (!operator.success) return operator;
  const tag = scanTag(operator.rest);
  if (tag === null) {
    recordFailure(operator.rest, "a heredoc tag");
    return failure("expected heredoc tag after <<", input);
  }
  const node: HeredocRedirect = {
    type: "heredoc",
    tag: tag.tag,
    stripTabs: operator.result === "<<-",
    quoted: tag.quoted,
    body: null,
    span: { start, end: positionAt(tag.rest) },
    bodySpan: null,
  };
  registerHeredoc(node);
  return success(node, lx.skipWhitespace(tag.rest));
};

/** All redirect forms. Heredocs first so << beats <. */
export const redirect: Parser<BashRedirect> = nonterminal(
  "redirect",
  or(heredocRedirect, fileRedirect),
);
