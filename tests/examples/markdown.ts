import { seqC, capture, optional } from "@/lib/combinators";
import { str, spaces, word, char } from "@/lib/parsers";

type InlineMarkdown =
  | InlineText
  | InlineBold
  | InlineItalic
  | InlineLink
  | InlineCode;

type InlineText = {
  type: "inline-text";
  content: string;
};

type InlineBold = {
  type: "inline-bold";
  content: string;
};

type InlineItalic = {
  type: "inline-italic";
  content: string;
};

type InlineLink = {
  type: "inline-link";
  content: string;
  url: string;
};

type InlineCode = {
  type: "inline-code";
  content: string;
};

type Paragraph = {
  type: "paragraph";
  content: InlineMarkdown[];
};

type Heading = {
  type: "heading";
  level: number;
  content: InlineMarkdown[];
};

type CodeBlock = {
  type: "code-block";
  content: string;
  language: string;
};

type BlockQuote = {
  type: "block-quote";
  content: (Paragraph | Heading | BlockQuote)[];
};

type List = {
  type: "list";
  ordered: boolean;
  items: ListItem[];
};

type ListItem = {
  type: "list-item";
  content: (Paragraph | Heading | BlockQuote | CodeBlock)[];
};

type Document = {
  type: "document";
  content: (Paragraph | Heading)[];
};

const headingParser = seqC(
  str("hello"),
  spaces,
  capture(word, "name"),
  optional(char("!"))
);
