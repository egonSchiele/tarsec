import { assert, describe, expect, it } from "vitest";
import {
  headingParser,
  codeBlockParser,
  blockQuoteParser,
  listParser,
  paragraphParser,
  imageParser,
} from "./markdown";
import { success } from "@/lib/types";

describe("headingParser", () => {
  it("should parse heading level 1", () => {
    const input = "# Heading 1";
    const expected = {
      type: "heading",
      level: 1,
      content: "Heading 1",
    };
    expect(headingParser(input)).toEqual(success(expected, ""));
  });

  it("should parse heading level 2", () => {
    const input = "## Heading 2";
    const expected = {
      type: "heading",
      level: 2,
      content: "Heading 2",
    };
    expect(headingParser(input)).toEqual(success(expected, ""));
  });
});

describe("codeBlockParser", () => {
  it("should parse code block", () => {
    const input = "```javascript\nconst a = 10;\n```";
    const expected = {
      language: "javascript",
      content: "const a = 10;\n",
    };
    expect(codeBlockParser(input)).toEqual(success(expected, ""));
  });

  it("should parse code block with no language", () => {
    const input = "```\nconst a = 10;\n```";
    const expected = {
      language: null,
      content: "const a = 10;\n",
    };
    expect(codeBlockParser(input)).toEqual(success(expected, ""));
  });
});

describe("blockQuoteParser", () => {
  it("should parse block quote", () => {
    const input = "> Blockquote";
    const expected = {
      content: "Blockquote",
    };
    expect(blockQuoteParser(input)).toEqual(success(expected, ""));
  });
});

describe("listParser", () => {
  it("should parse unordered list item", () => {
    const input = "- Item 1";
    const expected = {
      char: "-",
      content: "Item 1",
    };
    expect(listParser(input)).toEqual(success(expected, ""));
  });
});

describe("paragraphParser", () => {
  it("should parse paragraph", () => {
    const input = "This is a paragraph.";
    const expected = {
      content: "This is a paragraph.",
    };
    expect(paragraphParser(input)).toEqual(success(expected, ""));
  });
});

describe("imageParser", () => {
  it("should parse image", () => {
    const input = "![Alt Text](https://example.com/image.jpg)";
    const expected = {
      alt: "Alt Text",
      url: "https://example.com/image.jpg",
    };
    expect(imageParser(input)).toEqual(success(expected, ""));
  });
});
