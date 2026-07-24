import { alt } from "../../combinators.js";
import { compileCharPredicate } from "../../parsers.js";
import { recordFailure } from "../../rightmostFailure.js";
import {
  committedFailure,
  failure,
  isCommittedFailure,
  Parser,
  success,
} from "../../types.js";
import { nonterminal } from "./heredocQueue.js";
import { lx } from "./lexemes.js";
import { redirect } from "./redirects.js";
import { positionAt, spanned, spanOf } from "./spanned.js";
import { bashWord, scanWord } from "./words.js";
import {
  BashAssignment,
  BashRedirect,
  BashWord,
  SimpleCommand,
} from "./types.js";

const isNameStart = compileCharPredicate(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_",
);
const isNameRest = compileCharPredicate(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_",
);
const EQUALS = 0x3d;

const assignmentScan: Parser<Omit<BashAssignment, "span">> = (input: string) => {
  if (input.length === 0 || !isNameStart(input.charCodeAt(0))) {
    recordFailure(input, "an assignment");
    return failure("expected an assignment", input);
  }
  let nameEnd = 1;
  // Terminates: `nameEnd` strictly increases toward input.length.
  while (nameEnd < input.length && isNameRest(input.charCodeAt(nameEnd))) nameEnd++;
  if (input.charCodeAt(nameEnd) !== EQUALS) {
    recordFailure(input, "an assignment");
    return failure("expected = in assignment", input);
  }
  const name = input.slice(0, nameEnd);
  const afterEquals = input.slice(nameEnd + 1);
  const valueEnd = scanWord(afterEquals);
  if (valueEnd === -1) {
    // `NAME=` was consumed: this is an assignment with a malformed value.
    recordFailure(afterEquals, "a closing quote");
    return committedFailure("unterminated quote", input);
  }
  if (valueEnd === 0) {
    // e.g. `FOO=` followed by whitespace or an operator: empty value
    return success(
      { type: "assignment" as const, name, value: null },
      afterEquals,
    );
  }
  // Build the value node from the scan we already did (no re-scan).
  const valueRest = afterEquals.slice(valueEnd);
  const value: BashWord = {
    type: "word",
    text: afterEquals.slice(0, valueEnd),
    span: { start: positionAt(afterEquals), end: positionAt(valueRest) },
  };
  return success({ type: "assignment" as const, name, value }, valueRest);
};

/** `NAME=value`. The name uses its own charset (NOT lx.identifier): bash
 * keywords are not reserved in assignment position, so `if=1` is legal. */
export const assignment: Parser<BashAssignment> = lx.lexeme(
  spanned<BashAssignment>(assignmentScan),
);

type CommandElement = BashAssignment | BashRedirect | BashWord;

// Bash rule: NAME=value tokens are assignments only until the first *word*;
// after that they are ordinary words (`echo foo=bar`). Redirects may appear
// anywhere, including before the command name and between assignments.
// `alt` propagates committed failures (malformed redirect/word) and keeps
// rejected alternatives out of error messages.
const elementBeforeFirstWord: Parser<CommandElement> = alt(redirect, assignment, bashWord);
const elementAfterFirstWord: Parser<CommandElement> = alt(redirect, bashWord);

/** simpleCommand → (assignment | redirect | word)+ with the first-word rule
 * above. Fails unless at least one element is present. A committed failure
 * from an element (unterminated quote, redirect without target, `<<` without
 * tag) propagates out so the error points at the offending token instead of
 * surfacing later as a bogus separator error. */
export const simpleCommand: Parser<SimpleCommand> = nonterminal(
  "simpleCommand",
  (input: string) => {
    const elements: CommandElement[] = [];
    let seenWord = false;
    let rest = input;
    // Terminates: every element parser consumes at least one character on
    // success, and the loop exits on the first failure.
    while (true) {
      const element = seenWord ? elementAfterFirstWord : elementBeforeFirstWord;
      const parsed = element(rest);
      if (!parsed.success) {
        if (isCommittedFailure(parsed)) return parsed;
        break;
      }
      if (parsed.result.type === "word") seenWord = true;
      elements.push(parsed.result);
      rest = parsed.rest;
    }

    if (elements.length === 0) {
      recordFailure(input, "a command");
      return failure("expected a command", input);
    }
    return success(
      {
        type: "simple-command" as const,
        assignments: elements.filter(
          (element): element is BashAssignment => element.type === "assignment",
        ),
        words: elements.filter(
          (element): element is BashWord => element.type === "word",
        ),
        redirects: elements.filter(
          (element): element is BashRedirect =>
            element.type === "redirect" || element.type === "heredoc",
        ),
        span: spanOf(elements[0], elements[elements.length - 1]),
      },
      rest,
    );
  },
);
