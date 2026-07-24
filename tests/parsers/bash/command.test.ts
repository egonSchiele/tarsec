import { beforeEach, describe, expect, it } from "vitest";
import { assignment, simpleCommand } from "@/lib/parsers/bash/command";
import { resetHeredocQueue } from "@/lib/parsers/bash/heredocQueue";
import { BashAssignment, SimpleCommand } from "@/lib/parsers/bash/types";
import { setInputStr } from "@/lib/trace";

beforeEach(resetHeredocQueue);

function assignmentOk(input: string): { node: BashAssignment; rest: string } {
  setInputStr(input);
  const result = assignment(input);
  if (!result.success) throw new Error(result.message);
  return { node: result.result, rest: result.rest };
}

function commandOk(input: string): { node: SimpleCommand; rest: string } {
  setInputStr(input);
  const result = simpleCommand(input);
  if (!result.success) throw new Error(result.message);
  return { node: result.result, rest: result.rest };
}

describe("assignment", () => {
  it("parses NAME=value", () => {
    const { node, rest } = assignmentOk("FOO=bar x");
    expect(node.name).toEqual("FOO");
    expect(node.value?.text).toEqual("bar");
    expect(rest).toEqual("x");
  });

  it("parses an empty value", () => {
    const { node, rest } = assignmentOk("FOO= x");
    expect(node.value).toEqual(null);
    expect(rest).toEqual("x");
  });

  it("parses a quoted value as one word", () => {
    const { node } = assignmentOk('FOO="a b" x');
    expect(node.value?.text).toEqual('"a b"');
  });

  it("fails on an unterminated quoted value", () => {
    setInputStr('FOO="a');
    const result = assignment('FOO="a');
    expect(result.success).toEqual(false);
    if (!result.success) expect(result.message).toContain("unterminated quote");
  });

  it("allows keyword names: if=1", () => {
    const { node } = assignmentOk("if=1 x");
    expect(node.name).toEqual("if");
  });

  it("fails when there is no =", () => {
    setInputStr("echo hi");
    expect(assignment("echo hi").success).toEqual(false);
  });
});

describe("simpleCommand", () => {
  it("parses assignments, words, and redirects", () => {
    const { node } = commandOk("FOO=1 BAR=2 cmd -x file >out.txt");
    expect(node.assignments.map((a) => a.name)).toEqual(["FOO", "BAR"]);
    expect(node.words.map((w) => w.text)).toEqual(["cmd", "-x", "file"]);
    expect(node.redirects).toHaveLength(1);
  });

  it("allows a redirect before the command name", () => {
    const { node } = commandOk(">f cmd arg");
    expect(node.words.map((w) => w.text)).toEqual(["cmd", "arg"]);
    expect(node.redirects).toHaveLength(1);
  });

  it("recognizes assignments after a leading redirect", () => {
    const { node } = commandOk(">f FOO=1 cmd");
    expect(node.assignments.map((a) => a.name)).toEqual(["FOO"]);
    expect(node.words.map((w) => w.text)).toEqual(["cmd"]);
  });

  it("treats foo=bar after the command name as a word", () => {
    const { node } = commandOk("echo foo=bar");
    expect(node.assignments).toEqual([]);
    expect(node.words.map((w) => w.text)).toEqual(["echo", "foo=bar"]);
  });

  it("parses a lone redirect and a lone assignment", () => {
    const redirectOnly = commandOk("> out");
    expect(redirectOnly.node.words).toEqual([]);
    expect(redirectOnly.node.redirects).toHaveLength(1);

    const assignmentOnly = commandOk("FOO=1");
    expect(assignmentOnly.node.words).toEqual([]);
    expect(assignmentOnly.node.assignments).toHaveLength(1);
  });

  it("stops at operators and derives span from children", () => {
    const { node, rest } = commandOk("echo hi | wc");
    expect(rest).toEqual("| wc");
    expect(node.span.start.offset).toEqual(0);
    expect(node.span.end.offset).toEqual(7); // "echo hi"
  });

  it("fails on empty input and at operators", () => {
    setInputStr("");
    expect(simpleCommand("").success).toEqual(false);
    setInputStr("| x");
    expect(simpleCommand("| x").success).toEqual(false);
  });

  it("propagates a malformed element instead of ending the command early", () => {
    setInputStr("echo >");
    const missingTarget = simpleCommand("echo >");
    expect(missingTarget.success).toEqual(false);
    if (!missingTarget.success) {
      expect(missingTarget.message).toEqual("expected a target after >");
    }

    setInputStr("echo 'oops");
    const unterminated = simpleCommand("echo 'oops");
    expect(unterminated.success).toEqual(false);
    if (!unterminated.success) {
      expect(unterminated.message).toEqual("unterminated quote");
    }
  });
});
