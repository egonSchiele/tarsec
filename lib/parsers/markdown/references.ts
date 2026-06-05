import {
  seqC,
  seqR,
  capture,
  optional,
  many1WithJoin,
  map,
} from "../../combinators.js";
import { char, str, set, noneOf, spaces } from "../../parsers.js";
import { manyTillStr, many1Till } from "../../combinators.js";
import { Parser } from "../../types.js";
import { LinkDef, FootnoteDef } from "./types.js";

/* Reference link definitions.
 *
 *   [id]: url
 *   [id]: url "title"
 *
 * Built entirely from combinators. The optional title is `seqR(spaces, "..."`
 * unwrapped via `map`. */

const idChars = many1WithJoin(noneOf("]\n"));
const urlChars = many1WithJoin(noneOf(" \t\n"));
const titleChars = many1WithJoin(noneOf('"\n'));

const titleParser: Parser<string> = map(
  seqC(spaces, char('"'), capture(titleChars, "title"), char('"')),
  ({ title }) => title
);

export const linkDefinitionParser: Parser<LinkDef> = seqC(
  set("type", "link-definition"),
  char("["),
  capture(idChars, "id"),
  str("]:"),
  spaces,
  capture(urlChars, "url"),
  optional(capture(titleParser, "title"))
);

/* Footnote definitions: `[^id]: text` on a single line. */
export const footnoteDefinitionParser: Parser<FootnoteDef> = seqC(
  set("type", "footnote-definition"),
  str("[^"),
  capture(many1WithJoin(noneOf("] \n\t")), "id"),
  str("]:"),
  spaces,
  capture(many1WithJoin(noneOf("\n")), "content")
);

/* Resolution pass.
 *
 * Walk the AST. Collect link/footnote definitions (deeply — they can now
 * appear nested inside list-item block children), then rewrite ref nodes to
 * inline links/images and strip the definitions everywhere they appear. Id
 * matching is case-insensitive. */
const CHILD_KEYS = ["content", "items", "rows"] as const;

const isDef = (n: unknown): boolean =>
  isObj(n) &&
  ((n as any).type === "link-definition" ||
    (n as any).type === "footnote-definition");

export function resolveReferences(ast: unknown[]): unknown[] {
  const linkDefs = new Map<string, LinkDef>();
  const footnoteDefs = new Map<string, FootnoteDef>();

  function collect(node: unknown): void {
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    if (!isObj(node)) return;
    const obj = node as Record<string, unknown>;
    const t = obj.type;
    if (t === "link-definition") {
      const def = obj as unknown as LinkDef;
      linkDefs.set(def.id.toLowerCase(), def);
    } else if (t === "footnote-definition") {
      const def = obj as unknown as FootnoteDef;
      footnoteDefs.set(def.id.toLowerCase(), def);
    }
    for (const key of CHILD_KEYS) {
      if (Array.isArray(obj[key])) (obj[key] as unknown[]).forEach(collect);
    }
  }
  collect(ast);

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) {
      return node.filter((n) => !isDef(n)).map(walk);
    }
    if (!isObj(node)) return node;
    const obj = node as Record<string, unknown>;

    if (obj.type === "inline-ref-link") {
      const def = linkDefs.get(String(obj.id).toLowerCase());
      if (def) {
        const link: Record<string, unknown> = {
          type: "inline-link",
          content: [{ type: "inline-text", content: String(obj.text) }],
          url: def.url,
        };
        if (def.title != null) link.title = def.title;
        return link;
      }
      return { type: "inline-text", content: `[${obj.text}]` };
    }

    if (obj.type === "inline-ref-image") {
      const def = linkDefs.get(String(obj.id).toLowerCase());
      if (def) {
        const img: Record<string, unknown> = {
          type: "image",
          url: def.url,
          alt: obj.alt,
        };
        if (def.title != null) img.title = def.title;
        return img;
      }
      return { type: "inline-text", content: `![${obj.alt}]` };
    }

    if (obj.type === "inline-footnote-ref") {
      const def = footnoteDefs.get(String(obj.id).toLowerCase());
      if (def) {
        return { type: "inline-footnote-ref", id: obj.id, content: def.content };
      }
      return { type: "inline-text", content: `[^${obj.id}]` };
    }

    // Recurse into known child-bearing fields. The array path through `walk`
    // also strips nested link/footnote definitions, so list items, blockquotes,
    // etc. all get the same treatment as the top-level array.
    const out: Record<string, unknown> = { ...obj };
    for (const key of CHILD_KEYS) {
      if (Array.isArray(obj[key])) out[key] = walk(obj[key]);
    }
    return out;
  }

  return walk(ast) as unknown[];
}

function isObj(v: unknown): v is object {
  return typeof v === "object" && v !== null;
}
