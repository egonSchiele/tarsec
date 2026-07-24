/** Words: quoting, escapes, and expansions. A word is one or more
 * adjacent parts; only the whole word is a lexeme, so parts never eat
 * trailing whitespace (`$(pwd) x` must not glue `x` onto the word). */
import {
  lazy,
  many,
  many1,
  many1WithJoin,
  map,
  not,
  or,
  seq,
} from "../../combinators.js";
import {
  anyChar,
  char,
  compileCharPredicate,
  label,
  oneOf,
  str,
  takeWhile,
  takeWhile1,
} from "../../parsers.js";
import { trace } from "../../trace.js";
import { Parser, ParserResult } from "../../types.js";
import { bashLexemes, METACHARACTERS, reservedToken } from "./lexemes.js";
import { list0 as list0Import } from "./lists.js";
import { BashWord, List, WordPart } from "./types.js";

function literal(text: string): WordPart {
  return { tag: "literal", text };
}

/** Merge adjacent literal parts so ASTs read naturally. */
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

// No escapes exist inside single quotes; scanning to the next quote is
// exactly bash's rule.
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

// Balanced braces by recursion instead of a depth counter: a body is a
// sequence of non-brace runs and nested `{...}` groups.
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

const parenBodyImpl: Parser<string> = map(
  many(
    or(
      takeWhile1((code) => code !== 0x28 && code !== 0x29, "paren content"), // ( )
      seq(
        [char("("), lazy(() => parenBodyImpl), char(")")],
        (results) => "(" + results[1] + ")",
      ),
    ),
  ),
  (chunks) => (chunks as string[]).join(""),
);

/** Balanced parens, for `$(( ))` and `(( ))`. Sound because quotes are
 * not delimiters in bash arithmetic. Declared as a function so the
 * words/commands module cycle is safe under any import order. */
export function parenBody(input: string): ParserResult<string> {
  return parenBodyImpl(input);
}

const arithmeticExpansion: Parser<WordPart> = seq(
  [str("$(("), parenBody, str("))")],
  (results) => ({
    tag: "arithmeticExpansion",
    expression: results[1] as string,
  }) satisfies WordPart,
);

// `char(")")`, not `symbol(")")`: word parts must not eat trailing
// whitespace. `list0` is deferred to parse time: see the module-cycle
// note in commands.ts.
const commandSubstitution: Parser<WordPart> = seq(
  [str("$("), lazy(() => list0Import), char(")")],
  (results) => ({
    tag: "commandSubstitution",
    command: results[1] as List,
  }) satisfies WordPart,
);

const unquotedEscape: Parser<WordPart> = seq(
  [char("\\"), anyChar],
  // Backslash-newline inside a word disappears (line continuation).
  (results) => literal(results[1] === "\n" ? "" : (results[1] as string)),
);

const DQ_ESCAPABLE = '"$`\\';

const doubleQuoteEscape: Parser<WordPart> = or(
  seq([char("\\"), oneOf(DQ_ESCAPABLE)], (results) => literal(results[1] as string)),
  seq([char("\\"), char("\n")], () => literal("")),
  // Backslash before any other character stays literal.
  map(char("\\"), () => literal("\\")),
);

const isDoubleQuoteStop = compileCharPredicate('"$`\\');

const doubleQuoteLiteral: Parser<WordPart> = map(
  takeWhile1((code) => !isDoubleQuoteStop(code), "string characters"),
  literal,
);

// No backtick alternative: an unescaped backtick inside double quotes
// fails the parse (backtick substitution is unsupported; use `$()`).
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

const wordParserImpl: Parser<BashWord> = bashLexemes.lexeme(
  trace(
    "bash:word",
    map(many1(wordPart), (parts) => ({
      tag: "word",
      parts: mergeLiterals(parts),
    }) satisfies BashWord),
  ),
);

/** A word: quoting and expansions handled, trailing whitespace eaten.
 * Declared as a function so the words/lists/commands module cycle is
 * safe under any import order. */
export function wordParser(input: string): ParserResult<BashWord> {
  return wordParserImpl(input);
}

/** A word shaped like an assignment (`name=` / `name+=`). At command
 * position this is never a plain command word: `name=` was already taken
 * by the assignment parser, so what reaches here is unsupported syntax
 * (append, arrays) and must fail rather than parse as a command. */
export const assignmentLookalike = seq(
  [many1WithJoin(oneOf(IDENT_CHARS)), or(str("+="), str("="))],
  (results) => results[0] as string,
);

const commandWordImpl: Parser<BashWord> = seq(
  [not(reservedToken), not(assignmentLookalike), wordParser],
  (results) => results[2] as BashWord,
);

/** A word at command position: rejects reserved words standing alone,
 * which is how body lists stop at `fi`/`done`/`esac`. Quoted or extended
 * words (`"fi"`, `fi.txt`) pass, matching bash. */
export function commandWord(input: string): ParserResult<BashWord> {
  return commandWordImpl(input);
}

const identifierRunImpl = many1WithJoin(oneOf(IDENT_CHARS));

/** A run of identifier characters, shared with the assignment parser.
 * Declared as a function for module-cycle safety. */
export function identifierRun(input: string): ParserResult<string> {
  return identifierRunImpl(input);
}
