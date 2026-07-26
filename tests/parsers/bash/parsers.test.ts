/**
 * Tests for the small bash parser.
 *
 * Expectations are real bash semantics, restricted to the subset the
 * parser sets out to support. Organized in three layers so failures
 * isolate: word-level tests exercise the leaf parsers directly, command
 * tests exercise `simpleCommandParser`, and chain tests exercise
 * `commandParser`. A break in one layer does not hide the others.
 *
 * Note: there is no exported whole-input entry point, so `parseFully`
 * below composes one. A parser that stops early and leaves input behind
 * is treated as a failure — otherwise "parsed" would include commands
 * with half the text quietly discarded.
 */
import { describe, expect, it } from "vitest";
import {
  commandParser,
  flagWordParser,
  literalWordParser,
  pathWordParser,
  redirectParser,
  simpleCommandParser,
  singleQuotedWordParser,
  doubleQuotedWordParser,
  variableWordParser,
  wordParser,
} from "@/lib/parsers/bash/parsers";
import {
  Command,
  DoubleQuotedWord,
  SimpleCommand,
  Word,
} from "@/lib/parsers/bash/types";
import { Parser } from "@/lib/types";

/** Run a parser and require that it consumed the entire input. */
function parseFully<T>(parser: Parser<T>, input: string): T {
  const result = parser(input);
  if (!result.success) {
    throw new Error(`parse failed: ${result.message}`);
  }
  if (result.rest !== "") {
    throw new Error(
      `parser stopped early, left behind: ${JSON.stringify(result.rest)}`,
    );
  }
  return result.result;
}

function parsesFully<T>(parser: Parser<T>, input: string): boolean {
  const result = parser(input);
  return result.success && result.rest === "";
}

const command = (input: string): SimpleCommand =>
  parseFully(simpleCommandParser, input);

/** Every non-assignment, non-redirect word after the command name.
 *
 * Deliberately blind to the subcommands/args split: no syntactic rule can
 * tell `git status` (subcommand) from `echo status` (argument), so tests
 * assert on the combined list and leave that design choice open. */
function positional(cmd: SimpleCommand): string[] {
  return [...cmd.subcommands, ...cmd.args].map(describeWord);
}

function describeWord(word: Word): string {
  switch (word.tag) {
    case "literal":
    case "path":
    case "singleQuoted":
      return word.text;
    case "flag":
      return word.flagValue === undefined
        ? word.flagName
        : `${word.flagName}=${word.flagValue}`;
    case "variable":
      return `$${word.name}`;
    case "doubleQuoted":
      return word.parts.map(describeWord).join("");
  }
}

// ---------------------------------------------------------------------------
// Layer 1: words
// ---------------------------------------------------------------------------

describe("bare words", () => {
  it("parses a plain word as a literal", () => {
    expect(parseFully(wordParser, "echo")).toEqual({ tag: "literal", text: "echo" });
  });

  it("parses a filename containing a dot", () => {
    expect(parseFully(wordParser, "file.txt")).toEqual({
      tag: "literal",
      text: "file.txt",
    });
  });

  it("parses a word containing a hyphen", () => {
    expect(parseFully(wordParser, "my-file")).toEqual({
      tag: "literal",
      text: "my-file",
    });
  });

  it("parses a word containing an underscore", () => {
    expect(parseFully(wordParser, "my_file")).toEqual({
      tag: "literal",
      text: "my_file",
    });
  });

  it("parses a word containing a digit", () => {
    expect(parseFully(wordParser, "file2")).toEqual({ tag: "literal", text: "file2" });
  });

  it("does not match only the front of a longer word", () => {
    // "src" is not a word here — the word is the path "src/main.ts". A word
    // that stops mid-token leaves input no other parser can pick up.
    expect(literalWordParser("src/main.ts").success).toBe(false);
  });

  it("parses an assignment-shaped argument as a single word", () => {
    // `env FOO=bar` passes FOO=bar to env as one argument.
    expect(parseFully(literalWordParser, "FOO=bar")).toEqual({
      tag: "literal",
      text: "FOO=bar",
    });
  });

  it("ends a word at an operator character", () => {
    const result = literalWordParser("a&&b");
    expect(result.success && result.result.text).toBe("a");
    expect(result.success && result.rest).toBe("&&b");
  });
});

describe("paths", () => {
  it("parses an absolute path", () => {
    expect(parseFully(pathWordParser, "/usr/bin/env")).toEqual({
      tag: "path",
      text: "/usr/bin/env",
    });
  });

  it("parses a relative path", () => {
    expect(parseFully(pathWordParser, "src/main.ts")).toEqual({
      tag: "path",
      text: "src/main.ts",
    });
  });

  it("parses a dot-slash path", () => {
    expect(parseFully(pathWordParser, "./script.sh")).toEqual({
      tag: "path",
      text: "./script.sh",
    });
  });

  it("parses a bare slash", () => {
    // `ls /` is an ordinary command.
    expect(parseFully(pathWordParser, "/")).toEqual({ tag: "path", text: "/" });
  });

  it("parses a trailing slash", () => {
    expect(parseFully(pathWordParser, "src/")).toEqual({ tag: "path", text: "src/" });
  });

  it("rejects a path with a doubled slash", () => {
    expect(parsesFully(pathWordParser, "a//b")).toBe(false);
  });

  it("does not classify a word without a slash as a path", () => {
    // Otherwise every plain command name is tagged `path`, and a consumer
    // switching on the tag never sees a `literal`.
    expect(parsesFully(pathWordParser, "echo")).toBe(false);
  });

  it("does not match without consuming anything", () => {
    // A parser that succeeds on any input with an empty result matches
    // everywhere: it turns every following alternative into dead code and
    // injects empty words into argument lists.
    expect(pathWordParser(" hello").success).toBe(false);
    expect(pathWordParser("> out.txt").success).toBe(false);
    expect(pathWordParser("").success).toBe(false);
  });
});

describe("quoted words", () => {
  it("parses a single-quoted word", () => {
    expect(parseFully(singleQuotedWordParser, "'hello world'")).toEqual({
      tag: "singleQuoted",
      text: "hello world",
    });
  });

  it("parses an empty single-quoted word", () => {
    // `echo ''` passes one empty argument in bash.
    expect(parseFully(singleQuotedWordParser, "''")).toEqual({
      tag: "singleQuoted",
      text: "",
    });
  });

  it("parses a double-quoted word", () => {
    const word = parseFully(doubleQuotedWordParser, '"hello world"');
    expect(word.parts).toEqual([{ tag: "literal", text: "hello world" }]);
  });

  it("parses an empty double-quoted word", () => {
    // Either no parts or one empty part is a fine representation; what
    // matters is that it parses and carries no text.
    const word = parseFully(doubleQuotedWordParser, '""');
    expect(word.parts.map(describeWord).join("")).toBe("");
  });

  it("treats a variable inside double quotes as a variable", () => {
    // `echo "$HOME"` expands. Recording it as the literal text "$HOME"
    // makes a consumer pass a dollar sign through to the command.
    const word = parseFully(doubleQuotedWordParser, '"$HOME"');
    expect(word.parts).toEqual([{ tag: "variable", name: "HOME" }]);
  });

  it("parses text around a variable inside double quotes", () => {
    const word = parseFully(doubleQuotedWordParser, '"dir: $HOME/x"');
    expect(word.parts).toEqual([
      { tag: "literal", text: "dir: " },
      { tag: "variable", name: "HOME" },
      { tag: "literal", text: "/x" },
    ]);
  });

  it("parses two adjacent variables inside double quotes", () => {
    const word = parseFully(doubleQuotedWordParser, '"$A$B"');
    expect(word.parts).toEqual([
      { tag: "variable", name: "A" },
      { tag: "variable", name: "B" },
    ]);
  });

  it("parses a braced variable inside double quotes", () => {
    const word = parseFully(doubleQuotedWordParser, '"${HOME}"');
    expect(word.parts).toEqual([{ tag: "variable", name: "HOME" }]);
  });

  it("stops a variable name at a dot", () => {
    // bash expands `$HOME` and leaves ".txt" as text: a dot cannot appear
    // in a variable name.
    const word = parseFully(doubleQuotedWordParser, '"$HOME.txt"');
    expect(word.parts).toEqual([
      { tag: "variable", name: "HOME" },
      { tag: "literal", text: ".txt" },
    ]);
  });

  it("handles an escaped double quote inside double quotes", () => {
    // `"a\"b"` is the single word `a"b`.
    const word = parseFully(doubleQuotedWordParser, '"a\\"b"');
    expect(word.parts.map(describeWord).join("")).toBe('a"b');
  });

  it("unescapes an escaped backslash inside double quotes", () => {
    // bash: "a\\b" is the word a\b
    const word = parseFully(doubleQuotedWordParser, '"a\\\\b"');
    expect(word.parts.map(describeWord).join("")).toBe("a\\b");
  });

  it("treats an escaped dollar sign as text, not an expansion", () => {
    // bash: "\$5" is the word $5 — no variable named 5 is expanded.
    const word = parseFully(doubleQuotedWordParser, '"\\$5"');
    expect(word.parts.map(describeWord).join("")).toBe("$5");
  });

  it("keeps a backslash before an ordinary character", () => {
    // bash: "a\zb" keeps the backslash — it is only special before
    // `"`, `$`, a backtick, or another backslash.
    const word = parseFully(doubleQuotedWordParser, '"a\\zb"');
    expect(word.parts.map(describeWord).join("")).toBe("a\\zb");
  });

  it("merges adjacent literal parts into one", () => {
    // An escape splits the text run; a consumer should still see one part.
    const word = parseFully(doubleQuotedWordParser, '"a\\"b"');
    expect(word.parts).toEqual([{ tag: "literal", text: 'a"b' }]);
  });

  it("rejects command substitution inside double quotes", () => {
    // It expands in bash; treating it as text would run a different command.
    expect(parsesFully(doubleQuotedWordParser, '"$(date)"')).toBe(false);
  });

  it("rejects an unterminated single quote", () => {
    expect(parsesFully(singleQuotedWordParser, "'hello")).toBe(false);
  });

  it("rejects an unterminated double quote", () => {
    expect(parsesFully(doubleQuotedWordParser, '"hello')).toBe(false);
  });
});

describe("variables", () => {
  it("parses a bare variable", () => {
    expect(parseFully(variableWordParser, "$HOME")).toEqual({
      tag: "variable",
      name: "HOME",
    });
  });

  it("parses a braced variable", () => {
    expect(parseFully(variableWordParser, "${HOME}")).toEqual({
      tag: "variable",
      name: "HOME",
    });
  });

  it("parses a variable name containing an underscore", () => {
    expect(parseFully(variableWordParser, "$MY_VAR")).toEqual({
      tag: "variable",
      name: "MY_VAR",
    });
  });

  it("parses a single-letter variable name", () => {
    expect(parseFully(variableWordParser, "$A")).toEqual({ tag: "variable", name: "A" });
  });

  it("parses a variable name starting with an underscore", () => {
    expect(parseFully(variableWordParser, "$_private")).toEqual({
      tag: "variable",
      name: "_private",
    });
  });

  it("ends a variable name at a dot", () => {
    // A dot cannot appear in a variable name: bash expands `$HOME` and
    // leaves ".txt" as ordinary text.
    const result = variableWordParser("$HOME.txt");
    expect(result.success && result.result.name).toBe("HOME");
    expect(result.success && result.rest).toBe(".txt");
  });

  it("ends a variable name at a hyphen", () => {
    const result = variableWordParser("$HOME-x");
    expect(result.success && result.result.name).toBe("HOME");
    expect(result.success && result.rest).toBe("-x");
  });

  it("ends a braced variable name at the brace, not a dot", () => {
    expect(parseFully(variableWordParser, "${MY_VAR}")).toEqual({
      tag: "variable",
      name: "MY_VAR",
    });
  });
});

describe("flags", () => {
  it("parses a short flag", () => {
    expect(parseFully(flagWordParser, "-l")).toEqual({ tag: "flag", flagName: "-l" });
  });

  it("parses clustered short flags", () => {
    expect(parseFully(flagWordParser, "-la")).toEqual({ tag: "flag", flagName: "-la" });
  });

  it("parses a long flag", () => {
    expect(parseFully(flagWordParser, "--all")).toEqual({
      tag: "flag",
      flagName: "--all",
    });
  });

  it("parses a long flag containing a hyphen", () => {
    // `--dry-run` is one flag. Splitting it leaves "-run", which then looks
    // like a second flag.
    expect(parseFully(flagWordParser, "--dry-run")).toEqual({
      tag: "flag",
      flagName: "--dry-run",
    });
  });

  it("parses a long flag with a value", () => {
    expect(parseFully(flagWordParser, "--format=oneline")).toEqual({
      tag: "flag",
      flagName: "--format",
      flagValue: "oneline",
    });
  });
});

// ---------------------------------------------------------------------------
// Layer 2: simple commands
// ---------------------------------------------------------------------------

describe("simple commands", () => {
  it("parses a bare command", () => {
    expect(command("echo").command).toEqual({ tag: "literal", text: "echo" });
  });

  it("parses a command with one argument", () => {
    expect(positional(command("echo hello"))).toEqual(["hello"]);
  });

  it("parses a command with several arguments", () => {
    expect(positional(command("echo hello world again"))).toEqual([
      "hello",
      "world",
      "again",
    ]);
  });

  it("collapses runs of whitespace between arguments", () => {
    expect(positional(command("echo   hello\tworld"))).toEqual(["hello", "world"]);
  });

  it("tolerates leading and trailing whitespace", () => {
    const cmd = command("  echo hello  ");
    expect(cmd.command.text).toBe("echo");
    expect(positional(cmd)).toEqual(["hello"]);
  });

  it("parses a command with a path argument", () => {
    expect(positional(command("cat src/main.ts"))).toEqual(["src/main.ts"]);
  });

  it("parses a subcommand and a flag together", () => {
    expect(positional(command("git log --oneline"))).toEqual(["log", "--oneline"]);
  });

  it("parses a flag before a positional argument", () => {
    expect(positional(command("grep -i pattern"))).toEqual(["-i", "pattern"]);
  });

  it("parses a quoted argument", () => {
    expect(positional(command("echo 'hello world'"))).toEqual(["hello world"]);
  });
});

describe("input that is not a command", () => {
  // `simpleCommandParser` currently succeeds on all of these with an empty
  // command name, leaving the real text in `rest`. A consumer that trusts
  // `success` without checking `rest` acts on a command it never read.
  const notCommands = ["", "   ", "|||", "&&&", "; rm -rf /", "$(date)"];

  it.each(notCommands)("rejects %j rather than returning an empty command", (input) => {
    const result = simpleCommandParser(input);
    const parsedNothing =
      result.success && (result.result as SimpleCommand).command.text === "";
    expect(parsedNothing).toBe(false);
  });
});

describe("assignments", () => {
  it("parses a leading assignment", () => {
    const cmd = command("FOO=bar echo hi");
    expect(cmd.assignments).toHaveLength(1);
    expect(cmd.assignments[0].name).toBe("FOO");
    expect(cmd.command).toEqual({ tag: "literal", text: "echo" });
  });

  it("parses an assignment with an empty value", () => {
    expect(command("FOO= echo hi").assignments[0]).toMatchObject({
      name: "FOO",
      value: null,
    });
  });

  it("parses several leading assignments", () => {
    expect(command("FOO=1 BAR=2 echo hi").assignments.map((a) => a.name)).toEqual([
      "FOO",
      "BAR",
    ]);
  });

  it("does not treat an assignment-shaped argument as an assignment", () => {
    // `env FOO=bar` passes FOO=bar to env as an argument.
    const cmd = command("env FOO=bar");
    expect(cmd.assignments).toEqual([]);
    expect(cmd.command).toEqual({ tag: "literal", text: "env" });
  });

  it("parses a single-letter assignment name", () => {
    // `x=1` is an ordinary assignment.
    expect(command("x=1 echo hi").assignments[0].name).toBe("x");
  });

  it("parses an assignment name starting with an underscore", () => {
    expect(command("_x=1 echo hi").assignments[0].name).toBe("_x");
  });

  it("does not treat a name starting with a digit as an assignment", () => {
    // bash runs `1x=1` as a command literally named "1x=1" (exit 127), so
    // recording an assignment named "1x" misreports what would run.
    expect(command("1x=1").assignments).toEqual([]);
  });
});

describe("redirects", () => {
  it("parses an output redirect", () => {
    const redirect = parseFully(redirectParser, "> out.txt");
    expect(redirect.op).toBe(">");
    expect(describeWord(redirect.target)).toBe("out.txt");
  });

  it("parses an append redirect", () => {
    // `>>` appends where `>` truncates. Parsing it as `>` destroys a file.
    const redirect = parseFully(redirectParser, ">> out.txt");
    expect(redirect.op).toBe(">>");
    expect(describeWord(redirect.target)).toBe("out.txt");
  });

  it("parses an input redirect", () => {
    const redirect = parseFully(redirectParser, "< in.txt");
    expect(redirect.op).toBe("<");
  });

  it("parses a redirect with no space before its target", () => {
    const redirect = parseFully(redirectParser, ">out.txt");
    expect(redirect.op).toBe(">");
    expect(describeWord(redirect.target)).toBe("out.txt");
  });

  it("attaches an explicit file descriptor", () => {
    const redirect = parseFully(redirectParser, "2> err.txt");
    expect(redirect.fd).toBe(2);
    expect(redirect.op).toBe(">");
  });

  it("parses a redirect as part of a command", () => {
    const cmd = command("echo hi > out.txt");
    expect(cmd.redirects).toHaveLength(1);
    expect(cmd.redirects[0].op).toBe(">");
  });

  it("treats a detached number as an argument, not a file descriptor", () => {
    // `echo 2 > out.txt` passes "2" to echo. Only an ATTACHED digit is an fd.
    const cmd = command("echo 2 > out.txt");
    expect(positional(cmd)).toEqual(["2"]);
    expect(cmd.redirects[0].fd).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Layer 3: whole commands
// ---------------------------------------------------------------------------

describe("whole commands", () => {
  it("parses a simple command through the top-level parser", () => {
    const parsed = parseFully(commandParser, "echo hi");
    expect(parsed.tag).toBe("simpleCommand");
  });

  it("parses an && chain", () => {
    expect(parseFully(commandParser, "make && echo finished").tag).toBe("and");
  });

  it("parses an || chain", () => {
    expect(parseFully(commandParser, "make || echo failed").tag).toBe("or");
  });

  it("puts each side of a chain in the right slot", () => {
    const parsed = parseFully(commandParser, "make build && echo finished") as Command & {
      tag: "and";
      left: Command;
      right: Command;
    };
    expect((parsed.left as SimpleCommand).command).toEqual({
      tag: "literal",
      text: "make",
    });
    expect((parsed.right as SimpleCommand).command).toEqual({
      tag: "literal",
      text: "echo",
    });
  });

  it("parses a three-part chain", () => {
    expect(parsesFully(commandParser, "a && b && c")).toBe(true);
  });

  it("parses a chain with no spaces around the operator", () => {
    expect(parsesFully(commandParser, "a&&b")).toBe(true);
  });

  it("parses a parenthesized command", () => {
    expect(parseFully(commandParser, "(echo hi)").tag).toBe("parens");
  });
});

describe("reserved words", () => {
  it("rejects a bare reserved word as a command", () => {
    expect(parsesFully(commandParser, "if")).toBe(false);
  });

  it("rejects a compound command instead of mis-parsing its head", () => {
    // `if` starts a construct this parser does not support. Parsing it as a
    // command named `if` with arguments is a silent mis-parse.
    expect(parsesFully(commandParser, "if true; then echo hi; fi")).toBe(false);
  });

  it("rejects a reserved word in argument position too", () => {
    // `echo if` IS valid bash, and this parser deliberately refuses it.
    // Reserved words are rejected everywhere rather than only at command
    // position: this is a small subset of bash, and refusing to parse
    // something valid is the cheap failure. Mis-parsing it is not.
    expect(parsesFully(commandParser, "echo if")).toBe(false);
  });
});

describe("unsupported syntax is rejected, not mis-parsed", () => {
  const unsupported: [string, string][] = [
    ["pipeline", "ls | wc -l"],
    ["semicolon sequence", "echo a; echo b"],
    ["background command", "sleep 1 &"],
    ["command substitution", "echo $(date)"],
    ["backtick substitution", "echo `date`"],
    ["glob", "ls *.txt"],
    ["heredoc", "cat <<EOF"],
    ["brace expansion", "echo {a,b}"],
    ["tilde expansion", "cat ~/notes.txt"],
  ];

  it.each(unsupported)("rejects a %s", (_name, input) => {
    expect(parsesFully(commandParser, input)).toBe(false);
  });
});
