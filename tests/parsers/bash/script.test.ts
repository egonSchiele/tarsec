import { beforeEach, describe, expect, it } from "vitest";
import { parseBash } from "@/lib/parsers/bash";
import { resetHeredocQueue } from "@/lib/parsers/bash/heredocQueue";
import { BashScript, HeredocRedirect, SimpleCommand } from "@/lib/parsers/bash/types";

beforeEach(resetHeredocQueue);

function ok(input: string): BashScript {
  const result = parseBash(input);
  if (!result.success) throw new Error(result.diagnostics.prettyMessage);
  return result.result;
}

function firstCommand(script: BashScript): SimpleCommand {
  const body = script.statements[0].body;
  if (body.type !== "simple-command") throw new Error(`got ${body.type}`);
  return body;
}

describe("script basics", () => {
  it("parses a one-liner", () => {
    const script = ok("echo hi");
    expect(script.statements).toHaveLength(1);
    expect(firstCommand(script).words.map((w) => w.text)).toEqual(["echo", "hi"]);
  });

  it("parses multiple lines, semicolons, and background &", () => {
    const script = ok("a; b &\nc\n");
    expect(script.statements).toHaveLength(3);
    expect(script.statements[0].background).toEqual(false);
    expect(script.statements[1].background).toEqual(true);
  });

  it("accepts trailing separators at EOF", () => {
    expect(ok("a;").statements).toHaveLength(1);
    expect(ok("a &").statements[0].background).toEqual(true);
  });

  it("skips blank lines and full-line comments", () => {
    const script = ok("# header\n\na\n\n# mid\nb\n");
    expect(script.statements).toHaveLength(2);
  });

  it("parses an empty script", () => {
    expect(ok("").statements).toEqual([]);
    expect(ok("  \n# just a comment\n").statements).toEqual([]);
  });

  it("consumes trailing comments after a command", () => {
    const script = ok("echo a #b\n");
    expect(firstCommand(script).words.map((w) => w.text)).toEqual(["echo", "a"]);
  });

  it("keeps a#b as a literal word", () => {
    const script = ok("echo a#b");
    expect(firstCommand(script).words.map((w) => w.text)).toEqual(["echo", "a#b"]);
  });

  it("supports line continuations across commands", () => {
    const script = ok("echo a \\\n  b\n");
    expect(firstCommand(script).words.map((w) => w.text)).toEqual(["echo", "a", "b"]);
  });

  it("returns diagnostics on failure", () => {
    const result = parseBash("echo )");
    expect(result.success).toEqual(false);
    if (!result.success) {
      expect(result.diagnostics.prettyMessage).toContain("^");
    }
  });
});

describe("heredocs", () => {
  function heredocOf(script: BashScript): HeredocRedirect {
    const redirectNode = firstCommand(script).redirects[0];
    if (redirectNode.type !== "heredoc") throw new Error("expected heredoc");
    return redirectNode;
  }

  it("fills the body from after the newline", () => {
    const script = ok("cat <<EOF\nhello\nworld\nEOF\n");
    const heredoc = heredocOf(script);
    expect(heredoc.body).toEqual("hello\nworld\n");
    expect(heredoc.bodySpan?.start.line).toEqual(1);
  });

  it("lets the rest of the line parse before the body", () => {
    const script = ok("cat <<EOF && echo done\nbody\nEOF\n");
    expect(script.statements[0].body.type).toEqual("and-or");
  });

  it("fills multiple heredocs on one line in order", () => {
    const script = ok("cat <<A <<B\nfirst\nA\nsecond\nB\n");
    const command = firstCommand(script);
    const [first, second] = command.redirects as HeredocRedirect[];
    expect(first.body).toEqual("first\n");
    expect(second.body).toEqual("second\n");
  });

  it("fills heredocs on consecutive lines", () => {
    const script = ok("cat <<A\none\nA\ncat <<B\ntwo\nB\n");
    expect(script.statements).toHaveLength(2);
    const first = heredocOf(script);
    expect(first.body).toEqual("one\n");
  });

  it("drains a heredoc across a pipeline", () => {
    const script = ok("cat <<A | wc\nbody\nA\n");
    const statement = script.statements[0].body;
    if (statement.type !== "pipeline") throw new Error(`got ${statement.type}`);
    const catCommand = statement.commands[0];
    if (catCommand.type !== "simple-command") throw new Error("expected simple-command");
    const heredoc = catCommand.redirects[0];
    if (heredoc.type !== "heredoc") throw new Error("expected heredoc");
    expect(heredoc.body).toEqual("body\n");
  });

  it("strips tabs with <<-", () => {
    const heredoc = heredocOf(ok("cat <<-EOF\n\tindented\n\tEOF\n"));
    expect(heredoc.body).toEqual("indented\n");
  });

  it("accepts the delimiter at EOF without a trailing newline", () => {
    const heredoc = heredocOf(ok("cat <<EOF\nbody\nEOF"));
    expect(heredoc.body).toEqual("body\n");
  });

  it("parses commands after a heredoc body", () => {
    const script = ok("cat <<EOF\nbody\nEOF\necho after\n");
    expect(script.statements).toHaveLength(2);
  });

  it("drains a heredoc registered before a semicolon", () => {
    const script = ok("cat <<EOF; echo hi\nbody\nEOF");
    expect(script.statements).toHaveLength(2);
    expect(heredocOf(script).body).toEqual("body\n");
  });

  it("fails on an unterminated heredoc", () => {
    const result = parseBash("cat <<EOF\nno end");
    expect(result.success).toEqual(false);
    if (!result.success) expect(result.message).toContain("unterminated heredoc");
  });

  it("fails when a heredoc never reaches a newline", () => {
    const result = parseBash("cat <<EOF");
    expect(result.success).toEqual(false);
    if (!result.success) expect(result.message).toContain("unterminated heredoc");
  });

  it("fails on an unterminated heredoc after ; and &", () => {
    const semicolon = parseBash("cat <<EOF;\nno end");
    expect(semicolon.success).toEqual(false);
    if (!semicolon.success) expect(semicolon.message).toContain("unterminated heredoc");

    const background = parseBash("cat <<EOF &\nno end");
    expect(background.success).toEqual(false);
    if (!background.success) expect(background.message).toContain("unterminated heredoc");
  });
});
