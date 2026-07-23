import { beforeEach, describe, expect, it } from "vitest";
import { parseBash, pendingHeredocs, resetHeredocQueue, script } from "@/lib/parsers/bash";
import { BashScript, SimpleCommand } from "@/lib/parsers/bash/types";
import { getErrorMessage } from "@/lib/rightmostFailure";
import { setInputStr } from "@/lib/trace";

beforeEach(resetHeredocQueue);

function ok(input: string): BashScript {
  const result = parseBash(input);
  if (!result.success) throw new Error(result.diagnostics.prettyMessage);
  return result.result;
}

function firstCommand(scriptNode: BashScript): SimpleCommand {
  const body = scriptNode.statements[0].body;
  if (body.type !== "simple-command") throw new Error(`got ${body.type}`);
  return body;
}

describe("heredoc queue unwinding", () => {
  it("a failed parse leaves the queue empty (sibling-failure case)", () => {
    setInputStr("cat <<EOF && ");
    const result = script("cat <<EOF && ");
    expect(result.success).toEqual(false);
    expect(pendingHeredocs()).toEqual([]);
  });

  it("a failed parse leaves the queue empty (mid-script case)", () => {
    const input = "cat <<A\nbody\nA\necho | ";
    setInputStr(input);
    const result = script(input);
    expect(result.success).toEqual(false);
    expect(pendingHeredocs()).toEqual([]);
  });

  it("consecutive parseBash calls do not interfere, including spans", () => {
    expect(parseBash("cat <<EOF").success).toEqual(false);
    // shorter input than the first parse: stale line tables / offsets would
    // show up as wrong span offsets here
    const second = ok("echo ok");
    const command = firstCommand(second);
    expect(command.words[1].span).toEqual({
      start: { offset: 5, line: 0, column: 5 },
      end: { offset: 7, line: 0, column: 7 },
    });
  });
});

describe("spans", () => {
  it("word spans exclude trailing whitespace and heredoc bodies get bodySpan", () => {
    const scriptNode = ok("cat <<EOF\nhello\nEOF\n");
    const command = firstCommand(scriptNode);
    expect(command.words[0].span).toEqual({
      start: { offset: 0, line: 0, column: 0 },
      end: { offset: 3, line: 0, column: 3 },
    });
    const heredoc = command.redirects[0];
    if (heredoc.type !== "heredoc") throw new Error("expected heredoc");
    // body starts on line 1, delimiter on line 2
    expect(heredoc.bodySpan?.start).toEqual({ offset: 10, line: 1, column: 0 });
    expect(heredoc.bodySpan?.end).toEqual({ offset: 16, line: 2, column: 0 });
  });

  it("statement spans cover the full command", () => {
    const scriptNode = ok("a | b && c\n");
    const statement = scriptNode.statements[0];
    expect(statement.span.start.offset).toEqual(0);
    expect(statement.span.end.offset).toEqual(10);
  });
});

describe("error messages", () => {
  // toEqual, not toContain: the right phrase being buried in a dump of
  // operator/charset alternatives is a regression these tests must catch.
  it("reports unterminated quotes with line and column", () => {
    const result = parseBash("echo hi\necho 'bad");
    expect(result.success).toEqual(false);
    if (!result.success) expect(result.message).toEqual("unterminated quote");
    expect(getErrorMessage()).toEqual("Line 2, col 6: expected a closing quote");
  });

  it("reports a missing redirect target at the right position", () => {
    const result = parseBash("echo x > |");
    expect(result.success).toEqual(false);
    if (!result.success) expect(result.message).toEqual("expected target after >");
    expect(getErrorMessage()).toEqual("Line 1, col 10: expected a target after >");
  });

  it("reports a missing command after |", () => {
    const result = parseBash("echo |");
    expect(result.success).toEqual(false);
    expect(getErrorMessage()).toEqual("Line 1, col 7: expected a command after |");
  });

  it("reports 'expected a command' without dumping the alternatives", () => {
    const result = parseBash("echo;;");
    expect(result.success).toEqual(false);
    expect(getErrorMessage()).toEqual("Line 1, col 6: expected a command");
  });

  it("reports a clean separator error", () => {
    const result = parseBash("echo )");
    expect(result.success).toEqual(false);
    expect(getErrorMessage()).toEqual(
      "Line 1, col 6: expected ';', '&', or a newline",
    );
  });

  it("renders diagnostics with an accurate line, column, and caret", () => {
    const result = parseBash("echo hi\necho )");
    expect(result.success).toEqual(false);
    if (!result.success) {
      expect(result.diagnostics.line).toEqual(1);
      expect(result.diagnostics.column).toEqual(5);
      expect(result.diagnostics.prettyMessage).toEqual(
        [
          "Near: echo )",
          "           ^",
          "expected ';', '&', or newline after command",
        ].join("\n"),
      );
    }
  });

  it("keeps the caret aligned on long lines (windowed preview)", () => {
    const padding = "a".repeat(60);
    const result = parseBash(`echo ${padding} )`);
    expect(result.success).toEqual(false);
    if (!result.success) {
      const [previewLine, caretLine] = result.diagnostics.prettyMessage.split("\n");
      const caretIndex = caretLine.indexOf("^");
      expect(caretIndex).toBeGreaterThan(-1);
      expect(previewLine[caretIndex]).toEqual(")");
    }
  });
});

describe("malformed separators", () => {
  it.each([[";;"], ["| a"], ["&& a"]])("fails on %s", (input) => {
    expect(parseBash(input).success).toEqual(false);
  });

  it("fails on a command followed by garbage", () => {
    expect(parseBash("echo )").success).toEqual(false);
  });
});

describe("pinned limitations", () => {
  it("CRLF line endings leave the \\r in the word (known limitation)", () => {
    const scriptNode = ok("echo hi\r\n");
    expect(firstCommand(scriptNode).words.map((w) => w.text)).toEqual([
      "echo",
      "hi\r",
    ]);
  });
});
