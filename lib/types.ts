export type ParserSuccess = {
  success: true;
  match: string;
  matches?: Record<string, string>;
  rest: string;
};

export type ParserFailure = {
  success: false;
  rest: string;
  message: string;
};

export type ParserOptions = {
  matchTo: string;
};

export type ParserResult = ParserSuccess | ParserFailure;
export type Parser = (input: string) => ParserResult;
