import { expect, vi } from "vitest";
import {
  CaptureParserResult,
  CaptureParserSuccess,
  ParserResult,
  ParserSuccess,
} from "./lib/types";
vi.mock("nanoid", () => {
  return { nanoid: () => "fakeid" };
});

export function compareSuccess(a: ParserResult<any>, b: ParserSuccess<any>) {
  expect(a.success).toBe(b.success);
  expect(a.rest).toBe(b.rest);
  if (a.success) {
    expect(a.result).toEqual(b.result);
  }
}

export function compareSuccessCaptures(
  a: CaptureParserResult<any, any>,
  captures: Record<string, any>,
  rest: string
) {
  expect(a.success).toBe(true);
  expect(a.rest).toBe(rest);
  if (a.success) {
    expect(a.captures).toEqual(captures);
  }
}
