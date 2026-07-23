import { beforeEach, describe, expect, it } from "vitest";
import {
  drainHeredocs,
  nonterminal,
  pendingHeredocs,
  registerHeredoc,
  resetHeredocQueue,
  restoreHeredocs,
  scanHeredocBody,
  snapshotHeredocs,
  withQueueUnwind,
} from "@/lib/parsers/bash/heredocQueue";
import { HeredocRedirect } from "@/lib/parsers/bash/types";
import { failure, Parser, success } from "@/lib/types";

function mkHeredoc(tag: string): HeredocRedirect {
  const position = { offset: 0, line: 0, column: 0 };
  return {
    type: "heredoc", tag, stripTabs: false, quoted: false,
    body: null, span: { start: position, end: position }, bodySpan: null,
  };
}

beforeEach(resetHeredocQueue);

describe("queue basics", () => {
  it("registers, drains in order, and resets", () => {
    registerHeredoc(mkHeredoc("A"));
    registerHeredoc(mkHeredoc("B"));
    expect(pendingHeredocs().map((h) => h.tag)).toEqual(["A", "B"]);
    expect(drainHeredocs().map((h) => h.tag)).toEqual(["A", "B"]);
    expect(pendingHeredocs()).toEqual([]);
  });

  it("snapshot/restore resurrects drained entries", () => {
    registerHeredoc(mkHeredoc("A"));
    const snapshot = snapshotHeredocs();
    drainHeredocs();
    restoreHeredocs(snapshot);
    expect(pendingHeredocs().map((h) => h.tag)).toEqual(["A"]);
  });
});

describe("withQueueUnwind and nonterminal", () => {
  it("restores registrations when the parser fails", () => {
    const parser: Parser<null> = withQueueUnwind((input: string) => {
      registerHeredoc(mkHeredoc("LEAK"));
      return failure("nope", input);
    });
    expect(parser("x").success).toEqual(false);
    expect(pendingHeredocs()).toEqual([]);
  });

  it("keeps registrations when the parser succeeds", () => {
    const parser: Parser<null> = withQueueUnwind((input: string) => {
      registerHeredoc(mkHeredoc("KEEP"));
      return success(null, input);
    });
    expect(parser("x").success).toEqual(true);
    expect(pendingHeredocs().map((h) => h.tag)).toEqual(["KEEP"]);
  });

  it("restores entries drained by a failing parser", () => {
    registerHeredoc(mkHeredoc("PENDING"));
    const parser: Parser<null> = withQueueUnwind((input: string) => {
      drainHeredocs();
      return failure("nope", input);
    });
    expect(parser("x").success).toEqual(false);
    expect(pendingHeredocs().map((h) => h.tag)).toEqual(["PENDING"]);
  });

  it("nonterminal unwinds like withQueueUnwind", () => {
    const parser = nonterminal("test", (input: string) => {
      registerHeredoc(mkHeredoc("LEAK"));
      return failure("nope", input);
    });
    expect(parser("x").success).toEqual(false);
    expect(pendingHeredocs()).toEqual([]);
  });
});

describe("scanHeredocBody", () => {
  it("scans up to the delimiter line", () => {
    expect(scanHeredocBody("hello\nworld\nEOF\nnext", "EOF", false)).toEqual({
      body: "hello\nworld\n",
      delimRest: "EOF\nnext",
      rest: "next",
    });
  });

  it("accepts a delimiter at EOF without a trailing newline", () => {
    expect(scanHeredocBody("hi\nEOF", "EOF", false)).toEqual({
      body: "hi\n",
      delimRest: "EOF",
      rest: "",
    });
  });

  it("strips leading tabs from body and delimiter when stripTabs is set", () => {
    expect(scanHeredocBody("\thi\n\tEOF\n", "EOF", true)).toEqual({
      body: "hi\n",
      delimRest: "\tEOF\n",
      rest: "",
    });
  });

  it("requires the delimiter on its own line, exactly", () => {
    expect(scanHeredocBody("not EOF here\n", "EOF", false)).toEqual(null);
    expect(scanHeredocBody("EOFx\n", "EOF", false)).toEqual(null);
    // trailing whitespace on the delimiter line does NOT terminate
    expect(scanHeredocBody("hi\nEOF \nEOF\n", "EOF", false)).toEqual({
      body: "hi\nEOF \n",
      delimRest: "EOF\n",
      rest: "",
    });
  });

  it("returns null when unterminated", () => {
    expect(scanHeredocBody("hello\nworld", "EOF", false)).toEqual(null);
    expect(scanHeredocBody("", "EOF", false)).toEqual(null);
  });
});
