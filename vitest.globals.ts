import { expect, vi } from "vitest";
import { CaptureParserSuccess, ParserSuccess } from "./lib/types";
vi.mock("nanoid", () => {
  return { nanoid: () => "fakeid" };
});

export function compareSuccess(a: ParserSuccess<any>, b: ParserSuccess<any>) {
  expect(a.success).toBe(b.success);
  expect(a.rest).toBe(b.rest);
  expect(a.result).toEqual(b.result);
}

export function compareSuccessCaptures(
  a: CaptureParserSuccess<any, any>,
  captures: Record<string, any>,
  rest: string
) {
  expect(a.success).toBe(true);
  expect(a.rest).toBe(rest);
  expect(a.captures).toEqual(captures);
}
