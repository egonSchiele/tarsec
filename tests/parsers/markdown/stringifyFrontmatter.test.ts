import { describe, it, expect } from "vitest";
import {
  frontmatterParser,
  stringifyFrontmatter,
} from "@/lib/parsers/markdown/index";
import { FrontmatterValue } from "@/lib/parsers/markdown/types";

/** Parse a serialized block and return the data record, failing loudly. */
function roundTrip(fields: Record<string, string>): Record<string, FrontmatterValue> {
  const text = stringifyFrontmatter(fields);
  const res = frontmatterParser(text);
  expect(res.success, `parse failed for:\n${text}\n${JSON.stringify(res)}`).toBe(
    true
  );
  if (!res.success) throw new Error("unreachable");
  expect(res.rest).toBe("");
  return res.result.data;
}

describe("stringifyFrontmatter", () => {
  it("serializes a simple record to a plain frontmatter block", () => {
    const text = stringifyFrontmatter({
      name: "my-skill",
      description: "Use when refactoring",
    });
    expect(text).toBe(
      "---\nname: my-skill\ndescription: Use when refactoring\n---\n"
    );
  });

  it("serializes an empty record", () => {
    expect(roundTrip({})).toEqual({});
  });

  it("round-trips a value with leading flow-list syntax", () => {
    const fields = { description: "[Beta] Use when refactoring" };
    expect(roundTrip(fields)).toEqual(fields);
  });

  it("round-trips a literal backslash-n (two characters, not a newline)", () => {
    const fields = { description: "line one\\nline two" };
    expect(roundTrip(fields)).toEqual(fields);
  });

  it("round-trips a value with a trailing backslash", () => {
    const fields = { path: "C:\\temp\\" };
    expect(roundTrip(fields)).toEqual(fields);
  });

  it("keeps numeric-looking values as strings", () => {
    const fields = { name: "2024", ratio: "1.5", hex: "0x10", plus: "+5" };
    expect(roundTrip(fields)).toEqual(fields);
  });

  it("keeps boolean- and null-looking values as strings", () => {
    const fields = { a: "true", b: "false", c: "null", d: "~" };
    expect(roundTrip(fields)).toEqual(fields);
  });

  it("round-trips the empty string", () => {
    const fields = { description: "" };
    expect(roundTrip(fields)).toEqual(fields);
  });

  it("round-trips leading and trailing whitespace", () => {
    const fields = { a: "  padded  ", b: "\ttabbed", c: "trailing\r" };
    expect(roundTrip(fields)).toEqual(fields);
  });

  it("round-trips values containing quote characters", () => {
    const fields = {
      a: 'he said "hi"',
      b: "it's fine",
      c: "uses `code`",
      d: `mixed "double" and 'single'`,
    };
    expect(roundTrip(fields)).toEqual(fields);
  });

  it("round-trips a bare-safe value containing all three quote characters", () => {
    const fields = { a: `has "double" 'single' and \`tick\`` };
    expect(roundTrip(fields)).toEqual(fields);
  });

  it("round-trips a value with an embedded newline", () => {
    const fields = { description: "line one\nline two" };
    expect(roundTrip(fields)).toEqual(fields);
  });

  it("round-trips values starting with a quote character", () => {
    const fields = { a: '"unclosed', b: "'starts single" };
    expect(roundTrip(fields)).toEqual(fields);
  });

  it("round-trips values with colons, hashes, and other punctuation", () => {
    const fields = {
      a: "key: value",
      b: "# not a comment",
      c: "&anchor *alias %directive",
      d: "{not: a map}",
    };
    expect(roundTrip(fields)).toEqual(fields);
  });

  it("round-trips a __proto__ key as an own property", () => {
    const fields = { ["__proto__"]: "not a prototype" };
    const data = roundTrip(fields);
    expect(Object.keys(data)).toEqual(["__proto__"]);
    expect(data["__proto__"]).toBe("not a prototype");
  });

  it("throws on a key the grammar cannot spell", () => {
    expect(() => stringifyFrontmatter({ "bad key": "x" })).toThrow(/key/);
    expect(() => stringifyFrontmatter({ "": "x" })).toThrow(/key/);
    expect(() => stringifyFrontmatter({ "a:b": "x" })).toThrow(/key/);
  });

  it("throws on a non-string value", () => {
    expect(() =>
      stringifyFrontmatter({ n: 2024 as unknown as string })
    ).toThrow(/expected a string/);
  });

  it("throws on a value that defeats all three quote characters", () => {
    // Needs quoting (leading space) but contains every quote char.
    expect(() =>
      stringifyFrontmatter({ a: ` "double" 'single' \`tick\`` })
    ).toThrow(/serialize/);
    // Needs quoting (leading space) but a trailing backslash would escape
    // any closing quote.
    expect(() => stringifyFrontmatter({ a: " x\\" })).toThrow(/serialize/);
  });

  describe("round-trip property", () => {
    // Deterministic PRNG (mulberry32) so failures are reproducible.
    function mulberry32(seed: number) {
      return function () {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    const alphabet =
      "abcXYZ019 \t\r\n[]{}#&*\"'`\\,:~-_.%@!?<>()/=+|;" +
      "true false null";
    const keyAlphabet =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";

    function randomString(
      rand: () => number,
      chars: string,
      maxLen: number,
      minLen = 0
    ): string {
      const len = minLen + Math.floor(rand() * (maxLen - minLen + 1));
      let s = "";
      for (let i = 0; i < len; i++) {
        s += chars[Math.floor(rand() * chars.length)];
      }
      return s;
    }

    it("parse(stringify(x)) deep-equals x for every representable x", () => {
      const rand = mulberry32(42);
      let serialized = 0;
      let refused = 0;

      for (let trial = 0; trial < 1000; trial++) {
        const fields: Record<string, string> = {};
        const numKeys = 1 + Math.floor(rand() * 4);
        for (let i = 0; i < numKeys; i++) {
          const key = randomString(rand, keyAlphabet, 8, 1);
          fields[key] = randomString(rand, alphabet, 20);
        }

        let text: string;
        try {
          text = stringifyFrontmatter(fields);
        } catch {
          // The contract allows refusing unrepresentable values — but
          // refusal must be loud (throw), never silent divergence.
          refused++;
          continue;
        }
        serialized++;

        const res = frontmatterParser(text);
        expect(
          res.success,
          `parse failed for ${JSON.stringify(fields)}:\n${text}`
        ).toBe(true);
        if (!res.success) continue;
        expect(res.rest, `leftover input for ${JSON.stringify(fields)}`).toBe(
          ""
        );
        expect(res.result.data, `mismatch for:\n${text}`).toEqual(fields);
      }

      // The refusal escape hatch must stay narrow: most adversarial
      // records are still representable.
      expect(serialized).toBeGreaterThan(refused * 4);
    });
  });
});
