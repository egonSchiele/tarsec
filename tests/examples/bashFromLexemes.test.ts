import { describe, expect, it } from "vitest";
import { BIG_SCRIPT, REAL_SCRIPTS } from "./fixtures/corpus";
import {
  AndOr,
  bashParser,
  BashWord,
  CaseCommand,
  Command,
  ForCommand,
  FunctionDef,
  Group,
  IfCommand,
  List,
  LoopCommand,
  Pipeline,
  SimpleCommand,
  Subshell,
} from "./bashFromLexemes";

function parse(input: string): List {
  const result = bashParser(input);
  if (!result.success) {
    throw new Error(`parse failed: ${result.message}\nat: ${result.rest.slice(0, 40)}`);
  }
  return result.result;
}

/** Unwrap a list item that is a single non-negated pipeline of one command. */
function onlyCommand(list: List, index = 0): Command {
  const item = list.items[index];
  expect(item.command.rest).toEqual([]);
  expect(item.command.first.commands).toHaveLength(1);
  return item.command.first.commands[0];
}

function simple(list: List, index = 0): SimpleCommand {
  const command = onlyCommand(list, index);
  expect(command.tag).toBe("simpleCommand");
  return command as SimpleCommand;
}

/** Bare text of a word made of a single literal part. */
function text(word: BashWord): string {
  expect(word.parts).toHaveLength(1);
  const part = word.parts[0];
  if (part.tag !== "literal") throw new Error(`not a literal: ${part.tag}`);
  return part.text;
}

describe("simple commands and words", () => {
  it("parses a command with arguments", () => {
    const command = simple(parse("echo hello world"));
    expect(command.words.map(text)).toEqual(["echo", "hello", "world"]);
  });

  it("parses quoting: single, double, adjacent parts", () => {
    const command = simple(parse(`echo 'a b' "c $d" e'f'"g"$h`));
    expect(command.words).toHaveLength(4);
    expect(command.words[1].parts).toEqual([{ tag: "singleQuoted", text: "a b" }]);
    expect(command.words[2].parts).toEqual([
      {
        tag: "doubleQuoted",
        parts: [{ tag: "literal", text: "c " }, { tag: "variable", name: "d" }],
      },
    ]);
    // e'f'"g"$h is ONE word of four adjacent parts
    expect(command.words[3].parts).toEqual([
      { tag: "literal", text: "e" },
      { tag: "singleQuoted", text: "f" },
      { tag: "doubleQuoted", parts: [{ tag: "literal", text: "g" }] },
      { tag: "variable", name: "h" },
    ]);
  });

  it("parses escapes and special variables", () => {
    const command = simple(parse(String.raw`echo foo\ bar "$@" $? $1`));
    expect(text(command.words[1])).toBe("foo bar");
    expect(command.words[2].parts).toEqual([
      { tag: "doubleQuoted", parts: [{ tag: "variable", name: "@" }] },
    ]);
    expect(command.words[3].parts).toEqual([{ tag: "variable", name: "?" }]);
    expect(command.words[4].parts).toEqual([{ tag: "variable", name: "1" }]);
  });

  it("treats reserved words as plain words in argument position", () => {
    const command = simple(parse("echo if fi done"));
    expect(command.words.map(text)).toEqual(["echo", "if", "fi", "done"]);
  });

  it("parses assignments, including assignment-only commands", () => {
    const command = simple(parse('FOO=bar BAZ="qux $FOO" run --now'));
    expect(command.assignments.map((a) => a.name)).toEqual(["FOO", "BAZ"]);
    expect(command.words.map(text)).toEqual(["run", "--now"]);

    const bare = simple(parse("PATH=/usr/local/bin:$PATH"));
    expect(bare.words).toEqual([]);
    expect(bare.assignments[0].value?.parts).toEqual([
      { tag: "literal", text: "/usr/local/bin:" },
      { tag: "variable", name: "PATH" },
    ]);

    const empty = simple(parse("FOO="));
    expect(empty.assignments[0].value).toBeNull();
  });
});

describe("expansions", () => {
  it("parses nested command substitution", () => {
    const command = simple(parse('echo "dir: $(basename $(pwd))"'));
    const quoted = command.words[1].parts[0];
    if (quoted.tag !== "doubleQuoted") throw new Error("expected doubleQuoted");
    const substitution = quoted.parts[1];
    if (substitution.tag !== "commandSubstitution")
      throw new Error("expected commandSubstitution");
    const inner = simple(substitution.command);
    expect(text(inner.words[0])).toBe("basename");
    expect(inner.words[1].parts[0].tag).toBe("commandSubstitution");
  });

  it("parses parameter and arithmetic expansion as raw text", () => {
    const command = simple(parse("echo ${VAR:-default} $((count + 1)) `date`"));
    expect(command.words[1].parts).toEqual([
      { tag: "paramExpansion", expression: "VAR:-default" },
    ]);
    expect(command.words[2].parts).toEqual([
      { tag: "arithmeticExpansion", expression: "count + 1" },
    ]);
    expect(command.words[3].parts).toEqual([
      { tag: "backtickSubstitution", commandText: "date" },
    ]);
  });
});

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

  it("parses stderr shorthand and herestrings", () => {
    const command = simple(parse('grep foo <<< "$input" >&2'));
    expect(command.redirects[0]).toMatchObject({ op: "<<<" });
    expect(command.redirects[1]).toMatchObject({ op: ">&", target: { parts: [{ text: "2" }] } });
  });
});

describe("pipelines and lists", () => {
  it("parses pipelines", () => {
    const list = parse("ps aux | grep node | awk '{print $2}'");
    const pipeline = list.items[0].command.first;
    expect(pipeline.commands).toHaveLength(3);
    expect((pipeline.commands[2] as SimpleCommand).words[1].parts[0].tag).toBe(
      "singleQuoted",
    );
  });

  it("parses negation, && / || chains, and background &", () => {
    const list = parse("! grep -q foo bar.txt && echo found || echo missing &");
    const item = list.items[0];
    expect(item.background).toBe(true);
    expect(item.command.first.negated).toBe(true);
    expect(item.command.rest.map((r) => r.op)).toEqual(["&&", "||"]);
  });

  it("separates commands with ; and newlines, skipping comments", () => {
    const list = parse("cd /tmp; ls -la\n# a comment\n\necho done # trailing\n");
    expect(list.items).toHaveLength(3);
    expect(simple(list, 2).words.map(text)).toEqual(["echo", "done"]);
  });

  it("handles line continuations", () => {
    const command = simple(parse("echo one \\\n  two"));
    expect(command.words.map(text)).toEqual(["echo", "one", "two"]);
  });
});

describe("compound commands", () => {
  it("parses if / elif / else", () => {
    const list = parse(`
      if [ "$1" = start ]; then
        run start
      elif [ "$1" = stop ]; then
        run stop
      else
        echo "usage: $0 start|stop" >&2
      fi
    `);
    const ifCommand = onlyCommand(list) as IfCommand;
    expect(ifCommand.tag).toBe("if");
    expect(text(simple(ifCommand.cond).words[0])).toBe("[");
    expect(ifCommand.elifs).toHaveLength(1);
    expect(ifCommand.elseBody).not.toBeNull();
  });

  it("parses while and until loops with redirects", () => {
    const list = parse("while read -r line; do echo \"-> $line\"; done < input.txt");
    const loop = onlyCommand(list) as LoopCommand;
    expect(loop.tag).toBe("loop");
    expect(loop.kind).toBe("while");
    expect(loop.redirects).toMatchObject([{ op: "<" }]);
  });

  it("parses for loops", () => {
    const list = parse("for f in *.txt logs/*.log; do wc -l \"$f\"; done");
    const forCommand = onlyCommand(list) as ForCommand;
    expect(forCommand.tag).toBe("for");
    expect(forCommand.variable).toBe("f");
    expect(forCommand.words?.map(text)).toEqual(["*.txt", "logs/*.log"]);
  });

  it("parses case statements", () => {
    const list = parse(`
      case "$1" in
        start|restart) run start ;;
        stop) run stop ;;
        *) echo unknown ;;
      esac
    `);
    const caseCommand = onlyCommand(list) as CaseCommand;
    expect(caseCommand.tag).toBe("case");
    expect(caseCommand.items).toHaveLength(3);
    expect(caseCommand.items[0].patterns.map(text)).toEqual(["start", "restart"]);
    expect(caseCommand.items[2].patterns.map(text)).toEqual(["*"]);
  });

  it("parses subshells and groups", () => {
    const list = parse("(cd /tmp && ls) | sort; { echo a; echo b; } > out.txt");
    const pipeline = list.items[0].command.first;
    expect(pipeline.commands[0].tag).toBe("subshell");
    const group = onlyCommand(list, 1) as Group;
    expect(group.tag).toBe("group");
    expect(group.body.items).toHaveLength(2);
    expect(group.redirects).toMatchObject([{ op: ">" }]);
  });

  it("parses (( )) and [[ ]] as raw expressions", () => {
    const list = parse('if [[ -n "$name" && $count -gt 0 ]]; then (( count-- )); fi');
    const ifCommand = onlyCommand(list) as IfCommand;
    const conditional = onlyCommand(ifCommand.cond);
    expect(conditional).toMatchObject({
      tag: "conditional",
      expression: '-n "$name" && $count -gt 0',
    });
    const arithmetic = onlyCommand(ifCommand.thenBody);
    expect(arithmetic).toMatchObject({
      tag: "arithmeticCommand",
      expression: " count-- ",
    });
  });

  it("parses function definitions in both styles", () => {
    const list = parse("greet() { echo hi; }\nfunction cleanup {\n rm -f \"$tmp\"\n}");
    const greet = onlyCommand(list, 0) as FunctionDef;
    expect(greet).toMatchObject({ tag: "functionDef", name: "greet" });
    expect((greet.body as Group).tag).toBe("group");
    const cleanup = onlyCommand(list, 1) as FunctionDef;
    expect(cleanup.name).toBe("cleanup");
  });
});

describe("a realistic script", () => {
  it("parses end to end", () => {
    const script = BIG_SCRIPT;
    const list = parse(script);
    // set, readonly, log, check_deps, main, main "$@"
    expect(list.items).toHaveLength(6);
    expect((onlyCommand(list, 2) as FunctionDef).name).toBe("log");
    expect((onlyCommand(list, 3) as FunctionDef).name).toBe("check_deps");
    expect((onlyCommand(list, 4) as FunctionDef).name).toBe("main");
  });
});

describe("real scripts (checked-in fixtures)", () => {
  it.each(REAL_SCRIPTS)("parses %s", (_name, source) => {
    const result = bashParser(source);
    if (!result.success) {
      throw new Error(`failed at: ${result.rest.slice(0, 60)}`);
    }
    expect(result.result.items.length).toBeGreaterThan(0);
  });
});

describe("known boundaries", () => {
  it("cannot parse heredocs", () => {
    const result = bashParser("cat <<EOF\nhello\nEOF\n");
    expect(result.success).toBe(false);
  });

  it("MIS-parses array assignments as assignment + subshell (false positive)", () => {
    // bash reads this as one array assignment; this parser silently reads it
    // as `files=` followed by the subshell `(a.txt b.txt c.txt)`.
    const result = bashParser("files=(a.txt b.txt c.txt)");
    if (!result.success) throw new Error("expected (wrong) success");
    const list = result.result;
    expect(list.items).toHaveLength(2);
    expect(simple(list, 0).assignments[0]).toMatchObject({
      name: "files",
      value: null,
    });
    expect(onlyCommand(list, 1).tag).toBe("subshell");
  });

  it("does not see inside [[ ]] or $(( )) — they stay raw text", () => {
    const list = parse("echo $((x > 3 ? a : b))");
    const command = simple(list);
    expect(command.words[1].parts[0]).toMatchObject({
      tag: "arithmeticExpansion",
    });
  });
});
