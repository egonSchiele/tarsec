export * from "./types.js";
export * from "./inline.js";
export * from "./blocks.js";
export * from "./references.js";
export * from "./frontmatter.js";

import { seq, optional, many, map } from "../../combinators.js";
import { spaces } from "../../parsers.js";
import { blockEntry } from "./blocks.js";
import { resolveReferences } from "./references.js";
import { frontmatterParser } from "./frontmatter.js";
import { Block, Frontmatter, MarkdownNode } from "./types.js";

import { Parser } from "../../types.js";

const _markdownParser: Parser<MarkdownNode[]> = seq(
  [
    optional(frontmatterParser),
    optional(spaces),
    many(blockEntry),
    optional(spaces),
  ],
  (r) => {
    const fm = r[0] as Frontmatter | null;
    const blocks = r[2] as Block[];
    return fm ? [fm, ...blocks] : blocks;
  }
);

// Resolve [id]: url definitions across the AST after parsing.
export const markdownParser: Parser<MarkdownNode[]> = map(
  _markdownParser,
  (nodes) => resolveReferences(nodes as unknown[]) as MarkdownNode[]
);
