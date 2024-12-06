import {
  between,
  capture,
  many1,
  manyTillStr,
  or,
  seqC
} from "./lib/combinators.js";
import { regexParser, set, str } from "./lib/parsers.js";
import { Parser } from "./lib/types.js";

export type MustacheTag = VariableTag | SectionTag | InvertedTag | CommentTag | PartialTag;

export type VariableTag = {
  type: 'variable';
  name: string;
}

export type SectionTag = {
  type: 'section';
  name: string;
  content: string;
}

export type InvertedTag = {
  type: 'inverted';
  name: string;
  content: string;
}

export type CommentTag = {
  type: 'comment';
  content: string;
}

export type PartialTag = {
  type: 'partial';
  name: string;
}

const variableTag: Parser<VariableTag> = seqC(
  set("type", "variable"),
  capture(between(str("{{"), str("}}"), regexParser("([a-zA-Z0-9_]+)")), "name"),
)

const sectionTag: Parser<SectionTag> = seqC(
  set("type", "section"),
  capture(between(str("{{#"), str("}}"), regexParser("([a-zA-Z0-9_]+)")), "name"),
  capture(manyTillStr("{{/"), "content"),
)

const invertedTag: Parser<InvertedTag> = seqC(
  set("type", "inverted"),
  capture(between(str("{{^"), str("}}"), regexParser("([a-zA-Z0-9_]+)")), "name"),
  capture(manyTillStr("{{/"), "content"),
)

const commentTag: Parser<CommentTag> = seqC(
  set("type", "comment"),
  capture(between(str("{{!"), str("}}"), regexParser("(.+)")), "content"),
)

const partialTag: Parser<PartialTag> = seqC(
  set("type", "partial"),
  capture(between(str("{{>"), str("}}"), regexParser("([a-zA-Z0-9_]+)")), "name"),
)

export type Mustache = MustacheTag | SimpleText;

export type SimpleText = {
  type: 'text';
  content: string;
}

const text: Parser<SimpleText> = seqC(
  set("type", "text"),
  capture(manyTillStr("{{"), "content"),
)

export const mustacheParser: Parser<Mustache[]> = many1(or(variableTag, sectionTag, invertedTag, commentTag, partialTag, text));