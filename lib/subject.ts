import { Parser, ParserResult } from "./types";

export class Subject {
  input: string;

  constructor(input: string) {
    this.input = input;
  }

  parse(parsers: Parser[]): ParserResult {
    const matches: string[] = [];
    for (let parser of parsers) {
      let result = parser(this.input);
      if (result.success) {
        matches.push(result.match);
        this.input = result.rest;
      } else {
        return result;
      }
    }
    return {
      success: true,
      match: matches.join(""),
      rest: this.input,
    };
  }
}
