import { expect, vi } from "vitest";
import { ParserSuccess } from "./lib/types";
vi.mock("nanoid", () => {
  return { nanoid: () => "fakeid" };
});

export function compareSuccess(a: ParserSuccess<any>, b: ParserSuccess<any>) {
  expect(a.success).toBe(b.success);
  expect(a.rest).toBe(b.rest);
  expect(a.result).toEqual(b.result);
}
