/**
 * Tests for the small bash parser.
 *
 * Expectations are real bash semantics, restricted to the subset the
 * parser sets out to support. Organized in three layers so failures
 * isolate: word-level tests exercise the leaf parsers directly, command
 * tests exercise `simpleCommandParser`, and chain tests exercise
 * `commandParser`. A break in one layer does not hide the others.
 *
 * `bashParser` is the whole-input entry point; `parseFully` composes the
 * same rule for the sub-parsers, so a parser that stops early and leaves
 * input behind counts as a failure. Otherwise "parsed" would include
 * commands with half the text quietly discarded.
 */
import { describe, expect, it } from "vitest";
import {
  bashParser,
  commandParser,
  flagWordParser,
  interpolatedVariableWordParser,
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

/** Every non-assignment, non-redirect word after the command name, in
 *  source order. */
function positional(cmd: SimpleCommand): string[] {
  return cmd.args.map(describeWord);
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
    case "interpolatedVariable":
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

  it("accepts a doubled slash", () => {
    // `a//b` is a valid path in bash (duplicate slashes collapse), and the
    // `//` in a URL needs it — `curl http://example.com` depends on this.
    expect(parseFully(pathWordParser, "a//b")).toEqual({ tag: "path", text: "a//b" });
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

describe("interpolated words", () => {
  // An unquoted word can mix literal text and variables: `$HOME.txt` is ONE
  // word in bash. Without this, the parts become separate arguments and the
  // command means something else.
  const parts = (input: string) =>
    parseFully(interpolatedVariableWordParser, input).parts;

  it("parses a variable followed by literal text", () => {
    expect(parts("$HOME.txt")).toEqual([
      { tag: "variable", name: "HOME" },
      { tag: "literal", text: ".txt" },
    ]);
  });

  it("parses a variable followed by a path segment", () => {
    expect(parts("$HOME/bin")).toEqual([
      { tag: "variable", name: "HOME" },
      { tag: "literal", text: "/bin" },
    ]);
  });

  it("parses literal text followed by a variable", () => {
    expect(parts("prefix$NAME")).toEqual([
      { tag: "literal", text: "prefix" },
      { tag: "variable", name: "NAME" },
    ]);
  });

  it("parses two adjacent variables", () => {
    expect(parts("$A$B")).toEqual([
      { tag: "variable", name: "A" },
      { tag: "variable", name: "B" },
    ]);
  });

  it("parses text on both sides of a variable", () => {
    expect(parts("a$MID.b")).toEqual([
      { tag: "literal", text: "a" },
      { tag: "variable", name: "MID" },
      { tag: "literal", text: ".b" },
    ]);
  });

  it("parses a braced variable followed by text", () => {
    expect(parts("${HOME}.txt")).toEqual([
      { tag: "variable", name: "HOME" },
      { tag: "literal", text: ".txt" },
    ]);
  });

  it("does not match a word with no variable in it", () => {
    // `file.txt` is a plain literal; wrapping it in an interpolated word
    // would hide the simpler shape from consumers.
    expect(interpolatedVariableWordParser("file.txt").success).toBe(false);
  });

  it("parses a double-quoted part next to literal text", () => {
    // bash: `"a"b` is the single word `ab`.
    expect(parts('"a"b')).toEqual([
      { tag: "doubleQuoted", parts: [{ tag: "literal", text: "a" }] },
      { tag: "literal", text: "b" },
    ]);
  });

  it("parses a single-quoted part next to literal text", () => {
    expect(parts("'a'b")).toEqual([
      { tag: "singleQuoted", text: "a" },
      { tag: "literal", text: "b" },
    ]);
  });

  it("parses literal text on both sides of a quoted part", () => {
    expect(describeWord(parseFully(interpolatedVariableWordParser, 'a"b"c'))).toBe("abc");
  });

  it("parses a quoted variable followed by a path suffix", () => {
    // `"$HOME"/x` — quoting the variable then appending is idiomatic.
    expect(parts('"$HOME"/x')).toEqual([
      { tag: "doubleQuoted", parts: [{ tag: "variable", name: "HOME" }] },
      { tag: "literal", text: "/x" },
    ]);
  });

  it("does not match a lone quoted word", () => {
    // `"a b"` is a plain DoubleQuotedWord; there is nothing to join it to.
    expect(interpolatedVariableWordParser('"a b"').success).toBe(false);
    expect(interpolatedVariableWordParser("'a b'").success).toBe(false);
  });

  it("does not match a lone variable", () => {
    // `$HOME` on its own stays a plain VariableWord — there is nothing to
    // interpolate it with.
    expect(interpolatedVariableWordParser("$HOME").success).toBe(false);
  });

  it("parses a variable followed by a quoted part", () => {
    // bash: `$HOME"x"` is the single word `/hx`.
    expect(parts('$HOME"x"')).toEqual([
      { tag: "variable", name: "HOME" },
      { tag: "doubleQuoted", parts: [{ tag: "literal", text: "x" }] },
    ]);
  });

  it("requires the whole word to be consumed", () => {
    // A trailing operator character is a boundary, but a stray one that
    // no part can start is not: refuse rather than split the word.
    expect(interpolatedVariableWordParser("$HOME*x").success).toBe(false);
  });
});

describe("interpolated words in a command", () => {
  it("keeps a variable and its suffix as one argument", () => {
    const cmd = command("cat $HOME/notes.txt");
    expect(positional(cmd)).toEqual(["$HOME/notes.txt"]);
    expect(cmd.args).toHaveLength(1);
    expect(cmd.args[0].tag).toBe("interpolatedVariable");
  });

  it("keeps an interpolated assignment value with its command", () => {
    // Previously: assignment PATH=$HOME, command "/bin", subcommand "cmd" —
    // a different program than bash would run.
    const cmd = command("PATH=$HOME/bin cmd");
    expect(cmd.assignments).toHaveLength(1);
    expect(cmd.assignments[0].name).toBe("PATH");
    expect(describeWord(cmd.assignments[0].value as Word)).toBe("$HOME/bin");
    expect(cmd.command.text).toBe("cmd");
  });

  it("leaves a plain variable argument alone", () => {
    const cmd = command("echo $HOME");
    expect(cmd.args).toEqual([{ tag: "variable", name: "HOME" }]);
  });

  it("leaves a plain path argument alone", () => {
    const cmd = command("cat src/main.ts");
    expect(positional(cmd)).toEqual(["src/main.ts"]);
    expect(cmd.args[0].tag).toBe("path");
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

  it("parses a flag value containing a slash", () => {
    // bash: `--file=a/b` is one word.
    expect(parseFully(flagWordParser, "--file=a/b")).toEqual({
      tag: "flag",
      flagName: "--file",
      flagValue: "a/b",
    });
  });

  it("parses a flag name containing a path", () => {
    // `-I/usr/include` is one word to bash; splitting it leaves a stray
    // path argument the command was never given.
    expect(parseFully(flagWordParser, "-I/usr/include")).toEqual({
      tag: "flag",
      flagName: "-I/usr/include",
    });
  });

  it("does not leave a remainder after a flag", () => {
    // Without a boundary check the leftover becomes a separate argument.
    expect(flagWordParser('-x"y"').success).toBe(false);
  });
});

describe("interpolated words in commands", () => {
  it("keeps a quoted variable and its suffix as one argument", () => {
    const cmd = command('cat "$HOME"/notes.txt');
    expect(cmd.args).toHaveLength(1);
    expect(describeWord(cmd.args[0])).toBe("$HOME/notes.txt");
  });

  it("keeps a flag-shaped word containing a variable in one piece", () => {
    // `--file=$HOME/x` is one word; the flag parser cannot hold a variable,
    // so it lands as an interpolated word rather than being split.
    const cmd = command("cmd --file=$HOME/x");
    expect(cmd.args).toHaveLength(1);
    expect(describeWord(cmd.args[0])).toBe("--file=$HOME/x");
  });

  it("keeps an include flag and its path as one argument", () => {
    const cmd = command("gcc -I/usr/include main.c");
    expect(positional(cmd)).toEqual(["-I/usr/include", "main.c"]);
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

describe("newlines separate commands", () => {
  // A newline is a command separator, not whitespace. Treating it as
  // whitespace merges commands: `ls\nrm -rf /tmp/x` becomes a single `ls`
  // with arguments, so anything inspecting the command name sees `ls`
  // while bash runs the `rm`.
  function commands(input: string) {
    const result = bashParser(input);
    if (!result.success) throw new Error(`parse failed: ${result.message}`);
    return result.result;
  }

  it("splits two commands on a newline", () => {
    const parsed = commands("echo a\necho b");
    expect(parsed).toHaveLength(2);
  });

  it("does not attach the second command as arguments to the first", () => {
    const parsed = commands("ls\nrm -rf /tmp/x");
    expect(parsed).toHaveLength(2);
    expect((parsed[0] as SimpleCommand).command.text).toBe("ls");
    expect((parsed[1] as SimpleCommand).command.text).toBe("rm");
  });

  it("ignores blank lines between commands", () => {
    expect(commands("echo a\n\n\necho b")).toHaveLength(2);
  });

  it("accepts a semicolon followed by a newline", () => {
    expect(commands("echo a;\necho b")).toHaveLength(2);
  });

  it("still splits on a semicolon", () => {
    expect(commands("echo a; echo b")).toHaveLength(2);
  });

  it("still rejects a doubled semicolon", () => {
    const result = bashParser("echo a ;; echo b");
    expect(result.success && result.rest.trim() === "").toBe(false);
  });
});

describe("flags reach the args field", () => {
  // `-` is a word character, so a leading flag used to be matched as a
  // bare literal and `FlagWord` was unreachable for the commands that
  // matter most.
  it("records a leading short flag as a flag", () => {
    const cmd = command("ls -la");
    expect(cmd.args).toEqual([{ tag: "flag", flagName: "-la" }]);
  });

  it("records a long flag after a subcommand as a flag", () => {
    const cmd = command("git log --oneline");
    expect(cmd.args.map(describeWord)).toEqual(["log", "--oneline"]);
    expect(cmd.args[1]).toEqual({ tag: "flag", flagName: "--oneline" });
  });

  it("keeps a hyphen inside a word working", () => {
    // The rule is about a LEADING hyphen; `my-file` is still one word.
    expect(positional(command("cat my-file"))).toEqual(["my-file"]);
  });
});

describe("file descriptors attached to a redirect", () => {
  it("reads an attached digit as a file descriptor, not an argument", () => {
    // bash: `cmd 3> x` redirects fd 3 and passes NO argument.
    const cmd = command("cmd 3> x");
    expect(positional(cmd)).toEqual([]);
    expect(cmd.redirects[0].fd).toBe(3);
  });

  it("still treats a detached digit as an argument", () => {
    const cmd = command("echo 2 > x");
    expect(positional(cmd)).toEqual(["2"]);
    expect(cmd.redirects[0].fd).toBeUndefined();
  });

  it("allows an argument after a redirect", () => {
    // bash accepts redirects anywhere among the arguments.
    const cmd = command("cmd > out.txt arg");
    expect(positional(cmd)).toEqual(["arg"]);
    expect(cmd.redirects).toHaveLength(1);
  });
});

describe("arguments are one ordered list", () => {
  // There is no syntactic rule that separates a subcommand from an
  // argument — `git status` and `echo status` are the same shape — so
  // every word after the command name goes in `args`, in source order.
  const argTexts = (input: string) => command(input).args.map(describeWord);

  it("keeps a subcommand-shaped word in args", () => {
    expect(argTexts("git status")).toEqual(["status"]);
  });

  it("reports the file a command operates on", () => {
    expect(argTexts("rm foo.txt")).toEqual(["foo.txt"]);
  });

  it("keeps every positional argument, in order", () => {
    expect(argTexts("tar czf a.tar.gz dir/")).toEqual(["czf", "a.tar.gz", "dir/"]);
  });

  it("keeps flags and positionals in source order", () => {
    expect(argTexts("ls -la src")).toEqual(["-la", "src"]);
  });

  it("does not reorder around a path", () => {
    expect(argTexts("cp a.txt b.txt")).toEqual(["a.txt", "b.txt"]);
  });

  it("reports the command env runs", () => {
    const cmd = command("env FOO=bar cmd");
    expect(cmd.command.text).toBe("env");
    expect(argTexts("env FOO=bar cmd")).toEqual(["FOO=bar", "cmd"]);
  });
});

describe("leading separators", () => {
  const parses = (input: string) => {
    const result = bashParser(input);
    return result.success && result.rest.trim() === "";
  };

  it("accepts input starting with a newline", () => {
    expect(parses("\nls")).toBe(true);
  });

  it("accepts input starting with a blank line", () => {
    expect(parses("  \n ls")).toBe(true);
  });

  it("accepts CRLF line endings", () => {
    const result = bashParser("ls\r\nrm -rf x");
    expect(result.success && result.result).toHaveLength(2);
  });

  it("still accepts a trailing newline", () => {
    expect(parses("ls\n")).toBe(true);
  });
});

describe("standalone assignments", () => {
  it("parses an assignment with no command", () => {
    // A bare `FOO=bar` line is ordinary in a script and cannot be
    // mis-parsed into anything else.
    const cmd = command("FOO=bar");
    expect(cmd.command).toBeNull();
    expect(cmd.assignments).toHaveLength(1);
    expect(cmd.assignments[0].name).toBe("FOO");
  });

  it("still requires a command or an assignment", () => {
    expect(bashParser("   ").success).toBe(false);
  });
});

describe("redirect operators that take no file descriptor", () => {
  it("treats a digit before &> as an argument", () => {
    // bash has no fd-prefixed form of `&>`: in `cmd 2&> f` the `2` is an
    // ordinary argument. Reading it as fd 2 loses the argument entirely.
    const cmd = command("cmd 2&> f");
    expect(cmd.args.map(describeWord)).toEqual(["2"]);
    expect(cmd.redirects[0].op).toBe("&>");
    expect(cmd.redirects[0].fd).toBeUndefined();
  });

  it("still attaches a digit to an operator that takes one", () => {
    const cmd = command("cmd 3> f");
    expect(cmd.args).toEqual([]);
    expect(cmd.redirects[0].fd).toBe(3);
  });
});

describe("error positions", () => {
  it("reports the offset where the unparsed text starts", () => {
    // tarsec derives position from originalInput.length - rest.length, so
    // returning the whole input as `rest` puts every error at column 1.
    const result = bashParser("echo hi | wc");
    expect(result.success).toBe(false);
    expect(result.success === false && result.rest).toBe("| wc");
  });
});

describe("word characters", () => {
  const parses = (input: string) => {
    const result = bashParser(input);
    return result.success && result.rest.trim() === "";
  };

  it("accepts a colon, so URLs and PATH-style values work", () => {
    expect(parses("curl http://example.com")).toBe(true);
    expect(parses("PATH=/a:/b cmd")).toBe(true);
  });

  it("accepts a plus, so chmod works", () => {
    expect(parses("chmod +x run.sh")).toBe(true);
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
