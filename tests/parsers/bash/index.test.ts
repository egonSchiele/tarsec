import { execSync } from "child_process";
import { describe, expect, it } from "vitest";
import { bashParser, List, SimpleCommand } from "@/lib/parsers/bash/index";
import { buildLineTable, offsetToPosition } from "@/lib/position";
import {
  getErrorMessage,
  getRightmostFailure,
  resetRightmostFailure,
} from "@/lib/rightmostFailure";
import { setInputStr } from "@/lib/trace";
import { bashParser as permissiveParser } from "../../examples/bashFromLexemes";
import { BIG_SCRIPT } from "../../examples/fixtures/corpus";

/** Is a bash binary available? The differential `bash -n` assertions are
 * skipped (not failed) without one, so the parser tests still run on
 * minimal environments. */
const hasBash = (() => {
  try {
    execSync("bash -c 'exit 0'", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const itIfBash = hasBash ? it : it.skip;

/** Does real bash consider this script syntactically valid? */
function bashAccepts(script: string): boolean {
  try {
    execSync("bash -n", { input: script, stdio: ["pipe", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

/** Parse with the standard tarsec diagnostics flow, as documented in
 * lib/parsers/bash/index.ts. */
function parse(input: string) {
  setInputStr(input);
  resetRightmostFailure();
  const result = bashParser(input);
  if (result.success) {
    return { success: true as const, list: result.result };
  }
  const rightmost = getRightmostFailure();
  const offset = rightmost?.pos ?? input.length - result.rest.length;
  const position = offsetToPosition(buildLineTable(input), offset);
  return {
    success: false as const,
    message: getErrorMessage() ?? result.message,
    line: position.line + 1,
    column: position.column + 1,
  };
}

// Everything in the supported subset. Each of these must (a) parse, (b) be
// valid to real bash, and (c) produce the same AST as the permissive
// example parser in tests/examples.
const SUPPORTED: [string, string][] = [
  ["simple command", "echo hello world"],
  ["quoting", `echo 'a b' "c $d" e'f'"g"$h`],
  ["escapes and specials", String.raw`echo foo\ bar "$@" $? $1`],
  ["reserved words as args", "echo if fi done"],
  ["assignments", 'FOO=bar BAZ="qux $FOO" run --now'],
  ["assignment only", "PATH=/usr/local/bin:$PATH"],
  ["assignment-shaped argument words", "env FOO=bar cmd --opt=value"],
  ["assignment value containing =", "foo=bar=baz"],
  ["nested substitution", 'echo "dir: $(basename $(pwd))"'],
  ["raw expansions", "echo ${VAR:-default} $((count + 1))"],
  ["redirects", "cmd < in.txt >> log.txt 2>&1"],
  ["fd redirect", "echo 2> err.txt"],
  ["numeric arg", "echo 2 > out.txt"],
  ["herestring", 'grep foo <<< "$input" >&2'],
  ["pipeline", "ps aux | grep node | awk '{print $2}'"],
  ["negation, chains, background", "! grep -q foo bar.txt && echo found || echo missing &"],
  ["separators and comments", "cd /tmp; ls -la\n# a comment\n\necho done # trailing\n"],
  ["line continuation", "echo one \\\n  two"],
  [
    "if/elif/else",
    'if [ "$1" = start ]; then\n  run start\nelif [ "$1" = stop ]; then\n  run stop\nelse\n  echo usage >&2\nfi',
  ],
  ["while with redirect", 'while read -r line; do echo "-> $line"; done < input.txt'],
  ["until", "until [ -f done.txt ]; do sleep 1; done"],
  ["for", 'for f in *.txt logs/*.log; do wc -l "$f"; done'],
  [
    "case",
    'case "$1" in\n  start|restart) run start ;;\n  stop) run stop ;;\n  *) echo unknown ;;\nesac',
  ],
  ["case without final ;;", "case $x in\n  a) echo a ;;\n  b) echo b\nesac"],
  ["subshell and group", "(cd /tmp && ls) | sort; { echo a; echo b; } > out.txt"],
  ["arithmetic command", "(( count++ ))"],
  ["functions", 'greet() { echo hi; }\nfunction cleanup {\n rm -f "$tmp"\n}'],
  ["empty script", ""],
  ["only comments", "\n# just a comment\n\n"],
  ["realistic script", BIG_SCRIPT],
];

// Valid bash the parser deliberately refuses: fail closed rather than
// mis-parse.
const CUT: [string, string][] = [
  ["array assignment", "files=(a.txt b.txt)"],
  ["append assignment", "count+=1"],
  ["ANSI-C quoting", String.raw`echo $'a\tb'`],
  ["backtick substitution", "echo `date`"],
  ["backticks inside double quotes", 'echo "now: `date`"'],
  ["[[ ]] conditional", "[[ -n $HOME ]]"],
  ["brace expansion", "echo {a,b}.txt"],
  ["literal braces in a word", String.raw`find . -name tmp -exec rm {} \;`],
  ["bare dollar", "echo $"],
  ["bare dollar in double quotes", 'echo "cost: $"'],
  ["heredoc", "cat <<EOF\nhello\nEOF\n"],
  ["process substitution", "diff <(ls) <(sort x)"],
  ["select", "select x in a b; do echo $x; done"],
  ["time", "time ls"],
  // bash really does allow reserved words as for-loop variables.
  ["reserved word as for variable", "for do in a b; do :; done"],
];

// Invalid bash: the parser rejects it, and real bash agrees.
const INVALID: [string, string][] = [
  ["commands without a separator", "(echo a) (echo b)"],
  ["trailing pipe", "echo hi |"],
  ["dangling &&", "echo a && || echo b"],
  ["empty subshell", "( )"],
  ["empty if condition", "if ; then :; fi"],
  ["case item missing ;;", "case x in\n  a) echo a\n  b) echo b ;;\nesac"],
  ["double semicolon outside case", "echo a ;; echo b"],
];

describe("supported subset", () => {
  it.each(SUPPORTED)("parses %s", (_name, input) => {
    const result = parse(input);
    if (!result.success) {
      throw new Error(`rejected: ${result.message} (line ${result.line})`);
    }
    // The permissive example parser accepts a superset; on the supported
    // subset the two must agree exactly.
    const permissive = permissiveParser(input);
    if (!permissive.success) throw new Error("permissive parser rejected input");
    expect(result.list).toEqual(permissive.result);
  });

  itIfBash.each(SUPPORTED)("bash -n accepts %s", (_name, input) => {
    expect(bashAccepts(input)).toBe(true);
  });
});

describe("assignment vs word boundary", () => {
  function simple(list: List, index = 0): SimpleCommand {
    const command = list.items[index].command.first.commands[0];
    expect(command.tag).toBe("simpleCommand");
    return command as SimpleCommand;
  }

  it("treats k=v after the command word as a plain argument", () => {
    const result = parse("env FOO=bar cmd --opt=value");
    if (!result.success) throw new Error(result.message);
    const command = simple(result.list);
    expect(command.assignments).toEqual([]);
    expect(command.words).toHaveLength(4);
    expect(command.words[1].parts).toEqual([{ tag: "literal", text: "FOO=bar" }]);
  });

  it("parses name=bar=baz as an assignment with value bar=baz", () => {
    const result = parse("foo=bar=baz");
    if (!result.success) throw new Error(result.message);
    const command = simple(result.list);
    expect(command.words).toEqual([]);
    expect(command.assignments[0].name).toBe("foo");
    expect(command.assignments[0].value?.parts).toEqual([
      { tag: "literal", text: "bar=baz" },
    ]);
  });

  it("rejects append assignments at command position", () => {
    expect(parse("count+=1").success).toBe(false);
  });
});

describe("fail-closed: cut syntax is rejected even though bash accepts it", () => {
  it.each(CUT)("rejects %s", (_name, input) => {
    expect(parse(input).success).toBe(false);
  });

  itIfBash.each(CUT)("bash -n accepts %s (documents the cut)", (_name, input) => {
    expect(bashAccepts(input)).toBe(true);
  });
});

describe("invalid bash is rejected", () => {
  it.each(INVALID)("rejects %s", (_name, input) => {
    expect(parse(input).success).toBe(false);
  });

  itIfBash.each(INVALID)("bash -n also rejects %s", (_name, input) => {
    expect(bashAccepts(input)).toBe(false);
  });
});

describe("diagnostics", () => {
  it("reports the failure line", () => {
    const result = parse("echo ok\nfiles=(a b)\necho done");
    if (result.success) throw new Error("expected failure");
    expect(result.line).toBe(2);
    expect(result.column).toBeGreaterThan(0);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("labels unterminated quotes", () => {
    const result = parse("echo 'unterminated");
    if (result.success) throw new Error("expected failure");
    expect(result.message).toContain("single-quoted");
  });

  it("points at the offending construct", () => {
    const result = parse("echo `date`");
    if (result.success) throw new Error("expected failure");
    expect(result.line).toBe(1);
  });
});
