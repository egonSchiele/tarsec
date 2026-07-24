/** AST types for the bash parser. See `index.ts` for the supported subset. */

/** One piece of a word. Adjacent parts concatenate: `e'f'"g"$h` is a single
 * word of four parts. */
export type WordPart =
  | { tag: "literal"; text: string }
  | { tag: "singleQuoted"; text: string }
  | { tag: "doubleQuoted"; parts: WordPart[] }
  | { tag: "variable"; name: string }
  | { tag: "paramExpansion"; expression: string }
  | { tag: "commandSubstitution"; command: List }
  | { tag: "arithmeticExpansion"; expression: string };

export type BashWord = { tag: "word"; parts: WordPart[] };

/** `name=value` (or `name=` with a null value) before a command. */
export type Assignment = {
  tag: "assignment";
  name: string;
  value: BashWord | null;
};

/** A redirect like `> out.txt`, `2>&1`, or `<<< "$str"`. `fd` is the
 * explicit file descriptor (`2` in `2>`), or null for the default. */
export type Redirect = {
  tag: "redirect";
  fd: number | null;
  op: string;
  target: BashWord;
};

export type SimpleCommand = {
  tag: "simpleCommand";
  assignments: Assignment[];
  words: BashWord[];
  redirects: Redirect[];
};

export type IfCommand = {
  tag: "if";
  cond: List;
  thenBody: List;
  elifs: { cond: List; thenBody: List }[];
  elseBody: List | null;
  redirects: Redirect[];
};

export type LoopCommand = {
  tag: "loop";
  kind: "while" | "until";
  cond: List;
  body: List;
  redirects: Redirect[];
};

export type ForCommand = {
  tag: "for";
  variable: string;
  /** The `in word...` list, or null for the implicit `in "$@"`. */
  words: BashWord[] | null;
  body: List;
  redirects: Redirect[];
};

export type CaseItem = {
  patterns: BashWord[];
  body: List;
  /** `;;`, `;&`, `;;&`, or null when the final item ends at `esac`. */
  terminator: string | null;
};

export type CaseCommand = {
  tag: "case";
  subject: BashWord;
  items: CaseItem[];
  redirects: Redirect[];
};

export type Subshell = { tag: "subshell"; body: List; redirects: Redirect[] };

export type Group = { tag: "group"; body: List; redirects: Redirect[] };

/** `(( expression ))` as a command. The expression is kept as raw text. */
export type ArithmeticCommand = {
  tag: "arithmeticCommand";
  expression: string;
  redirects: Redirect[];
};

export type FunctionDef = { tag: "functionDef"; name: string; body: Command };

export type Command =
  | SimpleCommand
  | IfCommand
  | LoopCommand
  | ForCommand
  | CaseCommand
  | Subshell
  | Group
  | ArithmeticCommand
  | FunctionDef;

/** One or more commands joined by `|` (or `|&`), optionally negated. */
export type Pipeline = {
  tag: "pipeline";
  negated: boolean;
  commands: Command[];
};

/** Pipelines joined by `&&` / `||`, left to right. */
export type AndOr = {
  tag: "andOr";
  first: Pipeline;
  rest: { op: "&&" | "||"; pipeline: Pipeline }[];
};

export type ListItem = {
  tag: "listItem";
  command: AndOr;
  /** True when the command was followed by `&`. */
  background: boolean;
};

/** A sequence of commands separated by `;`, `&`, or newlines — the top
 * level of a script, and the body of every compound command. */
export type List = { tag: "list"; items: ListItem[] };
