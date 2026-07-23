import { beforeEach, describe, expect, it } from "vitest";
import { andOr, pipeline } from "@/lib/parsers/bash/grammar";
import { pendingHeredocs, resetHeredocQueue } from "@/lib/parsers/bash/heredocQueue";
import { BashNode } from "@/lib/parsers/bash/types";
import { setInputStr } from "@/lib/trace";

beforeEach(resetHeredocQueue);

function pipelineOk(input: string): { node: BashNode; rest: string } {
  setInputStr(input);
  const result = pipeline(input);
  if (!result.success) throw new Error(result.message);
  return { node: result.result, rest: result.rest };
}

function andOrOk(input: string): { node: BashNode; rest: string } {
  setInputStr(input);
  const result = andOr(input);
  if (!result.success) throw new Error(result.message);
  return { node: result.result, rest: result.rest };
}

describe("pipeline", () => {
  it("collapses a single command to the command node", () => {
    const { node } = pipelineOk("echo hi");
    expect(node.type).toEqual("simple-command");
  });

  it("parses a | b | c", () => {
    const { node } = pipelineOk("a | b | c");
    if (node.type !== "pipeline") throw new Error(`expected pipeline, got ${node.type}`);
    expect(node.commands).toHaveLength(3);
  });

  it("allows a newline after |", () => {
    const { node } = pipelineOk("a |\nb");
    if (node.type !== "pipeline") throw new Error(`expected pipeline, got ${node.type}`);
    expect(node.commands).toHaveLength(2);
  });

  it("does not treat || as a pipe", () => {
    const { node, rest } = pipelineOk("a || b");
    expect(node.type).toEqual("simple-command");
    expect(rest).toEqual("|| b");
  });

  it("fails when a command is missing after |", () => {
    setInputStr("a | ");
    expect(pipeline("a | ").success).toEqual(false);
  });
});

describe("andOr", () => {
  it("parses a && b || c left-to-right", () => {
    const { node } = andOrOk("a && b || c");
    if (node.type !== "and-or") throw new Error(`expected and-or, got ${node.type}`);
    expect(node.rest.map((link) => link.op)).toEqual(["&&", "||"]);
  });

  it("allows a newline after && and ||", () => {
    const { node } = andOrOk("a &&\nb");
    if (node.type !== "and-or") throw new Error(`expected and-or, got ${node.type}`);
    expect(node.rest).toHaveLength(1);
  });

  it("mixes pipelines and boolean operators", () => {
    const { node } = andOrOk("a | b && c");
    if (node.type !== "and-or") throw new Error(`expected and-or, got ${node.type}`);
    expect(node.first.type).toEqual("pipeline");
    expect(node.rest[0].command.type).toEqual("simple-command");
  });

  it("does not consume a single &", () => {
    const { node, rest } = andOrOk("a & b");
    expect(node.type).toEqual("simple-command");
    expect(rest).toEqual("& b");
  });

  it("unwinds heredoc registrations when it fails after && (sibling-failure case)", () => {
    setInputStr("cat <<EOF && ");
    const result = andOr("cat <<EOF && ");
    expect(result.success).toEqual(false);
    expect(pendingHeredocs()).toEqual([]);
  });
});
