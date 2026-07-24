import { describe, it, expect } from "vitest";
import { runNested } from "@/lib/runNested";
import { setInputStr, getInputStr, getDiagnostics } from "@/lib/trace";
import {
  recordFailure,
  getRightmostFailure,
  getErrorMessage,
} from "@/lib/rightmostFailure";
import { getPosition } from "@/lib/position";
import { str, digit, label } from "@/lib/parsers";
import { memo } from "@/lib/combinators";

describe("runNested", () => {
  it("restores the outer input string on success, failure, and throw", () => {
    setInputStr("outer input");
    runNested(str("in"), "inner");
    expect(getInputStr()).toBe("outer input");

    runNested(str("nope"), "inner"); // inner failure
    expect(getInputStr()).toBe("outer input");

    expect(() =>
      runNested(() => {
        throw new Error("boom");
      }, "inner"),
    ).toThrow("boom");
    expect(getInputStr()).toBe("outer input");
  });

  it("outer error formatting works after a nested parse (RangeError regression)", () => {
    // Outer input much longer than inner input: with the old shared
    // global, position = innerLength - outerRemaining went negative and
    // caret rendering crashed with RangeError: Invalid count value.
    const outer = "a".repeat(30);
    setInputStr(outer);
    runNested(str("x"), "x");
    recordFailure(outer.slice(25), "a b"); // outer failure at pos 25
    expect(getErrorMessage()).toBe("Line 1, col 26: expected a b");
  });

  it("the outer rightmost record survives a deeply-failing inner parse", () => {
    setInputStr("outer");
    recordFailure("ter", "an ou"); // outer record at pos 2
    runNested((input) => {
      recordFailure("", "inner thing"); // inner record, very deep
      return { success: false as const, message: "inner fail", rest: input };
    }, "some much longer inner input text");
    expect(getRightmostFailure()).toEqual({ pos: 2, expected: ["an ou"] });
  });

  it("memo entries do not cross between outer and nested parses", () => {
    let calls = 0;
    const counting = memo("nested-iso", (input: string) => {
      calls++;
      return digit(input);
    });
    setInputStr("5");
    counting("5");
    expect(calls).toBe(1);
    runNested(counting, "5"); // same input text, different parse
    expect(calls).toBe(2);
    counting("5"); // outer cache still valid
    expect(calls).toBe(2);
  });

  it("basePosition puts inner positions in outer coordinates", () => {
    setInputStr("line0\n[| x |]");
    const result = runNested(
      (input) => getPosition(input),
      "x",
      { basePosition: { offset: 9, line: 1, column: 3 } },
    );
    if (!result.success) throw new Error("nested parse failed");
    expect(result.result).toEqual({ offset: 9, line: 1, column: 3 });
  });

  it("nested-inside-offset: the caller supplies the inner base in outer coordinates", () => {
    // NOTE: a nested runNested composes against a FRESH state whose base
    // is exactly what the caller passed — bases do not auto-stack. The
    // caller computes the inner base in outermost coordinates (as
    // agency-lang does for literals inside templates).
    setInputStr("irrelevant outer");
    const result = runNested(
      () =>
        runNested((inner) => getPosition(inner), "z", {
          basePosition: { offset: 110, line: 32, column: 1 },
        }),
      "middle input",
      { basePosition: { offset: 100, line: 30, column: 5 } },
    );
    if (!result.success) throw new Error("nested parse failed");
    expect(result.result).toEqual({ offset: 110, line: 32, column: 1 });
  });

  it("a label around runNested never sees inner positions (record-leak regression guard)", () => {
    // Works under both current and post-fix `label` semantics: the inner
    // parse's deep record lives in a swapped-out state, so the outer
    // record can never be compared against inner coordinates.
    setInputStr("ab");
    const nestedThenFail = (input: string) => {
      runNested((inner) => {
        recordFailure("", "inner expectation"); // inner pos 30, very deep
        return { success: false as const, message: "inner", rest: inner };
      }, "x".repeat(30));
      return { success: false as const, message: "outer", rest: input };
    };
    label("a thing", nestedThenFail)("ab");
    const record = getRightmostFailure();
    expect(record?.pos ?? -1).toBeLessThanOrEqual(0); // never 30
    expect(record?.expected ?? []).not.toContain("inner expectation");
  });

  it("getDiagnostics (TarsecError path) composes line/col with a multi-line base", () => {
    const result = runNested(
      (input) => {
        const diagnostics = getDiagnostics(
          { success: false, message: "boom", rest: input.slice(2) },
          input.slice(2),
        );
        // inner failure at offset 2 (input "a\nbc") = inner line 1;
        // base line 40 → composed line 41. getDiagnostics' own column
        // math has a pre-existing newline-accounting quirk (it doesn't
        // count newline chars), which reports column 1 here — this test
        // pins composition, not that quirk.
        expect(diagnostics.line).toBe(41);
        expect(diagnostics.column).toBe(1);
        return { success: true as const, result: null, rest: input };
      },
      "a\nbc",
      { basePosition: { offset: 9, line: 40, column: 6 } },
    );
    if (!result.success) throw new Error("nested parse failed");
  });

  it("inner error messages come out in outer coordinates", () => {
    setInputStr("outer");
    runNested(
      (input) => {
        recordFailure(input.slice(2), "a thing"); // inner pos 2, inner line 1 col 0
        // capture the message while still inside the nested state
        const message = getErrorMessage();
        expect(message).toBe("Line 42, col 1: expected a thing");
        return { success: true as const, result: null, rest: input };
      },
      "a\nbc",
      { basePosition: { offset: 9, line: 40, column: 6 } },
    );
  });
});
