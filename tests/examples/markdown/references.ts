import {
  seqC,
  seqR,
  capture,
  optional,
  many1WithJoin,
  map,
} from "@/lib/combinators";
import { char, str, set, noneOf, spaces } from "@/lib/parsers";
import { manyTillStr, many1Till } from "@/lib/combinators";
import { Parser } from "@/lib/types";
import { LinkDef, FootnoteDef } from "./types";

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
 * Walk the AST. Collect link-definitions, then rewrite ref nodes to inline
 * links/images and strip the definitions. Id matching is case-insensitive. */
export function resolveReferences(ast: unknown[]): unknown[] {
  const linkDefs = new Map<string, LinkDef>();
  const footnoteDefs = new Map<string, FootnoteDef>();
  for (const node of ast) {
    if (!isObj(node)) continue;
    const t = (node as any).type;
    if (t === "link-definition") {
      const def = node as LinkDef;
      linkDefs.set(def.id.toLowerCase(), def);
    } else if (t === "footnote-definition") {
      const def = node as FootnoteDef;
      footnoteDefs.set(def.id.toLowerCase(), def);
    }
  }

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(walk);
    if (!isObj(node)) return node;
    const obj = node as Record<string, unknown>;

    if (obj.type === "inline-ref-link") {
      const def = linkDefs.get(String(obj.id).toLowerCase());
      if (def) {
        return {
          type: "inline-link",
          content: [{ type: "inline-text", content: obj.text }],
          url: def.url,
        };
      }
      return { type: "inline-text", content: `[${obj.text}]` };
    }

    if (obj.type === "inline-ref-image") {
      const def = linkDefs.get(String(obj.id).toLowerCase());
      if (def) {
        return { type: "image", url: def.url, alt: obj.alt };
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

    // recurse into known child-bearing fields
    const out: Record<string, unknown> = { ...obj };
    for (const key of ["content", "items", "rows"]) {
      if (Array.isArray(obj[key])) out[key] = (obj[key] as unknown[]).map(walk);
    }
    if (obj.sublist) out.sublist = walk(obj.sublist);
    return out;
  }

  return ast
    .filter(
      (n) =>
        !(
          isObj(n) &&
          ((n as any).type === "link-definition" ||
            (n as any).type === "footnote-definition")
        )
    )
    .map(walk);
}

function isObj(v: unknown): v is object {
  return typeof v === "object" && v !== null;
}
