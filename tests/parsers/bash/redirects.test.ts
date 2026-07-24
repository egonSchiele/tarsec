import { beforeEach, describe, expect, it } from "vitest";
import { redirect } from "@/lib/parsers/bash/redirects";
import { pendingHeredocs, resetHeredocQueue } from "@/lib/parsers/bash/heredocQueue";
import { BashRedirect, FileRedirect, HeredocRedirect } from "@/lib/parsers/bash/types";
import { setInputStr } from "@/lib/trace";

beforeEach(resetHeredocQueue);

function parseRedirectOk(input: string): { node: BashRedirect; rest: string } {
  setInputStr(input);
  const result = redirect(input);
  if (!result.success) throw new Error(result.message);
  return { node: result.result, rest: result.rest };
}

function fileRedirectOk(input: string): { node: FileRedirect; rest: string } {
  const { node, rest } = parseRedirectOk(input);
  if (node.type !== "redirect") throw new Error(`expected file redirect, got ${node.type}`);
  return { node, rest };
}

function heredocOk(input: string): { node: HeredocRedirect; rest: string } {
  const { node, rest } = parseRedirectOk(input);
  if (node.type !== "heredoc") throw new Error(`expected heredoc, got ${node.type}`);
  return { node, rest };
}

describe("file redirects", () => {
  it.each([
    [">out.txt x", ">", null, "out.txt"],
    [">> log x", ">>", null, "log"],
    ["<in x", "<", null, "in"],
    ["2>err x", ">", "2", "err"],
    ["&>all x", "&>", null, "all"],
  ])("parses %s", (input, op, fd, target) => {
    const { node, rest } = fileRedirectOk(input);
    expect(node.op).toEqual(op);
    expect(node.fd).toEqual(fd);
    expect(node.targetFd).toEqual(null);
    expect(node.target?.text).toEqual(target);
    expect(rest).toEqual("x");
  });

  it.each([
    ["2>&1 x", "2", "1"],
    ["2>&2 x", "2", "2"],
    ["1>&2 x", "1", "2"],
    [">&2 x", null, "2"],
    [">&- x", null, "-"],
    ["2>&- x", "2", "-"],
  ])("parses fd duplication %s with no target", (input, fd, targetFd) => {
    const { node, rest } = fileRedirectOk(input);
    expect(node.op).toEqual(">&");
    expect(node.fd).toEqual(fd);
    expect(node.targetFd).toEqual(targetFd);
    expect(node.target).toEqual(null);
    expect(rest).toEqual("x");
  });

  it("parses redirects with multi-digit fds", () => {
    const { node } = fileRedirectOk("22>x y");
    expect(node.op).toEqual(">");
    expect(node.fd).toEqual("22");
    expect(node.target?.text).toEqual("x");
  });

  it("rejects >&file with a message pointing at &>file", () => {
    setInputStr(">&file x");
    const result = redirect(">&file x");
    expect(result.success).toEqual(false);
    if (!result.success) {
      expect(result.message).toEqual(
        ">&file (redirect both streams) is not supported — use &>file",
      );
    }
  });

  it("fails without a target, leaving the queue clean", () => {
    setInputStr("> |");
    expect(redirect("> |").success).toEqual(false);
    expect(pendingHeredocs()).toEqual([]);
  });

  it("span covers op through target, excluding trailing whitespace", () => {
    const { node } = fileRedirectOk(">out.txt  x");
    expect(node.span.start.offset).toEqual(0);
    expect(node.span.end.offset).toEqual(8);
  });
});

describe("heredoc redirects", () => {
  it("parses <<TAG and registers the exact node object", () => {
    const { node, rest } = heredocOk("<<EOF x");
    expect(node.tag).toEqual("EOF");
    expect(node.stripTabs).toEqual(false);
    expect(node.quoted).toEqual(false);
    expect(node.body).toEqual(null);
    // the registered node IS the AST node (identity matters for drain)
    expect(pendingHeredocs()[0]).toBe(node);
    expect(rest).toEqual("x");
  });

  it("parses <<-TAG with stripTabs", () => {
    const { node } = heredocOk("<<-END x");
    expect(node.stripTabs).toEqual(true);
    expect(node.tag).toEqual("END");
  });

  it("parses quoted tags (single and double)", () => {
    const single = heredocOk("<<'EOF' x");
    expect(single.node.quoted).toEqual(true);
    expect(single.node.tag).toEqual("EOF");
    const double = heredocOk('<<"END" x');
    expect(double.node.quoted).toEqual(true);
    expect(double.node.tag).toEqual("END");
  });

  it("fails on << without a tag, leaving the queue clean", () => {
    setInputStr("<< |");
    expect(redirect("<< |").success).toEqual(false);
    expect(pendingHeredocs()).toEqual([]);
  });
});
