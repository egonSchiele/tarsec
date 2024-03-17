import { vi } from "vitest";
vi.mock("nanoid", () => {
  return { nanoid: () => "fakeid" };
});

export function success({
  rest,
  match,
  matches,
}: {
  rest: string;
  match: string;
  matches?: Record<string, string>;
}) {
  return { success: true, rest, match, matches };
}

export function failure({ rest, message }: { rest: string; message: string }) {
  return { success: false, rest, message };
}
