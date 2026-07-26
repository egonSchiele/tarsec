import { CaptureParser, failure, Parser, ParserResult, success } from "@/lib/types";
import { And, Arg, Assignment, Command, DoubleQuotedWord, FlagWord, literalWord, LiteralWord, Or, Parens, PathWord, Redirect, ScriptName, SimpleCommand, SingleQuotedWord, VariableWord, Word } from "./types";
import { alphanum, capture, char, lazy, many, many1, many1WithJoin, map, noneOf, optional, or, seqC, seqR, set, space, spaces, str, trace } from "../..";
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

export const literalWordParser: Parser<LiteralWord> = trace("literalWordParser", seqC(
  matchFail(RESERVED_WORDS),
  set("tag", "literal"),
  capture(many1WithJoin(alphanum), "text")
))

export const pathWordParser: Parser<PathWord> = trace("pathWordParser", seqC(
  matchFail(RESERVED_WORDS),
  set("tag", "path"),
  capture(many1WithJoin(or(alphanum, char("/"))), "text")
))

export const flagNameParser: Parser<string> = trace("flagNameParser", map(seqR(
  char("-"),
  optional(char("-")),
  many1WithJoin(alphanum)
), (result) => result.join("")))

export const flagWordNameOnlyParser: Parser<FlagWord> = trace("flagWordNameOnlyParser", seqC(
  set("tag", "flag"),
  capture(flagNameParser, "flagName"),
))

export const flagWordNameAndValueParser: Parser<FlagWord> = trace("flagWordNameAndValueParser", seqC(
  set("tag", "flag"),
  capture(flagNameParser, "flagName"),
  char("="),
  capture(many1WithJoin(alphanum), "flagValue")
))

export const flagWordParser: Parser<FlagWord> = trace("flagWordParser", or(
  flagWordNameAndValueParser,
  flagWordNameOnlyParser
))

export const singleQuotedWordParser: Parser<SingleQuotedWord> = trace("singleQuotedWordParser", seqC(
  set("tag", "singleQuoted"),
  char("'"),
  capture(many1WithJoin(noneOf("'")), "text"),
  char("'")
))

export const doubleQuotedWordParser: Parser<DoubleQuotedWord> = trace("doubleQuotedWordParser", seqC(
  set("tag", "doubleQuoted"),
  char('"'),
  capture(map(many1WithJoin(noneOf('"')), (text) => [literalWord(text)]), "parts"),
  char('"')
))

export const variableWordNoBracesParser: Parser<VariableWord> = trace("variableWordNoBracesParser", seqC(
  set("tag", "variable"),
  char("$"),
  capture(many1WithJoin(alphanum), "name")
))

export const variableWordWithBracesParser: Parser<VariableWord> = trace("variableWordWithBracesParser", seqC(
  set("tag", "variable"),
  char("$"),
  char("{"),
  capture(many1WithJoin(alphanum), "name"),
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
  capture(many1WithJoin(alphanum), "name"),
  char("="),
  set("value", null)
))

export const assignmentWithValueParser: Parser<Assignment> = trace("assignmentWithValueParser", seqC(
  set("tag", "assignment"),
  capture(many1WithJoin(alphanum), "name"),
  char("="),
  capture(wordParser, "value")
))

export const assignmentParser: Parser<Assignment> = trace("assignmentParser", or(
  assignmentWithValueParser,
  emptyAssignmentParser
))

export const redirectParser: Parser<Redirect> = trace("redirectParser", seqC(
  set("tag", "redirect"),
  optional(capture(map(char("2"), parseInt), "fd")),
  optional(space),
  capture(or(
    char(">"),
    char("<"),
    char(">>"),
    char("<<"),
    char("<<<"),
    char("&>"),
    char("&<")
  ), "op"),
  capture(wordParser, "target")
))

export const argParser: Parser<Arg> = trace("argParser", or(
  flagWordParser,
  wordParser
))

export const simpleCommandParser: Parser<SimpleCommand> = trace("simpleCommandParser", seqC(
  set("tag", "simpleCommand"),
  capture(many(assignmentParser), "assignments"),
  capture(scriptNameParser, "command"),
  capture(many(literalWordParser), "subcommands"),
  capture(many(argParser), "args"),
  capture(many(redirectParser), "redirects")
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