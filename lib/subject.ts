import { Parser, ParserOptions, ParserResult } from "./types";

export class Subject {
  input: string;

  constructor(input: string) {
    this.input = input;
  }

  parse(parsers: (Parser | [Parser, ParserOptions])[]): ParserResult {
    const match: string[] = [];
    const matches: Record<string, string> = {};
    for (let item of parsers) {
      let parser: Parser;
      let options: ParserOptions | null = null;
      if (Array.isArray(item)) {
        [parser, options] = item;
      } else {
        parser = item;
      }
      let result = parser(this.input);
      if (result.success) {
        match.push(result.match);
        this.input = result.rest;
        if (options) {
          if ("capture" in options) {
            matches[options.capture] = result.match;
          }
        }
      } else {
        return result;
      }
    }
    return {
      success: true,
      match: match.join(""),
      rest: this.input,
      matches,
    };
  }
}
