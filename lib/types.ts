export type Object = Record<string, string>;
export type ParserSuccess<T, U> = {
  success: true;
  match: T;
  namedMatches?: U;
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

export type ParserResult<T, U> = ParserSuccess<T, U> | ParserFailure;
export type Parser<T = any, U = any> = (
  input: string,
  debug?: any[]
) => ParserResult<T, U>;
