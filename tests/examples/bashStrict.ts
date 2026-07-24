/**
 * Fail-closed bash parser: a deliberately smaller syntax that is either
 * parsed correctly or rejected with a diagnostic — never silently
 * mis-parsed. Intended for contexts where acting on a wrong parse is
 * worse than rejecting a valid script.
 *
 * Soundness comes from two structural rules plus explicit cuts:
 *
 * 1. Separators between commands are MANDATORY (`;`, `&`, or newline).
 *    In the permissive parsers, text left over after a construct was
 *    re-interpreted as a new command (`files=(a b c)` became assignment +
 *    subshell). Here leftover text is a parse error.
 * 2. No permissive fallbacks. Any `$`, backtick, or `{`/`}` that isn't
 *    part of a supported construct fails the parse instead of degrading
 *    to a literal.
 *
 * Deliberately CUT (valid bash, rejected here — fail closed):
 *   arrays `x=(...)`, append `x+=`, ANSI-C `$'...'` / locale `$"..."`,
 *   backtick substitution (use `$()`), `[[ ]]` (its `]]` delimiter can
 *   appear inside quoted operands, so scanning for it is unsound; `[` is
 *   an ordinary command and still works), brace expansion `{a,b}` and
 *   literal `{`/`}` in words (quote them), bare `$` (write `\$` or '$'),
 *   heredocs, process substitution `<()`, `select`/`coproc`/`time`.
 *
 * Kept as RAW TEXT (delimiters are sound, contents are not interpreted):
 *   `${...}` (balanced braces), `$((...))` and `((...))` (balanced parens
 *   — sound because quotes are not delimiters in bash arithmetic).
 *
 * Semantics deliberately out of scope, as they are in bash's own parser:
 *   glob (`*`, `?`) and tilde expansion happen after parsing; consumers
 *   see the literal word text and must decide for themselves.
 */
import {
  lazy,
  many,
  many1,
  many1WithJoin,
  map,
  not,
  optional,
  or,
  peek,
  seq,
} from "@/lib/combinators";
import { makeLexemes } from "@/lib/lexeme";
import {
  anyChar,
  char,
  compileCharPredicate,
  eof,
  label,
  oneOf,
  str,
  takeWhile,
  takeWhile1,
} from "@/lib/parsers";
import { buildLineTable, offsetToPosition } from "@/lib/position";
import {
  getErrorMessage,
  getRightmostFailure,
  resetRightmostFailure,
} from "@/lib/rightmostFailure";
import { setInputStr } from "@/lib/trace";
import { Parser } from "@/lib/types";
import {
  AndOr,
  ArithmeticCommand,
  Assignment,
  BashWord,
  CaseCommand,
  CaseItem,
  Command,
  ForCommand,
  FunctionDef,
  Group,
  IfCommand,
  List,
  ListItem,
  LoopCommand,
  Pipeline,
  Redirect,
  SimpleCommand,
  Subshell,
  WordPart,
} from "./bashFromLexemes";

// ---------------------------------------------------------------------------
// Lexemes and tokens
// ---------------------------------------------------------------------------

const WORD_RESERVED = [
  "if", "then", "elif", "else", "fi",
  "do", "done", "while", "until", "for", "in",
  "case", "esac", "function",
  // Unsupported constructs, reserved so they error instead of parsing as words:
  "select", "coproc", "time", "[[", "]]",
];

const L = makeLexemes({
  whitespace: " \t",
  lineComment: "#",
  lineContinuation: true,
  operatorChars: "&|;<>",
  // identifier (for-loop variables, function names) must reject these.
  keywords: WORD_RESERVED,
});

const RESERVED_TOKENS = [...WORD_RESERVED, "{", "}", "!"];

// `{` and `}` are metacharacters here (unlike bash) because brace
// expansion is cut; a brace can only be a group delimiter or quoted.
const METACHARACTERS = " \t\n|&;()<>{}";

const wordBoundary = or(peek(oneOf(METACHARACTERS)), eof);

const reservedToken: Parser<string> = or(
  ...RESERVED_TOKENS.map((word) =>
    seq([str(word), wordBoundary], (results) => results[0] as string),
  ),
);

const whitespaceOrEnd = or(peek(oneOf(" \t\n")), eof);

// `{`, `}`, and `!` must be followed by whitespace (stricter than the
// permissive parsers: `!(` is extglob syntax, which is cut, not negation).
const groupOpen = L.lexeme(seq([str("{"), whitespaceOrEnd], () => "{"));
const groupClose = L.lexeme(seq([str("}"), wordBoundary], () => "}"));
const bangToken = L.lexeme(seq([str("!"), whitespaceOrEnd], () => "!"));

const lazyList0: Parser<List> = lazy(() => list0);
const lazyList1: Parser<List> = lazy(() => list1);
const lazyCommand: Parser<Command> = lazy(() => commandParser);

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

function literal(text: string): WordPart {
  return { tag: "literal", text };
}

function mergeLiterals(parts: WordPart[]): WordPart[] {
  const merged: WordPart[] = [];
  for (const part of parts) {
    const previous = merged[merged.length - 1];
    if (part.tag === "literal" && previous?.tag === "literal") {
      merged[merged.length - 1] = literal(previous.text + part.text);
    } else {
      merged.push(part);
    }
  }
  return merged;
}

const WORD_STOP = METACHARACTERS + "'\"`$\\";
const isWordStop = compileCharPredicate(WORD_STOP);
const NOT_SINGLE_QUOTE = (code: number) => code !== 0x27; // '

const plainRun: Parser<WordPart> = map(
  takeWhile1((code) => !isWordStop(code), "word characters"),
  literal,
);

const singleQuoted: Parser<WordPart> = label(
  "a single-quoted string",
  seq(
    [char("'"), takeWhile(NOT_SINGLE_QUOTE), char("'")],
    (results) => ({ tag: "singleQuoted", text: results[1] as string }) satisfies WordPart,
  ),
);

const IDENT_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";

const SPECIAL_VARIABLES = "?!#@*$-0123456789";

// No lone-`$` fallback: a `$` that starts no supported expansion is a
// parse error, which is what makes `$'...'` and `$"..."` fail loudly.
const variablePart: Parser<WordPart> = seq(
  [char("$"), or(oneOf(SPECIAL_VARIABLES), many1WithJoin(oneOf(IDENT_CHARS)))],
  (results) => ({ tag: "variable", name: results[1] as string }) satisfies WordPart,
);

const braceBody: Parser<string> = map(
  many(
    or(
      takeWhile1((code) => code !== 0x7b && code !== 0x7d, "brace content"), // { }
      seq(
        [char("{"), lazy(() => braceBody), char("}")],
        (results) => "{" + results[1] + "}",
      ),
    ),
  ),
  (chunks) => (chunks as string[]).join(""),
);

const paramExpansion: Parser<WordPart> = seq(
  [str("${"), braceBody, char("}")],
  (results) => ({
    tag: "paramExpansion",
    expression: results[1] as string,
  }) satisfies WordPart,
);

const parenBody: Parser<string> = map(
  many(
    or(
      takeWhile1((code) => code !== 0x28 && code !== 0x29, "paren content"), // ( )
      seq(
        [char("("), lazy(() => parenBody), char(")")],
        (results) => "(" + results[1] + ")",
      ),
    ),
  ),
  (chunks) => (chunks as string[]).join(""),
);

const arithmeticExpansion: Parser<WordPart> = seq(
  [str("$(("), parenBody, str("))")],
  (results) => ({
    tag: "arithmeticExpansion",
    expression: results[1] as string,
  }) satisfies WordPart,
);

const commandSubstitution: Parser<WordPart> = seq(
  [str("$("), lazyList0, char(")")],
  (results) => ({
    tag: "commandSubstitution",
    command: results[1] as List,
  }) satisfies WordPart,
);

const unquotedEscape: Parser<WordPart> = seq(
  [char("\\"), anyChar],
  (results) => literal(results[1] === "\n" ? "" : (results[1] as string)),
);

const DQ_ESCAPABLE = '"$`\\';

const doubleQuoteEscape: Parser<WordPart> = or(
  seq([char("\\"), oneOf(DQ_ESCAPABLE)], (results) => literal(results[1] as string)),
  seq([char("\\"), char("\n")], () => literal("")),
  map(char("\\"), () => literal("\\")),
);

const isDoubleQuoteStop = compileCharPredicate('"$`\\');

const doubleQuoteLiteral: Parser<WordPart> = map(
  takeWhile1((code) => !isDoubleQuoteStop(code), "string characters"),
  literal,
);

// No backtick alternative: an unescaped backtick inside double quotes
// fails the parse (backtick substitution is cut).
const doubleQuoted: Parser<WordPart> = seq(
  [
    char('"'),
    many(
      or(
        arithmeticExpansion,
        commandSubstitution,
        paramExpansion,
        variablePart,
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
  unquotedEscape,
  plainRun,
);

export const wordParser: Parser<BashWord> = L.lexeme(
  map(many1(wordPart), (parts) => ({
    tag: "word",
    parts: mergeLiterals(parts),
  }) satisfies BashWord),
);

/** A word shaped like an assignment (`name=` / `name+=`). At command
 * position this is never a plain command word: `name=` was already taken
 * by the assignment parser, so what reaches here is unsupported syntax
 * (append, arrays) and must fail rather than parse as a command. */
const assignmentLookalike = seq(
  [many1WithJoin(oneOf(IDENT_CHARS)), or(str("+="), str("="))],
  (results) => results[0] as string,
);

const commandWord: Parser<BashWord> = seq(
  [not(reservedToken), not(assignmentLookalike), wordParser],
  (results) => results[2] as BashWord,
);

// ---------------------------------------------------------------------------
// Redirects and assignments
// ---------------------------------------------------------------------------

const redirectOp: Parser<string> = or(
  str("&>>"), str("&>"), str(">>"), str(">|"), str(">&"),
  str("<<<"), str("<&"), str("<>"), str(">"),
  seq([str("<"), not(char("<"))], (results) => results[0] as string),
);

const fileDescriptor = many1WithJoin(oneOf("0123456789"));

export const redirectParser: Parser<Redirect> = seq(
  [optional(fileDescriptor), L.lexeme(redirectOp), wordParser],
  (results) => ({
    tag: "redirect",
    fd: results[0] === null ? null : parseInt(results[0] as string, 10),
    op: results[1] as string,
    target: results[2] as BashWord,
  }) satisfies Redirect,
);

export const assignmentParser: Parser<Assignment> = L.lexeme(
  seq(
    [many1WithJoin(oneOf(IDENT_CHARS)), str("="), optional(wordParser)],
    (results) => ({
      tag: "assignment",
      name: results[0] as string,
      value: results[2] as BashWord | null,
    }) satisfies Assignment,
  ),
);

// ---------------------------------------------------------------------------
// Simple commands
// ---------------------------------------------------------------------------

const prefixItem = or(assignmentParser, redirectParser);

function buildSimpleCommand(
  prefix: (Assignment | Redirect)[],
  first: BashWord | null,
  rest: (Redirect | BashWord)[],
): SimpleCommand {
  const assignments = prefix.filter(
    (item): item is Assignment => item.tag === "assignment",
  );
  const redirects = [
    ...prefix.filter((item): item is Redirect => item.tag === "redirect"),
    ...rest.filter((item): item is Redirect => item.tag === "redirect"),
  ];
  const words = [
    ...(first === null ? [] : [first]),
    ...rest.filter((item): item is BashWord => item.tag === "word"),
  ];
  return { tag: "simpleCommand", assignments, words, redirects };
}

const simpleCommandParser: Parser<SimpleCommand> = or(
  seq(
    [many(prefixItem), commandWord, many(or(redirectParser, wordParser))],
    (results) =>
      buildSimpleCommand(
        results[0] as (Assignment | Redirect)[],
        results[1] as BashWord,
        results[2] as (Redirect | BashWord)[],
      ),
  ),
  seq([many1(prefixItem)], (results) =>
    buildSimpleCommand(results[0] as (Assignment | Redirect)[], null, []),
  ),
);

// ---------------------------------------------------------------------------
// Compound commands
// ---------------------------------------------------------------------------

const newlineToken = L.lexeme(char("\n"));
const linebreak = many(newlineToken);

const elifClause = seq(
  [L.keyword("elif"), lazyList1, L.keyword("then"), lazyList1],
  (results) => ({ cond: results[1] as List, thenBody: results[3] as List }),
);

const elseClause = seq(
  [L.keyword("else"), lazyList1],
  (results) => results[1] as List,
);

const ifParser: Parser<IfCommand> = seq(
  [
    L.keyword("if"), lazyList1,
    L.keyword("then"), lazyList1,
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
    or(L.keyword("while"), L.keyword("until")), lazyList1,
    L.keyword("do"), lazyList1, L.keyword("done"),
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
    L.keyword("do"), lazyList1, L.keyword("done"),
  ],
  (results) => ({
    tag: "for",
    variable: results[1] as string,
    words: results[2] as BashWord[] | null,
    body: results[6] as List,
    redirects: [],
  }) satisfies ForCommand,
);

// Patterns via explicit seq/many: sepBy1 silently swallows a trailing
// separator when the next parse fails, which would hide a real error.
const casePatterns: Parser<BashWord[]> = seq(
  [
    wordParser,
    many(seq([L.operator("|"), wordParser], (results) => results[1] as BashWord)),
  ],
  (results) => [results[0] as BashWord, ...(results[1] as BashWord[])],
);

// Every item needs `;;` (or `;&` / `;;&`) unless `esac` follows directly.
const caseTerminator: Parser<string | null> = or(
  seq(
    [or(L.operator(";;&"), L.operator(";;"), L.operator(";&")), linebreak],
    (results) => results[0] as string,
  ),
  map(peek(L.keyword("esac")), () => null),
);

const caseItemParser: Parser<CaseItem> = seq(
  [optional(L.symbol("(")), casePatterns, L.symbol(")"), lazyList0, caseTerminator],
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

const arithmeticCommand: Parser<ArithmeticCommand> = L.lexeme(
  seq([str("(("), parenBody, str("))")], (results) => ({
    tag: "arithmeticCommand",
    expression: results[1] as string,
    redirects: [],
  }) satisfies ArithmeticCommand),
);

const subshellParser: Parser<Subshell> = seq(
  [L.symbol("("), lazyList1, L.symbol(")")],
  (results) => ({
    tag: "subshell",
    body: results[1] as List,
    redirects: [],
  }) satisfies Subshell,
);

const groupParser: Parser<Group> = seq(
  [groupOpen, lazyList1, groupClose],
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
  arithmeticCommand,
  subshellParser,
  groupParser,
);

const functionParens = seq([L.symbol("("), L.symbol(")")], () => "()");

const functionDefParser: Parser<FunctionDef> = or(
  seq(
    [L.keyword("function"), L.identifier, optional(functionParens), linebreak, lazyCommand],
    (results) => ({
      tag: "functionDef",
      name: results[1] as string,
      body: results[4] as Command,
    }) satisfies FunctionDef,
  ),
  seq(
    [L.identifier, functionParens, linebreak, lazyCommand],
    (results) => ({
      tag: "functionDef",
      name: results[0] as string,
      body: results[3] as Command,
    }) satisfies FunctionDef,
  ),
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
// Pipelines and lists
// ---------------------------------------------------------------------------

const pipeOperator = seq(
  [or(L.operator("|&"), L.operator("|")), linebreak],
  (results) => results[0] as string,
);

// Explicit seq/many instead of sepBy1: `echo hi |` must FAIL, not parse
// as `echo hi` with the `|` silently swallowed.
const pipelineParser: Parser<Pipeline> = seq(
  [
    optional(bangToken),
    lazyCommand,
    many(seq([pipeOperator, lazyCommand], (results) => results[1] as Command)),
  ],
  (results) => ({
    tag: "pipeline",
    negated: results[0] !== null,
    commands: [results[1] as Command, ...(results[2] as Command[])],
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

type SeparatorInfo = { background: boolean };

const itemSeparator: Parser<SeparatorInfo> = or(
  seq([L.operator("&"), linebreak], () => ({ background: true })),
  seq([L.operator(";"), linebreak], () => ({ background: false })),
  seq([newlineToken, linebreak], () => ({ background: false })),
);

// The core soundness rule: commands are SEPARATED by `;` / `&` / newline.
// A construct that stops early leaves text no separator precedes, which
// fails the enclosing parse instead of becoming a phantom second command.
const listBody: Parser<List> = seq(
  [
    andOrParser,
    many(
      seq([itemSeparator, andOrParser], (results) => ({
        separator: results[0] as SeparatorInfo,
        command: results[1] as AndOr,
      })),
    ),
    optional(itemSeparator),
  ],
  (results) => {
    const pairs = results[1] as { separator: SeparatorInfo; command: AndOr }[];
    const trailing = results[2] as SeparatorInfo | null;
    const commands = [results[0] as AndOr, ...pairs.map((pair) => pair.command)];
    // Separator i follows command i and carries its `&` marker.
    const separators: (SeparatorInfo | null)[] = [
      ...pairs.map((pair) => pair.separator),
      trailing,
    ];
    const items: ListItem[] = commands.map((command, index) => ({
      tag: "listItem",
      command,
      background: separators[index]?.background === true,
    }));
    return { tag: "list", items } satisfies List;
  },
);

const EMPTY_LIST: List = { tag: "list", items: [] };

// Empty lists are only legal where bash allows them: the top level, `$()`,
// and case-item bodies. Compound bodies and subshells require list1.
const list0: Parser<List> = seq(
  [L.whitespace, linebreak, optional(listBody)],
  (results) => (results[2] as List | null) ?? EMPTY_LIST,
);

const list1: Parser<List> = seq(
  [L.whitespace, linebreak, listBody],
  (results) => results[2] as List,
);

export const bashStrictParser: Parser<List> = seq(
  [list0, eof],
  (results) => results[0] as List,
);

// ---------------------------------------------------------------------------
// Entry point with diagnostics
// ---------------------------------------------------------------------------

export type StrictParseResult =
  | { success: true; list: List }
  | { success: false; message: string; line: number; column: number };

/** Parse a script; on failure, report the rightmost failure point with
 * 1-based line and column. */
export function parseBashStrict(input: string): StrictParseResult {
  setInputStr(input);
  resetRightmostFailure();
  const result = bashStrictParser(input);
  if (result.success) {
    return { success: true, list: result.result };
  }
  const rightmost = getRightmostFailure();
  const offset = rightmost?.pos ?? input.length - result.rest.length;
  const position = offsetToPosition(buildLineTable(input), offset);
  return {
    success: false,
    message: getErrorMessage() ?? result.message,
    line: position.line + 1,
    column: position.column + 1,
  };
}
