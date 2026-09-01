/**
 * YAML frontmatter parser for the Markdown example.
 *
 * Supports the spec from https://vitepress.dev/guide/frontmatter:
 *   ---
 *   title: Docs with VitePress
 *   editLink: true
 *   ---
 *
 * YAML coverage is a useful subset (top-level `key: value` only), built from
 * Tarsec combinators per the project's "combinator-first" rule:
 *   - scalar values: bare strings, single/double-quoted strings, integers,
 *     floats, `true`/`false`, `null`/`~`
 *   - inline flow lists:  [a, b, "c d"]
 */

import {
  capture,
  many,
  many1WithJoin,
  map,
  optional,
  or,
  seqC,
  seqR,
  sepBy,
} from "../../combinators.js";
import {
  alphanum,
  char,
  eof,
  noneOf,
  oneOf,
  quotedString,
  str,
} from "../../parsers.js";
import { Parser } from "../../types.js";
import { Frontmatter, FrontmatterValue } from "./types.js";

// --- helpers -----------------------------------------------------------------

const hSpace = oneOf(" \t");
const hSpaces = many(hSpace);
const newlineOrEof = or(char("\n"), eof);

/** Strip the surrounding quote chars (`'`, `"`, or `` ` ``) added by `quotedString`. */
const stripQuotes = (s: string): string => s.slice(1, -1);

/**
 * Classify a trimmed bare scalar token into its YAML value.
 * Booleans and null are matched exactly; otherwise we try numeric, else fall
 * back to the raw string.
 */
function classifyBare(raw: string): FrontmatterValue {
  const s = raw.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "~") return null;
  if (s.length > 0) {
    const n = Number(s);
    if (!Number.isNaN(n) && Number.isFinite(n)) return n;
  }
  return s;
}

// --- key ---------------------------------------------------------------------

// Conservative key chars: letters, digits, underscore, hyphen.
const keyChar = or(alphanum, oneOf("_-"));
const yamlKey = many1WithJoin(keyChar);

// --- scalar values -----------------------------------------------------------

// Quoted scalar — returns the inner string (quotes stripped).
const quotedScalar: Parser<string> = map(quotedString, stripQuotes);

// Bare scalar in top-level context: runs to end-of-line.
const bareValueLine: Parser<FrontmatterValue> = map(
  many1WithJoin(noneOf("\n")),
  classifyBare
);

// Bare scalar inside a flow list `[...]`: ends at `,` or `]` (or `\n`).
const bareValueInList: Parser<FrontmatterValue> = map(
  many1WithJoin(noneOf(",]\n")),
  classifyBare
);

// One element of a flow list: optional leading whitespace, then quoted or bare.
const listElement: Parser<FrontmatterValue> = map(
  seqC(hSpaces, capture(or(quotedScalar, bareValueInList), "value")),
  ({ value }) => value as FrontmatterValue
);

// Inline flow list: `[a, b, "c d"]`
const flowList: Parser<FrontmatterValue[]> = map(
  seqC(
    char("["),
    capture(sepBy(char(","), listElement), "items"),
    hSpaces,
    char("]")
  ),
  ({ items }) => items as FrontmatterValue[]
);

// Any value: prefer flow list, then quoted, then bare.
const yamlValue: Parser<FrontmatterValue> = or(
  flowList,
  quotedScalar,
  bareValueLine
);

// --- entries / body ----------------------------------------------------------

// `key: value` — gap between `:` and value may include horizontal whitespace.
const yamlEntry: Parser<[string, FrontmatterValue]> = map(
  seqC(
    capture(yamlKey, "key"),
    char(":"),
    hSpaces,
    capture(yamlValue, "value")
  ),
  ({ key, value }) => [key, value] as [string, FrontmatterValue]
);

// One terminated entry: `key: value\n` (or eof-terminated).
const entryLine: Parser<[string, FrontmatterValue]> = map(
  seqC(capture(yamlEntry, "entry"), newlineOrEof),
  ({ entry }) => entry as [string, FrontmatterValue]
);

const yamlBody: Parser<[string, FrontmatterValue][]> = many(entryLine);

// --- frontmatter -------------------------------------------------------------

const fence = str("---");
const fenceLine: Parser<unknown> = seqR(fence, optional(hSpaces), char("\n"));
const closingFence: Parser<unknown> = seqR(fence, optional(hSpaces), newlineOrEof);

/**
 * VitePress-style YAML frontmatter: a `---`-delimited block at the very top
 * of a Markdown file.
 */
export const frontmatterParser: Parser<Frontmatter> = map(
  seqC(fenceLine, capture(yamlBody, "entries"), closingFence),
  ({ entries }) => {
    const data: Record<string, FrontmatterValue> = {};
    for (const [k, v] of entries) data[k] = v;
    return { type: "frontmatter" as const, data };
  }
);

// --- serializer --------------------------------------------------------------

const QUOTE_CHARS = ['"', "'", "`"];

/**
 * A value can be written bare only if the parser hands it back verbatim:
 * `bareValueLine` stops at newlines, `yamlValue` tries the flow-list and
 * quoted branches first (so leading `[` or a quote char would be
 * misinterpreted), and `classifyBare` trims and coerces bools/null/numbers.
 */
function isBareSafe(value: string): boolean {
  if (value.length === 0 || value.includes("\n")) return false;
  const first = value[0];
  if (first === "[" || QUOTE_CHARS.includes(first)) return false;
  return classifyBare(value) === value;
}

// `quotedString` treats a quote preceded by an odd run of backslashes as
// escaped, so such a value would swallow its own closing quote.
function endsWithOddBackslashRun(value: string): boolean {
  let run = 0;
  for (let i = value.length - 1; i >= 0 && value[i] === "\\"; i--) run++;
  return run % 2 === 1;
}

/**
 * Quote a value for `quotedScalar`. The parser strips the surrounding quotes
 * but does NOT decode escapes, so the only option is a quote char that never
 * appears in the value. Returns null when no quote char can hold it.
 */
function quoteValue(value: string): string | null {
  if (endsWithOddBackslashRun(value)) return null;
  for (const q of QUOTE_CHARS) {
    if (!value.includes(q)) return q + value + q;
  }
  return null;
}

/**
 * Serialize a flat record to a frontmatter block that `frontmatterParser`
 * round-trips: `parse(stringifyFrontmatter(x))` deep-equals `x` for every
 * `x` in the supported domain (flat string-to-string records).
 *
 * Values that would be coerced when bare (numbers, booleans, null, trimmed
 * whitespace, flow-list or quote syntax) are quoted; throws on keys the
 * grammar cannot spell and on values no quote char can hold (a value
 * containing all three of `"`, `'`, and `` ` `` that cannot be written bare,
 * or one ending in an odd run of backslashes).
 */
export function stringifyFrontmatter(fields: Record<string, string>): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      throw new Error(
        `stringifyFrontmatter: key ${JSON.stringify(key)} cannot be spelled ` +
          `by the frontmatter grammar (keys are [a-zA-Z0-9_-]+)`
      );
    }
    if (typeof value !== "string") {
      throw new Error(
        `stringifyFrontmatter: expected a string value for key ` +
          `${JSON.stringify(key)}, got ${typeof value}`
      );
    }
    const encoded = isBareSafe(value) ? value : quoteValue(value);
    if (encoded === null) {
      throw new Error(
        `stringifyFrontmatter: cannot serialize value for key ` +
          `${JSON.stringify(key)}: no quote character can hold ` +
          `${JSON.stringify(value)}`
      );
    }
    lines.push(`${key}: ${encoded}`);
  }
  lines.push("---");
  return lines.join("\n") + "\n";
}
