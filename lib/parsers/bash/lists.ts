/** Pipelines, `&&`/`||` chains, and command lists.
 *
 * The core fail-closed rule lives here: commands are SEPARATED by `;`,
 * `&`, or newline. A construct that stops early leaves text no separator
 * precedes, which fails the enclosing parse instead of becoming a
 * phantom second command (the way `files=(a b c)` would otherwise parse
 * as an assignment followed by a subshell). */
import { lazy, many, optional, or, seq } from "../../combinators.js";
import { trace } from "../../trace.js";
import { Parser, ParserResult } from "../../types.js";
import {
  bangToken,
  bashLexemes,
  linebreak,
  newlineToken,
} from "./lexemes.js";
import { commandParser as commandParserImport } from "./commands.js";
import { AndOr, Command, List, ListItem, Pipeline } from "./types.js";

const L = bashLexemes;

// Deferred to parse time: see the module-cycle note in commands.ts.
const commandParser = lazy(() => commandParserImport);

const pipeOperator = seq(
  [or(L.operator("|&"), L.operator("|")), linebreak],
  (results) => results[0] as string,
);

// Explicit seq/many instead of sepBy1: `echo hi |` must FAIL, not parse
// as `echo hi` with the `|` silently swallowed.
const pipelineParser: Parser<Pipeline> = seq(
  [
    optional(bangToken),
    commandParser,
    many(seq([pipeOperator, commandParser], (results) => results[1] as Command)),
  ],
  (results) => ({
    tag: "pipeline",
    negated: results[0] !== null,
    commands: [results[1] as Command, ...(results[2] as Command[])],
  }) satisfies Pipeline,
);

const andOrTail = seq(
  [or(L.operator("&&"), L.operator("||")), linebreak, pipelineParser],
  (results) => ({
    op: results[0] as "&&" | "||",
    pipeline: results[2] as Pipeline,
  }),
);

const andOrParser: Parser<AndOr> = seq(
  [pipelineParser, many(andOrTail)],
  (results) => ({
    tag: "andOr",
    first: results[0] as Pipeline,
    rest: results[1] as { op: "&&" | "||"; pipeline: Pipeline }[],
  }) satisfies AndOr,
);

type SeparatorInfo = { background: boolean };

const itemSeparator: Parser<SeparatorInfo> = or(
  seq([L.operator("&"), linebreak], () => ({ background: true })),
  seq([L.operator(";"), linebreak], () => ({ background: false })),
  seq([newlineToken, linebreak], () => ({ background: false })),
);

/** A parsed list plus whether it ended with an explicit separator —
 * group parsing needs this to decide whether `}` is at command position. */
export type ListWithEnd = { list: List; endedWithSeparator: boolean };

const listBody: Parser<ListWithEnd> = seq(
  [
    andOrParser,
    many(
      seq([itemSeparator, andOrParser], (results) => ({
        separator: results[0] as SeparatorInfo,
        command: results[1] as AndOr,
      })),
    ),
    optional(itemSeparator),
  ],
  (results) => {
    const pairs = results[1] as { separator: SeparatorInfo; command: AndOr }[];
    const trailing = results[2] as SeparatorInfo | null;
    const commands = [results[0] as AndOr, ...pairs.map((pair) => pair.command)];
    // Separator i follows command i and carries its `&` marker.
    const separators: (SeparatorInfo | null)[] = [
      ...pairs.map((pair) => pair.separator),
      trailing,
    ];
    const items: ListItem[] = commands.map((command, index) => ({
      tag: "listItem",
      command,
      background: separators[index]?.background === true,
    }));
    return {
      list: { tag: "list", items },
      endedWithSeparator: trailing !== null,
    } satisfies ListWithEnd;
  },
);

const EMPTY_LIST: List = { tag: "list", items: [] };

const list0Impl: Parser<List> = trace(
  "bash:list0",
  seq(
    [L.whitespace, linebreak, optional(listBody)],
    (results) => (results[2] as ListWithEnd | null)?.list ?? EMPTY_LIST,
  ),
);

const list1Impl: Parser<List> = trace(
  "bash:list1",
  seq(
    [L.whitespace, linebreak, listBody],
    (results) => (results[2] as ListWithEnd).list,
  ),
);

const list1WithEndImpl: Parser<ListWithEnd> = seq(
  [L.whitespace, linebreak, listBody],
  (results) => results[2] as ListWithEnd,
);

/** A possibly-empty command list. Empty lists are only legal where bash
 * allows them: the top level, `$()`, and case-item bodies. Declared as a
 * function so the words/lists/commands module cycle is safe under any
 * import order. */
export function list0(input: string): ParserResult<List> {
  return list0Impl(input);
}

/** A command list with at least one command — the body of every compound
 * command, subshell, and group. */
export function list1(input: string): ParserResult<List> {
  return list1Impl(input);
}

/** `list1`, but also reporting whether it ended with a separator. */
export function list1WithEnd(input: string): ParserResult<ListWithEnd> {
  return list1WithEndImpl(input);
}
