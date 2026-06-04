import { many1WithJoin } from "./combinators.js";
import { trace } from "./trace.js";
import { recordFailure, saveRightmostFailure, restoreRightmostFailure } from "./rightmostFailure.js";
import {
  CaptureParser,
  captureSuccess,
  failure,
  Parser,
  ParserResult,
  Prettify,
  success,
} from "./types.js";
import { escape } from "./utils.js";
export { within } from "./parsers/within.js";
/**
 * Takes a character. Returns a parser that parses that character.
 *
 * @param c - character to parse
 * @returns - parser that parses the given character
 */
export function char<const S extends string>(c: S): Parser<S> {
  return trace(`char(${escape(c)})`, (input: string) => {
    if (input.length === 0) {
      recordFailure(input, `"${c}"`);
      return failure("unexpected end of input", input);
    }
    if (input[0] === c) {
      return success(c, input.slice(1));
    }
    recordFailure(input, `"${c}"`);
    return failure(`expected ${escape(c)}, got ${escape(input[0])}`, input);
  });
}

/**
 * Takes a string. Returns a parser that parses that string.
 *
 * @param s - string to match on
 * @returns - parser that parses the given string
 */
export function str<const S extends string>(s: S): Parser<S> {
  return trace(`str(${escape(s)})`, (input: string) => {
    if (input.substring(0, s.length) === s) {
      return success(s, input.slice(s.length));
    }
    recordFailure(input, `"${s}"`);
    return failure(`expected ${s}, got ${input.substring(0, s.length)}`, input);
  });
}

/**
 * Like `str`, but case insensitive.
 * @param s - string to match on, case insensitive
 * @returns - parser that matches the given string, case insensitive
 */
export function istr<const S extends string>(s: S): Parser<S> {
  return trace(`istr(${escape(s)})`, (input: string): ParserResult<S> => {
    if (
      input.substring(0, s.length).toLocaleLowerCase() === s.toLocaleLowerCase()
    ) {
      return success(input.substring(0, s.length) as S, input.slice(s.length));
    }
    recordFailure(input, `"${s}"`);
    return failure(`expected ${s}, got ${input.substring(0, s.length)}`, input);
  });
}

/**
 * Takes a string. Returns a parser that parses
 * one of the characters in that string.
 *
 * @param chars - string of possible characters
 * @returns - parser that parses one of the given characters
 */
export function oneOf(chars: string): Parser<string> {
  return trace(`oneOf(${escape(chars)})`, (input: string) => {
    if (input.length === 0) {
      recordFailure(input, `one of "${chars}"`);
      return failure("unexpected end of input", input);
    }
    const c = input[0];
    if (chars.includes(c)) {
      return char(c)(input);
    }
    recordFailure(input, `one of "${chars}"`);
    return failure(`expected one of ${escape(chars)}, got ${c}`, input);
  });
}

/**
 * Takes a string. Returns a parser that parses one character
 * that's not any of the characters in the given string
 *
 * @param chars - string of characters to avoid
 * @returns - parser that parses a character that is not in the given string
 */
export function noneOf(chars: string): Parser<string> {
  return trace(`noneOf(${escape(chars)})`, (input: string) => {
    if (input.length === 0) {
      recordFailure(input, `none of "${chars}"`);
      return failure("unexpected end of input", input);
    }
    if (chars.includes(input[0])) {
      recordFailure(input, `none of "${chars}"`);
      return failure(
        `expected none of ${escape(chars)}, got ${input[0]}`,
        input
      );
    }
    return char(input[0])(input);
  });
}

/**
 * Predicate over a single UTF-16 code unit (the value returned by
 * `String.prototype.charCodeAt`). Used by `takeWhile` / `takeWhile1`
 * to test each input character. Return `true` to keep consuming, `false`
 * to stop.
 *
 * ```ts
 * const isDigit: CharPredicate = (code) => code >= 0x30 && code <= 0x39;
 * ```
 */
export type CharPredicate = (code: number) => boolean;

/**
 * Compile a string of allowed characters or a user-supplied predicate
 * into a fast `CharPredicate`. For string inputs whose characters are
 * all ASCII (code points < 128), the result is a single 128-byte
 * `Uint8Array` lookup — one array read per character test. Non-ASCII
 * characters in the string fall back to a `Set<number>` check.
 * Predicates pass through unchanged.
 *
 * @param charsOrPred - a string of allowed characters or a predicate function
 * @returns - a `CharPredicate` suitable for use in tight scanning loops
 */
function compileCharPredicate(
  charsOrPred: string | CharPredicate
): CharPredicate {
  if (typeof charsOrPred === "function") return charsOrPred;
  const chars = charsOrPred;
  const ascii = new Uint8Array(128);
  let nonAscii: Set<number> | null = null;
  for (let i = 0; i < chars.length; i++) {
    const code = chars.charCodeAt(i);
    if (code < 128) {
      ascii[code] = 1;
    } else {
      (nonAscii ??= new Set()).add(code);
    }
  }
  if (nonAscii === null) {
    return (code: number) => code < 128 && ascii[code] === 1;
  }
  const set = nonAscii;
  return (code: number) =>
    code < 128 ? ascii[code] === 1 : set.has(code);
}

/**
 * A faster version of many/ manyWithJoin for character-class scanning.
 * 
 * Consume the longest prefix of `input` whose characters all satisfy
 * the predicate (or are contained in the given char-class string). Always
 * succeeds; returns "" when nothing matches.
 *
 * This is the fast equivalent of `manyWithJoin(oneOf(chars))` for
 * character-class scans (identifiers, digit runs, whitespace, etc.). It
 * runs a tight `charCodeAt` loop and returns a single `slice`, avoiding
 * the per-char string allocations and final `Array.join` of the
 * combinator form.
 *
 * Useful for scanning runs of characters that don't form their own
 * grammar — whitespace, identifier bodies, hex digit runs, etc.:
 *
 * ```ts
 * // Skip any spaces/tabs without allocating.
 * const inlineWs = takeWhile(" \t");
 *
 * // Scan an identifier body (caller already matched the first char).
 * const identTail = takeWhile(
 *   "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"
 * );
 *
 * // Predicate form: anything that isn't a quote or backslash.
 * const stringText = takeWhile(
 *   (code) => code !== 0x22 && code !== 0x5c
 * );
 * ```
 *
 * @param charsOrPred - a string of allowed characters, or a `CharPredicate`
 * @returns - a parser that consumes the matching prefix and always succeeds
 */
export function takeWhile(
  charsOrPred: string | CharPredicate
): Parser<string> {
  const pred = compileCharPredicate(charsOrPred);
  const label =
    typeof charsOrPred === "string"
      ? `takeWhile(${escape(charsOrPred)})`
      : "takeWhile(<predicate>)";
  return trace(label, (input: string) => {
    let i = 0;
    const n = input.length;
    while (i < n && pred(input.charCodeAt(i))) i++;
    return success(input.slice(0, i), input.slice(i));
  });
}

/**
 * Like `takeWhile`, but requires at least one matching character. On
 * empty/no-match input, fails without consuming and records a rightmost-
 * failure tagged with `expected` so error messages stay meaningful.
 *
 * Use this for things like identifier scanning, where an empty result
 * is a parse error rather than a valid match:
 *
 * ```ts
 * const VAR_CHARS =
 *   "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";
 *
 * // Replaces the slower `many1WithJoin(varNameChar)`.
 * const identifier = takeWhile1(VAR_CHARS, "an identifier");
 *
 * identifier("foo + bar");   // success("foo", " + bar")
 * identifier("  hi");        // failure: "expected an identifier"
 *
 * // Predicate form with a custom error message.
 * const hexRun = takeWhile1(
 *   (code) =>
 *     (code >= 0x30 && code <= 0x39) || // 0-9
 *     (code >= 0x41 && code <= 0x46) || // A-F
 *     (code >= 0x61 && code <= 0x66),   // a-f
 *   "a hex digit",
 * );
 * ```
 *
 * @param charsOrPred - a string of allowed characters, or a `CharPredicate`
 * @param expected - optional human-readable label used in error messages
 *                   (defaults to `one of "<chars>"` for string inputs)
 * @returns - a parser that consumes the matching prefix and fails if empty
 */
export function takeWhile1(
  charsOrPred: string | CharPredicate,
  expected?: string
): Parser<string> {
  const pred = compileCharPredicate(charsOrPred);
  const desc =
    expected ??
    (typeof charsOrPred === "string"
      ? `one of "${charsOrPred}"`
      : "<predicate>");
  const label =
    typeof charsOrPred === "string"
      ? `takeWhile1(${escape(charsOrPred)})`
      : "takeWhile1(<predicate>)";
  return trace(label, (input: string) => {
    let i = 0;
    const n = input.length;
    while (i < n && pred(input.charCodeAt(i))) i++;
    if (i === 0) {
      recordFailure(input, desc);
      return failure(`expected ${desc}`, input);
    }
    return success(input.slice(0, i), input.slice(i));
  });
}

/**
 * A parser that parses any one character.
 * Fails on empty strings, succeeds otherwise.
 *
 * @param input - input string
 * @returns - ParserResult
 */
export const anyChar: Parser<string> = trace("anyChar", (input: string) => {
  if (input.length === 0) {
    recordFailure(input, "any character");
    return failure("unexpected end of input", input);
  }
  return success(input[0], input.slice(1));
});

/**
 * Wraps a parser with a human-readable label for error reporting.
 * On failure, suppresses any inner failure recordings and records only the label.
 * This produces clean error messages like `expected a digit` instead of `expected one of "0123456789"`.
 *
 * @param name - human-readable description of what the parser expects
 * @param parser - the parser to wrap
 * @returns - a parser that records the label on failure
 */
export function label<T>(name: string, parser: Parser<T>): Parser<T> {
  return (input: string) => {
    const saved = saveRightmostFailure();
    const result = parser(input);
    restoreRightmostFailure(saved);
    if (!result.success) recordFailure(input, name);
    return result;
  };
}

/** A parser that matches one of " \t\n\r". */
export const space: Parser<string> = label("whitespace", oneOf(" \t\n\r"));

/** A parser that matches one or more spaces. */
export const spaces: Parser<string> = many1WithJoin(space);

/** A parser that matches one digit. */
export const digit: Parser<string> = label("a digit", oneOf("0123456789"));

/** A parser that matches one letter, case insensitive. */
export const letter: Parser<string> = label(
  "a letter",
  oneOf("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")
);

/** A parser that matches one digit or letter, case insensitive. */
export const alphanum: Parser<string> = label(
  "a letter or digit",
  oneOf("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
);

/** A parser that matches one word, case insensitive. */
export const word: Parser<string> = label("a word", regexParser("^[a-z]+", "ui"));

/** A parser that matches one or more digits. */
export const num: Parser<string> = label("a number", regexParser("^[0-9]+"));

/** A parser that matches one single quote, double quote, or backtick. */
export const quote: Parser<string> = label("a quote", oneOf(`'"\``));

/** A parser that matches one tab character. */
export const tab: Parser<string> = char("\t");

/** A parser that matches one newline ("\n" only) character. */
export const newline: Parser<string> = char("\n");

/** A parser that succeeds on an empty string. Returns `null` as the result. */
export const eof: Parser<null> = (input: string) => {
  if (input === "") {
    return success(null, input);
  }
  recordFailure(input, "end of input");
  return failure("expected end of input", input);
};

/** A parser that matches a quoted string, in single quotes, double quotes, or backticks.
 * The closing quote must match the opening quote.
 * Returns the string as the result, including the quotes.
 */
export const quotedString: Parser<string> = trace(
  "quotedString",
  (input: string) => {
    if (input.length === 0) {
      recordFailure(input, "a quoted string");
      return failure("unexpected end of input", input);
    }
    const q = input[0];
    if (q !== '"' && q !== "'" && q !== "`") {
      recordFailure(input, "a quoted string");
      return failure(
        `expected a quote, got ${escape(input[0])}`,
        input
      );
    }
    let closeIdx = -1;
    let searchFrom = 1;
    while (true) {
      const idx = input.indexOf(q, searchFrom);
      if (idx === -1) break;
      // Count consecutive backslashes before the quote
      let backslashes = 0;
      for (let i = idx - 1; i >= 1 && input[i] === "\\"; i--) backslashes++;
      if (backslashes % 2 === 0) {
        // Even number of backslashes (including 0) means the quote is unescaped
        closeIdx = idx;
        break;
      }
      searchFrom = idx + 1;
    }
    if (closeIdx === -1) {
      recordFailure(input, "a quoted string");
      return failure(`expected closing ${escape(q)}`, input);
    }
    const matched = input.slice(0, closeIdx + 1);
    return success(matched, input.slice(closeIdx + 1));
  }
);

/**
 * Returns a parser that matches a regex. If you pass in a string,
 * it will get converted to a regex. The regex should always match from the start of the input.
 * If you pass in a string, a `^` will get prepended to it.
 *
 * @param str - regex string or RegExp instance to match
 * @param options - regex options (i = ignore case, g = global, m = multiline, u = unicode)
 * @returns - parser that matches the given regex
 */
export function regexParser(
  str: string | RegExp,
  options = ""
): Parser<string> {
  let re: RegExp;
  if (typeof str === "string") {
    re = new RegExp(str.startsWith("^") ? str : `^${str}`, options);
  } else {
    re = str;
  }
  return trace(`regex(${str})`, (input: string) => {
    const match = input.match(re);
    if (match) {
      return success(match[0], input.slice(match[0].length));
    }
    recordFailure(input, `${str}`);
    return failure(`expected ${str}, got ${input.slice(0, 10)}`, input);
  });
}

/**
 * Like `regexParser`, but you can name your capture groups
 * and get them back as the result instead.
 * Fails if it doesn't have the same number of names as capture groups.
 *
 * @param str - regex string or RegExp instance to match
 * @param options - string of regex options (i = ignore case, g = global, m = multiline, u = unicode)
 * @param captureNames - names of the captures
 * @returns - parser that matches the given regex
 */
export function captureRegex<const T extends string[]>(
  str: string | RegExp,
  options = "",
  ...captureNames: T
): Parser<Prettify<Record<(typeof captureNames)[number], string>>> {
  let re: RegExp;
  if (typeof str === "string") {
    re = new RegExp(str.startsWith("^") ? str : `^${str}`, options);
  } else {
    re = str;
  }

  const _parser: Parser<Prettify<Record<(typeof captureNames)[number], string>>> = (input: string) => {
    const match = input.match(re);
    if (match) {
      if (match.slice(1).length > captureNames.length) {
        return failure(
          `more capture groups than names. ${match.slice(1).length} capture groups, ${captureNames.length} names`,
          input
        );
      }
      if (match.slice(1).length < captureNames.length) {
        return failure(
          `fewer capture groups than names. ${match.slice(1).length} capture groups, ${captureNames.length} names`,
          input
        );
      }
      const captures = {
        ...Object.fromEntries(
          match.slice(1).map((value, index) => [captureNames[index], value])
        ),
      } as Record<(typeof captureNames)[number], string>;
      return success(captures, input.slice(match[0].length));
    }
    recordFailure(input, `${str}`);
    return failure(`expected ${str}, got ${input.slice(0, 10)}`, input);
  }

  return trace(`captureRegex(${str})`, _parser);
}

/**
 * Return a parser that takes a key and a value.
 * The parser consumes no input and always succeeds,
 * and returns `null` as the result. It also returns a captures object
 * with that key-value pair set. This is useful when you need to inject
 * a key-value pair into captures for a `seq`. 
 * 
 * For example, here is a Markdown heading parser.

 * ```ts
 * export const headingParser: Parser<Heading> = seqC(
 *   capture(count(char("#")), "level"),
 *   spaces,
 *   capture(many1Till(or(char("\n"), eof)), "content")
 * );
```
 *
 * This parser returns
 * 
 * ```ts
 * {
 *   level: number,
 *   content: string
 * }
 * ```
 * but the type of heading is actually
 * 
 * ```ts
 * type Heading = {
 *   type: "heading";
 *   level: number;
 *   content: string;
 * };
 * ```
 * 
 * The `type` key is missing. You can use `set` to inject the `type`
 * key-value pair into captures:
 * 
 * ```ts
 * export const headingParser: Parser<Heading> = seqC(
 *   set("type", "heading"),
 *   capture(count(char("#")), "level"),
 *   spaces,
 *   capture(many1Till(or(char("\n"), eof)), "content")
 * );
 * ```
 * 
 * @param key - key to set on captures object
 * @param value - value to set on captures object
 * @returns 
 */
export function set<const K extends string, const V>(
  key: K,
  value: V
): CaptureParser<null, Record<K, V>> {
  return trace(`set(${key}, ${value})`, (input: string) => {
    return captureSuccess(null, input, { [key]: value } as Record<K, V>);
  });
}

/**
 * A parser that always succeeds with the given value.
 * @param value - value to succeed with
 * @returns value
 */
export function succeed<T>(value: T): Parser<T> {
  return trace(`succeed(${value})`, (input: string) => {
    return success(value, input);
  });
}

/**
 * A parser that always fails with the given message.
 * @param message - message to fail with
 * @returns failure
 */
export function fail(message: string): Parser<never> {
  return trace(`fail(${message})`, (input: string) => {
    return failure(message, input);
  });
}

/**
 * Takes a string. Succeeds if the given input contains that string.
 * Consumes no input.
 *
 * @param substr - substring to find
 * @returns - parser that succeeds if the given input contains that string
 */
export function includes<const S extends string>(substr: S): Parser<S> {
  return trace(`includes(${substr})`, (input: string) => {
    if (input.includes(substr)) {
      return success(substr, input);
    }
    return failure(
      `expected ${escape(input)} to include ${escape(substr)}`,
      input
    );
  });
}

/**
 * Like `includes`, but case-insensitive.
 *
 * @param substr - substring to find
 * @returns - parser that succeeds if the given input contains that string
 */
export function iIncludes<const S extends string>(substr: S): Parser<S> {
  return trace(`iIncludes(${substr})`, (input: string) => {
    if (input.toLowerCase().includes(substr.toLowerCase())) {
      return success(substr, input);
    }
    return failure(
      `expected "${input}" to include "${substr}" (case-insensitive)`,
      input
    );
  });
}
