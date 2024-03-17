import { vi } from "vitest";
vi.mock("nanoid", () => {
  return { nanoid: () => "fakeid" };
});

export function success<T>({
  rest,
  match,
  captures,
}: {
  rest: string;
  match: T;
  captures?: Record<string, string>;
}) {
  return { success: true, rest, match, captures };
}

export function failure({ rest, message }: { rest: string; message: string }) {
  return { success: false, rest, message };
}
