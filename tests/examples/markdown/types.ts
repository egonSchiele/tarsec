/* AST types for the Markdown example parser. */

export type InlineMarkdown =
  | InlineText
  | InlineBold
  | InlineItalic
  | InlineBoldItalic
  | InlineStrike
  | InlineHardBreak
  | InlineLink
  | InlineCode
  | Image
  | InlineRefLink
  | InlineRefImage;

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

export type InlineStrike = {
  type: "inline-strike";
  content: string;
};

export type InlineHardBreak = {
  type: "inline-hard-break";
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

export type BlockQuoteContent = InlineMarkdown | BlockQuote;
export type BlockQuote = {
  type: "block-quote";
  content: BlockQuoteContent[];
};

export type Image = {
  type: "image";
  url: string;
  alt: string;
};

export type InlineRefLink = {
  type: "inline-ref-link";
  text: string;
  id: string;
};

export type InlineRefImage = {
  type: "inline-ref-image";
  alt: string;
  id: string;
};

export type ListItem = {
  content: InlineMarkdown[];
  sublist?: List;
};

export type List = {
  type: "list";
  ordered: boolean;
  start: number;
  items: ListItem[];
};

export type HorizontalRule = {
  type: "horizontal-rule";
};

export type Alignment = "left" | "right" | "center" | null;

export type Table = {
  type: "table";
  headers: string[];
  alignments: Alignment[];
  rows: string[][];
};

export type LinkDef = {
  type: "link-definition";
  id: string;
  url: string;
  title?: string;
};
