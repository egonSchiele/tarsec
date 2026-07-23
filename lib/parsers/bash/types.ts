import { Span } from "../../position.js";

/** One shell word. Quoting is respected for *boundaries* but the text is
 * stored raw and unstructured — expansion ASTs are a future scope. */
export type BashWord = { type: "word"; text: string; span: Span };

export type BashAssignment = {
  type: "assignment";
  name: string;
  /** null for an empty value, e.g. `FOO=` */
  value: BashWord | null;
  span: Span;
};

/** The redirect operator as written, with optional leading fd digits:
 * ">", ">>", "<", "2>", "&>", and fd duplication "2>&1" / "1>&2" / ">&2" /
 * ">&-". A string rather than a union because the fd prefix is open-ended
 * (`22>x` is valid bash). */
export type FileRedirectOp = string;

export type FileRedirect = {
  type: "redirect";
  op: FileRedirectOp;
  /** null for fd-duplication ops (`[n]>&m`, `[n]>&-`), which take no target */
  target: BashWord | null;
  span: Span;
};

export type HeredocRedirect = {
  type: "heredoc";
  tag: string;
  /** true for <<- (leading tabs stripped from body and delimiter) */
  stripTabs: boolean;
  /** true when the tag was quoted (<<'TAG'), which suppresses expansion —
   * recorded now, meaningful when expansion parsing lands */
  quoted: boolean;
  /** filled in when the body is drained at the next newline */
  body: string | null;
  /** span of the << redirect itself */
  span: Span;
  /** span of the body text, filled at drain time */
  bodySpan: Span | null;
};

export type BashRedirect = FileRedirect | HeredocRedirect;

export type SimpleCommand = {
  type: "simple-command";
  assignments: BashAssignment[];
  /** first word is the command name */
  words: BashWord[];
  redirects: BashRedirect[];
  span: Span;
};

export type Pipeline = { type: "pipeline"; commands: BashNode[]; span: Span };

export type AndOrOp = "&&" | "||";

export type AndOr = {
  type: "and-or";
  first: BashNode;
  rest: { op: AndOrOp; command: BashNode }[];
  span: Span;
};

/** Compound commands (if/while/for/case) join this union in a future scope. */
export type BashNode = SimpleCommand | Pipeline | AndOr;

export type Statement = {
  type: "statement";
  body: BashNode;
  /** true when terminated with & */
  background: boolean;
  span: Span;
};

export type BashScript = { type: "script"; statements: Statement[]; span: Span };
