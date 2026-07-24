import { or, required } from "../../combinators.js";
import { compileCharPredicate, str } from "../../parsers.js";
import { recordFailure } from "../../rightmostFailure.js";
import {
  CommittedFailure,
  committedFailure,
  failure,
  isCommittedFailure,
  Parser,
  ParserResult,
  success,
} from "../../types.js";
import { nonterminal, registerHeredoc } from "./heredocQueue.js";
import { lx } from "./lexemes.js";
import { positionAt, spanned } from "./spanned.js";
import { rawWord } from "./words.js";
import {
  BashRedirect,
  FileRedirect,
  FileRedirectOp,
  HeredocRedirect,
} from "./types.js";

const ZERO = 0x30;
const NINE = 0x39;

function isDigitCode(code: number): boolean {
  return code >= ZERO && code <= NINE;
}

type ScannedFileOp =
  | {
      kind: "op";
      op: FileRedirectOp;
      fd: string | null;
      targetFd: string | null;
      /** The operator as written (fd digits included), for error messages. */
      opText: string;
      takesTarget: boolean;
      rest: string;
    }
  | { kind: "committed"; failure: CommittedFailure }
  | null;

/** Scan a file-redirect operator: `[n]>`, `[n]>>`, `[n]<`, `&>`, and the
 * fd-duplication forms `[n]>&m` / `[n]>&-` (so `2>&1`, `1>&2`, `>&2`, `>&-`
 * all parse; fd-duplication takes no target word). Returns null when the
 * input is not a redirect at all; returns a committed failure for `>&` with
 * neither an fd nor `-`, which is the unsupported `>&file` form. */
function scanFileOp(input: string): ScannedFileOp {
  let index = 0;
  // Terminates: strictly advancing digit scan.
  while (index < input.length && isDigitCode(input.charCodeAt(index))) index++;
  const fd = index > 0 ? input.slice(0, index) : null;
  const fdText = fd ?? "";

  if (input.startsWith(">>", index)) {
    return {
      kind: "op",
      op: ">>",
      fd,
      targetFd: null,
      opText: fdText + ">>",
      takesTarget: true,
      rest: input.slice(index + 2),
    };
  }
  if (input.startsWith(">&", index)) {
    let digitEnd = index + 2;
    // Terminates: strictly advancing digit scan.
    while (digitEnd < input.length && isDigitCode(input.charCodeAt(digitEnd))) digitEnd++;
    if (digitEnd > index + 2) {
      return {
        kind: "op",
        op: ">&",
        fd,
        targetFd: input.slice(index + 2, digitEnd),
        opText: input.slice(0, digitEnd),
        takesTarget: false,
        rest: input.slice(digitEnd),
      };
    }
    if (input[index + 2] === "-") {
      return {
        kind: "op",
        op: ">&",
        fd,
        targetFd: "-",
        opText: fdText + ">&-",
        takesTarget: false,
        rest: input.slice(index + 3),
      };
    }
    // `>&` followed by neither digits nor `-`: that's `>&file` (bash's older
    // synonym of `&>file`, redirecting both streams), which we don't support.
    recordFailure(
      input.slice(index),
      "a file descriptor after >& (>&file is not supported — use &>file)",
    );
    return {
      kind: "committed",
      failure: committedFailure(
        ">&file (redirect both streams) is not supported — use &>file",
        input,
      ),
    };
  }
  if (input[index] === ">") {
    return {
      kind: "op",
      op: ">",
      fd,
      targetFd: null,
      opText: fdText + ">",
      takesTarget: true,
      rest: input.slice(index + 1),
    };
  }
  if (input[index] === "<") {
    return {
      kind: "op",
      op: "<",
      fd,
      targetFd: null,
      opText: fdText + "<",
      takesTarget: true,
      rest: input.slice(index + 1),
    };
  }
  if (fd === null && input.startsWith("&>")) {
    return {
      kind: "op",
      op: "&>",
      fd: null,
      targetFd: null,
      opText: "&>",
      takesTarget: true,
      rest: input.slice(2),
    };
  }
  return null;
}

const fileRedirectScan: Parser<Omit<FileRedirect, "span">> = (input: string) => {
  const scanned = scanFileOp(input);
  if (scanned === null) return failure("expected a redirect", input);
  if (scanned.kind === "committed") return scanned.failure;
  if (!scanned.takesTarget) {
    return success(
      {
        type: "redirect" as const,
        op: scanned.op,
        fd: scanned.fd,
        targetFd: scanned.targetFd,
        target: null,
      },
      scanned.rest,
    );
  }
  // Once the operator is consumed a target must follow: `required` reports
  // "expected a target after >" at the gap (and lets a committed failure
  // from the word itself, e.g. `> 'oops`, pass through unchanged).
  const afterOperator = lx.skipWhitespace(scanned.rest);
  const target = required(`a target after ${scanned.opText}`, rawWord)(afterOperator);
  if (!target.success) return target;
  return success(
    {
      type: "redirect" as const,
      op: scanned.op,
      fd: scanned.fd,
      targetFd: scanned.targetFd,
      target: target.result,
    },
    target.rest,
  );
};

/** `>`, `>>`, `<`, `2>`, `&>`, fd duplication (`2>&1`, `1>&2`, `>&-`), with
 * optional leading fd digits. */
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
    // `<<` was consumed; nothing but a heredoc starts that way.
    recordFailure(operator.rest, "a heredoc tag");
    return committedFailure("expected heredoc tag after <<", input);
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

/** All redirect forms. Committed-aware alternation by hand: `or` would
 * swallow a committed failure (e.g. `<<` with no tag) and try the next
 * branch, losing the specific message and position. */
export const redirect: Parser<BashRedirect> = nonterminal(
  "redirect",
  (input: string): ParserResult<BashRedirect> => {
    const heredocResult = heredocRedirect(input);
    if (heredocResult.success || isCommittedFailure(heredocResult)) {
      return heredocResult;
    }
    return fileRedirect(input);
  },
);
