import { ParserResult, Parser } from "./types";

export function resultToString<T>(
  name: string,
  result: ParserResult<T, string>
): string {
  if (result.success) {
    return `✅ ${name} -- match: ${result.match}, rest: ${result.rest}`;
  }
  return `❌ ${name} -- message: ${result.message}, rest: ${result.rest}`;
}

export function trace(
  name: string,
  debug: any[],
  parser: Parser<any>
): Parser<any> {
  return (input: string) => {
    const result = parser(input);
    debug.push(resultToString(name, result));
    return result;
  };
}
