import { getResults, many1WithJoin, seq, transform } from "./combinators";
import { trace } from "./trace";
import { failure, Parser, success } from "./types";
import { escape } from "./utils";
export function char(c: string): Parser<string> {
  return trace(`char(${escape(c)})`, (input: string) => {
    if (input.length === 0) {
      return {
        success: false,
        rest: input,
        message: "unexpected end of input",
      };
    }
    if (input[0] === c) {
      return success(c, input.slice(1));
    }
    return failure(`expected ${escape(c)}, got ${escape(input[0])}`, input);
  });
}

export function str(s: string): Parser<string> {
  return trace(`str(${escape(s)})`, (input: string) => {
    if (input.substring(0, s.length) === s) {
      return success(s, input.slice(s.length));
    }
    return failure(`expected ${s}, got ${input.substring(0, s.length)}`, input);
  });
}

export function oneOf(chars: string): Parser<string> {
  return trace(`oneOf(${escape(chars)})`, (input: string) => {
    if (input.length === 0) {
      return failure("unexpected end of input", input);
    }
    const c = input[0];
    if (chars.includes(c)) {
      return char(c)(input);
    }
    return failure(`expected one of ${escape(chars)}, got ${c}`, input);
  });
}

export function noneOf(chars: string): Parser<string> {
  return trace(`noneOf(${escape(chars)})`, (input: string) => {
    if (input.length === 0) {
      return failure("unexpected end of input", input);
    }
    if (chars.includes(input[0])) {
      return failure(
        `expected none of ${escape(chars)}, got ${input[0]}`,
        input
      );
    }
    return char(input[0])(input);
  });
}

export function anyChar(input: string): Parser<string> {
  return trace("anyChar", (input: string) => {
    if (input.length === 0) {
      return failure("unexpected end of input", input);
    }
    return { success: true, match: input[0], rest: input.slice(1) };
  });
}

export const space: Parser<string> = oneOf(" \t\n\r");
export const spaces: Parser<string> = many1WithJoin(space);
export const digit: Parser<string> = oneOf("0123456789");
export const letter: Parser<string> = oneOf("abcdefghijklmnopqrstuvwxyz");
export const alphanum: Parser<string> = oneOf(
  "abcdefghijklmnopqrstuvwxyz0123456789"
);
export const word: Parser<string> = many1WithJoin(letter);
export const num: Parser<string> = many1WithJoin(digit);
export const quote: Parser<string> = oneOf(`'"`);
export const tab: Parser<string> = char("\t");
export const newline: Parser<string> = char("\n");

export const eof: Parser<null> = (input: string) => {
  if (input === "") {
    return success(null, input);
  }
  return failure("expected end of input", input);
};
export const quotedString = transform(
  seq([quote, word, quote], getResults),
  (x: string[]) => x.join("")
);
