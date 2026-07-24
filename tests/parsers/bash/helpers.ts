/** Shared assertion helpers for the bash parser test suites. */
import { expect } from "vitest";
import {
  bashParser,
  BashWord,
  Command,
  List,
  SimpleCommand,
} from "@/lib/parsers/bash/index";

/** Parse and unwrap, failing the test with the parser's message. */
export function parse(input: string): List {
  const result = bashParser(input);
  if (!result.success) {
    throw new Error(
      `parse failed: ${result.message}\nat: ${result.rest.slice(0, 40)}`,
    );
  }
  return result.result;
}

export function rejects(input: string): void {
  expect(bashParser(input).success).toBe(false);
}

/** Unwrap a list item that is a single non-negated pipeline of one command. */
export function onlyCommand(list: List, index = 0): Command {
  const item = list.items[index];
  expect(item.command.rest).toEqual([]);
  expect(item.command.first.commands).toHaveLength(1);
  return item.command.first.commands[0];
}

export function simple(list: List, index = 0): SimpleCommand {
  const command = onlyCommand(list, index);
  expect(command.tag).toBe("simpleCommand");
  return command as SimpleCommand;
}

/** Bare text of a word made of a single literal part. */
export function text(word: BashWord): string {
  expect(word.parts).toHaveLength(1);
  const part = word.parts[0];
  if (part.tag !== "literal") throw new Error(`not a literal: ${part.tag}`);
  return part.text;
}
