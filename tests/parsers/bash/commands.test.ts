import { describe, expect, it } from "vitest";
import {
  CaseCommand,
  ForCommand,
  FunctionDef,
  Group,
  IfCommand,
  LoopCommand,
  Subshell,
} from "@/lib/parsers/bash/index";
import { onlyCommand, parse, rejects, simple, text } from "./helpers";

describe("redirects", () => {
  it("parses common redirect forms", () => {
    const command = simple(parse("cmd < in.txt >> log.txt 2>&1"));
    expect(command.redirects).toMatchObject([
      { fd: null, op: "<", target: { parts: [{ text: "in.txt" }] } },
      { fd: null, op: ">>" },
      { fd: 2, op: ">&", target: { parts: [{ text: "1" }] } },
    ]);
  });

  it("distinguishes a numeric argument from a file descriptor", () => {
    const withFd = simple(parse("echo 2> err.txt"));
    expect(withFd.words.map(text)).toEqual(["echo"]);
    expect(withFd.redirects[0]).toMatchObject({ fd: 2, op: ">" });

    const withArg = simple(parse("echo 2 > out.txt"));
    expect(withArg.words.map(text)).toEqual(["echo", "2"]);
    expect(withArg.redirects[0]).toMatchObject({ fd: null, op: ">" });
  });

  it("attaches redirects with no space before the operator", () => {
    const command = simple(parse("echo foo>out.txt"));
    expect(command.words.map(text)).toEqual(["echo", "foo"]);
    expect(command.redirects[0]).toMatchObject({ fd: null, op: ">" });
  });

  it("parses stderr shorthand and herestrings", () => {
    const command = simple(parse('grep foo <<< "$input" >&2'));
    expect(command.redirects[0]).toMatchObject({ op: "<<<" });
    expect(command.redirects[1]).toMatchObject({
      op: ">&",
      target: { parts: [{ text: "2" }] },
    });
  });

  it("parses a redirect-only command", () => {
    const command = simple(parse("> empty.txt"));
    expect(command.words).toEqual([]);
    expect(command.redirects[0]).toMatchObject({ op: ">" });
  });

  it("rejects heredocs", () => rejects("cat <<EOF\nhello\nEOF\n"));
  it("rejects process substitution", () => rejects("diff <(ls) <(sort x)"));
});

describe("assignments and the assignment-vs-word boundary", () => {
  it("parses assignment prefixes before a command", () => {
    const command = simple(parse('FOO=bar BAZ="qux $FOO" run --now'));
    expect(command.assignments.map((a) => a.name)).toEqual(["FOO", "BAZ"]);
    expect(command.words.map(text)).toEqual(["run", "--now"]);
  });

  it("parses assignment-only commands", () => {
    const bare = simple(parse("PATH=/usr/local/bin:$PATH"));
    expect(bare.words).toEqual([]);
    expect(bare.assignments[0].value?.parts).toEqual([
      { tag: "literal", text: "/usr/local/bin:" },
      { tag: "variable", name: "PATH" },
    ]);
  });

  it("parses an empty assignment value as null", () => {
    const command = simple(parse("FOO="));
    expect(command.assignments[0].value).toBeNull();
  });

  it("treats k=v after the command word as a plain argument", () => {
    const command = simple(parse("env FOO=bar cmd --opt=value"));
    expect(command.assignments).toEqual([]);
    expect(command.words).toHaveLength(4);
    expect(command.words[1].parts).toEqual([{ tag: "literal", text: "FOO=bar" }]);
  });

  it("parses name=bar=baz as an assignment with value bar=baz", () => {
    const command = simple(parse("foo=bar=baz"));
    expect(command.words).toEqual([]);
    expect(command.assignments[0].name).toBe("foo");
    expect(command.assignments[0].value?.parts).toEqual([
      { tag: "literal", text: "bar=baz" },
    ]);
  });

  it("rejects append assignments", () => rejects("count+=1"));
  it("rejects array assignments", () => rejects("files=(a.txt b.txt)"));
});

describe("reserved words", () => {
  it("are plain words in argument position", () => {
    const command = simple(parse("echo if fi done"));
    expect(command.words.map(text)).toEqual(["echo", "if", "fi", "done"]);
  });

  it("are words when extended or quoted, matching bash", () => {
    const command = simple(parse("echo fi.txt"));
    expect(command.words.map(text)).toEqual(["echo", "fi.txt"]);
  });

  it("fail the parse when standing alone at command position", () => {
    rejects("fi");
    rejects("done");
    rejects("esac");
  });

  it("rejects unsupported reserved constructs", () => {
    rejects("[[ -n $HOME ]]");
    rejects("select x in a b; do echo $x; done");
    rejects("time ls");
  });
});

describe("if / elif / else", () => {
  it("parses the full form", () => {
    const list = parse(
      'if [ "$1" = start ]; then\n  run start\nelif [ "$1" = stop ]; then\n  run stop\nelif [ "$1" = status ]; then\n  run status\nelse\n  echo usage >&2\nfi',
    );
    const ifCommand = onlyCommand(list) as IfCommand;
    expect(ifCommand.tag).toBe("if");
    expect(text(simple(ifCommand.cond).words[0])).toBe("[");
    expect(ifCommand.elifs).toHaveLength(2);
    expect(ifCommand.elseBody).not.toBeNull();
  });

  it("rejects an empty condition", () => rejects("if ; then :; fi"));
  it("rejects a missing fi", () => rejects("if true; then echo hi"));
});

describe("loops", () => {
  it("parses while with a redirect on done", () => {
    const list = parse('while read -r line; do echo "-> $line"; done < input.txt');
    const loop = onlyCommand(list) as LoopCommand;
    expect(loop.kind).toBe("while");
    expect(loop.redirects).toMatchObject([{ op: "<" }]);
  });

  it("parses until", () => {
    const loop = onlyCommand(parse("until [ -f done.txt ]; do sleep 1; done")) as LoopCommand;
    expect(loop.kind).toBe("until");
  });

  it("parses for with an in-list", () => {
    const forCommand = onlyCommand(
      parse('for f in *.txt logs/*.log; do wc -l "$f"; done'),
    ) as ForCommand;
    expect(forCommand.variable).toBe("f");
    expect(forCommand.words?.map(text)).toEqual(["*.txt", "logs/*.log"]);
  });

  it("parses for without in (implicit \"$@\")", () => {
    const forCommand = onlyCommand(parse("for arg; do echo $arg; done")) as ForCommand;
    expect(forCommand.variable).toBe("arg");
    expect(forCommand.words).toBeNull();
  });

  it("rejects reserved words as loop variables", () =>
    rejects("for do in a b; do :; done"));
});

describe("case", () => {
  it("parses items, patterns, and terminators", () => {
    const list = parse(
      'case "$1" in\n  start|restart) run start ;;\n  (stop) run stop ;;\n  *) echo unknown ;;\nesac',
    );
    const caseCommand = onlyCommand(list) as CaseCommand;
    expect(caseCommand.items).toHaveLength(3);
    expect(caseCommand.items[0].patterns.map(text)).toEqual(["start", "restart"]);
    expect(caseCommand.items[1].patterns.map(text)).toEqual(["stop"]);
    expect(caseCommand.items[2].patterns.map(text)).toEqual(["*"]);
    expect(caseCommand.items.map((i) => i.terminator)).toEqual([";;", ";;", ";;"]);
  });

  it("allows the final item to end at esac without ;;", () => {
    const caseCommand = onlyCommand(
      parse("case $x in\n  a) echo a ;;\n  b) echo b\nesac"),
    ) as CaseCommand;
    expect(caseCommand.items[1].terminator).toBeNull();
  });

  it("parses fallthrough terminators and empty bodies", () => {
    const caseCommand = onlyCommand(
      parse("case $x in\n  a) echo a ;&\n  b) ;;&\n  c) echo c ;;\nesac"),
    ) as CaseCommand;
    expect(caseCommand.items.map((i) => i.terminator)).toEqual([";&", ";;&", ";;"]);
    expect(caseCommand.items[1].body.items).toEqual([]);
  });

  it("rejects a non-final item without ;;", () =>
    rejects("case x in\n  a) echo a\n  b) echo b ;;\nesac"));

  it("treats bare esac as the end of the case, not a pattern", () => {
    rejects("case x in esac) echo hi ;; esac");
  });

  it("allows esac as a parenthesized pattern, matching bash", () => {
    const caseCommand = onlyCommand(
      parse("case x in (esac) echo hi ;; esac"),
    ) as CaseCommand;
    expect(caseCommand.items[0].patterns.map(text)).toEqual(["esac"]);
  });
});

describe("subshells, groups, and arithmetic commands", () => {
  it("parses subshells and groups with redirects", () => {
    const list = parse("(cd /tmp && ls) | sort; { echo a; echo b; } > out.txt");
    const pipeline = list.items[0].command.first;
    expect(pipeline.commands[0].tag).toBe("subshell");
    expect((pipeline.commands[0] as Subshell).body.items).toHaveLength(1);
    const group = onlyCommand(list, 1) as Group;
    expect(group.body.items).toHaveLength(2);
    expect(group.redirects).toMatchObject([{ op: ">" }]);
  });

  it("parses (( )) as a raw arithmetic command", () => {
    const list = parse("(( count++ ))");
    expect(onlyCommand(list)).toMatchObject({
      tag: "arithmeticCommand",
      expression: " count++ ",
    });
  });

  it("rejects empty subshells and groups", () => {
    rejects("( )");
    rejects("{ }");
  });
});

describe("groups close only at command position (like bash's reserved })", () => {
  it("accepts a separator before }", () => {
    parse("{ echo a; }");
    parse("{ echo a\n}");
    parse("{ sleep 1 & }");
  });

  it("accepts a bare compound command as the final command", () => {
    parse("{ { echo a; } }");
    parse("{ if true; then :; fi }");
    parse("{ while true; do break; done }");
    parse("{ ( echo a ) }");
    parse("{ case y in a) echo b ;; esac }");
    parse("{ f() { :; } }");
  });

  it("accepts a pipeline or chain ending in a compound", () => {
    parse("{ echo a | { cat; } }");
    parse("{ echo a && { cat; } }");
    parse("{ ! { cat; } }");
  });

  it("rejects } directly after a simple command", () => {
    rejects("{ echo a }");
    rejects("func() { echo a }");
    rejects("if { echo a }; then :; fi");
  });

  it("rejects } after a redirected compound (a redirect re-enters word context)", () => {
    rejects("{ { cat; } > log }");
    rejects("{ if true; then :; fi > log }");
  });

  it("rejects } after (( )), matching bash 3.2", () => {
    // Parser-only: bash versions differ here, so it stays out of the
    // bash -n differential corpus.
    rejects("{ (( x++ )) }");
  });
});

describe("function definitions", () => {
  it("parses both styles", () => {
    const list = parse('greet() { echo hi; }\nfunction cleanup {\n rm -f "$tmp"\n}');
    const greet = onlyCommand(list, 0) as FunctionDef;
    expect(greet).toMatchObject({ tag: "functionDef", name: "greet" });
    expect((greet.body as Group).tag).toBe("group");
    const cleanup = onlyCommand(list, 1) as FunctionDef;
    expect(cleanup.name).toBe("cleanup");
  });

  it("parses the function keyword with parens", () => {
    const def = onlyCommand(parse("function go() { echo hi; }")) as FunctionDef;
    expect(def.name).toBe("go");
  });

  it("allows any compound command as the body, with redirects", () => {
    parse("f() if true; then :; fi");
    parse("f() ( echo hi )");
    parse("f() { :; } > log");
  });

  it("rejects non-compound bodies, matching bash", () => {
    rejects("f() echo hi");
    rejects("f() g() { :; }");
  });
});
