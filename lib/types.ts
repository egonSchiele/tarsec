export type Object = Record<string, any>;
export type ParserSuccess<M, C extends Object> = {
  success: true;
  match: M;
  captures?: C;
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

export type ParserResult<M, C extends Object> =
  | ParserSuccess<M, C>
  | ParserFailure;
export type Parser<M, C extends Object> = (input: string) => ParserResult<M, C>;
