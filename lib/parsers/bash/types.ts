/** AST types for the bash parser. See `index.ts` for the supported subset. */

export type Word =
  | LiteralWord
  | PathWord
  | FlagWord
  | SingleQuotedWord
  | DoubleQuotedWord
  | VariableWord;

export type ScriptName = LiteralWord | PathWord

export type LiteralWord = { tag: "literal"; text: string };
export type PathWord = { tag: "path"; text: string };

export type FlagWord = { tag: "flag"; flagName: string; flagValue?: string };
export type SingleQuotedWord = { tag: "singleQuoted"; text: string };
export type DoubleQuotedWord = { tag: "doubleQuoted"; parts: Word[] };
export type VariableWord = { tag: "variable"; name: string };

export function literalWord(text: string): LiteralWord {
  return { tag: "literal", text };
}

/** `name=value` (or `name=` with a null value) before a command. */
export type Assignment = {
  tag: "assignment";
  name: string;
  value: Word | null;
};

/** A redirect like `> out.txt`, `2>&1`, or `<<< "$str"`. `fd` is the
 * explicit file descriptor (`2` in `2>`), or null for the default. */
export type Redirect = {
  tag: "redirect";
  fd?: number;
  op: string;
  target: Word;
};

export type PositionalArg = Word;
export type FlagArg = FlagWord;
export type Arg = PositionalArg | FlagArg;

export type SimpleCommand = {
  tag: "simpleCommand";
  assignments: Assignment[];
  command: ScriptName;
  subcommands: LiteralWord[];
  args: Arg[];
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

export type BashAST = Command[];