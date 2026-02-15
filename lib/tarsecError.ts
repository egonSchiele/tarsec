export type TarsecErrorData = {
  line: number;
  column: number;
  length: number;
  prettyMessage: string;
  message: string;
};

export class TarsecError extends Error {
  public data: TarsecErrorData;
  constructor(error: TarsecErrorData) {
    super(error.message);
    this.name = "TarsecError";
    this.data = error;
  }
}
