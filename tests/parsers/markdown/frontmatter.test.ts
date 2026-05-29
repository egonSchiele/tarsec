import { describe, it, expect } from "vitest";
import { success } from "@/lib/types";
import { frontmatterParser } from "@/lib/parsers/markdown/frontmatter";
import { markdownParser } from "@/lib/parsers/markdown/index";

describe("frontmatterParser", () => {
  it("parses the VitePress example with a string and a boolean", () => {
    const input = "---\ntitle: Docs with VitePress\neditLink: true\n---\n";
    expect(frontmatterParser(input)).toEqual(
      success(
        {
          type: "frontmatter",
          data: { title: "Docs with VitePress", editLink: true },
        },
        ""
      )
    );
  });

  it("parses false, null, and tilde-null", () => {
    const input = "---\na: false\nb: null\nc: ~\n---\n";
    const res = frontmatterParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.data).toEqual({ a: false, b: null, c: null });
    }
  });

  it("parses integer and float values as numbers", () => {
    const input = "---\nport: 3000\nratio: 1.5\n---\n";
    const res = frontmatterParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.data).toEqual({ port: 3000, ratio: 1.5 });
    }
  });

  it("parses single- and double-quoted strings (quotes stripped)", () => {
    const input = `---\ntitle: "Hello, World"\nsubtitle: 'a quote'\n---\n`;
    const res = frontmatterParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.data).toEqual({
        title: "Hello, World",
        subtitle: "a quote",
      });
    }
  });

  it("parses a flow list of mixed scalar values", () => {
    const input = `---\ntags: [vite, ssg, "vue 3"]\n---\n`;
    const res = frontmatterParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.data).toEqual({ tags: ["vite", "ssg", "vue 3"] });
    }
  });

  it("treats words that start with true/false/null as plain strings", () => {
    const input = "---\ntag: trueblue\nname: nullable\n---\n";
    const res = frontmatterParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result.data).toEqual({ tag: "trueblue", name: "nullable" });
    }
  });

  it("allows the closing `---` to end the input (no trailing newline)", () => {
    const input = "---\ntitle: x\n---";
    const res = frontmatterParser(input);
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.data).toEqual({ title: "x" });
  });

  it("allows an empty frontmatter block", () => {
    const input = "---\n---\n";
    const res = frontmatterParser(input);
    expect(res.success).toBe(true);
    if (res.success) expect(res.result.data).toEqual({});
  });

  it("fails when the opening `---` is missing", () => {
    expect(frontmatterParser("title: x\n---\n").success).toBe(false);
  });

  it("fails when the closing `---` is missing", () => {
    expect(frontmatterParser("---\ntitle: x\n").success).toBe(false);
  });
});

describe("markdownParser with frontmatter", () => {
  it("emits the frontmatter as the first AST node", () => {
    const input = "---\ntitle: T\neditLink: true\n---\n# Hello";
    const res = markdownParser(input);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result).toEqual([
        { type: "frontmatter", data: { title: "T", editLink: true } },
        {
          type: "heading",
          level: 1,
          content: [{ type: "inline-text", content: "Hello" }],
        },
      ]);
    }
  });

  it("still parses documents that have no frontmatter", () => {
    const res = markdownParser("# Hello");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.result).toEqual([
        {
          type: "heading",
          level: 1,
          content: [{ type: "inline-text", content: "Hello" }],
        },
      ]);
    }
  });
});
