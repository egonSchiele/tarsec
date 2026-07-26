/** AST types for the bash parser. See `index.ts` for the supported subset. */

export type Word =
  | LiteralWord
  | PathWord
  | FlagWord
  | SingleQuotedWord
  | DoubleQuotedWord
  | VariableWord
  | InterpolatedVariableWord;

export type ScriptName = LiteralWord | PathWord

export type LiteralWord = { tag: "literal"; text: string };
export type PathWord = { tag: "path"; text: string };

export type FlagWord = { tag: "flag"; flagName: string; flagValue?: string };
export type SingleQuotedWord = { tag: "singleQuoted"; text: string };
export type DoubleQuotedWord = { tag: "doubleQuoted"; parts: Word[] };
export type VariableWord = { tag: "variable"; name: string };
/** A word built from two or more adjacent parts: `$HOME.txt`, `"a"b`,
 * `"$HOME"/x`. These are ONE word in bash; split into separate words they
 * become separate arguments and the command means something else.
 *
 * Quoted parts belong here as much as variables do — quoting a variable
 * and appending to it (`"$HOME"/bin`) is idiomatic shell. */
export type InterpolatedVariableWord = {
  tag: "interpolatedVariable";
  parts: (LiteralWord | VariableWord | SingleQuotedWord | DoubleQuotedWord)[];
};

export function literalWord(text: string): LiteralWord {
  return { tag: "literal", text };
}

/** `name=value` (or `name=` with a null value) before a command. */
export type Assignment = {
  tag: "assignment";
  name: string;
  value: Word | null;
};

/** A redirect like `> out.txt`, `>> log`, `2> err.txt` or `< in.txt`.
 * `fd` is the explicit file descriptor (`2` in `2>`), or undefined for the
 * default. Only `>`, `>>`, `<` and `&>` are recognized; `2>&1`, heredocs
 * and here-strings are rejected rather than parsed. */
export type Redirect = {
  tag: "redirect";
  fd?: number;
  op: string;
  target: Word;
};

export type SimpleCommand = {
  tag: "simpleCommand";
  assignments: Assignment[];
  /** The command name, or null for an assignment-only line (`FOO=bar`).
   *  Bash requires at least one of a command name or an assignment. */
  command: ScriptName | null;
  /** Every word after the command name, in source order. There is no
   *  `subcommands` field: no syntactic rule separates `git status` from
   *  `echo status`, so splitting them would put a command's real
   *  arguments in whichever bucket the preceding word happened to pick. */
  args: Word[];
  redirects: Redirect[];
};

export type Command = SimpleCommand | And | Or | Parens;

export type And = {
  tag: "and";
  left: Command;
  right: Command;
}

export type Or = {
  tag: "or";
  left: Command;
  right: Command;
}


export type Parens = {
  tag: "parens";
  command: Command;
};

export type BashNode = Command | SimpleCommand | Assignment | Redirect | Word | ScriptName;

export type BashAST = Command[];