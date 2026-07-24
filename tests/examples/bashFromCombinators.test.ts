import { describe, expect, it } from "vitest";
import { BIG_SCRIPT, REAL_SCRIPTS } from "./fixtures/corpus";
import { bashParser as loopParser } from "./bashFromLexemes";
import { bashParser as combinatorParser } from "./bashFromCombinators";

// Everything the loop-based parser handles, the combinator-only parser must
// handle identically — same AST, same rest, or failure on the same input.
const CORPUS: [string, string][] = [
  ["simple command", "echo hello world"],
  ["quoting", `echo 'a b' "c $d" e'f'"g"$h`],
  ["escapes and specials", String.raw`echo foo\ bar "$@" $? $1`],
  ["reserved words as args", "echo if fi done"],
  ["assignments", 'FOO=bar BAZ="qux $FOO" run --now'],
  ["assignment only", "PATH=/usr/local/bin:$PATH"],
  ["empty assignment", "FOO="],
  ["nested substitution", 'echo "dir: $(basename $(pwd))"'],
  ["expansions", "echo ${VAR:-default} $((count + 1)) `date`"],
  ["nested braces/parens", "echo ${outer{inner}rest} $((2 * (3 + 1)))"],
  ["lone dollar", "echo $ price"],
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
  ["for", 'for f in *.txt logs/*.log; do wc -l "$f"; done'],
  [
    "case",
    'case "$1" in\n  start|restart) run start ;;\n  stop) run stop ;;\n  *) echo unknown ;;\nesac',
  ],
  ["subshell and group", "(cd /tmp && ls) | sort; { echo a; echo b; } > out.txt"],
  [
    "conditional and arithmetic",
    'if [[ -n "$name" && $count -gt 0 ]]; then (( count-- )); fi',
  ],
  ["functions", 'greet() { echo hi; }\nfunction cleanup {\n rm -f "$tmp"\n}'],
  // Known warts must be shared warts:
  ["array mis-parse", "files=(a.txt b.txt c.txt)"],
  ["heredoc (fails in both)", "cat <<EOF\nhello\nEOF\n"],
  ["unterminated quote (fails in both)", "echo 'oops"],
];

describe("combinator-only parser is equivalent to the loop-based one", () => {
  it.each(CORPUS)("%s", (_name, input) => {
    const expected = loopParser(input);
    const actual = combinatorParser(input);
    expect(actual.success).toBe(expected.success);
    if (expected.success && actual.success) {
      expect(actual.result).toEqual(expected.result);
      expect(actual.rest).toEqual(expected.rest);
    }
  });

  it("parses the realistic script identically", () => {
    const expected = loopParser(BIG_SCRIPT);
    const actual = combinatorParser(BIG_SCRIPT);
    if (!expected.success) throw new Error("loop parser failed");
    if (!actual.success) {
      throw new Error(`combinator parser failed at: ${actual.rest.slice(0, 60)}`);
    }
    expect(actual.result).toEqual(expected.result);
  });

  it.each(REAL_SCRIPTS)(
    "parses %s identically",
    (_name, source) => {
      const expected = loopParser(source);
      const actual = combinatorParser(source);
      expect(actual.success).toBe(expected.success);
      if (expected.success && actual.success) {
        expect(actual.result).toEqual(expected.result);
      }
    },
  );
});

// Informational and machine-sensitive (observed anywhere from 1.3x to 2x
// between machines); opt in with RUN_BENCH=1 to keep CI fast and quiet.
const itBench = process.env.RUN_BENCH ? it : it.skip;

describe("cost of the constraint", () => {
  itBench("measures both parsers on the realistic script", () => {
    const ITERATIONS = 300;
    const time = (parser: (input: string) => unknown): number => {
      for (let i = 0; i < 30; i++) parser(BIG_SCRIPT); // warmup
      const start = performance.now();
      for (let i = 0; i < ITERATIONS; i++) parser(BIG_SCRIPT);
      return performance.now() - start;
    };
    // Two rounds, keeping the second, so JIT warmup and measurement order
    // don't favor either parser.
    time(loopParser);
    time(combinatorParser);
    const loopMs = time(loopParser);
    const combinatorMs = time(combinatorParser);
    console.log(
      `loop-based: ${loopMs.toFixed(1)}ms, combinator-only: ${combinatorMs.toFixed(1)}ms ` +
        `(${(combinatorMs / loopMs).toFixed(1)}x) for ${ITERATIONS} parses`,
    );
    expect(loopMs).toBeGreaterThan(0);
    expect(combinatorMs).toBeGreaterThan(0);
  });
});
