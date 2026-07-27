/**
 * Turn a parsed AST back into a bash command.
 *
 * The inverse of `bashParser`, with one guarantee that matters more than
 * exact reproduction: **the output is always safe to hand to bash**. Text
 * that needs quoting gets quoted, whatever the node's tag claims. The
 * parser cannot produce a `LiteralWord` holding `; rm -rf /` — its word
 * charset forbids `;` — but a consumer can construct or mutate one, and a
 * naive emitter would hand that straight to a shell.
 *
 * Where quoting cannot rescue a field — a variable name, an assignment
 * target, a redirect operator — an `AstToBashError` is thrown instead.
 * Quoting those would stop them being a variable, a target or an operator
 * at all, so refusing is the only way to keep the guarantee.
 *
 * ```ts
 * const ast = bashParser("git commit -m 'hi'").result;
 * astToBash(ast); // "git commit -m 'hi'"
 * ```
 */
import {
  Assignment,
  BashAST,
  BashNode,
  Command,
  DoubleQuotedWord,
  FlagWord,
  InterpolatedVariableWord,
  Redirect,
  SimpleCommand,
  Word,
} from "./types.js";

const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";

/** The characters the parser reads as a bare word or a path. Text made
 *  only of these can be emitted unquoted and read back as the same word.
 *  This is `bareWordChars` / `bareWordStartChars` from parsers.ts plus
 *  `/`, since `literalWordParser` and `pathWordParser` between them cover
 *  both. */
const BARE_WORD_CHARS = new Set(LETTERS + DIGITS + "_-.=:+/");
const BARE_WORD_START_CHARS = new Set(LETTERS + DIGITS + "_.=:+/");

/** Characters that can continue a variable name. A variable part followed
 *  by one of these has to be braced. */
const VAR_NAME_CHARS = new Set(LETTERS + DIGITS + "_");

/** Characters the parser allows in a flag name or value. */
const FLAG_CHARS = new Set(LETTERS + DIGITS + "_-./");

/** The redirect operators the parser recognizes. `&>` is separate: bash
 *  has no fd-prefixed form of it, and the parser rejects `2&> f`. */
const FD_REDIRECT_OPS = new Set([">", ">>", "<"]);
const BARE_REDIRECT_OPS = new Set(["&>"]);

/**
 * Thrown for an AST that cannot be written as bash at all.
 *
 * Quoting rescues word TEXT — `'; rm -rf /'` is one harmless argument.
 * It cannot rescue a variable name, an assignment target or a redirect
 * operator: quoting those stops them being a variable, a target or an
 * operator. Emitting them raw would let a hand-built AST inject a second
 * command, so the only way to keep the safety guarantee is to refuse.
 */
export class AstToBashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AstToBashError";
  }
}

/** `[A-Za-z_][A-Za-z0-9_]*`, matching the parser's identifier rule. */
function isIdentifier(text: string): boolean {
  if (text.length === 0) return false;
  if (!(LETTERS + "_").includes(text[0])) return false;
  for (const character of text) {
    if (!VAR_NAME_CHARS.has(character)) return false;
  }
  return true;
}

/** A variable name: an identifier, or a single digit for a positional
 *  parameter (`$1`), matching `varNameParser`. */
function isVariableName(text: string): boolean {
  return isIdentifier(text) || (text.length === 1 && DIGITS.includes(text));
}

function isFlagText(text: string): boolean {
  for (const character of text) {
    if (!FLAG_CHARS.has(character)) return false;
  }
  return text.length > 0;
}

/** Can this text be written without quotes and read back unchanged?
 *
 *  A leading `-` disqualifies it: bare `-la` reads back as a flag, not a
 *  literal. Quoting is the safe answer in that case. */
function isBareWord(text: string): boolean {
  if (text.length === 0) return false;
  if (!BARE_WORD_START_CHARS.has(text[0])) return false;
  for (const character of text) {
    if (!BARE_WORD_CHARS.has(character)) return false;
  }
  return true;
}

/** Wrap text in single quotes. Bash has no escape inside single quotes,
 *  so an embedded `'` closes the string, emits an escaped quote, and
 *  reopens: `it's` becomes `'it'\''s'`. */
function singleQuote(text: string): string {
  return `'${text.split("'").join("'\\''")}'`;
}

/** Emit bare where that reads back unchanged, quoted otherwise. */
function quoteIfNeeded(text: string): string {
  return isBareWord(text) ? text : singleQuote(text);
}

/** Escape the characters that stay special inside double quotes. */
function escapeForDoubleQuotes(text: string): string {
  let out = "";
  for (const character of text) {
    if (character === '"' || character === "\\" || character === "$" || character === "`") {
      out += "\\";
    }
    out += character;
  }
  return out;
}

function doubleQuotedToBash(word: DoubleQuotedWord): string {
  const inner = word.parts
    .map((part) =>
      part.tag === "literal" ? escapeForDoubleQuotes(part.text) : wordToBash(part),
    )
    .join("");
  return `"${inner}"`;
}

/** Would `next` be read as a continuation of the variable name before it? */
function continuesVariableName(next: Word | undefined): boolean {
  if (next === undefined) return false;
  const text = next.tag === "literal" ? next.text : "";
  return text.length > 0 && VAR_NAME_CHARS.has(text[0]);
}

/**
 * Adjacent parts, concatenated with no separator.
 *
 * The one subtlety: `[variable "A", literal "bc"]` written plainly gives
 * `$Abc`, which reads back as a variable named `Abc` — a different
 * command. A variable is braced whenever the next part could continue its
 * name.
 */
function interpolatedToBash(word: InterpolatedVariableWord): string {
  return word.parts
    .map((part, index) => {
      if (part.tag === "variable" && continuesVariableName(word.parts[index + 1])) {
        return `\${${part.name}}`;
      }
      return wordToBash(part);
    })
    .join("");
}

function wordToBash(word: Word): string {
  switch (word.tag) {
    case "literal":
    case "path":
      return quoteIfNeeded(word.text);
    case "singleQuoted":
      return singleQuote(word.text);
    case "doubleQuoted":
      return doubleQuotedToBash(word);
    case "variable":
      if (!isVariableName(word.name)) {
        throw new AstToBashError(
          `Not a valid variable name: ${JSON.stringify(word.name)}`,
        );
      }
      return `$${word.name}`;
    case "flag":
      return flagToBash(word);
    case "interpolatedVariable":
      return interpolatedToBash(word);
  }
}

/** A flag CAN be rescued by quoting: the whole token becomes a single
 *  argument. It reads back as a quoted word rather than a flag, which is
 *  the documented trade for hand-built nodes — one argument that means
 *  what it says beats a flag that starts a second command. */
function flagToBash(word: FlagWord): string {
  const rendered =
    word.flagValue === undefined
      ? word.flagName
      : `${word.flagName}=${word.flagValue}`;
  const isSafe =
    word.flagName.startsWith("-") &&
    isFlagText(word.flagName.replace(/^--?/, "")) &&
    (word.flagValue === undefined || isFlagText(word.flagValue));
  return isSafe ? rendered : singleQuote(rendered);
}

function assignmentToBash(assignment: Assignment): string {
  if (!isIdentifier(assignment.name)) {
    throw new AstToBashError(
      `Not a valid assignment name: ${JSON.stringify(assignment.name)}`,
    );
  }
  const value = assignment.value === null ? "" : wordToBash(assignment.value);
  return `${assignment.name}=${value}`;
}

function redirectToBash(redirect: Redirect): string {
  const takesFd = FD_REDIRECT_OPS.has(redirect.op);
  if (!takesFd && !BARE_REDIRECT_OPS.has(redirect.op)) {
    throw new AstToBashError(
      `Not a supported redirect operator: ${JSON.stringify(redirect.op)}`,
    );
  }
  if (redirect.fd !== undefined && !takesFd) {
    throw new AstToBashError(
      `\`${redirect.op}\` takes no file descriptor.`,
    );
  }
  const fd = redirect.fd === undefined ? "" : String(redirect.fd);
  return `${fd}${redirect.op} ${wordToBash(redirect.target)}`;
}

/** Assignments, command, arguments, redirects.
 *
 *  Redirects go last because the AST does not record where they sat among
 *  the arguments — `cmd > out.txt arg` comes back as `cmd arg > out.txt`,
 *  which is the same command. */
function simpleCommandToBash(command: SimpleCommand): string {
  const pieces = [
    ...command.assignments.map(assignmentToBash),
    ...(command.command === null ? [] : [wordToBash(command.command)]),
    ...command.args.map(wordToBash),
    ...command.redirects.map(redirectToBash),
  ];
  return pieces.join(" ");
}

/**
 * A chain operand, parenthesized when it needs to be.
 *
 * `&&` and `||` are one precedence level and associate left, so an
 * `and`/`or` nested on the RIGHT cannot be written flat: `And(a, Or(b, c))`
 * as `a && b || c` reads back as `Or(And(a, b), c)`, a different tree.
 *
 * Bash parens are a subshell, so this is not a pure grouping — but the
 * parser never builds this shape (chains are left-associative, so right
 * children are always primaries), and it is the only way to preserve a
 * hand-built one.
 */
function chainOperandToBash(command: Command, isRightOperand: boolean): string {
  const needsParens =
    isRightOperand && (command.tag === "and" || command.tag === "or");
  const emitted = commandToBash(command);
  return needsParens ? `(${emitted})` : emitted;
}

function commandToBash(command: Command): string {
  switch (command.tag) {
    case "simpleCommand":
      return simpleCommandToBash(command);
    case "and":
    case "or": {
      const operator = command.tag === "and" ? "&&" : "||";
      const left = chainOperandToBash(command.left, false);
      const right = chainOperandToBash(command.right, true);
      return `${left} ${operator} ${right}`;
    }
    case "parens":
      return `(${commandToBash(command.command)})`;
  }
}

function isCommand(node: BashNode): node is Command {
  return (
    node.tag === "simpleCommand" ||
    node.tag === "and" ||
    node.tag === "or" ||
    node.tag === "parens"
  );
}

/**
 * Turn an AST back into bash source.
 *
 * Accepts a whole script (commands joined with `; `) or any single node,
 * down to a lone word — handy in tests and while debugging.
 *
 * For anything the parser produced, `bashParser(astToBash(ast))` gives an
 * equal AST. That is equality of ASTs, not of strings: whitespace
 * normalizes, and redirects move to the end of their command.
 *
 * For a hand-built AST the guarantee is deliberately weaker. The output is
 * always safe and always produces the words asked for, but a tag can
 * change on the way back: `literal "a b"` emits `'a b'` and returns as a
 * `singleQuoted`. No emission preserves both the tag and the meaning, and
 * meaning is the one worth keeping.
 */
export function astToBash(node: BashNode | BashAST): string {
  if (Array.isArray(node)) {
    return node.map(commandToBash).join("; ");
  }
  if (isCommand(node)) {
    return commandToBash(node);
  }
  switch (node.tag) {
    case "assignment":
      return assignmentToBash(node);
    case "redirect":
      return redirectToBash(node);
    default:
      return wordToBash(node);
  }
}
