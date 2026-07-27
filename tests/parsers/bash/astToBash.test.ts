/**
 * Tests for astToBash — turning a parsed AST back into a bash command.
 *
 * The headline property is the round trip: for anything the parser
 * produced, emitting and re-parsing must give back an equal AST. String
 * equality is deliberately NOT the property — the AST does not record
 * where a redirect sat among the arguments, and whitespace normalizes.
 */
import { execFileSync } from "child_process";
import { describe, expect, it } from "vitest";
import { astToBash } from "@/lib/parsers/bash/astToBash";
import { bashParser } from "@/lib/parsers/bash/parsers";
import {
  BashAST,
  Command,
  SimpleCommand,
  Word,
  literalWord,
} from "@/lib/parsers/bash/types";

function parse(input: string): BashAST {
  const result = bashParser(input);
  if (!result.success) throw new Error(`parse failed: ${result.message}`);
  return result.result;
}

/** Emit, re-parse, and hand back both ASTs for comparison. */
function roundTrip(input: string): { before: BashAST; after: BashAST; emitted: string } {
  const before = parse(input);
  const emitted = astToBash(before);
  const after = parse(emitted);
  return { before, after, emitted };
}

const firstCommand = (input: string): SimpleCommand =>
  parse(input)[0] as SimpleCommand;

const onlyArg = (input: string): Word => firstCommand(input).args[0];

// ---------------------------------------------------------------------------
// The round-trip property
// ---------------------------------------------------------------------------

describe("round trip", () => {
  const corpus = [
    "echo",
    "echo hello",
    "echo hello world",
    "git status",
    "git log --oneline",
    "ls -la",
    "ls -la src",
    "cat file.txt",
    "cat src/main.ts",
    "/usr/bin/env node",
    "ls /",
    "echo 'hello world'",
    'echo "hello world"',
    "echo ''",
    'echo "$HOME"',
    "echo $HOME",
    "echo ${HOME}",
    "echo $HOME/bin",
    "echo $HOME.txt",
    'echo "$HOME"/x',
    'echo "a"b',
    "echo $A$B",
    "FOO=bar echo hi",
    "FOO= echo hi",
    "FOO=1 BAR=2 echo hi",
    "FOO=bar",
    "PATH=$HOME/bin cmd",
    "env FOO=bar",
    "echo hi > out.txt",
    "echo hi >> out.txt",
    "grep x < in.txt",
    "cmd 2> err.txt",
    "cmd 3> x",
    "cmd &> all.txt",
    "echo 2 > out.txt",
    "make && echo finished",
    "make || echo failed",
    "a && b && c",
    "a || b && c",
    "(echo hi)",
    "(a && b) || c",
    "echo a; echo b",
    "curl http://example.com",
    "chmod +x run.sh",
    "gcc -I/usr/include main.c",
    "cmd --file=a/b",
  ];

  it.each(corpus)("re-parses to the same AST: %s", (input) => {
    const { before, after } = roundTrip(input);
    expect(after).toEqual(before);
  });

  it("produces output the parser accepts for every corpus entry", () => {
    for (const input of corpus) {
      const emitted = astToBash(parse(input));
      expect(bashParser(emitted).success, `emitted: ${emitted}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Quoting rules
// ---------------------------------------------------------------------------

describe("words", () => {
  it("emits a plain word bare", () => {
    expect(astToBash(onlyArg("echo hello"))).toBe("hello");
  });

  it("emits a path bare", () => {
    expect(astToBash(onlyArg("cat src/main.ts"))).toBe("src/main.ts");
  });

  it("emits a variable", () => {
    expect(astToBash(onlyArg("echo $HOME"))).toBe("$HOME");
  });

  it("emits a flag", () => {
    expect(astToBash(onlyArg("ls -la"))).toBe("-la");
  });

  it("emits a flag with a value", () => {
    expect(astToBash(onlyArg("git --format=oneline"))).toBe("--format=oneline");
  });

  it("emits a single-quoted word", () => {
    expect(astToBash(onlyArg("echo 'a b'"))).toBe("'a b'");
  });

  it("emits a double-quoted word", () => {
    expect(astToBash(onlyArg('echo "a b"'))).toBe('"a b"');
  });

  it("emits a variable inside double quotes", () => {
    expect(astToBash(onlyArg('echo "$HOME"'))).toBe('"$HOME"');
  });

  it("emits an interpolated word with no separator", () => {
    expect(astToBash(onlyArg("echo $HOME/bin"))).toBe("$HOME/bin");
  });
});

describe("quoting text that could not have come from the parser", () => {
  // The parser's word charset cannot produce these, but a consumer can
  // construct them. Emitting them bare would change the command.
  it("quotes a literal containing a space", () => {
    expect(astToBash(literalWord("a b"))).toBe("'a b'");
  });

  it("quotes a literal containing a semicolon", () => {
    expect(astToBash(literalWord("; rm -rf /"))).toBe("'; rm -rf /'");
  });

  it("quotes a literal containing a dollar sign", () => {
    expect(astToBash(literalWord("$HOME"))).toBe("'$HOME'");
  });

  it("quotes an empty literal", () => {
    expect(astToBash(literalWord(""))).toBe("''");
  });

  it("escapes a single quote inside a single-quoted word", () => {
    // bash has no escape inside single quotes; the idiom is to close,
    // emit an escaped quote, and reopen.
    const word: Word = { tag: "singleQuoted", text: "it's" };
    expect(astToBash(word)).toBe("'it'\\''s'");
  });

  it("escapes a double quote inside a double-quoted word", () => {
    const word: Word = { tag: "doubleQuoted", parts: [literalWord('a"b')] };
    expect(astToBash(word)).toBe('"a\\"b"');
  });

  it("escapes a dollar sign inside a double-quoted word", () => {
    const word: Word = { tag: "doubleQuoted", parts: [literalWord("cost: $5")] };
    expect(astToBash(word)).toBe('"cost: \\$5"');
  });
});

describe("a variable followed by text needs braces", () => {
  it("braces a variable when the next part could continue its name", () => {
    // `$Abc` would parse as a variable named "Abc" — a different command.
    const word: Word = {
      tag: "interpolatedVariable",
      parts: [{ tag: "variable", name: "A" }, literalWord("bc")],
    };
    expect(astToBash(word)).toBe("${A}bc");
  });

  it("braces a variable followed by a digit", () => {
    const word: Word = {
      tag: "interpolatedVariable",
      parts: [{ tag: "variable", name: "A" }, literalWord("1")],
    };
    expect(astToBash(word)).toBe("${A}1");
  });

  it("does not brace when the next part cannot continue the name", () => {
    const word: Word = {
      tag: "interpolatedVariable",
      parts: [{ tag: "variable", name: "HOME" }, literalWord("/bin")],
    };
    expect(astToBash(word)).toBe("$HOME/bin");
  });

  it("round-trips a braced variable through the parser", () => {
    const word: Word = {
      tag: "interpolatedVariable",
      parts: [{ tag: "variable", name: "A" }, literalWord("bc")],
    };
    const reparsed = firstCommand(`echo ${astToBash(word)}`).args[0];
    expect(reparsed).toEqual(word);
  });
});

describe("commands", () => {
  it("emits a simple command", () => {
    expect(astToBash(parse("echo hello world"))).toBe("echo hello world");
  });

  it("emits assignments before the command", () => {
    expect(astToBash(parse("FOO=bar echo hi"))).toBe("FOO=bar echo hi");
  });

  it("emits an assignment with no value", () => {
    expect(astToBash(parse("FOO= echo hi"))).toBe("FOO= echo hi");
  });

  it("emits an assignment-only command", () => {
    expect(astToBash(parse("FOO=bar"))).toBe("FOO=bar");
  });

  it("emits a redirect", () => {
    expect(astToBash(parse("echo hi > out.txt"))).toBe("echo hi > out.txt");
  });

  it("emits a redirect with a file descriptor", () => {
    expect(astToBash(parse("cmd 2> err.txt"))).toBe("cmd 2> err.txt");
  });

  it("emits redirects after the arguments", () => {
    // The AST does not record where the redirect sat, so it goes last.
    expect(astToBash(parse("cmd > out.txt arg"))).toBe("cmd arg > out.txt");
  });

  it("emits an && chain", () => {
    expect(astToBash(parse("make && echo done2"))).toBe("make && echo done2");
  });

  it("emits an || chain", () => {
    expect(astToBash(parse("make || echo failed"))).toBe("make || echo failed");
  });

  it("emits parens", () => {
    expect(astToBash(parse("(echo hi)"))).toBe("(echo hi)");
  });

  it("joins multiple commands with a semicolon", () => {
    expect(astToBash(parse("echo a; echo b"))).toBe("echo a; echo b");
  });
});

describe("a right-nested chain needs parens", () => {
  it("parenthesizes an or nested on the right of an and", () => {
    // Flat, `a && b || c` re-parses left-associatively as Or(And(a,b),c) —
    // a different tree.
    const a = parse("a")[0];
    const b = parse("b")[0];
    const c = parse("c")[0];
    const nested: Command = {
      tag: "and",
      left: a,
      right: { tag: "or", left: b, right: c },
    };
    expect(astToBash(nested)).toBe("a && (b || c)");
  });

  it("does not parenthesize a left-nested chain", () => {
    expect(astToBash(parse("a && b && c"))).toBe("a && b && c");
  });
});

// ---------------------------------------------------------------------------
// Differential: does bash build the argv the AST describes?
// ---------------------------------------------------------------------------

describe("emitted commands run as the AST describes", () => {
  /** Run the emitted text with a function that prints its own argv. */
  function bashArgv(command: string): string[] {
    const script = `cmd() { printf '%s\\0' "$@"; }\nHOME=/h; export HOME\n${command}\n`;
    const out = execFileSync("bash", ["-c", script], {
      encoding: "buffer",
      stdio: ["pipe", "pipe", "ignore"],
    });
    const parts = out.toString("utf8").split("\0");
    parts.pop();
    return parts;
  }

  const cases: [string, string[]][] = [
    ["cmd a b", ["a", "b"]],
    ["cmd 'a b'", ["a b"]],
    ["cmd \"a b\"", ["a b"]],
    ["cmd $HOME/x", ["/h/x"]],
    ["cmd \"$HOME\"/x", ["/h/x"]],
    ["cmd file.txt", ["file.txt"]],
  ];

  it.each(cases)("%s keeps its argv through a round trip", (input, expected) => {
    const emitted = astToBash(parse(input));
    expect(bashArgv(emitted)).toEqual(expected);
  });

  it("does not let a constructed literal break out into new words", () => {
    // The whole point of quoting on the way out: this must stay ONE
    // argument, not a second command.
    const command: SimpleCommand = {
      tag: "simpleCommand",
      assignments: [],
      command: { tag: "literal", text: "cmd" },
      args: [literalWord("; rm -rf /")],
      redirects: [],
    };
    expect(bashArgv(astToBash(command))).toEqual(["; rm -rf /"]);
  });
});
