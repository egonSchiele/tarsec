import { describe, it, expect } from "vitest";
import {
  createParseState,
  getParseState,
  swapParseState,
} from "@/lib/parseState";
import { setInputStr, getInputStr } from "@/lib/trace";
import { recordFailure, getRightmostFailure } from "@/lib/rightmostFailure";
import { memo, resetMemos } from "@/lib/combinators";
import { str } from "@/lib/parsers";

describe("parse state", () => {
  it("swapParseState replaces the current state and returns the previous one", () => {
    const original = getParseState();
    const fresh = createParseState("abc");
    const previous = swapParseState(fresh);
    expect(previous).toBe(original);
    expect(getParseState()).toBe(fresh);
    swapParseState(previous); // restore for other tests
  });

  it("setInputStr and getInputStr read and write the current state", () => {
    setInputStr("hello");
    expect(getInputStr()).toBe("hello");
    expect(getParseState().inputStr).toBe("hello");
  });

  it("rightmost-failure records live on the current state", () => {
    setInputStr("hello");
    recordFailure("llo", "an h"); // pos = 5 - 3 = 2
    expect(getRightmostFailure()).toEqual({ pos: 2, expected: ["an h"] });

    // A different state has its own record
    const saved = swapParseState(createParseState("xy"));
    expect(getRightmostFailure()).toBeNull();
    swapParseState(saved);
    expect(getRightmostFailure()).toEqual({ pos: 2, expected: ["an h"] });
  });
});

describe("memo caches on parse state", () => {
  it("memo entries do not leak between parse states", () => {
    let calls = 0;
    const counting = memo("counting", (input: string) => {
      calls++;
      return str("ab")(input);
    });

    setInputStr("ab");
    counting("ab");
    counting("ab"); // cache hit
    expect(calls).toBe(1);

    // A fresh state must not see the other state's cache
    const saved = swapParseState(createParseState("ab"));
    counting("ab");
    expect(calls).toBe(2);
    swapParseState(saved);

    // Back in the original state, the original entry still serves
    counting("ab");
    expect(calls).toBe(2);
  });

  it("resetMemos clears only the current state's caches", () => {
    let calls = 0;
    const counting = memo("counting2", (input: string) => {
      calls++;
      return str("cd")(input);
    });

    setInputStr("cd");
    counting("cd");
    expect(calls).toBe(1);
    resetMemos();
    counting("cd");
    expect(calls).toBe(2);
  });
});
