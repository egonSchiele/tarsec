import { describe, it, expect } from "vitest";
import { success } from "@/lib/types";
import { linkDefinitionParser, resolveReferences } from "./references";

describe("linkDefinitionParser", () => {
  it("parses [id]: url", () => {
    const res = linkDefinitionParser("[foo]: https://x");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result).toEqual({
        type: "link-definition",
        id: "foo",
        url: "https://x",
      });
    }
  });

  it('parses [id]: url "title"', () => {
    const res = linkDefinitionParser('[foo]: https://x "T"');
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result).toEqual({
        type: "link-definition",
        id: "foo",
        url: "https://x",
        title: "T",
      });
    }
  });
});

describe("resolveReferences", () => {
  it("resolves ref links via [id]: url definitions", () => {
    const ast = [
      { type: "link-definition", id: "x", url: "https://x" },
      {
        type: "paragraph",
        content: [{ type: "inline-ref-link", text: "hi", id: "x" }],
      },
    ];
    expect(resolveReferences(ast)).toEqual([
      {
        type: "paragraph",
        content: [{ type: "inline-link", content: "hi", url: "https://x" }],
      },
    ]);
  });

  it("resolves ref images", () => {
    const ast = [
      { type: "link-definition", id: "img", url: "u.png" },
      {
        type: "paragraph",
        content: [{ type: "inline-ref-image", alt: "alt", id: "img" }],
      },
    ];
    const out = resolveReferences(ast) as any[];
    expect(out[0].content[0]).toEqual({
      type: "image",
      url: "u.png",
      alt: "alt",
    });
  });

  it("leaves unresolved refs as inline-text fallback", () => {
    const ast = [
      {
        type: "paragraph",
        content: [{ type: "inline-ref-link", text: "hi", id: "unknown" }],
      },
    ];
    const out = resolveReferences(ast) as any[];
    expect(out[0].content[0].type).toBe("inline-text");
  });

  it("case-insensitive id matching", () => {
    const ast = [
      { type: "link-definition", id: "FOO", url: "https://x" },
      {
        type: "paragraph",
        content: [{ type: "inline-ref-link", text: "hi", id: "foo" }],
      },
    ];
    const out = resolveReferences(ast) as any[];
    expect(out[0].content[0].type).toBe("inline-link");
  });
});
