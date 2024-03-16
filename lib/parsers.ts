import { Parser } from "./types";

export function char(c: string): Parser {
  return (input: string) => {
    if (input.length === 0) {
      return {
        success: false,
        rest: input,
        message: "unexpected end of input",
      };
    }
    if (input[0] === c) {
      return { success: true, match: c, rest: input.slice(1) };
    }
    return {
      success: false,
      rest: input,
      message: `expected ${c}, got ${input[0]}`,
    };
  };
}

export function str(s: string): Parser {
  return (input: string) => {
    let rest = input;
    for (let c of s) {
      let result = char(c)(rest);
      if (!result.success) {
        return result;
      }
      rest = result.rest;
    }
    return { success: true, match: s, rest };
  };
}
