import { execSync } from "child_process";
import { describe, expect, it } from "vitest";
import { bashParser as permissiveParser } from "./bashFromLexemes";
import { parseBashStrict } from "./bashStrict";

/** Does real bash consider this script syntactically valid? */
function bashAccepts(script: string): boolean {
  try {
    execSync("bash -n", { input: script, stdio: ["pipe", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

const BIG_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

readonly LOG_FILE=/var/log/deploy.log

log() {
  echo "[$(date +%H:%M:%S)] $1" >> "$LOG_FILE"
}

check_deps() {
  for cmd in git node npm; do
    if ! command -v "$cmd" > /dev/null 2>&1; then
      log "missing dependency: $cmd"
      exit 1
    fi
  done
}

main() {
  check_deps
  local branch
  branch=$(git rev-parse --abbrev-ref HEAD)

  case "$branch" in
    main|master)
      log "deploying $branch"
      npm run build && npm run deploy || exit 1
      ;;
    feature/*)
      log "skipping feature branch"
      ;;
    *)
      echo "unknown branch: $branch" >&2
      exit 1
      ;;
  esac

  while read -r line; do
    echo "-> $line"
  done < "$LOG_FILE" &
}

main "$@"
`;

// Everything in the supported subset. Each of these must (a) parse, (b) be
// valid to real bash, and (c) produce the same AST as the permissive parser.
const SUPPORTED: [string, string][] = [
  ["simple command", "echo hello world"],
  ["quoting", `echo 'a b' "c $d" e'f'"g"$h`],
  ["escapes and specials", String.raw`echo foo\ bar "$@" $? $1`],
  ["reserved words as args", "echo if fi done"],
  ["assignments", 'FOO=bar BAZ="qux $FOO" run --now'],
  ["assignment only", "PATH=/usr/local/bin:$PATH"],
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

// Valid bash we deliberately refuse: fail closed rather than mis-parse.
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

// Invalid bash: we reject it, and real bash agrees.
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
    const result = parseBashStrict(input);
    if (!result.success) {
      throw new Error(`rejected: ${result.message} (line ${result.line})`);
    }
    // The permissive parser accepts a superset; on the strict subset the
    // two must agree exactly.
    const permissive = permissiveParser(input);
    if (!permissive.success) throw new Error("permissive parser rejected input");
    expect(result.list).toEqual(permissive.result);
  });

  it.each(SUPPORTED)("bash -n accepts %s", (_name, input) => {
    expect(bashAccepts(input)).toBe(true);
  });
});

describe("fail-closed: cut syntax is rejected even though bash accepts it", () => {
  it.each(CUT)("rejects %s", (_name, input) => {
    expect(parseBashStrict(input).success).toBe(false);
    expect(bashAccepts(input)).toBe(true); // documents that this is a cut
  });
});

describe("invalid bash is rejected, and real bash agrees", () => {
  it.each(INVALID)("rejects %s", (_name, input) => {
    expect(parseBashStrict(input).success).toBe(false);
    expect(bashAccepts(input)).toBe(false);
  });
});

describe("diagnostics", () => {
  it("reports the failure line", () => {
    const result = parseBashStrict("echo ok\nfiles=(a b)\necho done");
    if (result.success) throw new Error("expected failure");
    expect(result.line).toBe(2);
    expect(result.column).toBeGreaterThan(0);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("labels unterminated quotes", () => {
    const result = parseBashStrict("echo 'unterminated");
    if (result.success) throw new Error("expected failure");
    expect(result.message).toContain("single-quoted");
  });

  it("former silent mis-parses now point at the offending construct", () => {
    const result = parseBashStrict("echo `date`");
    if (result.success) throw new Error("expected failure");
    expect(result.line).toBe(1);
  });
});
