/* AST types for the Markdown example parser. */

export type InlineMarkdown =
  | InlineText
  | InlineBold
  | InlineItalic
  | InlineBoldItalic
  | InlineLink
  | InlineCode;

export type InlineText = {
  type: "inline-text";
  content: string;
};

export type InlineBold = {
  type: "inline-bold";
  content: string;
};

export type InlineItalic = {
  type: "inline-italic";
  content: string;
};

export type InlineBoldItalic = {
  type: "inline-bold-italic";
  content: string;
};

export type InlineLink = {
  type: "inline-link";
  content: string;
  url: string;
};

export type InlineCode = {
  type: "inline-code";
  content: string;
};

export type Paragraph = {
  type: "paragraph";
  content: InlineMarkdown[];
};

export type Heading = {
  type: "heading";
  level: number;
  content: string;
};

export type CodeBlock = {
  type: "code-block";
  content: string;
  language: string | null;
};

export type BlockQuote = {
  type: "block-quote";
  content: string;
};

export type Image = {
  type: "image";
  url: string;
  alt: string;
};

export type List = {
  type: "list";
  ordered: boolean;
  items: string[];
};
