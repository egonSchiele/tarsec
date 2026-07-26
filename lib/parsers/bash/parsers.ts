import { CaptureParser, failure, Parser, ParserResult, success } from "../../types.js";
import { And, Arg, Assignment, BashAST, Command, DoubleQuotedWord, FlagWord, literalWord, LiteralWord, Or, Parens, PathWord, Redirect, ScriptName, SimpleCommand, SingleQuotedWord, VariableWord, Word } from "./types.js";
import { capture, char, digit, label, lazy, letter, many, many1, many1WithJoin, manyWithJoin, map, noneOf, num, oneOf, optional, or, sepBy, sepBy1, seqC, seqR, set, space, spaces, str, trace } from "../../index.js";
export const RESERVED_WORDS = [
  "if", "then", "elif", "else", "fi",
  "do", "done", "while", "until", "for", "in",
  "case", "esac", "function",
  "select", "coproc", "time", "[[", "]]",
];

function matchFail(array: string[]) {
  return (input: string) => {
    if (array.includes(input)) {
      return failure(`Reserved word "${input}" cannot be used.`, input);
    }
    return success(input, input);
  };
}

function result<T>(parser: Parser<T>): CaptureParser<T, { result: T }> {
  return capture(parser, "result")
}

function getResult<T>(parser: Parser<{ result: T }>): Parser<T> {
  return (input: string): ParserResult<T> => {
    const result = parser(input);
    if (result.success) {
      return success(result.result.result, result.rest);
    } else {
      return result;
    }
  };
}

const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";

/** Characters allowed inside a VARIABLE name. Deliberately narrower than
 * `wordChars`: a dot or hyphen ends the name, so `$HOME.txt` is `$HOME`
 * followed by the text ".txt", as in bash. */
export const varNameChars: Parser<string> = label(
  "a variable name character",
  oneOf(LETTERS + DIGITS + "_")
);

/** Characters allowed in a bare WORD — a command name, a filename, a flag
 * value. Wider than `varNameChars` because filenames routinely contain
 * dots and hyphens (`my-file.txt`). */
export const wordChars: Parser<string> = label(
  "a word character",
  oneOf(LETTERS + DIGITS + "_-.")
);

/** An identifier: `[A-Za-z_][A-Za-z0-9_]*`. `manyWithJoin`, not `many1`,
 * so a one-character name (`x=1`, `$A`) is valid. */
const identifierParser: Parser<string> = map(seqR(
  or(letter, char("_")),
  manyWithJoin(varNameChars)
), (result) => result.join(""))

/** The name in `$name` / `${name}`. A lone digit is a positional
 * parameter (`$1`); unbraced, `$12` is `$1` followed by "2". */
export const varNameParser: Parser<string> = trace("varNameParser", or(
  identifierParser,
  digit
))

/** The target of an assignment. Unlike `varNameParser` this refuses a
 * digit: bash runs `1x=1` as a command literally named "1x=1", so
 * recording it as an assignment would misreport what runs. */
export const assignmentNameParser: Parser<string> = trace("assignmentNameParser", identifierParser)

export const literalWordParser: Parser<LiteralWord> = (input: string) => {
  const result = trace("literalWordParser", seqC(
    set("tag", "literal"),
    capture(many1WithJoin(wordChars), "text")
  ))(input)
  if (result.success) {
    const text = result.result.text;
    if (RESERVED_WORDS.includes(text)) {
      return failure(`Reserved word "${text}" cannot be used.`, input);
    }
  }
  return result;
}

export const pathWordParser: Parser<PathWord> = (input: string) => {
  const result = trace("pathWordParser", seqC(
    set("tag", "path"),
    capture(map(sepBy1(char("/"), many1WithJoin(wordChars)), (parts) => parts.join("/")), "text")
  ))(input);

  if (result.success) {
    const text = result.result.text;
    if (RESERVED_WORDS.includes(text)) {
      return failure(`Reserved word "${text}" cannot be used.`, input);
    }
  }
  return result;
}

export const flagNameParser: Parser<string> = trace("flagNameParser", map(seqR(
  char("-"),
  optional(char("-")),
  many1WithJoin(wordChars)
), (result) => result.join("")))

export const flagWordNameOnlyParser: Parser<FlagWord> = trace("flagWordNameOnlyParser", seqC(
  set("tag", "flag"),
  capture(flagNameParser, "flagName"),
))

export const flagWordNameAndValueParser: Parser<FlagWord> = trace("flagWordNameAndValueParser", seqC(
  set("tag", "flag"),
  capture(flagNameParser, "flagName"),
  char("="),
  capture(many1WithJoin(wordChars), "flagValue")
))

export const flagWordParser: Parser<FlagWord> = trace("flagWordParser", or(
  flagWordNameAndValueParser,
  flagWordNameOnlyParser
))

export const singleQuotedWordParser: Parser<SingleQuotedWord> = trace("singleQuotedWordParser", seqC(
  set("tag", "singleQuoted"),
  char("'"),
  capture(manyWithJoin(noneOf("'")), "text"),
  char("'")
))

// A run of ordinary text inside double quotes. Stops at `$` so an
// expansion is not swallowed as text.
const doubleQuotedLiteralParser: Parser<LiteralWord> = trace("doubleQuotedLiteralParser", map(
  many1WithJoin(noneOf('"$')),
  literalWord
))

// Neither alternative can match empty, so `many` below always terminates.
const doubleQuotedPartParser: Parser<Word> = trace("doubleQuotedPartParser", or(
  lazy(() => variableWordParser),
  doubleQuotedLiteralParser
))

/** Double quotes interpolate: `"$HOME"` expands, so the parts are text runs
 * interleaved with variables. Recording the whole thing as literal text
 * would pass a dollar sign through to the command instead of its value.
 *
 * A `$` that starts no supported expansion (`"$(date)"`, a bare `"$"`)
 * fails the parse rather than degrading to text. */
export const doubleQuotedWordParser: Parser<DoubleQuotedWord> = trace("doubleQuotedWordParser", seqC(
  set("tag", "doubleQuoted"),
  char('"'),
  capture(many(doubleQuotedPartParser), "parts"),
  char('"')
))

export const variableWordNoBracesParser: Parser<VariableWord> = trace("variableWordNoBracesParser", seqC(
  set("tag", "variable"),
  char("$"),
  capture(varNameParser, "name")
))

export const variableWordWithBracesParser: Parser<VariableWord> = trace("variableWordWithBracesParser", seqC(
  set("tag", "variable"),
  char("$"),
  char("{"),
  capture(varNameParser, "name"),
  char("}")
))

export const variableWordParser: Parser<VariableWord> = trace("variableWordParser", or(
  variableWordWithBracesParser,
  variableWordNoBracesParser
))

export const wordParser: Parser<Word> = trace("wordParser", or(
  flagWordParser,
  singleQuotedWordParser,
  doubleQuotedWordParser,
  variableWordParser,
  pathWordParser,
  literalWordParser,
))

export const scriptNameParser: Parser<ScriptName> = trace("scriptNameParser", or(
  pathWordParser,
  literalWordParser,
))

export const emptyAssignmentParser: Parser<Assignment> = trace("emptyAssignmentParser", seqC(
  set("tag", "assignment"),
  capture(assignmentNameParser, "name"),
  char("="),
  set("value", null)
))

export const assignmentWithValueParser: Parser<Assignment> = trace("assignmentWithValueParser", seqC(
  set("tag", "assignment"),
  capture(assignmentNameParser, "name"),
  char("="),
  capture(wordParser, "value")
))

export const assignmentParser: Parser<Assignment> = trace("assignmentParser", or(
  assignmentWithValueParser,
  emptyAssignmentParser
))

export const redirectParser: Parser<Redirect> = trace("redirectParser", seqC(
  set("tag", "redirect"),
  optional(capture(map(num, parseInt), "fd")),
  capture(or(
    str("<<<"),
    str(">>"),
    str("<<"),
    str(">"),
    str("<"),
    str("&>"),
    str("&<")
  ), "op"),
  optional(space),
  capture(wordParser, "target")
))

export const argParser: Parser<Arg> = trace("argParser", or(
  flagWordParser,
  wordParser
))

export const simpleCommandParser: Parser<SimpleCommand> = trace("simpleCommandParser", seqC(
  set("tag", "simpleCommand"),
  capture(sepBy(spaces, assignmentParser), "assignments"),
  capture(scriptNameParser, "command"),
  capture(sepBy(spaces, literalWordParser), "subcommands"),
  capture(sepBy(spaces, argParser), "args"),
  capture(sepBy(spaces, redirectParser), "redirects")
))

export const andParser: Parser<And> = trace("andParser", seqC(
  set("tag", "and"),
  capture(lazy(() => commandParser), "left"),
  spaces,
  str("&&"),
  spaces,
  capture(lazy(() => commandParser), "right")
))

export const orParser: Parser<Or> = trace("orParser", seqC(
  set("tag", "or"),
  capture(lazy(() => commandParser), "left"),
  spaces,
  str("||"),
  spaces,
  capture(lazy(() => commandParser), "right")
))

export const commandParser: Parser<Command> = trace("commandParser", or(
  andParser,
  orParser,
  lazy(() => parensParser),
  simpleCommandParser
))

export const parensParser: Parser<Parens> = trace("parensParser", seqC(
  set("tag", "parens"),
  char("("),
  capture(lazy(() => commandParser), "command"),
  char(")")
))

export const semicolonSeparator = seqR(
  optional(spaces),
  char(";"),
  optional(spaces)
)

export function bashParserParser(input: string): ParserResult<BashAST> {
  const result = trace("bashParser", sepBy1(semicolonSeparator, commandParser))(input);
  if (result.success) {
    if (result.rest.trim() !== "") {
      return failure(`Unexpected input after commands: "${result.rest}"`, input);
    }
  }
  return result;
}