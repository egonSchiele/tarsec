export type Object = Record<string, string>;
export type ParserSuccess<M, C extends string> = {
  success: true;
  match: M;
  captures?: Record<C, any>;
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

export type ParserResult<M, C extends string> =
  | ParserSuccess<M, C>
  | ParserFailure;
export type Parser<M, C extends string = string> = (
  input: string,
  debug?: any[]
) => ParserResult<M, C>;
