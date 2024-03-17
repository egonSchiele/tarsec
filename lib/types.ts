export type Object = Record<string, string>;
export type ParserSuccess<Matches = Object> = {
  success: true;
  match: string;
  matches?: Matches;
  rest: string;
};

export type ParserFailure = {
  success: false;
  rest: string;
  message: string;
};

export type ParserOptions = {
  capture: string;
};

export type ParserResult<T = Object> = ParserSuccess<T> | ParserFailure;
export type Parser<T = Object> = (
  input: string,
  debug?: any[]
) => ParserResult<T>;
