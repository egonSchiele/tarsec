/**
 * Variant of bashFromLexemes with a constraint: no hand-written loops.
 * Every parser is built from library combinators only — no `while`/`for`,
 * no `indexOf` scanning, no regex, no imperative parser functions.
 *
 * How each hand-written loop was replaced:
 * - character runs (plainRun, dqLiteral)  -> many1WithJoin(noneOf(...))
 * - scan-to-delimiter (quotes, backticks) -> manyTill / manyTillStr
 * - balanced-depth counters (${ }, $(( ))) -> recursive grammars via lazy
 * - reserved-word / bare-word checks       -> not(...) + peek(...) boundaries
 * - "at least one of these" guards         -> or() over the valid shapes
 *
 * AST types are imported from bashFromLexemes so the two parsers can be
 * tested for exact output equivalence.
 */
import {
  lazy,
  many,
  many1,
  many1WithJoin,
  manyTill,
  manyTillStr,
  manyWithJoin,
  map,
  not,
  optional,
  or,
  peek,
  sepBy1,
  seq,
} from "@/lib/combinators";
import { makeLexemes } from "@/lib/lexeme";
import { anyChar, char, eof, noneOf, oneOf, str } from "@/lib/parsers";
import { Parser } from "@/lib/types";
import {
  AndOr,
  ArithmeticCommand,
  Assignment,
  BashWord,
  CaseCommand,
  CaseItem,
  Command,
  ConditionalCommand,
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
// Lexemes and shared tokens
// ---------------------------------------------------------------------------

const L = makeLexemes({
  whitespace: " \t",
  lineComment: "#",
  lineContinuation: true,
  operatorChars: "&|;<>",
});

const RESERVED_WORDS = [
  "if", "then", "elif", "else", "fi",
  "do", "done", "while", "until", "for", "in",
  "case", "esac", "function", "time",
  "{", "}", "!",
];

const METACHARACTERS = " \t\n|&;()<>";

/** The next character (unconsumed) would end a word, or input is done. */
const wordBoundary = or(peek(oneOf(METACHARACTERS)), eof);

/** A reserved word as a whole token. Order doesn't matter: each alternative
 * carries its own boundary check, so "do" cannot steal the front of "done". */
const reservedToken: Parser<string> = or(
  ...RESERVED_WORDS.map((word) =>
    seq([str(word), wordBoundary], (results) => results[0] as string),
  ),
);

/** Match exactly the bare word `s` (for `{`, `}`, `!`). */
function wordLiteral(s: string): Parser<string> {
  return L.lexeme(seq([str(s), wordBoundary], (results) => results[0] as string));
}

const lazyList: Parser<List> = lazy(() => listParser);
const lazyCommand: Parser<Command> = lazy(() => commandParser);

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

function literal(text: string): WordPart {
  return { tag: "literal", text };
}

/** Merge adjacent literal parts (reduce, not a loop). */
function mergeLiterals(parts: WordPart[]): WordPart[] {
  return parts.reduce<WordPart[]>((merged, part) => {
    const previous = merged[merged.length - 1];
    if (part.tag === "literal" && previous?.tag === "literal") {
      merged[merged.length - 1] = literal(previous.text + part.text);
    } else {
      merged.push(part);
    }
    return merged;
  }, []);
}

const WORD_STOP = " \t\n|&;()<>'\"`$\\";

const plainRun: Parser<WordPart> = map(many1WithJoin(noneOf(WORD_STOP)), literal);

const singleQuoted: Parser<WordPart> = seq(
  [char("'"), manyTill(char("'")), char("'")],
  (results) => ({ tag: "singleQuoted", text: results[1] as string }) satisfies WordPart,
);

const IDENT_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";

const SPECIAL_VARIABLES = "?!#@*$-0123456789";

const variablePart: Parser<WordPart> = seq(
  [char("$"), or(oneOf(SPECIAL_VARIABLES), many1WithJoin(oneOf(IDENT_CHARS)))],
  (results) => ({ tag: "variable", name: results[1] as string }) satisfies WordPart,
);

// Balanced braces by recursion instead of a depth counter: a body is a
// sequence of non-brace runs and nested `{...}` groups.
const braceBody: Parser<string> = manyWithJoin(
  or(
    many1WithJoin(noneOf("{}")),
    seq(
      [char("{"), lazy(() => braceBody), char("}")],
      (results) => "{" + results[1] + "}",
    ),
  ),
) as Parser<string>;

const paramExpansion: Parser<WordPart> = seq(
  [str("${"), braceBody, char("}")],
  (results) => ({
    tag: "paramExpansion",
    expression: results[1] as string,
  }) satisfies WordPart,
);

// Same trick for balanced parens inside $(( )) and (( )).
const parenBody: Parser<string> = manyWithJoin(
  or(
    many1WithJoin(noneOf("()")),
    seq(
      [char("("), lazy(() => parenBody), char(")")],
      (results) => "(" + results[1] + ")",
    ),
  ),
) as Parser<string>;

const arithmeticExpansion: Parser<WordPart> = seq(
  [str("$(("), parenBody, str("))")],
  (results) => ({
    tag: "arithmeticExpansion",
    expression: results[1] as string,
  }) satisfies WordPart,
);

const commandSubstitution: Parser<WordPart> = seq(
  [str("$("), lazyList, char(")")],
  (results) => ({
    tag: "commandSubstitution",
    command: results[1] as List,
  }) satisfies WordPart,
);

const backtickSubstitution: Parser<WordPart> = seq(
  [char("`"), manyTillStr("`"), char("`")],
  (results) => ({
    tag: "backtickSubstitution",
    commandText: results[1] as string,
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
  // Backslash before any other character stays literal (and consumes only itself).
  map(char("\\"), () => literal("\\")),
);

const doubleQuoteLiteral: Parser<WordPart> = map(
  many1WithJoin(noneOf('"$`\\')),
  literal,
);

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
  // A `$` before anything else (including end of input) is literal.
  map(char("$"), literal),
  plainRun,
);

export const wordParser: Parser<BashWord> = L.lexeme(
  map(many1(wordPart), (parts) => ({
    tag: "word",
    parts: mergeLiterals(parts),
  }) satisfies BashWord),
);

/** A word at command position: fails when the input starts with a reserved
 * word standing alone. Quoted or extended words (`"fi"`, `fi.txt`) pass,
 * because either `str` or the boundary check fails on them. */
const commandWord: Parser<BashWord> = seq(
  [not(reservedToken), wordParser],
  (results) => results[1] as BashWord,
);

// ---------------------------------------------------------------------------
// Redirects and assignments
// ---------------------------------------------------------------------------

// Longest first, so ">>" wins over ">". The bare "<" refuses a following
// "<" so heredocs stay unparsed rather than half-parsed.
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

// "At least one of prefix/word" guard, expressed as the two valid shapes.
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

const arithmeticCommand: Parser<ArithmeticCommand> = L.lexeme(
  seq([str("(("), parenBody, str("))")], (results) => ({
    tag: "arithmeticCommand",
    expression: results[1] as string,
    redirects: [],
  }) satisfies ArithmeticCommand),
);

const conditionalCommand: Parser<ConditionalCommand> = L.lexeme(
  seq([str("[["), manyTillStr("]]"), str("]]")], (results) => ({
    tag: "conditional",
    expression: (results[1] as string).trim(),
    redirects: [],
  }) satisfies ConditionalCommand),
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

// "Needs `function` or `()`" guard, expressed as the two valid shapes.
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

const listParser: Parser<List> = seq(
  [L.whitespace, linebreak, many(listItemParser)],
  (results) => ({ tag: "list", items: results[2] as ListItem[] }) satisfies List,
);

export const bashParser: Parser<List> = seq(
  [listParser, eof],
  (results) => results[0] as List,
);
