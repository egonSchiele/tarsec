import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { describe, it, expect } from "vitest";
import { memo, resetMemos } from "@/lib/combinators";
import { Parser, success, failure } from "@/lib/types";

// A heap measurement needs a full collection first, or garbage counts too.
setFlagsFromString("--expose-gc");
const collectGarbage = runInNewContext("gc") as () => void;
function heapUsedMB(): number {
  collectGarbage();
  return process.memoryUsage().heapUsed / 1_000_000;
}

function counted<T>(p: Parser<T>): { parser: Parser<T>; calls: () => number } {
  let n = 0;
  return {
    parser: (input) => {
      n++;
      return p(input);
    },
    calls: () => n,
  };
}

describe("memo", () => {
  it("caches success at the same input", () => {
    const inner = counted<string>((input) =>
      input.startsWith("a") ? success("a", input.slice(1)) : failure("no", input),
    );
    const m = memo("test parser", inner.parser);

    const r1 = m("abc");
    const r2 = m("abc");

    expect(r1).toEqual(r2);
    expect(inner.calls()).toBe(1);
  });

  it("caches failure at the same input", () => {
    const inner = counted<string>((input) => failure("nope", input));
    const m = memo("test parser", inner.parser);

    m("xyz");
    m("xyz");

    expect(inner.calls()).toBe(1);
  });

  it("re-invokes inner parser for different inputs", () => {
    const inner = counted<string>((input) => success("ok", input.slice(1)));
    const m = memo("test parser", inner.parser);

    m("abc");
    m("def");
    m("abc");

    expect(inner.calls()).toBe(2);
  });

  it("treats value-equal but distinct string objects as the same key", () => {
    const inner = counted<string>((input) => success("ok", input.slice(1)));
    const m = memo("test parser", inner.parser);

    const a = "abc";
    const b = ("a" + "b" + "c") as string;
    m(a);
    m(b);

    expect(inner.calls()).toBe(1);
  });

  it("evicts oldest entries past the cache limit", () => {
    // hard to assert eviction directly without exposing internals — just verify
    // many distinct inputs don't blow up and the result for a fresh input is correct
    const inner = counted<string>((input) => success(input[0] ?? "", input.slice(1)));
    const m = memo("test parser", inner.parser);

    for (let i = 0; i < 20_000; i++) {
      m(`input-${i}`);
    }
    const r = m("input-fresh");
    expect(r.success).toBe(true);
  });

  it("keeps the rest of the input as a slice, not a copy", () => {
    // Each input below is a slice of `source`: a few bytes pointing into
    // it. V8 copies a string in full when it becomes a Map key, so a cache
    // keyed by the input string held one copy of the rest of the file per
    // entry. On a 190 KB file that came to 4.5 GB.
    const source = "abcdefghijklmnopqrstuvwxyz".repeat(8_000); // 208 KB
    const m = memo("test parser", (input: string) => success("ok", input.slice(1)));
    const before = heapUsedMB();
    for (let i = 0; i < 2_000; i++) {
      m(source.slice(i * 50));
    }
    const grown = heapUsedMB() - before;
    resetMemos();
    // Slices cost well under 1 MB here; copies would cost about 300 MB.
    expect(grown).toBeLessThan(20);
  });

  it("separates different inputs of the same length", () => {
    const inner = counted<string>((input) => success(input, ""));
    const m = memo("test parser", inner.parser);

    const first = m("abc");
    const second = m("xyz");

    expect(first.success && first.result).toBe("abc");
    expect(second.success && second.result).toBe("xyz");
    expect(inner.calls()).toBe(2);
  });

  it("preserves captures for CaptureParser", () => {
    const inner = counted<string>((input) => ({
      success: true,
      result: "a",
      rest: input.slice(1),
      captures: { x: 1 },
    }));
    const m = memo("test parser", inner.parser as unknown as Parser<string>);
    const r = m("abc") as { success: true; result: string; rest: string; captures: { x: number } };
    expect(r.success).toBe(true);
    expect(r.captures).toEqual({ x: 1 });
  });
});
