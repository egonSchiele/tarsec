/**
 * Experiment: how far can a bash parser get using `makeLexemes` plus the
 * core combinators, with no bash-specific machinery added to the library?
 *
 * Design notes:
 * - Whitespace is " \t" only — newlines are command separators, and
 *   `makeLexemes` line comments deliberately stop AT the newline, which is
 *   exactly bash's behavior.
 * - Reserved words (`if`, `fi`, `done`, ...) are only special as the FIRST
 *   word of a command, mirroring real bash. `commandWord` rejects them, so
 *   body lists naturally stop at their closing keyword; argument words
 *   (`echo fi`) are unaffected.
 * - Words are sequences of adjacent parts (literals, quotes, expansions).
 *   Only the outer word parser is a lexeme; part parsers must NOT eat
 *   trailing whitespace or `$(pwd) x` would glue "x" into the word.
 *
 * Known boundaries (see the test file): heredocs, arrays, and the guts of
 * `[[ ]]` / `$(( ))` (kept as raw text, not parsed).
 */
import {
  lazy,
  many,
  many1,
  optional,
  or,
  sepBy1,
  seq,
} from "@/lib/combinators";
import { makeLexemes } from "@/lib/lexeme";
import { char, compileCharPredicate, eof, str, takeWhile1 } from "@/lib/parsers";
import { trace } from "@/lib/trace";
import { failure, Parser, ParserResult, success } from "@/lib/types";

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

export type WordPart =
  | { tag: "literal"; text: string }
  | { tag: "singleQuoted"; text: string }
  | { tag: "doubleQuoted"; parts: WordPart[] }
  | { tag: "variable"; name: string }
  | { tag: "paramExpansion"; expression: string }
  | { tag: "commandSubstitution"; command: List }
  | { tag: "backtickSubstitution"; commandText: string }
  | { tag: "arithmeticExpansion"; expression: string };

export type BashWord = { tag: "word"; parts: WordPart[] };

export type Assignment = {
  tag: "assignment";
  name: string;
  value: BashWord | null;
};

export type Redirect = {
  tag: "redirect";
  fd: number | null;
  op: string;
  target: BashWord;
};

export type SimpleCommand = {
  tag: "simpleCommand";
  assignments: Assignment[];
  words: BashWord[];
  redirects: Redirect[];
};

export type IfCommand = {
  tag: "if";
  cond: List;
  thenBody: List;
  elifs: { cond: List; thenBody: List }[];
  elseBody: List | null;
  redirects: Redirect[];
};

export type LoopCommand = {
  tag: "loop";
  kind: "while" | "until";
  cond: List;
  body: List;
  redirects: Redirect[];
};

export type ForCommand = {
  tag: "for";
  variable: string;
  words: BashWord[] | null;
  body: List;
  redirects: Redirect[];
};

export type CaseItem = {
  patterns: BashWord[];
  body: List;
  terminator: string | null;
};

export type CaseCommand = {
  tag: "case";
  subject: BashWord;
  items: CaseItem[];
  redirects: Redirect[];
};

export type Subshell = { tag: "subshell"; body: List; redirects: Redirect[] };
export type Group = { tag: "group"; body: List; redirects: Redirect[] };

export type ArithmeticCommand = {
  tag: "arithmeticCommand";
  expression: string;
  redirects: Redirect[];
};

export type ConditionalCommand = {
  tag: "conditional";
  expression: string;
  redirects: Redirect[];
};

export type FunctionDef = { tag: "functionDef"; name: string; body: Command };

export type Command =
  | SimpleCommand
  | IfCommand
  | LoopCommand
  | ForCommand
  | CaseCommand
  | Subshell
  | Group
  | ArithmeticCommand
  | ConditionalCommand
  | FunctionDef;

export type Pipeline = {
  tag: "pipeline";
  negated: boolean;
  commands: Command[];
};

export type AndOr = {
  tag: "andOr";
  first: Pipeline;
  rest: { op: "&&" | "||"; pipeline: Pipeline }[];
};

export type ListItem = {
  tag: "listItem";
  command: AndOr;
  background: boolean;
};

export type List = { tag: "list"; items: ListItem[] };

// ---------------------------------------------------------------------------
// Lexemes
// ---------------------------------------------------------------------------

const L = makeLexemes({
  whitespace: " \t",
  lineComment: "#",
  lineContinuation: true,
  operatorChars: "&|;<>",
});

// Reserved words are rejected at command position only (see commandWord).
const RESERVED = new Set([
  "if", "then", "elif", "else", "fi",
  "do", "done", "while", "until", "for", "in",
  "case", "esac", "function", "time",
  "{", "}", "!",
]);

const lazyList: Parser<List> = lazy(() => listParser);
const lazyCommand: Parser<Command> = lazy(() => commandParser);

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

function literal(text: string): WordPart {
  return { tag: "literal", text };
}

/** Merge adjacent literal parts so ASTs read naturally in tests. */
function mergeLiterals(parts: WordPart[]): WordPart[] {
  const merged: WordPart[] = [];
  for (const part of parts) {
    const previous = merged[merged.length - 1];
    if (part.tag === "literal" && previous?.tag === "literal") {
      previous.text += part.text;
    } else {
      merged.push(part);
    }
  }
  return merged;
}

// Characters that end an unquoted literal run: bash metacharacters plus the
// characters that start quotes, expansions, or escapes.
const isWordStop = compileCharPredicate(" \t\n|&;()<>'\"`$\\");

const plainRun: Parser<WordPart> = (input) => {
  let end = 0;
  // Terminates: `end` strictly increases toward input.length.
  while (end < input.length && !isWordStop(input.charCodeAt(end))) end++;
  if (end === 0) {
    return failure("expected word characters", input);
  }
  return success(literal(input.slice(0, end)), input.slice(end));
};

const singleQuoted: Parser<WordPart> = (input) => {
  if (input[0] !== "'") {
    return failure("expected a single quote", input);
  }
  // No escapes exist inside single quotes, so scanning to the next quote
  // is exactly bash's rule.
  const closeIndex = input.indexOf("'", 1);
  if (closeIndex === -1) {
    return failure("unterminated single quote", input);
  }
  return success(
    { tag: "singleQuoted", text: input.slice(1, closeIndex) },
    input.slice(closeIndex + 1),
  );
};

const IDENT_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";
const identifierRun = takeWhile1(IDENT_CHARS, "a variable name");

const SPECIAL_VARIABLES = "?!#@*$-0123456789";

const variablePart: Parser<WordPart> = (input) => {
  if (input[0] !== "$") {
    return failure("expected $", input);
  }
  const after = input.slice(1);
  const first = after[0];
  if (first !== undefined && SPECIAL_VARIABLES.includes(first)) {
    return success({ tag: "variable", name: first }, after.slice(1));
  }
  const nameResult = identifierRun(after);
  if (nameResult.success) {
    return success({ tag: "variable", name: nameResult.result }, nameResult.rest);
  }
  // A lone `$` before a non-name character is literal in bash.
  return success(literal("$"), after);
};

const paramExpansion: Parser<WordPart> = (input) => {
  if (!input.startsWith("${")) {
    return failure("expected ${", input);
  }
  let depth = 0;
  let index = 2;
  // Terminates: `index` strictly increases toward input.length.
  while (index < input.length) {
    const c = input[index];
    if (c === "{") depth++;
    if (c === "}") {
      if (depth === 0) {
        return success(
          { tag: "paramExpansion", expression: input.slice(2, index) },
          input.slice(index + 1),
        );
      }
      depth--;
    }
    index++;
  }
  return failure("unterminated ${", input);
};

const arithmeticExpansion: Parser<WordPart> = (input) => {
  if (!input.startsWith("$((")) {
    return failure("expected $((", input);
  }
  const scanned = scanBalancedParens(input, 3);
  if (scanned === null) {
    return failure("unterminated $((", input);
  }
  return success(
    { tag: "arithmeticExpansion", expression: scanned.contents },
    input.slice(scanned.endIndex),
  );
};

/** Scan from `startIndex` to a `))` at paren depth zero (quotes ignored).
 * Returns the contents and the index just past the closing `))`. */
function scanBalancedParens(
  input: string,
  startIndex: number,
): { contents: string; endIndex: number } | null {
  let depth = 0;
  let index = startIndex;
  // Terminates: `index` strictly increases toward input.length.
  while (index < input.length) {
    const c = input[index];
    if (c === "(") depth++;
    if (c === ")") {
      if (depth === 0) {
        if (input[index + 1] !== ")") return null;
        return { contents: input.slice(startIndex, index), endIndex: index + 2 };
      }
      depth--;
    }
    index++;
  }
  return null;
}

// Note: char(")"), not symbol(")") — a word part must not eat trailing
// whitespace or `$(pwd) x` would glue "x" onto the word.
const commandSubstitution: Parser<WordPart> = seq(
  [str("$("), lazyList, char(")")],
  (results) => ({
    tag: "commandSubstitution",
    command: results[1] as List,
  }) satisfies WordPart,
);

const backtickSubstitution: Parser<WordPart> = (input) => {
  if (input[0] !== "`") {
    return failure("expected a backtick", input);
  }
  const closeIndex = input.indexOf("`", 1);
  if (closeIndex === -1) {
    return failure("unterminated backtick", input);
  }
  return success(
    { tag: "backtickSubstitution", commandText: input.slice(1, closeIndex) },
    input.slice(closeIndex + 1),
  );
};

const unquotedEscape: Parser<WordPart> = (input) => {
  if (input[0] !== "\\" || input.length < 2) {
    return failure("expected an escape", input);
  }
  const escaped = input[1];
  // Backslash-newline inside a word disappears (line continuation).
  return success(literal(escaped === "\n" ? "" : escaped), input.slice(2));
};

const isDoubleQuoteStop = compileCharPredicate('"$`\\');

const doubleQuoteLiteral: Parser<WordPart> = (input) => {
  let end = 0;
  // Terminates: `end` strictly increases toward input.length.
  while (end < input.length && !isDoubleQuoteStop(input.charCodeAt(end))) end++;
  if (end === 0) {
    return failure("expected literal text", input);
  }
  return success(literal(input.slice(0, end)), input.slice(end));
};

const DQ_ESCAPABLE = '"$`\\';

const doubleQuoteEscape: Parser<WordPart> = (input) => {
  if (input[0] !== "\\" || input.length < 2) {
    return failure("expected an escape", input);
  }
  const escaped = input[1];
  if (escaped === "\n") return success(literal(""), input.slice(2));
  if (DQ_ESCAPABLE.includes(escaped)) {
    return success(literal(escaped), input.slice(2));
  }
  // Inside double quotes, backslash before other characters stays literal.
  return success(literal("\\"), input.slice(1));
};

const doubleQuoted: Parser<WordPart> = seq(
  [
    char('"'),
    many(
      or(
        arithmeticExpansion,
        commandSubstitution,
        paramExpansion,
        variablePart,
        backtickSubstitution,
        doubleQuoteEscape,
        doubleQuoteLiteral,
      ),
    ),
    char('"'),
  ],
  (results) => ({
    tag: "doubleQuoted",
    parts: mergeLiterals(results[1] as WordPart[]),
  }) satisfies WordPart,
);

const wordPart: Parser<WordPart> = or(
  singleQuoted,
  doubleQuoted,
  arithmeticExpansion,
  commandSubstitution,
  paramExpansion,
  variablePart,
  backtickSubstitution,
  unquotedEscape,
  plainRun,
);

export const wordParser: Parser<BashWord> = L.lexeme(
  trace(
    "bash:word",
    seq([many1(wordPart)], (results) => ({
      tag: "word",
      parts: mergeLiterals(results[0] as WordPart[]),
    }) satisfies BashWord),
  ),
);

/** The bare text of a word that is a single unquoted literal, else null. */
function bareLiteral(word: BashWord): string | null {
  if (word.parts.length !== 1) return null;
  const part = word.parts[0];
  return part.tag === "literal" ? part.text : null;
}

/** A word at command position: reserved words are rejected here (and only
 * here), which is how body lists stop at `fi`/`done`/`esac`/... */
const commandWord: Parser<BashWord> = (input) => {
  const result = wordParser(input);
  if (!result.success) return result;
  const bare = bareLiteral(result.result);
  if (bare !== null && RESERVED.has(bare)) {
    return failure(`unexpected reserved word ${bare}`, input);
  }
  return result;
};

/** Match a word that is exactly the bare literal `s` (used for `{`, `}`, `!`,
 * which are words, not operators, in bash). */
function wordLiteral(s: string): Parser<string> {
  return (input) => {
    const result = wordParser(input);
    if (!result.success || bareLiteral(result.result) !== s) {
      return failure(`expected ${s}`, input);
    }
    return success(s, result.rest);
  };
}

// ---------------------------------------------------------------------------
// Redirects and assignments
// ---------------------------------------------------------------------------

// Longest first, so ">>" wins over ">" and "<<<" over "<".
const REDIRECT_OPS = ["&>>", "&>", ">>", ">|", ">&", "<<<", "<&", "<>", ">", "<"];

const fileDescriptor = takeWhile1("0123456789", "a file descriptor");

export const redirectParser: Parser<Redirect> = trace(
  "bash:redirect",
  (input) => {
    let rest = input;
    let fd: number | null = null;
    const fdResult = fileDescriptor(input);
    if (fdResult.success) {
      fd = parseInt(fdResult.result, 10);
      rest = fdResult.rest;
    }
    if (rest.startsWith("<<") && !rest.startsWith("<<<")) {
      return failure("heredocs are not supported", input);
    }
    const op = REDIRECT_OPS.find((candidate) => rest.startsWith(candidate));
    if (op === undefined) {
      return failure("expected a redirect operator", input);
    }
    const afterOp = L.skipWhitespace(rest.slice(op.length));
    const target = wordParser(afterOp);
    if (!target.success) {
      return failure(`expected a redirect target after ${op}`, input);
    }
    return success(
      { tag: "redirect", fd, op, target: target.result },
      target.rest,
    );
  },
);

export const assignmentParser: Parser<Assignment> = L.lexeme(
  trace("bash:assignment", (input): ParserResult<Assignment> => {
    const name = identifierRun(input);
    if (!name.success) {
      return failure("expected an assignment", input);
    }
    if (!name.rest.startsWith("=")) {
      return failure("expected = after assignment name", input);
    }
    const afterEquals = name.rest.slice(1);
    const value = wordParser(afterEquals);
    if (value.success) {
      return success(
        { tag: "assignment", name: name.result, value: value.result },
        value.rest,
      );
    }
    return success(
      { tag: "assignment", name: name.result, value: null },
      afterEquals,
    );
  }),
);

// ---------------------------------------------------------------------------
// Simple commands
// ---------------------------------------------------------------------------

const simpleCommandParser: Parser<SimpleCommand> = trace(
  "bash:simpleCommand",
  (input) => {
    const result = seq(
      [
        many(or(assignmentParser, redirectParser)),
        // The argument loop only runs when a command word is present, so a
        // reserved word at command position ends the simple command cleanly.
        optional(
          seq(
            [commandWord, many(or(redirectParser, wordParser))],
            (results) => ({
              first: results[0] as BashWord,
              rest: results[1] as (Redirect | BashWord)[],
            }),
          ),
        ),
      ],
      (results) => {
        const assignments: Assignment[] = [];
        const redirects: Redirect[] = [];
        const words: BashWord[] = [];
        for (const item of results[0] as (Assignment | Redirect)[]) {
          if (item.tag === "assignment") assignments.push(item);
          else redirects.push(item);
        }
        const body = results[1] as {
          first: BashWord;
          rest: (Redirect | BashWord)[];
        } | null;
        if (body !== null) {
          words.push(body.first);
          for (const item of body.rest) {
            if (item.tag === "redirect") redirects.push(item);
            else words.push(item);
          }
        }
        return { tag: "simpleCommand", assignments, words, redirects } satisfies SimpleCommand;
      },
    )(input);
    if (
      result.success &&
      result.result.assignments.length === 0 &&
      result.result.words.length === 0 &&
      result.result.redirects.length === 0
    ) {
      return failure("expected a command", input);
    }
    return result;
  },
);

// ---------------------------------------------------------------------------
// Compound commands
// ---------------------------------------------------------------------------

const newlineToken = L.lexeme(char("\n"));
const linebreak = many(newlineToken);

const elifClause = seq(
  [L.keyword("elif"), lazyList, L.keyword("then"), lazyList],
  (results) => ({ cond: results[1] as List, thenBody: results[3] as List }),
);

const elseClause = seq(
  [L.keyword("else"), lazyList],
  (results) => results[1] as List,
);

const ifParser: Parser<IfCommand> = seq(
  [
    L.keyword("if"), lazyList,
    L.keyword("then"), lazyList,
    many(elifClause),
    optional(elseClause),
    L.keyword("fi"),
  ],
  (results) => ({
    tag: "if",
    cond: results[1] as List,
    thenBody: results[3] as List,
    elifs: results[4] as { cond: List; thenBody: List }[],
    elseBody: results[5] as List | null,
    redirects: [],
  }) satisfies IfCommand,
);

const loopParser: Parser<LoopCommand> = seq(
  [
    or(L.keyword("while"), L.keyword("until")), lazyList,
    L.keyword("do"), lazyList, L.keyword("done"),
  ],
  (results) => ({
    tag: "loop",
    kind: results[0] as "while" | "until",
    cond: results[1] as List,
    body: results[3] as List,
    redirects: [],
  }) satisfies LoopCommand,
);

const forParser: Parser<ForCommand> = seq(
  [
    L.keyword("for"), L.identifier,
    optional(
      seq([L.keyword("in"), many(wordParser)], (results) => results[1] as BashWord[]),
    ),
    optional(or(L.operator(";"), newlineToken)),
    linebreak,
    L.keyword("do"), lazyList, L.keyword("done"),
  ],
  (results) => ({
    tag: "for",
    variable: results[1] as string,
    words: results[2] as BashWord[] | null,
    body: results[6] as List,
    redirects: [],
  }) satisfies ForCommand,
);

const caseItemParser: Parser<CaseItem> = seq(
  [
    optional(L.symbol("(")),
    sepBy1(L.operator("|"), wordParser),
    L.symbol(")"),
    lazyList,
    optional(or(L.operator(";;&"), L.operator(";;"), L.operator(";&"))),
    linebreak,
  ],
  (results) => ({
    patterns: results[1] as BashWord[],
    body: results[3] as List,
    terminator: results[4] as string | null,
  }) satisfies CaseItem,
);

const caseParser: Parser<CaseCommand> = seq(
  [
    L.keyword("case"), wordParser, L.keyword("in"), linebreak,
    many(caseItemParser),
    L.keyword("esac"),
  ],
  (results) => ({
    tag: "case",
    subject: results[1] as BashWord,
    items: results[4] as CaseItem[],
    redirects: [],
  }) satisfies CaseCommand,
);

// `((expr))` must be tried before subshell, like bash's own disambiguation.
const arithmeticCommand: Parser<ArithmeticCommand> = L.lexeme(
  (input: string) => {
    if (!input.startsWith("((")) {
      return failure("expected ((", input);
    }
    const scanned = scanBalancedParens(input, 2);
    if (scanned === null) {
      return failure("unterminated ((", input);
    }
    return success(
      {
        tag: "arithmeticCommand",
        expression: scanned.contents,
        redirects: [],
      } satisfies ArithmeticCommand,
      input.slice(scanned.endIndex),
    );
  },
);

// `[[ ... ]]` is its own sub-language; keep the expression as raw text.
const conditionalCommand: Parser<ConditionalCommand> = L.lexeme(
  (input: string) => {
    if (!input.startsWith("[[")) {
      return failure("expected [[", input);
    }
    const closeIndex = input.indexOf("]]", 2);
    if (closeIndex === -1) {
      return failure("unterminated [[", input);
    }
    return success(
      {
        tag: "conditional",
        expression: input.slice(2, closeIndex).trim(),
        redirects: [],
      } satisfies ConditionalCommand,
      input.slice(closeIndex + 2),
    );
  },
);

const subshellParser: Parser<Subshell> = seq(
  [L.symbol("("), lazyList, L.symbol(")")],
  (results) => ({
    tag: "subshell",
    body: results[1] as List,
    redirects: [],
  }) satisfies Subshell,
);

const groupParser: Parser<Group> = seq(
  [wordLiteral("{"), lazyList, wordLiteral("}")],
  (results) => ({
    tag: "group",
    body: results[1] as List,
    redirects: [],
  }) satisfies Group,
);

const compoundParser: Parser<Command> = or(
  ifParser,
  loopParser,
  forParser,
  caseParser,
  conditionalCommand,
  arithmeticCommand,
  subshellParser,
  groupParser,
);

const functionDefParser: Parser<FunctionDef> = trace(
  "bash:functionDef",
  (input) => {
    const result = seq(
      [
        optional(L.keyword("function")),
        L.identifier,
        optional(seq([L.symbol("("), L.symbol(")")], () => "()")),
        linebreak,
        lazyCommand,
      ],
      (results) => ({
        keyword: results[0] as string | null,
        name: results[1] as string,
        parens: results[2] as string | null,
        body: results[4] as Command,
      }),
    )(input);
    if (!result.success) return result;
    const { keyword, name, parens, body } = result.result;
    // Without either the `function` keyword or `()`, this is just a word.
    if (keyword === null && parens === null) {
      return failure("expected a function definition", input);
    }
    return success(
      { tag: "functionDef", name, body } satisfies FunctionDef,
      result.rest,
    );
  },
);

const commandParser: Parser<Command> = or(
  seq(
    [compoundParser, many(redirectParser)],
    (results) => ({
      ...(results[0] as Command),
      redirects: results[1] as Redirect[],
    }),
  ),
  functionDefParser,
  simpleCommandParser,
);

// ---------------------------------------------------------------------------
// Pipelines, lists, script
// ---------------------------------------------------------------------------

const pipeOperator = seq(
  [or(L.operator("|&"), L.operator("|")), linebreak],
  (results) => results[0] as string,
);

const pipelineParser: Parser<Pipeline> = seq(
  [optional(wordLiteral("!")), sepBy1(pipeOperator, commandParser)],
  (results) => ({
    tag: "pipeline",
    negated: results[0] !== null,
    commands: results[1] as Command[],
  }) satisfies Pipeline,
);

const andOrTail = seq(
  [or(L.operator("&&"), L.operator("||")), linebreak, pipelineParser],
  (results) => ({
    op: results[0] as "&&" | "||",
    pipeline: results[2] as Pipeline,
  }),
);

const andOrParser: Parser<AndOr> = seq(
  [pipelineParser, many(andOrTail)],
  (results) => ({
    tag: "andOr",
    first: results[0] as Pipeline,
    rest: results[1] as { op: "&&" | "||"; pipeline: Pipeline }[],
  }) satisfies AndOr,
);

const listItemParser: Parser<ListItem> = seq(
  [andOrParser, optional(or(L.operator("&"), L.operator(";"))), linebreak],
  (results) => ({
    tag: "listItem",
    command: results[0] as AndOr,
    background: results[1] === "&",
  }) satisfies ListItem,
);

const listParser: Parser<List> = trace(
  "bash:list",
  seq(
    [L.whitespace, linebreak, many(listItemParser)],
    (results) => ({ tag: "list", items: results[2] as ListItem[] }) satisfies List,
  ),
);

export const bashParser: Parser<List> = seq(
  [listParser, eof],
  (results) => results[0] as List,
);
