import { CaptureParser, failure, Parser, ParserResult, success } from "../../types.js";
import { And, Arg, Assignment, BashAST, Command, DoubleQuotedWord, FlagWord, InterpolatedVariableWord, literalWord, LiteralWord, Or, Parens, PathWord, Redirect, ScriptName, SimpleCommand, SingleQuotedWord, VariableWord, Word } from "./types.js";
import { buildExpressionParser, capture, char, digit, eof, not, label, lazy, letter, many, many1, many1WithJoin, manyWithJoin, map, noneOf, num, oneOf, optional, or, peek, sepBy, sepBy1, seq, seqC, seqR, set, space, spaces, str, trace } from "../../index.js";
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

/** Characters allowed in a flag name or a flag value. Wider than
 * `varNameChars` because filenames routinely contain dots and hyphens
 * (`my-file.txt`).
 *
 * Deliberately excludes `=`, unlike `bareWordChars`: `--format=oneline`
 * splits into a name and a value on that `=`, so a flag name that could
 * swallow it would take the whole thing as the name. */
export const wordChars: Parser<string> = label(
  "a word character",
  oneOf(LETTERS + DIGITS + "_-./")
);

/** Characters allowed in a bare word — a command name, a filename, an
 * argument. Includes `=` because an assignment-shaped ARGUMENT is an
 * ordinary word: `env FOO=bar` passes "FOO=bar" to env in one piece.
 * (A leading assignment is still an assignment: those are parsed before
 * the command name.) */
export const bareWordChars: Parser<string> = label(
  "a word character",
  oneOf(LETTERS + DIGITS + "_-.=")
);

/** A bare word may not START with `-`: that is a flag. Without this rule
 * `subcommands` (bare literals, parsed before `args`) swallows a leading
 * flag as a literal and `FlagWord` is unreachable for `ls -la`. A hyphen
 * inside a word (`my-file`) is still fine. */
export const bareWordStartChars: Parser<string> = label(
  "a word character",
  oneOf(LETTERS + DIGITS + "_.=")
);

/** Characters that end a bare word: whitespace and the operators that
 * separate commands. */
const WORD_END_CHARS = " \t\n\r&|;()<>";

/**
 * Whitespace WITHIN a command: spaces and tabs only.
 *
 * Deliberately not tarsec's `spaces`, which includes `\n`. A newline is a
 * command SEPARATOR, and eating it as whitespace merges commands —
 * `ls\nrm -rf /tmp/x` becomes a single `ls` with arguments, so anything
 * that inspects the command name sees `ls` while bash runs the `rm`.
 */
const blanks: Parser<string> = manyWithJoin(oneOf(" \t"));

/**
 * Require that a word ran all the way to a boundary.
 *
 * Without this a word parser happily matches the FRONT of a longer token
 * — `src` out of `src/main.ts`, `FOO` out of `FOO=bar` — and the leftover
 * (`/main.ts`) matches nothing, so the whole command fails to parse with
 * no indication of why. Stopping mid-token is never right: whatever
 * follows is part of the same word.
 */
function wholeWord<T>(parser: Parser<T>): Parser<T> {
  // The boundary is REQUIRED, not optional: `optional(peek(...))` succeeds
  // whether or not a boundary follows, which makes the whole check a no-op
  // and lets `src` match out of `src/main.ts` again. `eof` covers the word
  // that ends the input, which is the only reason it looked optional.
  return getResult(seqC(result(parser), or(peek(oneOf(WORD_END_CHARS)), eof)));
}

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

export const literalWordParser: Parser<LiteralWord> = wholeWord((input: string) => {
  const result = trace("literalWordParser", seqC(
    set("tag", "literal"),
    capture(map(seqR(bareWordStartChars, manyWithJoin(bareWordChars)), (r) => r.join("")), "text")
  ))(input)
  if (result.success) {
    const text = result.result.text;
    if (RESERVED_WORDS.includes(text)) {
      return failure(`Reserved word "${text}" cannot be used.`, input);
    }
  }
  return result;
})

// Slashes are scanned as part of the run rather than used as separators,
// so a LEADING slash is just another character: `sepBy1` needed a segment
// before the first separator, which made every absolute path unparseable.
// A bare "/" and a trailing "/" are both real paths (`ls /`, `ls src/`).
export const pathWordParser: Parser<PathWord> = wholeWord((input: string) => {
  const result = trace("pathWordParser", seqC(
    set("tag", "path"),
    capture(many1WithJoin(or(bareWordChars, char("/"))), "text")
  ))(input);

  if (result.success) {
    const text = result.result.text;
    if (RESERVED_WORDS.includes(text)) {
      return failure(`Reserved word "${text}" cannot be used.`, input);
    }
    if (text.includes("//")) {
      return failure(`Path cannot contain "//".`, input);
    }
    if (!text.includes("/")) {
      return failure(`Path must contain at least one "/".`, input);
    }
  }
  return result;
})

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

export const flagWordParser: Parser<FlagWord> = trace("flagWordParser", wholeWord(or(
  flagWordNameAndValueParser,
  flagWordNameOnlyParser
)))

export const singleQuotedWordParser: Parser<SingleQuotedWord> = trace("singleQuotedWordParser", seqC(
  set("tag", "singleQuoted"),
  char("'"),
  capture(manyWithJoin(noneOf("'")), "text"),
  char("'")
))

// A run of ordinary text inside double quotes. Stops at `$` so an
// expansion is not swallowed as text, and at `\` so an escape is not.
const doubleQuotedLiteralParser: Parser<LiteralWord> = trace("doubleQuotedLiteralParser", map(
  many1WithJoin(noneOf('"$\\')),
  literalWord
))

/** The characters a backslash escapes inside double quotes. Before
 * anything else the backslash is ordinary text: bash prints `"a\zb"` as
 * `a\zb`, but `"a\"b"` as `a"b`. */
const DOUBLE_QUOTE_ESCAPABLE = '"$`\\';

const doubleQuotedEscapeParser: Parser<LiteralWord> = trace("doubleQuotedEscapeParser", or(
  map(seqR(char("\\"), oneOf(DOUBLE_QUOTE_ESCAPABLE)), (results) =>
    literalWord(results[1] as string)),
  map(char("\\"), () => literalWord("\\"))
))

// No alternative can match empty, so `many` below always terminates.
const doubleQuotedPartParser: Parser<Word> = trace("doubleQuotedPartParser", or(
  lazy(() => variableWordParser),
  doubleQuotedEscapeParser,
  doubleQuotedLiteralParser
))

/** Merge adjacent literal parts. An escape splits the text run in three
 * (`a`, `"`, `b`), which is an artifact of how it was parsed rather than
 * anything a consumer should have to reassemble. */
function mergeLiterals(parts: Word[]): Word[] {
  return parts.reduce<Word[]>((merged, part) => {
    const previous = merged[merged.length - 1];
    if (part.tag === "literal" && previous?.tag === "literal") {
      merged[merged.length - 1] = literalWord(previous.text + part.text);
      return merged;
    }
    merged.push(part);
    return merged;
  }, []);
}

/** Double quotes interpolate: `"$HOME"` expands, so the parts are text runs
 * interleaved with variables. Recording the whole thing as literal text
 * would pass a dollar sign through to the command instead of its value.
 *
 * A `$` that starts no supported expansion (`"$(date)"`, a bare `"$"`)
 * fails the parse rather than degrading to text. */
export const doubleQuotedWordParser: Parser<DoubleQuotedWord> = trace("doubleQuotedWordParser", seqC(
  set("tag", "doubleQuoted"),
  char('"'),
  capture(map(many(doubleQuotedPartParser), mergeLiterals), "parts"),
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

// A run of ordinary text inside an unquoted word. Slashes are included so
// `$HOME/bin` keeps its suffix; `$` is excluded so a variable is not eaten
// as text.
const interpolatedLiteralParser: Parser<LiteralWord> = trace("interpolatedLiteralParser", map(
  many1WithJoin(or(bareWordChars, char("/"))),
  literalWord
))

// Quoted words are parts too: `"$HOME"/x` and `"a"b` are single words.
// The literal run cannot contain a quote, so these never overlap.
const interpolatedPartParser: Parser<
  LiteralWord | VariableWord | SingleQuotedWord | DoubleQuotedWord
> = trace("interpolatedPartParser", or(
  variableWordParser,
  singleQuotedWordParser,
  doubleQuotedWordParser,
  interpolatedLiteralParser
))

/**
 * An unquoted word that mixes literal text and variables: `$HOME.txt`,
 * `$HOME/bin`, `prefix$NAME`, `$A$B`.
 *
 * These are ONE word in bash. Parsed as separate words they become
 * separate arguments, which changes what the command means — and in an
 * assignment (`PATH=$HOME/bin cmd`) it changes which program runs.
 *
 * Only matches when the word genuinely mixes: it needs at least one
 * variable and at least two parts, so a plain `file.txt` stays a
 * `LiteralWord` and a lone `$HOME` stays a `VariableWord` rather than
 * every word acquiring a `parts` array a consumer has to walk.
 */
export const interpolatedVariableWordParser: Parser<InterpolatedVariableWord> =
  wholeWord((input: string) => {
    const result = trace("interpolatedVariableWordParser",
      many1(interpolatedPartParser))(input);
    if (!result.success) return result;
    const parts = result.result as InterpolatedVariableWord["parts"];
    // Two or more parts is what makes a word interpolated. A single part
    // keeps its own simpler type: `file.txt` stays a LiteralWord, `$HOME`
    // a VariableWord, `"a b"` a DoubleQuotedWord.
    if (parts.length < 2) {
      return failure("Not an interpolated word: nothing to interpolate.", input);
    }
    return success(
      { tag: "interpolatedVariable", parts } satisfies InterpolatedVariableWord,
      result.rest
    );
  })

export const wordParser: Parser<Word> = trace("wordParser", or(
  flagWordParser,
  // Before every single-part parser: each of those would match only the
  // FIRST part of an interpolated word and leave the rest to become a
  // separate argument.
  interpolatedVariableWordParser,
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
  // No `<<` or `<<<`: a heredoc's body lives on the lines AFTER the
  // command, so `cat <<EOF` is not a redirect to a file named "EOF".
  // Parsing it as one is a silent mis-parse; leaving the operator out
  // means the `<` alternative fails on the second `<` and the command is
  // rejected instead. Longest alternative first, so `>>` beats `>`.
  capture(or(
    str(">>"),
    str("&>"),
    str(">"),
    str("<")
  ), "op"),
  blanks,
  capture(wordParser, "target")
))

export const argParser: Parser<Arg> = trace("argParser", or(
  flagWordParser,
  wordParser
))

/** Run a parser, then eat any trailing whitespace.
 *
 * The discipline: every token-shaped parser consumes its own TRAILING
 * space, and leading space is eaten once at the start of the command.
 * `sepBy(spaces, ...)` cannot express this — it only puts a separator
 * BETWEEN elements of one group, so the space between the command name
 * and its first argument, or between the last argument and a redirect,
 * had nothing to consume it and the rest of the command was left
 * unparsed. */
function token<T>(parser: Parser<T>): Parser<T> {
  return map(seqR(parser, blanks), (results) => results[0] as T);
}

/** A redirect or an argument, tried in that order.
 *
 * Interleaved rather than parsed as two separate groups, for two reasons.
 * A digit attached to an operator is a FILE DESCRIPTOR, not an argument —
 * bash reads `cmd 3> x` as "redirect fd 3, no arguments" — and args-first
 * would always claim the `3`. And bash allows a redirect anywhere among
 * the arguments (`cmd > out.txt arg`), which two fixed groups reject. */
const argOrRedirectParser: Parser<Arg | Redirect> = trace("argOrRedirectParser", or(
  redirectParser,
  argParser
))

const isRedirect = (item: Arg | Redirect): item is Redirect =>
  item.tag === "redirect";

export const simpleCommandParser: Parser<SimpleCommand> = trace("simpleCommandParser", map(
  seqC(
    set("tag", "simpleCommand"),
    blanks,
    capture(many(token(assignmentParser)), "assignments"),
    capture(token(scriptNameParser), "command"),
    // `not(redirectParser)` for the same reason: without it a bare `3`
    // lands here as a subcommand before the redirect is ever tried.
    capture(many(token(seqR(not(redirectParser), literalWordParser))), "subcommands"),
    capture(many(token(argOrRedirectParser)), "items")
  ),
  (parsed) => {
    const items = parsed.items as unknown as (Arg | Redirect)[];
    return {
      tag: "simpleCommand",
      assignments: parsed.assignments,
      command: parsed.command,
      // seqR yields [null, word]; the word is what we want.
      subcommands: (parsed.subcommands as unknown as [null, LiteralWord][])
        .map((pair) => pair[1]),
      args: items.filter((item): item is Arg => !isRedirect(item)),
      redirects: items.filter(isRedirect),
    } satisfies SimpleCommand;
  }
))

/** An operator in a `&&` / `||` chain, absorbing the whitespace around it.
 * `buildExpressionParser` applies this directly to the remaining input, so
 * it has to eat its own surrounding space; optional, so `a&&b` works too. */
const chainOperator = (symbol: "&&" | "||"): Parser<string> =>
  map(seqR(blanks, str(symbol), blanks), () => symbol);

/**
 * `a && b || c`, plus `( ... )` grouping.
 *
 * Built with `buildExpressionParser` rather than by hand because the naive
 * shape is left-recursive: an `and` parser whose first move is to call the
 * command parser recurses forever on the same input. Here the atom
 * (`simpleCommandParser`) always consumes before any operator is tried.
 *
 * Both operators sit at ONE precedence level, left-associative, because
 * that is what bash does: `a || b && c` is `((a || b) && c)`, not
 * `(a || (b && c))`. Splitting them across two levels would silently
 * change the meaning of every mixed chain.
 */
export const commandParser: Parser<Command> = trace("commandParser", buildExpressionParser<Command>(
  simpleCommandParser,
  [[
    {
      op: chainOperator("&&"),
      assoc: "left",
      apply: (left, right): And => ({ tag: "and", left, right }),
    },
    {
      op: chainOperator("||"),
      assoc: "left",
      apply: (left, right): Or => ({ tag: "or", left, right }),
    },
  ]],
  // Passed explicitly: the default paren parser returns the inner
  // expression unwrapped, which would drop the `Parens` node.
  lazy(() => parensParser)
))

export const parensParser: Parser<Parens> = trace("parensParser", seqC(
  set("tag", "parens"),
  char("("),
  capture(lazy(() => commandParser), "command"),
  char(")")
))

/** What separates two commands: a `;` or a newline.
 *
 * The trailing run absorbs blank lines and a `;` followed by a newline,
 * but NOT a second `;` — `echo a ;; echo b` stays a parse error. */
export const commandSeparator = seqR(
  blanks,
  or(char(";"), char("\n")),
  manyWithJoin(oneOf(" \t\n"))
)

export function bashParserParser(input: string): ParserResult<BashAST> {
  const result = trace("bashParser", sepBy1(commandSeparator, commandParser))(input);
  if (result.success) {
    if (result.rest.trim() !== "") {
      return failure(`Unexpected input after commands: "${result.rest}"`, input);
    }
  }
  return result;
}