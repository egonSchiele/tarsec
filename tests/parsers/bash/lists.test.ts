import { describe, expect, it } from "vitest";
import { SimpleCommand } from "@/lib/parsers/bash/index";
import { parse, rejects, simple, text } from "./helpers";

describe("pipelines", () => {
  it("parses multi-stage pipelines", () => {
    const list = parse("ps aux | grep node | awk '{print $2}'");
    const pipeline = list.items[0].command.first;
    expect(pipeline.commands).toHaveLength(3);
    expect((pipeline.commands[2] as SimpleCommand).words[1].parts[0].tag).toBe(
      "singleQuoted",
    );
  });

  it("parses |& (pipe stderr too)", () => {
    // Parser-only: |& is bash 4+, so it stays out of the bash -n corpus
    // (macOS ships bash 3.2).
    const list = parse("make |& tee build.log");
    expect(list.items[0].command.first.commands).toHaveLength(2);
  });

  it("parses ! negation", () => {
    const list = parse("! grep -q foo bar.txt");
    expect(list.items[0].command.first.negated).toBe(true);
  });

  it("allows a newline after the pipe", () => {
    const list = parse("echo hi |\n  wc -l");
    expect(list.items[0].command.first.commands).toHaveLength(2);
  });

  it("rejects a trailing pipe", () => rejects("echo hi |"));
});

describe("&& and || chains", () => {
  it("parses chains left to right", () => {
    const list = parse("npm run build && npm run deploy || exit 1");
    const item = list.items[0];
    expect(item.command.rest.map((r) => r.op)).toEqual(["&&", "||"]);
  });

  it("allows a newline after && or ||", () => {
    const list = parse("true &&\n  echo yes");
    expect(list.items[0].command.rest).toHaveLength(1);
  });

  it("rejects a dangling operator", () => rejects("echo a && || echo b"));
});

describe("separators", () => {
  it("separates commands with ; and newlines, skipping comments", () => {
    const list = parse("cd /tmp; ls -la\n# a comment\n\necho done # trailing\n");
    expect(list.items).toHaveLength(3);
    expect(simple(list, 2).words.map(text)).toEqual(["echo", "done"]);
  });

  it("marks & commands as background", () => {
    const list = parse("sleep 10 & echo started");
    expect(list.items[0].background).toBe(true);
    expect(list.items[1].background).toBe(false);
  });

  it("marks a trailing & as background", () => {
    const list = parse("server --listen &");
    expect(list.items[0].background).toBe(true);
  });

  it("handles line continuations", () => {
    const command = simple(parse("echo one \\\n  two"));
    expect(command.words.map(text)).toEqual(["echo", "one", "two"]);
  });

  it("parses an empty script and comment-only scripts", () => {
    expect(parse("").items).toEqual([]);
    expect(parse("\n# just a comment\n\n").items).toEqual([]);
  });

  it("requires a separator between commands", () => {
    rejects("(echo a) (echo b)");
    rejects("echo a ;; echo b");
  });
});
