import { describe, expect, it } from "vitest";
import { wordParser } from "@/lib/parsers/bash/index";
import { parse, rejects, simple, text } from "./helpers";

describe("plain words and quoting", () => {
  it("parses a word and stops at whitespace", () => {
    const result = wordParser("foo bar");
    if (!result.success) throw new Error(result.message);
    expect(result.result.parts).toEqual([{ tag: "literal", text: "foo" }]);
    expect(result.rest).toBe("bar");
  });

  it("parses single quotes with no escape processing", () => {
    const command = simple(parse(String.raw`echo 'a b' 'back\slash'`));
    expect(command.words[1].parts).toEqual([{ tag: "singleQuoted", text: "a b" }]);
    expect(command.words[2].parts).toEqual([
      { tag: "singleQuoted", text: "back\\slash" },
    ]);
  });

  it("parses double quotes with embedded variables", () => {
    const command = simple(parse('echo "c $d"'));
    expect(command.words[1].parts).toEqual([
      {
        tag: "doubleQuoted",
        parts: [{ tag: "literal", text: "c " }, { tag: "variable", name: "d" }],
      },
    ]);
  });

  it("keeps adjacent parts as ONE word", () => {
    const command = simple(parse(`echo e'f'"g"$h`));
    expect(command.words[1].parts).toEqual([
      { tag: "literal", text: "e" },
      { tag: "singleQuoted", text: "f" },
      { tag: "doubleQuoted", parts: [{ tag: "literal", text: "g" }] },
      { tag: "variable", name: "h" },
    ]);
  });

  it("parses the empty double-quoted string", () => {
    const command = simple(parse('echo ""'));
    expect(command.words[1].parts).toEqual([{ tag: "doubleQuoted", parts: [] }]);
  });

  it("handles escapes outside quotes", () => {
    const command = simple(parse(String.raw`echo foo\ bar \$HOME`));
    expect(text(command.words[1])).toBe("foo bar");
    expect(text(command.words[2])).toBe("$HOME");
  });

  it("handles escapes inside double quotes", () => {
    const command = simple(parse(String.raw`echo "a \"b\" \$x \\ \q"`));
    expect(command.words[1].parts).toEqual([
      { tag: "doubleQuoted", parts: [{ tag: "literal", text: 'a "b" $x \\ \\q' }] },
    ]);
  });
});

describe("variables and expansions", () => {
  it("parses named and special variables", () => {
    const command = simple(parse('echo $name "$@" $? $1 $#'));
    expect(command.words[1].parts).toEqual([{ tag: "variable", name: "name" }]);
    expect(command.words[2].parts).toEqual([
      { tag: "doubleQuoted", parts: [{ tag: "variable", name: "@" }] },
    ]);
    expect(command.words[3].parts).toEqual([{ tag: "variable", name: "?" }]);
    expect(command.words[4].parts).toEqual([{ tag: "variable", name: "1" }]);
    expect(command.words[5].parts).toEqual([{ tag: "variable", name: "#" }]);
  });

  it("keeps ${...} as raw text, with brace nesting balanced", () => {
    const command = simple(parse("echo ${VAR:-default} ${outer{inner}rest}"));
    expect(command.words[1].parts).toEqual([
      { tag: "paramExpansion", expression: "VAR:-default" },
    ]);
    expect(command.words[2].parts).toEqual([
      { tag: "paramExpansion", expression: "outer{inner}rest" },
    ]);
  });

  it("keeps $(( )) as raw text, with paren nesting balanced", () => {
    const command = simple(parse("echo $((count + 1)) $((2 * (3 + 1))) $((x > 3 ? a : b))"));
    expect(command.words[1].parts).toEqual([
      { tag: "arithmeticExpansion", expression: "count + 1" },
    ]);
    expect(command.words[2].parts).toEqual([
      { tag: "arithmeticExpansion", expression: "2 * (3 + 1)" },
    ]);
    expect(command.words[3].parts).toEqual([
      { tag: "arithmeticExpansion", expression: "x > 3 ? a : b" },
    ]);
  });

  it("parses $() recursively, including nesting inside double quotes", () => {
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

  it("parses an empty command substitution", () => {
    const command = simple(parse("echo $()"));
    expect(command.words[1].parts).toEqual([
      { tag: "commandSubstitution", command: { tag: "list", items: [] } },
    ]);
  });

  it("glues substitutions to neighboring text in the same word", () => {
    const command = simple(parse("echo $(pwd)/bin"));
    expect(command.words[1].parts).toHaveLength(2);
    expect(command.words[1].parts[0].tag).toBe("commandSubstitution");
    expect(command.words[1].parts[1]).toEqual({ tag: "literal", text: "/bin" });
  });
});

describe("fail-closed word syntax", () => {
  it("rejects unterminated single quotes", () => rejects("echo 'oops"));
  it("rejects unterminated double quotes", () => rejects('echo "oops'));
  it("rejects unterminated ${", () => rejects("echo ${x"));
  it("rejects backticks", () => rejects("echo `date`"));
  it("rejects backticks inside double quotes", () => rejects('echo "now: `date`"'));
  it("rejects ANSI-C quoting", () => rejects(String.raw`echo $'a\tb'`));
  it("rejects locale quoting", () => rejects('echo $"text"'));
  it("rejects a bare dollar", () => rejects("echo $"));
  it("rejects a bare dollar inside double quotes", () => rejects('echo "cost: $"'));
  it("rejects unquoted braces in words", () => rejects("echo {a,b}.txt"));
});
