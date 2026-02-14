export class TarsecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TarsecError";
  }
}
