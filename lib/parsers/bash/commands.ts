/** Commands: redirects, assignments, simple commands, compound commands,
 * and function definitions. */
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
} from "../../combinators.js";
import { char, oneOf, str } from "../../parsers.js";
import { trace } from "../../trace.js";
import { failure, Parser, ParserResult, success } from "../../types.js";
import {
  bashLexemes,
  groupClose,
  groupOpen,
  linebreak,
  newlineToken,
  wordBoundary,
} from "./lexemes.js";
import {
  list0 as list0Import,
  list1 as list1Import,
  list1WithEnd as list1WithEndImport,
  ListWithEnd,
} from "./lists.js";
import {
  commandWord as commandWordImport,
  identifierRun as identifierRunImport,
  parenBody as parenBodyImport,
  wordParser as wordParserImport,
} from "./words.js";
import {
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
  LoopCommand,
  Redirect,
  SimpleCommand,
  Subshell,
} from "./types.js";

const L = bashLexemes;

// The words/lists/commands modules form an import cycle. Deferring every
// cross-module reference to parse time (via lazy) keeps the cycle safe
// regardless of module evaluation order or transform.
const list0 = lazy(() => list0Import);
const list1 = lazy(() => list1Import);
const commandWord = lazy(() => commandWordImport);
const identifierRun = lazy(() => identifierRunImport);
const parenBody = lazy(() => parenBodyImport);
const wordParser = lazy(() => wordParserImport);
const list1WithEnd = lazy(() => list1WithEndImport);

// ---------------------------------------------------------------------------
// Redirects and assignments
// ---------------------------------------------------------------------------

// Longest first, so ">>" wins over ">". The bare "<" refuses a following
// "<" so heredocs (unsupported) stay unparsed rather than half-parsed.
const redirectOp: Parser<string> = or(
  str("&>>"), str("&>"), str(">>"), str(">|"), str(">&"),
  str("<<<"), str("<&"), str("<>"), str(">"),
  seq([str("<"), not(char("<"))], (results) => results[0] as string),
);

const fileDescriptor = many1WithJoin(oneOf("0123456789"));

/** `> file`, `2>&1`, `<<< "$str"`, ... The file descriptor must be
 * attached to the operator (`2>` redirects fd 2; `2 >` is an argument). */
export const redirectParser: Parser<Redirect> = trace(
  "bash:redirect",
  seq(
    [optional(fileDescriptor), L.lexeme(redirectOp), wordParser],
    (results) => ({
      tag: "redirect",
      fd: results[0] === null ? null : parseInt(results[0] as string, 10),
      op: results[1] as string,
      target: results[2] as BashWord,
    }) satisfies Redirect,
  ),
);

/** `name=value`, `name=`, or `name="$x"y` — value is a full word. */
export const assignmentParser: Parser<Assignment> = L.lexeme(
  trace(
    "bash:assignment",
    seq(
      [identifierRun, str("="), optional(wordParser)],
      (results) => ({
        tag: "assignment",
        name: results[0] as string,
        value: results[2] as BashWord | null,
      }) satisfies Assignment,
    ),
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

// "At least one of prefix/word" expressed as the two valid shapes.
const simpleCommandParser: Parser<SimpleCommand> = trace(
  "bash:simpleCommand",
  or(
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
  ),
);

// ---------------------------------------------------------------------------
// Compound commands
// ---------------------------------------------------------------------------

const elifClause = seq(
  [L.keyword("elif"), list1, L.keyword("then"), list1],
  (results) => ({ cond: results[1] as List, thenBody: results[3] as List }),
);

const elseClause = seq(
  [L.keyword("else"), list1],
  (results) => results[1] as List,
);

const ifParser: Parser<IfCommand> = seq(
  [
    L.keyword("if"), list1,
    L.keyword("then"), list1,
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
    or(L.keyword("while"), L.keyword("until")), list1,
    L.keyword("do"), list1, L.keyword("done"),
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
    L.keyword("do"), list1, L.keyword("done"),
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

// Without a leading `(`, a bare `esac` cannot start a pattern — it ends
// the case statement (bash rejects `case x in esac) ...`).
const bareEsac = seq([str("esac"), wordBoundary], () => "esac");

const caseItemStart: Parser<BashWord[]> = or(
  seq([L.symbol("("), casePatterns], (results) => results[1] as BashWord[]),
  seq([not(bareEsac), casePatterns], (results) => results[1] as BashWord[]),
);

const caseItemParser: Parser<CaseItem> = seq(
  [caseItemStart, L.symbol(")"), list0, caseTerminator],
  (results) => ({
    patterns: results[0] as BashWord[],
    body: results[2] as List,
    terminator: results[3] as string | null,
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
  [L.symbol("("), list1, L.symbol(")")],
  (results) => ({
    tag: "subshell",
    body: results[1] as List,
    redirects: [],
  }) satisfies Subshell,
);

/** Can `}` directly follow this command, as it can in bash? True for a
 * compound command with no trailing redirects (`{ { echo a; } }`), and
 * for a function definition whose body qualifies. A redirect re-enters
 * word context (`{ { cat; } > log }` is rejected by bash), and `(( ))`
 * does not qualify. */
function closesGroup(command: Command): boolean {
  if (command.tag === "functionDef") return closesGroup(command.body);
  const isCompound =
    command.tag === "if" ||
    command.tag === "loop" ||
    command.tag === "for" ||
    command.tag === "case" ||
    command.tag === "subshell" ||
    command.tag === "group";
  return isCompound && command.redirects.length === 0;
}

function endsAtCommandPosition({ list, endedWithSeparator }: ListWithEnd): boolean {
  if (endedWithSeparator) return true;
  const lastItem = list.items[list.items.length - 1];
  const andOr = lastItem.command;
  const lastPipeline =
    andOr.rest.length > 0 ? andOr.rest[andOr.rest.length - 1].pipeline : andOr.first;
  return closesGroup(lastPipeline.commands[lastPipeline.commands.length - 1]);
}

// `}` is a reserved word, recognized only at command position: the group
// body must end with a separator or a bare compound command. Without this
// check, `{ echo a }` would fail OPEN (bash treats that `}` as an
// argument to echo and rejects the unterminated group).
const groupParser: Parser<Group> = (input) => {
  const result = seq(
    [groupOpen, list1WithEnd, groupClose],
    (results) => results[1] as ListWithEnd,
  )(input);
  if (!result.success) return result;
  if (!endsAtCommandPosition(result.result)) {
    return failure("expected ; & or newline before }", input);
  }
  return success(
    { tag: "group", body: result.result.list, redirects: [] } satisfies Group,
    result.rest,
  );
};

const compoundParser: Parser<Command> = or(
  ifParser,
  loopParser,
  forParser,
  caseParser,
  arithmeticCommand,
  subshellParser,
  groupParser,
);

const compoundWithRedirects: Parser<Command> = seq(
  [compoundParser, many(redirectParser)],
  (results) => ({
    ...(results[0] as Command),
    redirects: results[1] as Redirect[],
  }),
);

const functionParens = seq([L.symbol("("), L.symbol(")")], () => "()");

// "Needs `function` or `()`" expressed as the two valid shapes. The body
// must be a compound command (bash rejects `f() echo hi` and nested
// definitions like `f() g() { :; }`); trailing redirects are allowed.
const functionDefParser: Parser<FunctionDef> = or(
  seq(
    [L.keyword("function"), L.identifier, optional(functionParens), linebreak, compoundWithRedirects],
    (results) => ({
      tag: "functionDef",
      name: results[1] as string,
      body: results[4] as Command,
    }) satisfies FunctionDef,
  ),
  seq(
    [L.identifier, functionParens, linebreak, compoundWithRedirects],
    (results) => ({
      tag: "functionDef",
      name: results[0] as string,
      body: results[3] as Command,
    }) satisfies FunctionDef,
  ),
);

const commandParserImpl: Parser<Command> = trace(
  "bash:command",
  or(compoundWithRedirects, functionDefParser, simpleCommandParser),
);

/** Any single command: simple, compound (with trailing redirects), or a
 * function definition. Declared as a function so the words/lists/commands
 * module cycle is safe under any import order. */
export function commandParser(input: string): ParserResult<Command> {
  return commandParserImpl(input);
}
